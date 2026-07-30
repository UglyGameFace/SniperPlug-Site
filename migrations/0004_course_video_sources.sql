-- Stable descriptors for authorized Whop course-video playback.
-- Tokens and playback IDs are intentionally not persisted; each request
-- re-fetches the exact lesson through the connected Whop OAuth session.
CREATE TABLE IF NOT EXISTS course_video_sources (
  video_key TEXT PRIMARY KEY,
  guide_id INTEGER NOT NULL,
  lesson_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  audio_only INTEGER NOT NULL DEFAULT 0 CHECK (audio_only IN (0, 1)),
  duration_seconds REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_video_sources_guide ON course_video_sources (guide_id);
CREATE INDEX IF NOT EXISTS idx_course_video_sources_lesson ON course_video_sources (lesson_id);
