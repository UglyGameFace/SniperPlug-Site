-- Cache bounded Whop app capability checks so source discovery can finish over
-- several small requests without exceeding Cloudflare or Whop request budgets.
CREATE TABLE IF NOT EXISTS whop_experience_capabilities (
  experience_id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('forum', 'course', 'chat', 'unsupported')),
  app_json TEXT NOT NULL DEFAULT '{}',
  probe_status TEXT NOT NULL CHECK (probe_status IN ('complete', 'transient')),
  probe_error TEXT,
  retry_after TEXT,
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whop_capabilities_checked
  ON whop_experience_capabilities (checked_at);
