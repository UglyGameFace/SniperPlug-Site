PRAGMA foreign_keys = ON;

-- Existing owner rows keep their physical primary/foreign keys. New subscriber
-- rows use deterministic tenant-specific storage keys while these upstream
-- columns preserve the exact Whop ids exposed to API clients.
ALTER TABLE whop_sources ADD COLUMN principal_id TEXT NOT NULL DEFAULT 'sniperplug-owner';
ALTER TABLE whop_sources ADD COLUMN upstream_experience_id TEXT;
ALTER TABLE whop_posts ADD COLUMN principal_id TEXT NOT NULL DEFAULT 'sniperplug-owner';
ALTER TABLE whop_posts ADD COLUMN upstream_source_key TEXT;
ALTER TABLE whop_posts ADD COLUMN upstream_experience_id TEXT;
ALTER TABLE guides ADD COLUMN principal_id TEXT NOT NULL DEFAULT 'sniperplug-owner';
ALTER TABLE guides ADD COLUMN upstream_source_key TEXT;

UPDATE whop_sources
SET upstream_experience_id = experience_id
WHERE upstream_experience_id IS NULL OR upstream_experience_id = '';

UPDATE whop_posts
SET upstream_source_key = source_key
WHERE upstream_source_key IS NULL OR upstream_source_key = '';

UPDATE whop_posts
SET upstream_experience_id = (
  SELECT COALESCE(s.upstream_experience_id, s.experience_id)
  FROM whop_sources s WHERE s.experience_id = whop_posts.experience_id
)
WHERE upstream_experience_id IS NULL OR upstream_experience_id = '';

UPDATE guides
SET upstream_source_key = source_key
WHERE source_key IS NOT NULL AND (upstream_source_key IS NULL OR upstream_source_key = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_whop_sources_principal_upstream
  ON whop_sources (principal_id, upstream_experience_id);
CREATE INDEX IF NOT EXISTS idx_whop_sources_principal_decision
  ON whop_sources (principal_id, decision, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whop_posts_principal_upstream
  ON whop_posts (principal_id, upstream_source_key);
CREATE INDEX IF NOT EXISTS idx_whop_posts_principal_experience
  ON whop_posts (principal_id, upstream_experience_id, decision, source_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guides_principal_status
  ON guides (principal_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guides_principal_upstream
  ON guides (principal_id, upstream_source_key) WHERE upstream_source_key IS NOT NULL;
