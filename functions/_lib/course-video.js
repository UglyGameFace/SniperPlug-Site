import { sha256 } from './crypto.js';
import { HttpError, requireDatabase } from './http.js';

const VIDEO_KEY_PATTERN = /^wcv-[a-f0-9]{40}$/;
const STATIC_PROBE_TIMEOUT_MS = 12_000;
const STATIC_RENDITIONS = Object.freeze([
  'highest.mp4',
  'capped-2160p.mp4',
  'capped-1440p.mp4',
  'capped-1080p.mp4',
  'high.mp4',
  'medium.mp4',
]);

let schemaPromise = null;

export function validCourseVideoKey(value) {
  const key = String(value || '').trim();
  return VIDEO_KEY_PATTERN.test(key) ? key : '';
}

export function extractCourseVideoKeys(value) {
  const keys = new Set();
  const expression = /\/course-video\/(wcv-[a-f0-9]{40})/g;
  for (const match of String(value || '').matchAll(expression)) {
    const key = validCourseVideoKey(match[1]);
    if (key) keys.add(key);
  }
  return keys;
}

export function muxPlayback(asset) {
  const signedPlaybackId = String(asset?.signed_playback_id || '').trim();
  const publicPlaybackId = String(asset?.playback_id || '').trim();
  const playbackId = signedPlaybackId || publicPlaybackId;
  if (!playbackId) return null;
  return {
    playbackId,
    signed: Boolean(signedPlaybackId),
    playbackToken: String(asset?.signed_video_playback_token || '').trim() || null,
    thumbnailToken: String(asset?.signed_thumbnail_playback_token || '').trim() || null,
    storyboardToken: String(asset?.signed_storyboard_playback_token || '').trim() || null,
    audioOnly: Boolean(asset?.audio_only),
    durationSeconds: Math.max(0, Number(asset?.duration_seconds || 0)) || null,
    assetId: String(asset?.id || asset?.asset_id || '').trim() || null,
    status: String(asset?.status || '').trim().toLowerCase() || null,
  };
}

function muxResourceUrl(playback, filename) {
  const url = new URL(`https://stream.mux.com/${encodeURIComponent(playback.playbackId)}/${filename}`);
  if (playback.playbackToken) url.searchParams.set('token', playback.playbackToken);
  return url;
}

function totalBytes(response) {
  const contentRange = String(response.headers.get('content-range') || '');
  const total = Number(contentRange.match(/\/(\d+)\s*$/)?.[1] || 0);
  if (total > 0) return total;
  const length = Number(response.headers.get('content-length') || 0);
  return response.status === 200 && length > 0 ? length : null;
}

