"""
Excel → PostgreSQL importer for Kolossus AI Marketing.
Usage: python importer.py "data/Gandhidham I-4.0.xlsx"
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

import db

BROKEN_WORDS = {
    "Inte rnational": "International",
    "Engi neering": "Engineering",
    "ga ndhidham": "Gandhidham",
    "agrib usiness": "agribusiness",
    "cong lomerate": "conglomerate",
    "infra structure": "infrastructure",
}

GMAIL_TYPO = re.compile(r"@[a-z]*gna?il\.(com|net|org)|@gidc\.(gnail|gmai)\.com", re.I)
CITY_WORDS = ["Gandhidham", "Anjar", "Bhuj", "Bhachau"]


def _clean_str(v):
    if v is None or (isinstance(v, float) and str(v) == "nan"):
        return None
    s = str(v).strip()
    return s if s else None


def _fix_words(s):
    if not s:
        return s
    for broken, fixed in BROKEN_WORDS.items():
        s = s.replace(broken, fixed)
    return s


def _derive_city(address):
    if not address:
        return None
    for city in CITY_WORDS:
        if city.lower() in address.lower():
            return city
    return None


def import_excel(file_path_or_obj, source_file=None):
    if source_file is None:
        source_file = str(file_path_or_obj) if isinstance(file_path_or_obj, (str, Path)) else "upload"

    df = pd.read_excel(
        file_path_or_obj,
        sheet_name="Sheet1",
        header=None,
        skiprows=1,
        dtype=str,
        engine="openpyxl",
    )

    df = df.iloc[:, :13]
    df.columns = [
        "sr_no", "full_name", "designation", "company", "mobile", "email",
        "social_category", "gender", "msme_type", "udyam_aadhaar",
        "sector", "company_type", "address",
    ]
    df = df.dropna(how="all").reset_index(drop=True)

    inserted = updated = skipped = duplicates = quality_flags = 0
    rows_read = len(df)

    mobile_first = {}
    for _, row in df.iterrows():
        mobile_raw = _clean_str(row.get("mobile"))
        if mobile_raw:
            mobile_clean = re.sub(r"\.0$", "", mobile_raw)
            sr = _clean_str(row.get("sr_no"))
            if mobile_clean not in mobile_first:
                mobile_first[mobile_clean] = sr

    conn = db.get_conn()
    cur = conn.cursor()

    for _, row in df.iterrows():
        raw = {col: _clean_str(row[col]) for col in df.columns}
        raw_json = json.dumps(raw)

        sr_no_raw = _clean_str(row.get("sr_no"))
        if not sr_no_raw:
            skipped += 1
            continue
        sr_no_str = re.sub(r"\.0$", "", sr_no_raw)
        try:
            sr_no = int(float(sr_no_str))
        except ValueError:
            skipped += 1
            continue

        mobile_raw = _clean_str(row.get("mobile"))
        mobile = re.sub(r"\.0$", "", mobile_raw) if mobile_raw else None

        full_name = _fix_words(_clean_str(row.get("full_name")))
        designation = _fix_words(_clean_str(row.get("designation")))
        company = _fix_words(_clean_str(row.get("company")))
        email_raw = _clean_str(row.get("email"))
        email = email_raw.lower() if email_raw else None
        social_category = _clean_str(row.get("social_category"))
        gender = _clean_str(row.get("gender"))
        msme_type = _clean_str(row.get("msme_type"))

        udyam_raw = _clean_str(row.get("udyam_aadhaar"))
        udyam_aadhaar = re.sub(r"\s+", "", udyam_raw) if udyam_raw else None

        sector = _fix_words(_clean_str(row.get("sector")))

        ct_raw = _clean_str(row.get("company_type"))
        company_type = ct_raw.replace("Manufacturin g", "Manufacturing") if ct_raw else None
        if company_type:
            company_type = _fix_words(company_type)

        address = _fix_words(_clean_str(row.get("address")))
        city = _derive_city(address)

        data_quality_flag = None
        if email and GMAIL_TYPO.search(email):
            data_quality_flag = "check_email"
            quality_flags += 1

        if not full_name:
            skipped += 1
            continue

        possible_duplicate_of = None
        if mobile and mobile in mobile_first and mobile_first[mobile] != sr_no_str:
            cur.execute(
                "SELECT id FROM users WHERE mobile = %s ORDER BY sr_no LIMIT 1", (mobile,)
            )
            existing = cur.fetchone()
            if existing:
                possible_duplicate_of = existing["id"]
                duplicates += 1

        cur.execute(
            "SELECT id FROM users WHERE source_file = %s AND sr_no = %s",
            (source_file, sr_no),
        )
        existing_row = cur.fetchone()

        try:
            if existing_row:
                cur.execute(
                    """UPDATE users SET
                       full_name=%s, designation=%s, company=%s, mobile=%s, email=%s,
                       social_category=%s, gender=%s, msme_type=%s, udyam_aadhaar=%s,
                       sector=%s, company_type=%s, address=%s, city=%s,
                       possible_duplicate_of=%s, data_quality_flag=%s, raw_json=%s,
                       updated_at=NOW()
                       WHERE source_file=%s AND sr_no=%s""",
                    (full_name, designation, company, mobile, email,
                     social_category, gender, msme_type, udyam_aadhaar,
                     sector, company_type, address, city,
                     possible_duplicate_of, data_quality_flag, raw_json,
                     source_file, sr_no),
                )
                updated += 1
            else:
                cur.execute(
                    """INSERT INTO users
                       (sr_no, full_name, designation, company, mobile, email,
                        social_category, gender, msme_type, udyam_aadhaar,
                        sector, company_type, address, city,
                        possible_duplicate_of, data_quality_flag, raw_json, source_file)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (sr_no, full_name, designation, company, mobile, email,
                     social_category, gender, msme_type, udyam_aadhaar,
                     sector, company_type, address, city,
                     possible_duplicate_of, data_quality_flag, raw_json, source_file),
                )
                inserted += 1
        except Exception:
            conn.rollback()
            skipped += 1
            continue

    conn.commit()

    # Second pass: fix possible_duplicate_of for rows inserted before their ref existed
    for _, row in df.iterrows():
        mobile_raw = _clean_str(row.get("mobile"))
        if not mobile_raw:
            continue
        mobile = re.sub(r"\.0$", "", mobile_raw)
        sr_no_raw = _clean_str(row.get("sr_no"))
        if not sr_no_raw:
            continue
        sr_no_str = re.sub(r"\.0$", "", sr_no_raw)
        try:
            sr_no = int(float(sr_no_str))
        except ValueError:
            continue

        if mobile in mobile_first and mobile_first[mobile] != sr_no_str:
            cur.execute(
                "SELECT id FROM users WHERE mobile = %s ORDER BY sr_no LIMIT 1", (mobile,)
            )
            first = cur.fetchone()
            cur.execute(
                "SELECT id, possible_duplicate_of FROM users WHERE source_file = %s AND sr_no = %s",
                (source_file, sr_no),
            )
            this = cur.fetchone()
            if first and this and this["possible_duplicate_of"] is None:
                cur.execute(
                    "UPDATE users SET possible_duplicate_of = %s WHERE id = %s",
                    (first["id"], this["id"]),
                )

    conn.commit()
    cur.close()
    conn.close()

    return dict(
        rows_read=rows_read,
        inserted=inserted,
        updated=updated,
        skipped=skipped,
        duplicates=duplicates,
        quality_flags=quality_flags,
    )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python importer.py <path_to_xlsx>")
        sys.exit(1)
    db.init_db()
    result = import_excel(sys.argv[1], source_file=Path(sys.argv[1]).name)
    print(f"Done: {result}")
