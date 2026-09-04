-- Runtime code also self-creates this table so existing deployments fail safely
-- if this migration has not been applied yet.
CREATE TABLE IF NOT EXISTS browser_capture_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_session_id TEXT NOT NULL,
  allowed_origins_json TEXT NOT NULL DEFAULT '[]',
  rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (rights_confirmed IN (0, 1)),
  use_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 100,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_browser_capture_sessions_expires
  ON browser_capture_sessions (expires_at);
