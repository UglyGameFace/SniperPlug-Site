CREATE TABLE IF NOT EXISTS media_storage_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used_bytes INTEGER NOT NULL DEFAULT 0,
  reserved_bytes INTEGER NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0,
  copy_month TEXT,
  copies_this_month INTEGER NOT NULL DEFAULT 0,
  copy_day TEXT,
  copies_today INTEGER NOT NULL DEFAULT 0,
  read_day TEXT,
  origin_reads_today INTEGER NOT NULL DEFAULT 0,
  last_inventory_at TEXT,
  last_cleanup_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO media_storage_state (
  id, used_bytes, reserved_bytes, object_count, copy_month, copies_this_month,
  copy_day, copies_today, read_day, origin_reads_today,
  last_inventory_at, last_cleanup_at, updated_at
) VALUES (
  1, 0, 0, 0, strftime('%Y-%m', 'now'), 0,
  date('now'), 0, date('now'), 0,
  NULL, NULL, CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_objects (
  storage_key TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  reserved_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('copying', 'ready')),
  reservation_id TEXT,
  managed INTEGER NOT NULL DEFAULT 1 CHECK (managed IN (0, 1)),
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  source_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_referenced_at TEXT,
  unreferenced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_objects_status
  ON media_objects (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_media_objects_cleanup
  ON media_objects (managed, status, unreferenced_at);
