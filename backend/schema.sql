-- Kolossus AI Marketing — Follow-up Tracker
-- PostgreSQL schema (managed via init_schema() in db.py)
-- This file is kept for reference; actual schema creation is done programmatically.

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
  current_status        TEXT NOT NULL DEFAULT 'New',
  status_updated_at     TIMESTAMP,
  last_followup_at      TIMESTAMP,
  last_channel          TEXT,
  last_outcome          TEXT,
  next_followup_at      TIMESTAMP,
  followup_count        INTEGER NOT NULL DEFAULT 0,
  assigned_to           TEXT,
  priority              TEXT NOT NULL DEFAULT 'Medium',
  interest_level        TEXT,
  lead_source           TEXT NOT NULL DEFAULT 'Gandhidham I-4.0 Excel',
  notes                 TEXT,
  possible_duplicate_of INTEGER REFERENCES users(id),
  data_quality_flag     TEXT,
  raw_json              TEXT,
  source_file           TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (source_file, sr_no)
);

CREATE TABLE IF NOT EXISTS followups (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followup_at      TIMESTAMP NOT NULL,
  channel          TEXT NOT NULL,
  direction        TEXT NOT NULL DEFAULT 'Outbound',
  call_result      TEXT,
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
);
