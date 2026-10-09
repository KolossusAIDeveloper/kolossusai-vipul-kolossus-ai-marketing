-- Kolossus AI Marketing — Follow-up Tracker
-- Run on every connection: PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
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
  current_status        TEXT NOT NULL DEFAULT 'New' CHECK (current_status IN (
                          'New','Attempted - No Answer','Contacted','Interested',
                          'Follow-up Scheduled','Demo Scheduled','Proposal Sent',
                          'Negotiation','Converted','Not Interested',
                          'Invalid / Wrong Number','Do Not Contact')),
  status_updated_at     TEXT,
  last_followup_at      TEXT,
  last_channel          TEXT,
  last_outcome          TEXT,
  next_followup_at      TEXT,
  followup_count        INTEGER NOT NULL DEFAULT 0,
  assigned_to           TEXT,
  priority              TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
  interest_level        TEXT CHECK (interest_level IN ('Hot','Warm','Cold') OR interest_level IS NULL),
  lead_source           TEXT NOT NULL DEFAULT 'Gandhidham I-4.0 Excel',
  notes                 TEXT,
  possible_duplicate_of INTEGER REFERENCES users(id),
  data_quality_flag     TEXT,
  raw_json              TEXT,
  source_file           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (source_file, sr_no)
);

CREATE TABLE IF NOT EXISTS followups (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followup_at      TEXT NOT NULL,
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
  next_followup_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS ix_users_status   ON users(current_status);
CREATE INDEX IF NOT EXISTS ix_users_next     ON users(next_followup_at);
CREATE INDEX IF NOT EXISTS ix_users_mobile   ON users(mobile);
CREATE INDEX IF NOT EXISTS ix_followups_user ON followups(user_id, followup_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_followup_insert AFTER INSERT ON followups
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
    last_followup_at  = MAX(COALESCE(last_followup_at, ''), NEW.followup_at),
    followup_count    = (SELECT COUNT(*) FROM followups WHERE user_id = NEW.user_id),
    updated_at        = datetime('now','localtime')
  WHERE id = NEW.user_id;
END;
