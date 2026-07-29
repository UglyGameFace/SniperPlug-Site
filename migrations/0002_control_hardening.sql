CREATE TABLE IF NOT EXISTS bulk_jobs (
  id TEXT PRIMARY KEY,
  admin_session_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'canceled')),
  source_ids_json TEXT NOT NULL,
  source_index INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL DEFAULT '[]',
  failures_json TEXT NOT NULL DEFAULT '[]',
  summary_json TEXT NOT NULL DEFAULT '{}',
  lease_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bulk_jobs_owner_status
  ON bulk_jobs (admin_session_id, status, updated_at DESC);
