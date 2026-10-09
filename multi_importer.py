"""
Multi-file Excel importer for Kolossus AI Marketing.
Connects directly to the PostgreSQL DB and inserts all contacts from all Excel files.
Deduplicates by mobile number across files.
Multiple phone numbers per row are stored with the primary in `mobile` and extras in `notes`.
"""
import json
import os
import re
import sys
import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import psycopg2
import psycopg2.extras

EXCEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "excels")

FILES = [
    # (display_name, path, parser_type)
    ("Gandhidham I-4.0 1.xlsx",      os.path.join(EXCEL_DIR, "Gandhidham I-4.0 1.xlsx"),        "gandhidham"),
    ("MCMA 2026 Morbi.xlsx",          os.path.join(EXCEL_DIR, "MCMA 2026 Morbi.xlsx"),            "mcma"),
    ("Medium Rajkot 2026.xlsx",       os.path.join(EXCEL_DIR, "Medium Rajkot 2026.xlsx"),         "medium_rajkot"),
    ("Surendranagar.xlsx",            os.path.join(EXCEL_DIR, "Surendranagar.xlsx"),               "surendranagar"),
    ("GBPS Rajkot 2024.xlsx",         os.path.join(EXCEL_DIR, "GBPS Rajkot 2024.xlsx"),            "gbps"),
    ("Rajkot all data.xlsx",          os.path.join(EXCEL_DIR, "Rajkot all data.xlsx"),              "rajkot_all"),
    ("Database NPC Ahmedabad.xlsx",   os.path.join(EXCEL_DIR, "Database NPC Ahmedabad.xlsx"),       "npc_ahmedabad"),
    ("METODA AutoRecovered.xls",      os.path.join(EXCEL_DIR, "METODA AutoRecovered.xls"),          "metoda"),
    ("METODA Industry4.xls",          os.path.join(EXCEL_DIR, "METODA Industry4.xls"),              "metoda"),
    ("METODA Industry4.0.xls",        os.path.join(EXCEL_DIR, "METODA Industry4.0.xls"),            "metoda"),
]

BROKEN_WORDS = {
    "Inte rnational": "International",
    "Engi neering": "Engineering",
    "ga ndhidham": "Gandhidham",
    "agrib usiness": "agribusiness",
    "cong lomerate": "conglomerate",
    "infra structure": "infrastructure",
    "Manufacturin g": "Manufacturing",
}

CITY_KEYWORDS = ["Gandhidham", "Anjar", "Bhuj", "Bhachau", "Rajkot", "Morbi",
                  "Ahmedabad", "Surendranagar", "Metoda", "Jasdan", "Dhoraji",
                  "Gondal", "Jetpur", "Upleta", "Wankaner", "Amreli"]

def get_conn():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "5432")),
        dbname=os.environ.get("DB_NAME", "kolossus_marketing"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ["DB_PASSWORD"],
        sslmode=os.environ.get("DB_SSLMODE", "require"),
        connect_timeout=10,
    )

def clean(val):
    if val is None or (isinstance(val, float) and str(val) == "nan"):
        return None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null", "-", "n/a", "na"):
        return None
    for broken, fixed in BROKEN_WORDS.items():
        s = s.replace(broken, fixed)
    return s

def derive_city(address):
    if not address:
        return None
    addr_lower = address.lower()
    for city in CITY_KEYWORDS:
        if city.lower() in addr_lower:
            return city
    return None

def extract_mobiles(raw):
    """Extract all 10-digit mobile numbers from a string like '9879510333 / 9825229296'."""
    if not raw:
        return []
    # find all sequences of digits, filter to 10-digit ones
    nums = re.findall(r'\d+', str(raw))
    mobiles = []
    for n in nums:
        n = n.strip()
        if len(n) == 10 and n[0] in "6789":
            mobiles.append(n)
        elif len(n) == 11 and n.startswith("0"):
            m = n[1:]
            if m[0] in "6789":
                mobiles.append(m)
        elif len(n) == 12 and n.startswith("91"):
            m = n[2:]
            if len(m) == 10 and m[0] in "6789":
                mobiles.append(m)
    return list(dict.fromkeys(mobiles))  # deduplicate preserving order

def check_email_flag(email):
    if not email:
        return None
    typo_domains = ["gnail.com", "gmai.com", "gamil.com", "gmial.com", "yaho.com",
                    "yahooo.com", "hotmai.com", "outlok.com"]
    domain = email.split("@")[-1].lower() if "@" in email else ""
    return "check_email" if domain in typo_domains else None

