-- Serialize OAuth refresh-token rotation across concurrent Cloudflare requests.
-- Runtime code also self-creates this table so existing deployments fail safely
-- if this migration has not been applied yet.
CREATE TABLE IF NOT EXISTS whop_refresh_leases (
  admin_session_id TEXT PRIMARY KEY,
  lease_token TEXT NOT NULL,
  base_token_version INTEGER NOT NULL,
  lease_until TEXT NOT NULL,
  created_at TEXT NOT NULL
);
