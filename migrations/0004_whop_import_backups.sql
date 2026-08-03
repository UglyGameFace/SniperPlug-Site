PRAGMA foreign_keys = ON;

ALTER TABLE whop_posts ADD COLUMN stale_at TEXT;

CREATE INDEX IF NOT EXISTS idx_whop_posts_current
  ON whop_posts (experience_id, stale_at, source_updated_at DESC);

CREATE TABLE IF NOT EXISTS whop_import_backups (
  backup_id TEXT PRIMARY KEY,
  owner_session_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('all', 'source')),
  experience_id TEXT,
  label TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'verified', 'failed')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  checksum TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL DEFAULT '',
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  reset_token_hash TEXT,
  reset_token_expires_at TEXT,
  reset_options_json TEXT,
  reset_used_at TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  restored_at TEXT,
  restore_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_whop_import_backups_created
  ON whop_import_backups (deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whop_import_backups_scope
  ON whop_import_backups (scope, experience_id, deleted_at, created_at DESC);

CREATE TABLE IF NOT EXISTS whop_import_backup_rows (
  backup_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (backup_id, entity_type, entity_key),
  FOREIGN KEY (backup_id) REFERENCES whop_import_backups(backup_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whop_import_backup_rows_type
  ON whop_import_backup_rows (backup_id, entity_type, entity_key);

CREATE TABLE IF NOT EXISTS whop_import_backup_media (
  backup_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  source_key TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (backup_id, storage_key),
  FOREIGN KEY (backup_id) REFERENCES whop_import_backups(backup_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whop_import_backup_media_key
  ON whop_import_backup_media (storage_key, backup_id);