# ─── Parsers — one per file format ────────────────────────────────────────────

def parse_gandhidham(path, source_file):
    """Same format as original Gandhidham I-4.0.xlsx — skip row 0 (merged header)."""
    df = pd.read_excel(path, sheet_name=0, header=None, skiprows=1)
    records = []
    for i, row in df.iterrows():
        raw = {f"col_{j}": (None if pd.isna(v) else v) for j, v in enumerate(row)}
        sr_no = int(row[0]) if pd.notna(row[0]) else (i + 1)
        full_name = clean(row[1])
        if not full_name:
            continue
        designation = clean(row[2])
        company     = clean(row[3])
        mobiles     = extract_mobiles(row[4])
        email       = clean(row[5])
        if email: email = email.lower()
        social_cat  = clean(row[6])
        gender      = clean(row[7])
        msme_type   = clean(row[8])
        udyam       = clean(row[9])
        if udyam: udyam = re.sub(r'\s+', '', udyam)
        sector      = clean(row[10])
        company_type = clean(row[11])
        if company_type == "Manufacturin g": company_type = "Manufacturing"
        address     = clean(row[12])
        city        = derive_city(address) if address else None
        records.append({
            "sr_no": sr_no, "full_name": full_name, "designation": designation,
            "company": company, "mobiles": mobiles, "email": email,
            "social_category": social_cat, "gender": gender, "msme_type": msme_type,
            "udyam_aadhaar": udyam, "sector": sector, "company_type": company_type,
            "address": address, "city": city, "raw": raw, "source_file": source_file,
        })
    return records

def parse_mcma(path, source_file):
    """MCMA Morbi: header on row 1, data from row 2. Cols: Sr No, Company, Divisions, Person, Mobile."""
    df = pd.read_excel(path, sheet_name=0, header=1)
    records = []
    for i, row in df.iterrows():
        raw = row.to_dict()
        company   = clean(row.get("Company Name"))
        if not company:
            continue
        full_name = clean(row.get("Person Name")) or company
        mobiles   = extract_mobiles(row.get("Mobile No."))
        sector    = clean(row.get("Divisions"))
        sr_no     = int(row.get("Sr No", i+1)) if pd.notna(row.get("Sr No", float("nan"))) else (i+1)
        records.append({
            "sr_no": sr_no, "full_name": full_name, "designation": None,
            "company": company, "mobiles": mobiles, "email": None,
            "social_category": None, "gender": None, "msme_type": None,
            "udyam_aadhaar": None, "sector": sector, "company_type": "Manufacturing",
            "address": "Morbi", "city": "Morbi", "raw": {str(k): str(v) for k,v in raw.items()},
            "source_file": source_file,
        })
    return records

def parse_medium_rajkot(path, source_file):
    """Medium Rajkot: header on row 0. Has mobile, mobile 2, email cols."""
    df = pd.read_excel(path, sheet_name=0, header=0)
    # Normalise column names
    df.columns = [str(c).strip().lower() for c in df.columns]
    records = []
    for i, row in df.iterrows():
        raw = row.to_dict()
        company = clean(row.get("company name ") or row.get("company name"))
        if not company:
            continue
        full_name = clean(row.get("contec persion") or row.get("contact person")) or company
        mob1 = extract_mobiles(row.get("mobile", ""))
        mob2 = extract_mobiles(row.get("mobile 2", ""))
        # Some cells have masked numbers like 90*****247 — skip those
        all_mobs = []
        for m in mob1 + mob2:
            if "*" not in str(m):
                all_mobs.append(m)
        email = clean(row.get("email"))
        if email: email = email.lower()
        # second email col
        cols = list(df.columns)
        email_cols = [c for c in cols if "email" in c]
        if len(email_cols) > 1 and not email:
            email = clean(row.get(email_cols[1]))
            if email: email = email.lower()
        udyam  = clean(row.get("udyam_no") or row.get("udyam no"))
        addr   = clean(row.get("address"))
        city   = clean(row.get("city")) or derive_city(addr)
        msme   = clean(row.get("enterprise_type_past") or row.get("msme_type"))
        sector = clean(row.get("major_activity"))
        sr_no  = int(row.get("no", i+1)) if pd.notna(row.get("no", float("nan"))) else (i+1)
        records.append({
            "sr_no": sr_no, "full_name": full_name, "designation": None,
            "company": company, "mobiles": all_mobs, "email": email,
            "social_category": None, "gender": None, "msme_type": msme,
            "udyam_aadhaar": udyam, "sector": sector, "company_type": "Manufacturing",
            "address": addr, "city": city, "raw": {str(k): str(v) for k,v in raw.items()},
            "source_file": source_file,
        })
    return records

