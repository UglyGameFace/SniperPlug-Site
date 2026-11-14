-- Additive, isolated bot observability store. No changes to the SniperPlug
-- production SQLite or Whop importer tables.
CREATE TABLE IF NOT EXISTS sniperplug_ops_snapshots (
  id TEXT PRIMARY KEY,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source = 'discloud-sniperplug'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sniperplug_ops_snapshots_received
  ON sniperplug_ops_snapshots(received_at DESC);
