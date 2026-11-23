CREATE TABLE IF NOT EXISTS admin_login_codes (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_admin_code_created ON admin_login_codes(created_at DESC);
CREATE TABLE IF NOT EXISTS admin_sessions (session_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS admin_auth_rate (id TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);