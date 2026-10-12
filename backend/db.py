import os
import psycopg2
import psycopg2.extras
import datetime

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
        pass


def get_conn():
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


def init_schema():
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


# alias
init_db = init_schema


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
    today = datetime.date.today().isoformat()
    # "This week" = Monday of current ISO week through today
    today_dt = datetime.date.today()
    week_start = (today_dt - datetime.timedelta(days=today_dt.weekday())).isoformat()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM users")
    total = cur.fetchone()["cnt"]
    cur.execute("SELECT COUNT(*) as cnt FROM users WHERE next_followup_at::date = %s", (today,))
    due_today = cur.fetchone()["cnt"]
    cur.execute(
        """SELECT COUNT(*) as cnt FROM users
           WHERE next_followup_at IS NOT NULL AND next_followup_at::date < %s
           AND current_status NOT IN ('Converted','Not Interested','Invalid / Wrong Number','Do Not Contact')""",
        (today,),
    )
    overdue = cur.fetchone()["cnt"]
    # "Contacted this week" = had a follow-up logged since Monday of this week
    cur.execute(
        "SELECT COUNT(*) as cnt FROM users WHERE last_followup_at::date >= %s AND last_followup_at::date <= %s",
        (week_start, today),
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


def get_chart_data():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT sector, COUNT(*) as cnt FROM users WHERE sector IS NOT NULL GROUP BY sector ORDER BY cnt DESC LIMIT 10")
    by_sector = [{"name": r["sector"], "value": r["cnt"]} for r in cur.fetchall()]
    cur.execute("SELECT company_type, COUNT(*) as cnt FROM users WHERE company_type IS NOT NULL GROUP BY company_type ORDER BY cnt DESC")
    by_company_type = [{"name": r["company_type"], "value": r["cnt"]} for r in cur.fetchall()]
    cur.execute("SELECT city, COUNT(*) as cnt FROM users WHERE city IS NOT NULL GROUP BY city ORDER BY cnt DESC")
    by_city = [{"name": r["city"], "value": r["cnt"]} for r in cur.fetchall()]
    cur.execute("SELECT msme_type, COUNT(*) as cnt FROM users WHERE msme_type IS NOT NULL GROUP BY msme_type ORDER BY cnt DESC")
    by_msme = [{"name": r["msme_type"], "value": r["cnt"]} for r in cur.fetchall()]
    cur.close()
    conn.close()
    return dict(by_sector=by_sector, by_company_type=by_company_type, by_city=by_city, by_msme=by_msme)


def get_users(
    statuses=None, search=None, next_followup_filter=None,
    last_followup_from=None, last_followup_to=None,
    company_types=None, sectors=None, msme_types=None, cities=None,
    designations=None, assigned_tos=None, priorities=None,
    interest_levels=None, last_channels=None, extra_cols=None,
    id_search=None, page=1, page_size=100, last_followup_filter=None,
    sort_by="id", sort_dir="desc",
):
    today_dt = datetime.date.today()
    today = today_dt.isoformat()
    week_start = (today_dt - datetime.timedelta(days=today_dt.weekday())).isoformat()
    week_end = (today_dt + datetime.timedelta(days=7)).isoformat()

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

    # Direct ID lookup — overrides all other filters
    if id_search:
        try:
            wheres.append("id = %s")
            params.append(int(id_search))
        except (ValueError, TypeError):
            pass

    if statuses:
        wheres.append("current_status = ANY(%s)")
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

    if last_followup_filter == "This week":
        wheres.append("last_followup_at::date >= %s AND last_followup_at::date <= %s")
        params.extend([week_start, today])
    elif last_followup_filter == "Today":
        wheres.append("last_followup_at::date = %s")
        params.append(today)
    elif last_followup_filter == "Never":
        wheres.append("last_followup_at IS NULL")

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

    # Whitelist allowed sort columns to prevent SQL injection
    ALLOWED_SORT_COLS = {
        "id", "sr_no", "full_name", "company", "mobile", "current_status",
        "last_followup_at", "next_followup_at", "followup_count",
    }
    safe_sort_by = sort_by if sort_by in ALLOWED_SORT_COLS else "id"
    safe_sort_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    conn = get_conn()
    cur = conn.cursor()

    # Count total matching rows for pagination
    cur.execute(f"SELECT COUNT(*) as cnt FROM users {where_clause}", params)
    total = cur.fetchone()["cnt"]

    # Paginated fetch
    page = max(1, page)
    page_size = max(1, min(page_size, 500))
    offset = (page - 1) * page_size
    sql = f"SELECT {col_str} FROM users {where_clause} ORDER BY {safe_sort_by} {safe_sort_dir} LIMIT %s OFFSET %s"
    cur.execute(sql, params + [page_size, offset])
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}


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
    set_parts = []
    params = []
    for k, v in updates.items():
        set_parts.append(f"{k} = %s")
        params.append(v)
    set_parts.append("updated_at = NOW()")
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
        if hasattr(val, "strftime"):
            if hasattr(val, "hour"):
                return val.strftime("%d-%m-%Y %I:%M %p")
            return val.strftime("%d-%m-%Y")
        s = str(val)
        if ":" in s:
            dt = datetime.datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
            return dt.strftime("%d-%m-%Y %I:%M %p")
        else:
            d = datetime.date.fromisoformat(s[:10])
            return d.strftime("%d-%m-%Y")
    except Exception:
        return str(val)
