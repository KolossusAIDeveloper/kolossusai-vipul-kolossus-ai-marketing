import os
import psycopg2
import psycopg2.extras

STATUSES = [
    "New",
    "Attempted - No Answer",
    "Contacted",
    "Interested",
    "Follow-up Scheduled",
    "Demo Scheduled",
    "Proposal Sent",
    "Negotiation",
    "Converted",
    "Not Interested",
    "Invalid / Wrong Number",
    "Do Not Contact",
]

CLOSED_STATUSES = {"Converted", "Not Interested", "Invalid / Wrong Number", "Do Not Contact"}

STATUS_COLORS = {
    "New": "#9e9e9e",
    "Attempted - No Answer": "#ff9800",
    "Contacted": "#2196f3",
    "Interested": "#4caf50",
    "Follow-up Scheduled": "#9c27b0",
    "Demo Scheduled": "#00bcd4",
    "Proposal Sent": "#3f51b5",
    "Negotiation": "#e91e63",
    "Converted": "#1b5e20",
    "Not Interested": "#f44336",
    "Invalid / Wrong Number": "#bdbdbd",
    "Do Not Contact": "#212121",
}

CHANNELS = ["Call", "WhatsApp", "Email", "SMS", "Meeting", "Video Call", "Visit", "LinkedIn", "Other"]
CALL_RESULTS = ["Connected", "No Answer", "Busy", "Switched Off", "Wrong Number", "Replied", "Not Replied"]


def _ensure_db_exists():
    """Connect to the default 'postgres' DB and create kolossus_marketing if missing."""
    target = os.environ.get("DB_NAME", "kolossus_marketing")
    try:
        admin = psycopg2.connect(
            host=os.environ["DB_HOST"],
            port=int(os.environ.get("DB_PORT", "5432")),
            dbname="postgres",
            user=os.environ.get("DB_USER", "postgres"),
            password=os.environ["DB_PASSWORD"],
            sslmode=os.environ.get("DB_SSLMODE", "require"),
            connect_timeout=10,
        )
        admin.autocommit = True
        cur = admin.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target,))
        if not cur.fetchone():
            cur.execute(f'CREATE DATABASE "{target}"')
        cur.close()
        admin.close()
    except Exception:
        pass  # If we can't connect to postgres DB, proceed and let the real error surface


