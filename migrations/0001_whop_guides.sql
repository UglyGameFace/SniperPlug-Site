PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guide_categories (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO guide_categories (slug, label, description, sort_order, active, created_at, updated_at) VALUES
  ('general', 'General', 'Guides that do not fit a product-specific category yet.', 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('electronics', 'Electronics', 'Electronics, gaming, computers, and related methods.', 20, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('home', 'Home', 'Home goods, cleaning, furniture, and household methods.', 30, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kitchen', 'Kitchen', 'Kitchen products, appliances, food-prep, and related methods.', 40, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('outdoor', 'Outdoor', 'Outdoor, seasonal, grilling, and recreation methods.', 50, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('smart-home', 'Smart Home', 'Connected-home, security, automation, and smart-device methods.', 60, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tools', 'Tools', 'Tools, hardware, home-improvement, and workshop methods.', 70, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS whop_oauth_states (
  state TEXT PRIMARY KEY,
  admin_session_id TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whop_oauth_states_expires
  ON whop_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS whop_sessions (
  admin_session_id TEXT PRIMARY KEY,
  access_cipher TEXT NOT NULL,
  refresh_cipher TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  scopes TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  user_json TEXT NOT NULL DEFAULT '{}',
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS whop_sources (
  experience_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  company_id TEXT,
  company_title TEXT,
  experience_name TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'disapproved')),
  default_group TEXT CHECK (default_group IN ('black-box', 'hidden-files') OR default_group IS NULL),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whop_sources_decision
  ON whop_sources (decision, updated_at DESC);

CREATE TABLE IF NOT EXISTS whop_posts (
  source_key TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  author_json TEXT NOT NULL DEFAULT '{}',
  attachment_json TEXT NOT NULL DEFAULT '[]',
  source_created_at TEXT,
  source_updated_at TEXT,
  source_fingerprint TEXT,
  integrity_json TEXT NOT NULL DEFAULT '{}',
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'disapproved', 'blocked')),
  decision_updated_at TEXT,
  last_scanned_at TEXT NOT NULL,
  FOREIGN KEY (experience_id) REFERENCES whop_sources(experience_id) ON DELETE CASCADE,
  UNIQUE (experience_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_whop_posts_experience_decision
  ON whop_posts (experience_id, decision, source_updated_at DESC);

CREATE TABLE IF NOT EXISTS guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rejected')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 999,
  source_key TEXT UNIQUE,
  source_group TEXT,
  source_experience_id TEXT,
  source_post_id TEXT,
  source_fingerprint TEXT,
  attachment_json TEXT NOT NULL DEFAULT '[]',
  integrity_json TEXT NOT NULL DEFAULT '{}',
  author_json TEXT NOT NULL DEFAULT '{}',
  source_created_at TEXT,
  source_updated_at TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  FOREIGN KEY (category_slug) REFERENCES guide_categories(slug),
  FOREIGN KEY (source_key) REFERENCES whop_posts(source_key) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_guides_public
  ON guides (status, featured DESC, sort_order ASC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_guides_category
  ON guides (category_slug, status, sort_order ASC);