def parse_surendranagar(path, source_file):
    """Surendranagar: header on row 1 (0-indexed), data from row 2."""
    try:
        df = pd.read_excel(path, sheet_name="Sheet1", header=None)
    except Exception:
        return []
    # Find header row
    header_row = None
    for idx in range(min(5, len(df))):
        row_vals = [str(v).strip().lower() for v in df.iloc[idx] if pd.notna(v)]
        if any("company" in v or "sr" in v for v in row_vals):
            header_row = idx
            break
    if header_row is None:
        return []
    df.columns = [str(c).strip() if pd.notna(c) else f"col_{i}" for i, c in enumerate(df.iloc[header_row])]
    df = df.iloc[header_row+1:].reset_index(drop=True)
    records = []
    for i, row in df.iterrows():
        raw = row.to_dict()
        company = clean(row.get("Company Name") or row.get("Copany Name "))
        if not company:
            continue
        full_name = clean(row.get("Contact Person")) or company
        mob_raw = row.get("Mo.") or row.get("Contact No.") or row.get("Contact Number") or ""
        mobiles = extract_mobiles(mob_raw)
        email   = clean(row.get("E-Mail ID") or row.get("Mail Id."))
        if email: email = email.lower()
        sr_no_raw = row.get("Sr.No.") or row.get("SR No.") or (i+1)
        try:
            sr_no = int(float(sr_no_raw))
        except (ValueError, TypeError):
            sr_no = i + 1
        records.append({
            "sr_no": sr_no, "full_name": full_name, "designation": None,
            "company": company, "mobiles": mobiles, "email": email,
            "social_category": None, "gender": None, "msme_type": None,
            "udyam_aadhaar": None, "sector": None, "company_type": None,
            "address": "Surendranagar", "city": "Surendranagar",
            "raw": {str(k): str(v) for k,v in raw.items()},
            "source_file": source_file,
        })
    return records

def parse_gbps(path, source_file):
    """GBPS Rajkot: header on row 1, data from row 2. Cols: SR No, Company, Contact No, Mail, Website."""
    df = pd.read_excel(path, sheet_name=0, header=1)
    records = []
    for i, row in df.iterrows():
        raw = row.to_dict()
        company = clean(row.get("Company Name ") or row.get("Company Name"))
        if not company:
            continue
        full_name = company  # no person column
        mobiles = extract_mobiles(row.get("Contact No.") or row.get("Contact No"))
        email   = clean(row.get("Mail Id.") or row.get("Email"))
        if email: email = email.lower()
        sr_no_raw = row.get("SR No.") or row.get("Sr No") or (i+1)
        try:
            sr_no = int(float(sr_no_raw))
        except (ValueError, TypeError):
            sr_no = i + 1
        records.append({
            "sr_no": sr_no, "full_name": full_name, "designation": None,
            "company": company, "mobiles": mobiles, "email": email,
            "social_category": None, "gender": None, "msme_type": None,
            "udyam_aadhaar": None, "sector": None, "company_type": None,
            "address": "Rajkot", "city": "Rajkot",
            "raw": {str(k): str(v) for k,v in raw.items()},
            "source_file": source_file,
        })
    return records