export async function findMuxStaticRendition(asset, { timeoutMs = STATIC_PROBE_TIMEOUT_MS } = {}) {
  const playback = muxPlayback(asset);
  if (!playback) return null;
  const candidates = playback.audioOnly ? ['audio.m4a'] : STATIC_RENDITIONS;
  for (const filename of candidates) {
    const url = muxResourceUrl(playback, filename);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          accept: playback.audioOnly ? 'audio/mp4,*/*;q=0.8' : 'video/mp4,*/*;q=0.8',
          range: 'bytes=0-0',
        },
      });
      const usable = response.status === 200 || response.status === 206;
      const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      await response.body?.cancel().catch(() => null);
      if (!usable || (!contentType.startsWith('video/') && !contentType.startsWith('audio/') && contentType !== 'application/octet-stream')) continue;
      return {
        playback,
        filename,
        url: url.toString(),
        contentType: contentType || (playback.audioOnly ? 'audio/mp4' : 'video/mp4'),
        size: totalBytes(response),
      };
    } catch {
      // A missing static rendition is normal; adaptive HLS playback remains available.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function ensureSchema(env) {
  if (schemaPromise) return schemaPromise;
  const db = requireDatabase(env);
  schemaPromise = db.batch([
    db.prepare(`
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
      )
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_course_video_sources_guide ON course_video_sources (guide_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_course_video_sources_lesson ON course_video_sources (lesson_id)'),
  ]).then(() => db).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function registerCourseVideo(env, { guideId, lessonId, sourceKey, title, asset }) {
  const numericGuideId = Number.parseInt(guideId, 10);
  const exactLessonId = String(lessonId || '').trim();
  const exactSourceKey = String(sourceKey || '').trim();
  const playback = muxPlayback(asset);
  if (!Number.isFinite(numericGuideId) || numericGuideId <= 0 || !exactLessonId || !exactSourceKey || !playback) return null;
  const digest = await sha256(`${numericGuideId}:${exactLessonId}:${playback.assetId || playback.playbackId}`);
  const videoKey = `wcv-${digest.slice(0, 40)}`;
  const now = new Date().toISOString();
  const db = await ensureSchema(env);
  await db.prepare(`
    INSERT INTO course_video_sources (
      video_key, guide_id, lesson_id, source_key, title, audio_only, duration_seconds, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_key) DO UPDATE SET
      guide_id = excluded.guide_id,
      lesson_id = excluded.lesson_id,
      source_key = excluded.source_key,
      title = excluded.title,
      audio_only = excluded.audio_only,
      duration_seconds = excluded.duration_seconds,
      updated_at = excluded.updated_at
  `).bind(
    videoKey,
    numericGuideId,
    exactLessonId,
    exactSourceKey,
    String(title || 'Course video').normalize('NFKC').trim().slice(0, 180) || 'Course video',
    playback.audioOnly ? 1 : 0,
    playback.durationSeconds,
    now,
    now,
  ).run();
  return {
    videoKey,
    playerUrl: `/course-video/${encodeURIComponent(videoKey)}`,
    downloadUrl: `/course-video/${encodeURIComponent(videoKey)}?download=1`,
    playback,
  };
}

export async function courseVideoSource(env, key) {
  const videoKey = validCourseVideoKey(key);
  if (!videoKey) throw new HttpError(404, 'Course video not found.');
  const db = await ensureSchema(env);
  const row = await db.prepare(`
    SELECT course_video_sources.*, guides.status AS guide_status
    FROM course_video_sources
    JOIN guides ON guides.id = course_video_sources.guide_id
    WHERE course_video_sources.video_key = ?
  `).bind(videoKey).first();
  if (!row) throw new HttpError(404, 'Course video not found.');
  return row;
}

export async function removeOtherCourseVideos(env, guideId, keepKey = null) {
  const numericGuideId = Number.parseInt(guideId, 10);
  if (!Number.isFinite(numericGuideId) || numericGuideId <= 0) return;
  const db = await ensureSchema(env);
  if (keepKey) {
    await db.prepare('DELETE FROM course_video_sources WHERE guide_id = ? AND video_key != ?').bind(numericGuideId, keepKey).run();
  } else {
    await db.prepare('DELETE FROM course_video_sources WHERE guide_id = ?').bind(numericGuideId).run();
  }
}

export async function pruneDetachedCourseVideos(env, guideId, body, attachments = {}) {
  const numericGuideId = Number.parseInt(guideId, 10);
  if (!Number.isFinite(numericGuideId) || numericGuideId <= 0) return attachments;
  const referenced = extractCourseVideoKeys(body);
  const db = await ensureSchema(env);
  const rows = await db.prepare('SELECT video_key FROM course_video_sources WHERE guide_id = ?').bind(numericGuideId).all();
  for (const row of rows.results || []) {
    if (!referenced.has(String(row.video_key || ''))) {
      await db.prepare('DELETE FROM course_video_sources WHERE guide_id = ? AND video_key = ?')
        .bind(numericGuideId, row.video_key).run();
    }
  }
  const files = Array.isArray(attachments?.files) ? attachments.files : [];
  const kept = files.filter((file) => {
    if (!['hosted-video-player', 'hosted-video-download'].includes(String(file?.role || ''))) return true;
    const keys = extractCourseVideoKeys(file?.url);
    return [...keys].some((key) => referenced.has(key));
  });
  const next = {
    ...attachments,
    files: kept,
    reviewCount: kept.filter((file) => file?.durable !== true || !file?.url).length,
  };
  await db.prepare('UPDATE guides SET attachment_json = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(next), new Date().toISOString(), numericGuideId).run();
  return next;
}

export function muxPlayerUrl(asset, title = 'Course video') {
  const playback = muxPlayback(asset);
  if (!playback) return null;
  const url = new URL(`https://player.mux.com/${encodeURIComponent(playback.playbackId)}`);
  if (playback.playbackToken) url.searchParams.set('playback-token', playback.playbackToken);
  if (playback.thumbnailToken) url.searchParams.set('thumbnail-token', playback.thumbnailToken);
  if (playback.storyboardToken) url.searchParams.set('storyboard-token', playback.storyboardToken);
  url.searchParams.set('title', String(title || 'Course video').slice(0, 180));
  url.searchParams.set('metadata-video-id', playback.assetId || playback.playbackId);
  url.searchParams.set('metadata-video-title', String(title || 'Course video').slice(0, 180));
  url.searchParams.set('disable-tracking', 'true');
  url.searchParams.set('disable-cookies', 'true');
  return url.toString();
}
