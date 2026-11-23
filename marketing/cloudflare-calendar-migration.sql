ALTER TABLE leads ADD COLUMN preferred_time TEXT;
ALTER TABLE leads ADD COLUMN duration_minutes INTEGER;
ALTER TABLE leads ADD COLUMN google_calendar_event_id TEXT;
ALTER TABLE leads ADD COLUMN calendar_sync_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE leads ADD COLUMN calendar_error TEXT;
CREATE TABLE IF NOT EXISTS demo_slots (date TEXT NOT NULL, time TEXT NOT NULL, lead_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, PRIMARY KEY(date,time));
CREATE INDEX IF NOT EXISTS idx_leads_calendar ON leads(calendar_sync_status, created_at DESC);