def parse_rajkot_all(path, source_file):
    """Rajkot all data: multiple sheets, each with header on row 1. Skip row 0."""
    xf = pd.ExcelFile(path)
    all_records = []
    sheet_sr = {}
    for sheet in xf.sheet_names:
        try:
            df = pd.read_excel(path, sheet_name=sheet, header=None)
            if len(df) < 2:
                continue
            # Find header row (row with 'Company' or 'Sr')
            header_row = None
            for idx in range(min(4, len(df))):
                vals = [str(v).strip().lower() for v in df.iloc[idx] if pd.notna(v)]
                if any("company" in v or "sr" in v or "name" in v for v in vals):
                    header_row = idx
                    break
            if header_row is None:
                continue
            df.columns = [str(c).strip() if pd.notna(c) else f"col_{i}" for i, c in enumerate(df.iloc[header_row])]
            df = df.iloc[header_row+1:].reset_index(drop=True)
            sr_offset = sheet_sr.get(sheet, 0)
            for i, row in df.iterrows():
                raw = row.to_dict()
                company = clean(
                    row.get("Company Name") or row.get("Copany Name ") or
                    row.get("Company Name ") or row.get("Name of Party")
                )
                if not company:
                    continue
                full_name = clean(
                    row.get("Contact Person") or row.get("Cont. Person") or
                    row.get("Name") or row.get("Party Name")
                ) or company
                mob_raw = (
                    row.get("Contact Number") or row.get("Mobile no.") or
                    row.get("Contact No.") or row.get("Mobile") or ""
                )
                mobiles = extract_mobiles(mob_raw)
                email   = clean(
                    row.get("Email -ID") or row.get("E-Mail ID") or
                    row.get("Mail Id.") or row.get("Email")
                )
                if email: email = email.lower()
                sr_no_raw = row.get("Sr.No.") or row.get("SR No.") or row.get("Sr.") or (i+1)
                try:
                    sr_no = int(float(sr_no_raw)) + sr_offset
                except (ValueError, TypeError):
                    sr_no = i + 1 + sr_offset
                all_records.append({
                    "sr_no": sr_no, "full_name": full_name, "designation": None,
                    "company": company, "mobiles": mobiles, "email": email,
                    "social_category": None, "gender": None, "msme_type": None,
                    "udyam_aadhaar": None, "sector": sheet[:50], "company_type": None,
                    "address": "Rajkot", "city": "Rajkot",
                    "raw": {str(k): str(v) for k,v in raw.items()},
                    "source_file": f"{source_file}:{sheet}",
                })
            sheet_sr[sheet] = sr_offset + len(df)
        except Exception as e:
            print(f"  Sheet '{sheet}' error: {e}")
    return all_records

def parse_npc_ahmedabad(path, source_file):
    """NPC Ahmedabad: Data 1 sheet has header on row 0. Data 2 is just company+mobile pairs."""
    records = []
    # Sheet Data 1
    try:
        df1 = pd.read_excel(path, sheet_name="Data 1", header=0)
        for i, row in df1.iterrows():
            raw = row.to_dict()
            company   = clean(row.get("Company Name"))
            if not company:
                continue
            full_name = clean(row.get("Contact Person")) or company
            mob_raw   = str(row.get("Mobile", "") or "")
            mobiles   = extract_mobiles(mob_raw)
            email_raw = str(row.get("Email", "") or "")
            # May have multiple emails separated by /
            emails    = [e.strip().lower() for e in email_raw.split("/") if "@" in e]
            email     = emails[0] if emails else None
            addr      = clean(row.get("Address"))
            city      = clean(row.get("City")) or derive_city(addr)
            records.append({
                "sr_no": i+1, "full_name": full_name, "designation": None,
                "company": company, "mobiles": mobiles, "email": email,
                "social_category": None, "gender": None, "msme_type": None,
                "udyam_aadhaar": None, "sector": None, "company_type": None,
                "address": addr, "city": city,
                "raw": {str(k): str(v) for k,v in raw.items()},
                "source_file": source_file,
            })
    except Exception as e:
        print(f"  Data 1 error: {e}")

    # Sheet Data 2: just company name + mobile
    try:
        df2 = pd.read_excel(path, sheet_name="Data 2", header=None)
        for i, row in df2.iterrows():
            company = clean(row[0])
            if not company:
                continue
            mobiles = extract_mobiles(row[1])
            records.append({
                "sr_no": len(records)+1, "full_name": company, "designation": None,
                "company": company, "mobiles": mobiles, "email": None,
                "social_category": None, "gender": None, "msme_type": None,
                "udyam_aadhaar": None, "sector": None, "company_type": None,
                "address": "Ahmedabad", "city": "Ahmedabad",
                "raw": {"col_0": str(row[0]), "col_1": str(row[1])},
                "source_file": f"{source_file}:Data2",
            })
    except Exception as e:
        print(f"  Data 2 error: {e}")

    return records

