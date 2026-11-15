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

-- Stored HMAC key material is SHA-256-derived from a one-time owner pairing
-- secret. The cleartext pairing code is never saved or returned again.
CREATE TABLE IF NOT EXISTS sniperplug_ops_pairing (
  source TEXT PRIMARY KEY CHECK (source = 'discloud-sniperplug'),
  key_digest_hex TEXT NOT NULL,
  created_at TEXT NOT NULL
);