def get_conn():
    _ensure_db_exists()
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "5432")),
        dbname=os.environ.get("DB_NAME", "kolossus_marketing"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ["DB_PASSWORD"],
        sslmode=os.environ.get("DB_SSLMODE", "require"),
        connect_timeout=10,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
          id                    SERIAL PRIMARY KEY,
          sr_no                 INTEGER,
          full_name             TEXT NOT NULL,
          designation           TEXT,
          company               TEXT,
          mobile                TEXT,
          email                 TEXT,
          social_category       TEXT,
          gender                TEXT,
          msme_type             TEXT,
          udyam_aadhaar         TEXT,
          sector                TEXT,
          company_type          TEXT,
          address               TEXT,
          city                  TEXT,
          current_status        TEXT NOT NULL DEFAULT 'New'
                                  CHECK (current_status IN (
                                    'New','Attempted - No Answer','Contacted','Interested',
                                    'Follow-up Scheduled','Demo Scheduled','Proposal Sent',
                                    'Negotiation','Converted','Not Interested',
                                    'Invalid / Wrong Number','Do Not Contact')),
          status_updated_at     TIMESTAMP,
          last_followup_at      TIMESTAMP,
          last_channel          TEXT,
          last_outcome          TEXT,
          next_followup_at      TIMESTAMP,
          followup_count        INTEGER NOT NULL DEFAULT 0,
          assigned_to           TEXT,
          priority              TEXT NOT NULL DEFAULT 'Medium'
                                  CHECK (priority IN ('High','Medium','Low')),
          interest_level        TEXT CHECK (interest_level IN ('Hot','Warm','Cold') OR interest_level IS NULL),
          lead_source           TEXT NOT NULL DEFAULT 'Gandhidham I-4.0 Excel',
          notes                 TEXT,
          possible_duplicate_of INTEGER REFERENCES users(id),
          data_quality_flag     TEXT,
          raw_json              TEXT,
          source_file           TEXT,
          created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (source_file, sr_no)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS followups (
          id               SERIAL PRIMARY KEY,
          user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          followup_at      TIMESTAMP NOT NULL,
          channel          TEXT NOT NULL CHECK (channel IN
                             ('Call','WhatsApp','Email','SMS','Meeting','Video Call','Visit','LinkedIn','Other')),
          direction        TEXT NOT NULL DEFAULT 'Outbound' CHECK (direction IN ('Outbound','Inbound')),
          call_result      TEXT CHECK (call_result IN
                             ('Connected','No Answer','Busy','Switched Off','Wrong Number','Replied','Not Replied')
                             OR call_result IS NULL),
          duration_min     INTEGER,
          contacted_by     TEXT NOT NULL,
          spoke_with       TEXT,
          customer_said    TEXT,
          our_notes        TEXT,
          status_before    TEXT,
          status_after     TEXT NOT NULL,
          next_action      TEXT,
          next_followup_at TIMESTAMP,
          created_at       TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS ix_users_status   ON users(current_status)")
    cur.execute("CREATE INDEX IF NOT EXISTS ix_users_next     ON users(next_followup_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS ix_users_mobile   ON users(mobile)")
    cur.execute("CREATE INDEX IF NOT EXISTS ix_followups_user ON followups(user_id, followup_at DESC)")

    # PostgreSQL trigger to auto-update user metadata after followup insert
    cur.execute("""
        CREATE OR REPLACE FUNCTION trg_followup_insert_fn() RETURNS TRIGGER AS $$
        BEGIN
          UPDATE users SET
            current_status    = CASE WHEN last_followup_at IS NULL OR NEW.followup_at >= last_followup_at
                                     THEN NEW.status_after ELSE current_status END,
            status_updated_at = CASE WHEN last_followup_at IS NULL OR NEW.followup_at >= last_followup_at
                                     THEN NEW.followup_at ELSE status_updated_at END,
            last_channel      = CASE WHEN last_followup_at IS NULL OR NEW.followup_at >= last_followup_at
                                     THEN NEW.channel ELSE last_channel END,
            last_outcome      = CASE WHEN last_followup_at IS NULL OR NEW.followup_at >= last_followup_at
                                     THEN COALESCE(NEW.customer_said, NEW.call_result) ELSE last_outcome END,
            next_followup_at  = CASE WHEN last_followup_at IS NULL OR NEW.followup_at >= last_followup_at
                                     THEN NEW.next_followup_at ELSE next_followup_at END,
            last_followup_at  = GREATEST(COALESCE(last_followup_at, '1970-01-01'::timestamp), NEW.followup_at),
            followup_count    = (SELECT COUNT(*) FROM followups WHERE user_id = NEW.user_id),
            updated_at        = NOW()
          WHERE id = NEW.user_id;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    cur.execute("DROP TRIGGER IF EXISTS trg_followup_insert ON followups")
    cur.execute("""
        CREATE TRIGGER trg_followup_insert
        AFTER INSERT ON followups
        FOR EACH ROW EXECUTE FUNCTION trg_followup_insert_fn()
    """)

    conn.commit()
    cur.close()
    conn.close()


def count_users():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM users")
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row["cnt"]


def get_status_counts():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT current_status, COUNT(*) as cnt FROM users GROUP BY current_status")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {r["current_status"]: r["cnt"] for r in rows}


def get_kpis():
    import datetime
    today = datetime.date.today()
    today_str = today.isoformat()
    # ISO week Monday (weekday() == 0 for Monday)
    week_monday = (today - datetime.timedelta(days=today.weekday())).isoformat()
    week_end_str = today_str + " 23:59:59"
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM users")
    total = cur.fetchone()["cnt"]
    cur.execute("SELECT COUNT(*) as cnt FROM users WHERE next_followup_at::date = %s", (today_str,))
    due_today = cur.fetchone()["cnt"]
    cur.execute(
        """SELECT COUNT(*) as cnt FROM users
           WHERE next_followup_at IS NOT NULL AND next_followup_at::date < %s
           AND current_status NOT IN ('Converted','Not Interested','Invalid / Wrong Number','Do Not Contact')""",
        (today_str,),
    )
    overdue = cur.fetchone()["cnt"]
    cur.execute(
        "SELECT COUNT(*) as cnt FROM users WHERE last_followup_at >= %s AND last_followup_at <= %s",
        (week_monday + " 00:00:00", week_end_str),
    )
    contacted_week = cur.fetchone()["cnt"]
    cur.execute("SELECT COUNT(*) as cnt FROM users WHERE current_status = 'Converted'")
    converted = cur.fetchone()["cnt"]
    cur.close()
    conn.close()
    return dict(total=total, due_today=due_today, overdue=overdue,
                contacted_week=contacted_week, converted=converted)


def get_filter_options():
    conn = get_conn()
    cur = conn.cursor()

    def distinct(col):
        cur.execute(f"SELECT DISTINCT {col} FROM users WHERE {col} IS NOT NULL ORDER BY {col}")
        return [r[col] for r in cur.fetchall()]

    opts = {
        "company_type": distinct("company_type"),
        "sector": distinct("sector"),
        "msme_type": distinct("msme_type"),
        "city": distinct("city"),
        "designation": distinct("designation"),
        "assigned_to": distinct("assigned_to"),
        "priority": ["High", "Medium", "Low"],
        "interest_level": ["Hot", "Warm", "Cold"],
        "last_channel": distinct("last_channel"),
    }
    cur.close()
    conn.close()
    return opts


def get_contacted_this_week_range():
    """Return (monday_00:00:00, today_23:59:59) strings for the current ISO week."""
    import datetime
    today = datetime.date.today()
    week_monday = today - datetime.timedelta(days=today.weekday())
    return week_monday.isoformat() + " 00:00:00", today.isoformat() + " 23:59:59"


def get_users(
    statuses=None, search=None, next_followup_filter=None,
    last_followup_from=None, last_followup_to=None,
    contacted_this_week=False,
    company_types=None, sectors=None, msme_types=None, cities=None,
    designations=None, assigned_tos=None, priorities=None,
    interest_levels=None, last_channels=None, extra_cols=None,
):
    import datetime
    today = datetime.date.today().isoformat()
    week_end = (datetime.date.today() + datetime.timedelta(days=7)).isoformat()

    base_cols = [
        "id", "sr_no", "full_name", "designation", "company", "mobile", "email",
        "sector", "company_type", "msme_type", "city",
        "current_status", "last_followup_at", "last_outcome", "next_followup_at",
        "followup_count", "assigned_to", "possible_duplicate_of",
    ]
    hidden_cols = ["social_category", "gender", "udyam_aadhaar", "address"]
    cols = base_cols + [c for c in (extra_cols or []) if c in hidden_cols]

    wheres = []
    params = []

    if statuses:
        wheres.append(f"current_status = ANY(%s)")
        params.append(statuses)

    if search:
        wheres.append("(full_name ILIKE %s OR company ILIKE %s OR mobile ILIKE %s OR email ILIKE %s)")
        s = f"%{search}%"
        params.extend([s, s, s, s])

    if next_followup_filter == "Overdue":
        wheres.append("next_followup_at IS NOT NULL AND next_followup_at::date < %s")
        params.append(today)
    elif next_followup_filter == "Today":
        wheres.append("next_followup_at::date = %s")
        params.append(today)
    elif next_followup_filter == "This week":
        wheres.append("next_followup_at::date BETWEEN %s AND %s")
        params.extend([today, week_end])
    elif next_followup_filter == "Not scheduled":
        wheres.append("next_followup_at IS NULL")

    if contacted_this_week:
        w_from, w_to = get_contacted_this_week_range()
        wheres.append("last_followup_at >= %s AND last_followup_at <= %s")
        params.extend([w_from, w_to])
    elif last_followup_from or last_followup_to:
        if last_followup_from:
            wheres.append("last_followup_at::date >= %s")
            params.append(str(last_followup_from))
        if last_followup_to:
            wheres.append("last_followup_at::date <= %s")
            params.append(str(last_followup_to))

    def multi(col, vals):
        if vals:
            wheres.append(f"{col} = ANY(%s)")
            params.append(list(vals))

    multi("company_type", company_types)
    multi("sector", sectors)
    multi("msme_type", msme_types)
    multi("city", cities)
    multi("designation", designations)
    multi("assigned_to", assigned_tos)
    multi("priority", priorities)
    multi("interest_level", interest_levels)
    multi("last_channel", last_channels)

    where_clause = ("WHERE " + " AND ".join(wheres)) if wheres else ""
    col_str = ", ".join(cols)
    sql = f"SELECT {col_str} FROM users {where_clause} ORDER BY id ASC"

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def get_user(user_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return dict(row) if row else None


def update_user(user_id, **fields):
    allowed = {
        "full_name", "designation", "company", "mobile", "email",
        "social_category", "gender", "msme_type", "udyam_aadhaar",
        "sector", "company_type", "address", "city",
        "assigned_to", "priority", "interest_level", "notes",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    updates["updated_at"] = "NOW()"
    set_parts = []
    params = []
    for k, v in updates.items():
        if v == "NOW()":
            set_parts.append(f"{k} = NOW()")
        else:
            set_parts.append(f"{k} = %s")
            params.append(v)
    params.append(user_id)
    sql = f"UPDATE users SET {', '.join(set_parts)} WHERE id = %s"
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    cur.close()
    conn.close()


def get_followups(user_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM followups WHERE user_id = %s ORDER BY followup_at DESC", (user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


def insert_followup(
    user_id, followup_at, channel, direction, call_result, duration_min,
    contacted_by, spoke_with, customer_said, our_notes,
    status_before, status_after, next_action, next_followup_at,
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO followups
           (user_id, followup_at, channel, direction, call_result, duration_min,
            contacted_by, spoke_with, customer_said, our_notes,
            status_before, status_after, next_action, next_followup_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (user_id, followup_at, channel, direction, call_result or None, duration_min or None,
         contacted_by, spoke_with or None, customer_said or None, our_notes or None,
         status_before, status_after, next_action or None, next_followup_at or None),
    )
    conn.commit()
    cur.close()
    conn.close()


def update_followup(followup_id, **fields):
    allowed = {
        "followup_at", "channel", "direction", "call_result", "duration_min",
        "contacted_by", "spoke_with", "customer_said", "our_notes",
        "status_after", "next_action", "next_followup_at",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    params = list(updates.values()) + [followup_id]
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"UPDATE followups SET {set_clause} WHERE id = %s", params)
    conn.commit()
    cur.close()
    conn.close()


def delete_followup(followup_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT user_id FROM followups WHERE id = %s", (followup_id,))
    row = cur.fetchone()
    if row:
        user_id = row["user_id"]
        cur.execute("DELETE FROM followups WHERE id = %s", (followup_id,))
        conn.commit()
        cur.close()
        conn.close()
        recalc_user(user_id)
    else:
        cur.close()
        conn.close()


def recalc_user(user_id):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM followups WHERE user_id = %s ORDER BY followup_at DESC LIMIT 1",
        (user_id,),
    )
    latest = cur.fetchone()
    cur.execute("SELECT COUNT(*) as cnt FROM followups WHERE user_id = %s", (user_id,))
    count = cur.fetchone()["cnt"]
    if latest:
        cur.execute(
            """UPDATE users SET
               current_status = %s, status_updated_at = %s, last_followup_at = %s,
               last_channel = %s,
               last_outcome = COALESCE(%s, %s),
               next_followup_at = %s, followup_count = %s, updated_at = NOW()
               WHERE id = %s""",
            (
                latest["status_after"], latest["followup_at"], latest["followup_at"],
                latest["channel"],
                latest["customer_said"], latest["call_result"],
                latest["next_followup_at"], count, user_id,
            ),
        )
    else:
        cur.execute(
            """UPDATE users SET
               current_status = 'New', status_updated_at = NULL,
               last_followup_at = NULL, last_channel = NULL, last_outcome = NULL,
               next_followup_at = NULL, followup_count = 0, updated_at = NOW()
               WHERE id = %s""",
            (user_id,),
        )
    conn.commit()
    cur.close()
    conn.close()


def mask_aadhaar(val):
    if not val:
        return val
    digits = "".join(c for c in str(val) if c.isdigit())
    if len(digits) == 12:
        return f"XXXX-XXXX-{digits[-4:]}"
    return val


def fmt_date(val):
    if not val:
        return ""
    try:
        from datetime import datetime, date
        if hasattr(val, "strftime"):
            if hasattr(val, "hour"):
                return val.strftime("%d-%m-%Y %I:%M %p")
            return val.strftime("%d-%m-%Y")
        s = str(val)
        if ":" in s:
            dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
            return dt.strftime("%d-%m-%Y %I:%M %p")
        else:
            d = date.fromisoformat(s[:10])
            return d.strftime("%d-%m-%Y")
    except Exception:
        return str(val)