def parse_metoda(path, source_file):
    """METODA files: Sheet1 has header on row 1. Cols 0-6: Sr, Name, Pl.no, Person, Mobile, Ph, Email.
    Also parse all other sheets (Aji GIDC, Metoda GIDC, etc.) which have same pattern."""
    xf = pd.ExcelFile(path)
    all_records = []
    seen_companies = set()
    sheet_sr = {}
    for sheet in xf.sheet_names:
        if sheet == "STICKERS":
            continue
        try:
            df = pd.read_excel(path, sheet_name=sheet, header=None)
            if len(df) < 3:
                continue
            # Header is on row 1 for Sheet1, row 1 for others too
            # Row 0 is title, Row 1 is header
            header_row = None
            for idx in range(min(5, len(df))):
                vals = [str(v).strip().lower() for v in df.iloc[idx] if pd.notna(v) and str(v).strip()]
                if any(k in " ".join(vals) for k in ["name", "party", "mobile", "company", "sr"]):
                    header_row = idx
                    break
            if header_row is None:
                continue

            headers = []
            for v in df.iloc[header_row]:
                h = str(v).strip() if pd.notna(v) else ""
                headers.append(h)
            df = df.iloc[header_row+1:].reset_index(drop=True)
            df.columns = headers

            sr_offset = sheet_sr.get(sheet, 0)
            for i, row in df.iterrows():
                raw = {}
                for j, h in enumerate(headers[:10]):
                    val = row.iloc[j] if j < len(row) else None
                    raw[h or f"col_{j}"] = str(val) if pd.notna(val) else None

                # Extract core fields by position (most robust for METODA)
                vals = list(row)
                company   = clean(vals[1]) if len(vals) > 1 else None
                if not company:
                    continue
                # Skip duplicate companies within same file
                key = company.lower().strip()
                if key in seen_companies:
                    continue
                seen_companies.add(key)

                full_name = clean(vals[3]) if len(vals) > 3 else company
                if not full_name: full_name = company

                # Mobile is col 4, may contain "9879510333 / 9825229296"
                mob_raw = vals[4] if len(vals) > 4 else None
                # Also check col 9 and 10 for extra mobile notes
                extra_note = ""
                if len(vals) > 9 and pd.notna(vals[9]):
                    extra_note = str(vals[9])
                mobiles = extract_mobiles(mob_raw)
                # Extract any extra mobiles from note column
                extra_mobs = extract_mobiles(extra_note)
                for m in extra_mobs:
                    if m not in mobiles:
                        mobiles.append(m)

                email = clean(vals[6]) if len(vals) > 6 else None
                if email: email = email.lower()

                addr  = clean(vals[2]) if len(vals) > 2 else None  # Pl.no. used as address
                city  = sheet if sheet not in ("Sheet1",) else "Metoda"

                sr_no_raw = vals[0]
                try:
                    sr_no = int(float(sr_no_raw)) + sr_offset
                except (ValueError, TypeError):
                    sr_no = i + 1 + sr_offset

                all_records.append({
                    "sr_no": sr_no, "full_name": full_name, "designation": None,
                    "company": company, "mobiles": mobiles, "email": email,
                    "social_category": None, "gender": None, "msme_type": None,
                    "udyam_aadhaar": None, "sector": "Manufacturing",
                    "company_type": "Manufacturing",
                    "address": addr, "city": city,
                    "raw": raw,
                    "source_file": f"{source_file}:{sheet}",
                })
            sheet_sr[sheet] = sr_offset + len(df)
        except Exception as e:
            print(f"  Sheet '{sheet}' error: {e}")
    return all_records


PARSERS = {
    "gandhidham":    parse_gandhidham,
    "mcma":          parse_mcma,
    "medium_rajkot": parse_medium_rajkot,
    "surendranagar": parse_surendranagar,
    "gbps":          parse_gbps,
    "rajkot_all":    parse_rajkot_all,
    "npc_ahmedabad": parse_npc_ahmedabad,
    "metoda":        parse_metoda,
}

# ─── DB Helpers ───────────────────────────────────────────────────────────────

def get_existing_mobiles(conn):
    """Return dict of mobile -> id for all existing users."""
    with conn.cursor() as cur:
        cur.execute("SELECT mobile, id FROM users WHERE mobile IS NOT NULL")
        return {row[0]: row[1] for row in cur.fetchall()}

def insert_user(conn, rec, existing_mobiles):
    """Insert or skip a user record. Returns ('inserted'|'duplicate'|'skipped', id)."""
    mobiles = rec.get("mobiles", [])
    primary_mobile = mobiles[0] if mobiles else None
    extra_mobiles  = mobiles[1:] if len(mobiles) > 1 else []

    # Check if primary mobile already exists
    dup_of = None
    if primary_mobile and primary_mobile in existing_mobiles:
        dup_of = existing_mobiles[primary_mobile]

    # Build notes with extra numbers
    notes_parts = []
    if extra_mobiles:
        notes_parts.append("Additional numbers: " + ", ".join(extra_mobiles))
    notes = "\n".join(notes_parts) if notes_parts else None

    email = rec.get("email")
    dq_flag = check_email_flag(email)

    raw_json = json.dumps({str(k): str(v) for k, v in rec.get("raw", {}).items()}, ensure_ascii=False)

    sql = """
        INSERT INTO users (
            sr_no, full_name, designation, company, mobile, email,
            social_category, gender, msme_type, udyam_aadhaar, sector,
            company_type, address, city, notes, possible_duplicate_of,
            data_quality_flag, raw_json, source_file, lead_source,
            current_status, priority, followup_count
        ) VALUES (
            %s,%s,%s,%s,%s,%s,
            %s,%s,%s,%s,%s,
            %s,%s,%s,%s,%s,
            %s,%s,%s,%s,
            'New','Medium',0
        )
        ON CONFLICT (source_file, sr_no) DO UPDATE SET
            full_name      = EXCLUDED.full_name,
            designation    = EXCLUDED.designation,
            company        = EXCLUDED.company,
            mobile         = EXCLUDED.mobile,
            email          = EXCLUDED.email,
            sector         = EXCLUDED.sector,
            company_type   = EXCLUDED.company_type,
            address        = EXCLUDED.address,
            city           = EXCLUDED.city,
            notes          = CASE WHEN users.notes IS NULL THEN EXCLUDED.notes ELSE users.notes END,
            updated_at     = NOW()
        RETURNING id, (xmax = 0) AS inserted
    """
    with conn.cursor() as cur:
        cur.execute(sql, (
            rec.get("sr_no"), rec.get("full_name"), rec.get("designation"),
            rec.get("company"), primary_mobile, email,
            rec.get("social_category"), rec.get("gender"), rec.get("msme_type"),
            rec.get("udyam_aadhaar"), rec.get("sector"),
            rec.get("company_type"), rec.get("address"), rec.get("city"),
            notes, dup_of, dq_flag, raw_json,
            rec.get("source_file"), rec.get("source_file"),
        ))
        row = cur.fetchone()
        user_id, was_inserted = row
    conn.commit()

    if primary_mobile and primary_mobile not in existing_mobiles:
        existing_mobiles[primary_mobile] = user_id

    # Also register extra mobiles so subsequent rows don't duplicate
    for m in extra_mobiles:
        if m not in existing_mobiles:
            existing_mobiles[m] = user_id

    status = "inserted" if was_inserted else "updated"
    if dup_of:
        status = "duplicate"
    return status, user_id


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    conn = get_conn()
    print("Connected to PostgreSQL.\n")

    existing_mobiles = get_existing_mobiles(conn)
    print(f"Existing contacts in DB: {len(existing_mobiles)}\n")

    total_inserted = 0
    total_updated  = 0
    total_dup      = 0
    total_skipped  = 0

    for source_file, path, parser_type in FILES:
        print(f"{'='*60}")
        print(f"Processing: {source_file}")
        parser = PARSERS[parser_type]
        try:
            records = parser(path, source_file)
        except Exception as e:
            print(f"  PARSE ERROR: {e}")
            total_skipped += 1
            continue

        file_ins = file_upd = file_dup = file_skip = 0
        for rec in records:
            try:
                status, uid = insert_user(conn, rec, existing_mobiles)
                if status == "inserted":   file_ins += 1
                elif status == "updated":  file_upd += 1
                elif status == "duplicate": file_dup += 1
            except Exception as e:
                print(f"  ROW ERROR ({rec.get('full_name','?')}): {e}")
                conn.rollback()
                file_skip += 1

        print(f"  Parsed: {len(records)} rows | Inserted: {file_ins} | Updated: {file_upd} | Duplicates: {file_dup} | Errors: {file_skip}")
        total_inserted += file_ins
        total_updated  += file_upd
        total_dup      += file_dup
        total_skipped  += file_skip

    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM users")
        total_users = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users WHERE possible_duplicate_of IS NOT NULL")
        total_dups_flagged = cur.fetchone()[0]

    conn.close()

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"  Newly inserted : {total_inserted}")
    print(f"  Updated        : {total_updated}")
    print(f"  Duplicates flagged: {total_dup}")
    print(f"  Errors/skipped : {total_skipped}")
    print(f"  Total users in DB: {total_users}")
    print(f"  Total duplicate flags in DB: {total_dups_flagged}")

if __name__ == "__main__":
    main()
