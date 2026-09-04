import { randomToken, sha256 } from './crypto.js';
import { listCategories, slugify, suggestedCategoryForText } from './guides.js';
import { HttpError, requireDatabase } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';

const CAPTURE_TTL_MS = 30 * 60_000;
const CAPTURE_MAX_USES = 100;
const MAX_CAPTURE_BODY_BYTES = 1_000_000;
const CAPTURE_SOURCE_GROUP = 'Authorized Whop page capture';

function safeJson(value, fallback = null) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function excerpt(value, limit = 260) {
  return String(value || '')
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function whopOwnedOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === 'whop.com'
      || host.endsWith('.whop.com')
      || host === 'whop.site'
      || host.endsWith('.whop.site');
  } catch {
    return false;
  }
}

function exactExperienceId(value) {
  const id = String(value || '').trim();
  return /^exp_[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

function exactAppId(value) {
  const id = String(value || '').trim();
  return /^app_[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

async function ensureCaptureSchema(env) {
  const db = requireDatabase(env);
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS browser_capture_sessions (
        token_hash TEXT PRIMARY KEY,
        admin_session_id TEXT NOT NULL,
        allowed_origins_json TEXT NOT NULL DEFAULT '[]',
        rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (rights_confirmed IN (0, 1)),
        use_count INTEGER NOT NULL DEFAULT 0,
        max_uses INTEGER NOT NULL DEFAULT 100,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      )
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_browser_capture_sessions_expires ON browser_capture_sessions (expires_at)'),
  ]);
  return db;
}

async function discoveredCaptureOrigins(db) {
  const origins = new Set(['https://whop.com']);
  try {
    const rows = await db.prepare(`
      SELECT app_json
      FROM whop_experience_capabilities
      WHERE source_type = 'unsupported' AND probe_status = 'complete'
      ORDER BY checked_at DESC
      LIMIT 250
    `).all();
    for (const row of rows.results || []) {
      const app = safeJson(row.app_json, {});
      const origin = normalizedOrigin(app?.origin || app?.experienceUrl || app?.openapiUrl || app?.skillsUrl);
      if (origin) origins.add(origin);
    }
  } catch {
    // Capability-cache absence must not disable the helper for Whop-hosted app origins.
  }
  return [...origins];
}

export async function createAuthorizedCaptureSession(env, admin, { rightsConfirmed = false } = {}) {
  if (rightsConfirmed !== true) {
    throw new HttpError(422, 'Confirm that you own this content or have explicit permission to store and republish it before creating a browser-capture token.');
  }
  const db = await ensureCaptureSchema(env);
  const now = new Date();
  const token = `cap_${randomToken(24)}`;
  const tokenHash = await sha256(token);
  const expiresAt = new Date(now.getTime() + CAPTURE_TTL_MS).toISOString();
  const allowedOrigins = await discoveredCaptureOrigins(db);
  await db.prepare('DELETE FROM browser_capture_sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
  await db.prepare(`
    INSERT INTO browser_capture_sessions (
      token_hash, admin_session_id, allowed_origins_json, rights_confirmed,
      use_count, max_uses, expires_at, created_at, last_used_at
    ) VALUES (?, ?, ?, 1, 0, ?, ?, ?, NULL)
  `).bind(tokenHash, String(admin?.sid || ''), JSON.stringify(allowedOrigins), CAPTURE_MAX_USES, expiresAt, now.toISOString()).run();
  return {
    token,
    expiresAt,
    maxUses: CAPTURE_MAX_USES,
    allowedOrigins,
  };
}

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '').trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function captureSessionForRequest(request, env, sourceUrl) {
  const token = bearerToken(request);
  if (!/^cap_[A-Za-z0-9_-]{20,}$/.test(token)) throw new HttpError(401, 'The SniperPlug browser-capture token is missing or invalid.');
  const db = await ensureCaptureSchema(env);
  const tokenHash = await sha256(token);
  const row = await db.prepare('SELECT * FROM browser_capture_sessions WHERE token_hash = ?').bind(tokenHash).first();
  if (!row) throw new HttpError(401, 'This browser-capture token is not recognized. Generate a new token in the Control Center.');
  if (Number(row.rights_confirmed || 0) !== 1) throw new HttpError(403, 'This browser-capture token was not created with the required rights confirmation.');
  if (Date.parse(String(row.expires_at || '')) <= Date.now()) {
    await db.prepare('DELETE FROM browser_capture_sessions WHERE token_hash = ?').bind(tokenHash).run();
    throw new HttpError(401, 'This browser-capture token expired. Generate a new one in the Control Center.');
  }
  if (Number(row.use_count || 0) >= Number(row.max_uses || CAPTURE_MAX_USES)) {
    throw new HttpError(429, 'This browser-capture token reached its page limit. Generate a new token to continue.');
  }

  const origin = normalizedOrigin(sourceUrl);
  if (!origin) throw new HttpError(422, 'Capture only an HTTPS page that is already open in your authorized browser session.');
  const allowedOrigins = new Set(safeJson(row.allowed_origins_json, []));
  if (!whopOwnedOrigin(origin) && !allowedOrigins.has(origin)) {
    throw new HttpError(403, 'This capture token is not authorized for the current app origin. Refresh Whop sources first, then generate a new token.', {
      code: 'capture_origin_not_authorized',
      origin,
    });
  }

  const usedAt = new Date().toISOString();
  const changed = await db.prepare(`
    UPDATE browser_capture_sessions
    SET use_count = use_count + 1, last_used_at = ?
    WHERE token_hash = ? AND use_count < max_uses AND expires_at > ?
  `).bind(usedAt, tokenHash, usedAt).run();
  if (Number(changed.meta?.changes || 0) !== 1) throw new HttpError(409, 'The browser-capture token changed while this page was being accepted. Generate a new token and retry once.');
  return { db, row, origin };
}

async function categoryForCapture(env, title, body) {
  const active = await listCategories(env);
  if (!active.length) throw new HttpError(503, 'Create at least one active SniperPlug guide category before importing browser-captured content.');
  const allowed = new Set(active.map((item) => item.slug));
  const suggested = suggestedCategoryForText(`${title}\n${body}`);
  if (allowed.has(suggested)) return suggested;
  if (allowed.has('general')) return 'general';
  return active[0].slug;
}

function normalizedCaptureInput(input) {
  const sourceUrl = String(input?.sourceUrl || '').trim();
  const title = String(input?.title || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const markdown = String(input?.markdown || '').trim();
  const experienceId = exactExperienceId(input?.experienceId);
  const appId = exactAppId(input?.appId);
  const appName = String(input?.appName || '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Whop app';
  const imageUrls = [...new Set((Array.isArray(input?.imageUrls) ? input.imageUrls : [])
    .map((value) => String(value || '').trim())
    .filter((value) => /^https:\/\//i.test(value))
    .slice(0, 100))];
  if (!sourceUrl) throw new HttpError(422, 'The browser helper did not provide the current page URL.');
  if (!title) throw new HttpError(422, 'The browser helper could not find a guide title on this page.');
  if (!markdown || markdown.length < 80) throw new HttpError(422, 'The rendered page did not contain enough guide content to import safely.');
  if (new TextEncoder().encode(markdown).byteLength > MAX_CAPTURE_BODY_BYTES) throw new HttpError(413, 'This rendered guide is too large for one capture.');
  return { sourceUrl, title, markdown, experienceId, appId, appName, imageUrls };
}

export async function saveAuthorizedCapturedPage(request, env, input) {
  const capture = normalizedCaptureInput(input);
  const session = await captureSessionForRequest(request, env, capture.sourceUrl);
  const prepared = await prepareGuideBody(capture.markdown, { source: `Authorized rendered page ${capture.sourceUrl}` });
  const integrity = await assertGuideRoundTrip(prepared.body, prepared.body);
  const category = await categoryForCapture(env, capture.title, prepared.body);
  const sourcePostId = `browser:${(await sha256(capture.sourceUrl)).slice(0, 24)}`;
  const contentFingerprint = await sha256(JSON.stringify({ title: capture.title.toLowerCase(), body: prepared.body }));
  const sourceFingerprint = await sha256(JSON.stringify({
    sourcePostId,
    sourceUrl: capture.sourceUrl,
    origin: session.origin,
    title: capture.title,
    body: prepared.body,
    imageUrls: capture.imageUrls,
    experienceId: capture.experienceId,
    appId: capture.appId,
  }));
  const existing = await session.db.prepare(`
    SELECT * FROM guides
    WHERE source_key IS NULL AND source_group = ? AND source_post_id = ? AND status != 'rejected'
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).bind(CAPTURE_SOURCE_GROUP, sourcePostId).first();
  if (existing?.source_fingerprint === sourceFingerprint) {
    return {
      guideId: Number(existing.id),
      slug: existing.slug,
      title: existing.title,
      category: existing.category_slug,
      action: 'unchanged',
      imageReviewCount: capture.imageUrls.length,
    };
  }

  const duplicate = await session.db.prepare(`
    SELECT id, slug, title, category_slug FROM guides
    WHERE id IS NOT ? AND lower(title) = lower(?) AND body_markdown = ? AND status != 'rejected'
    ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(existing?.id || null, capture.title, prepared.body).first();
  if (duplicate) {
    return {
      guideId: Number(duplicate.id),
      slug: duplicate.slug,
      title: duplicate.title,
      category: duplicate.category_slug,
      action: 'duplicate-held',
      imageReviewCount: capture.imageUrls.length,
    };
  }

  const slugBase = slugify(capture.title) || 'captured-guide';
  const slug = existing?.slug || `${slugBase.slice(0, 62)}-${(await sha256(sourcePostId)).slice(0, 12)}`;
  const now = new Date().toISOString();
  const expectedUpdatedAt = existing?.updated_at == null ? null : String(existing.updated_at);
  const sourceMeta = {
    type: 'browser-capture',
    captureMode: 'rendered-dom',
    sourceUrl: capture.sourceUrl,
    origin: session.origin,
    experienceId: capture.experienceId,
    appId: capture.appId,
    appName: capture.appName,
    imageUrls: capture.imageUrls,
  };
  const attachment = {
    files: capture.imageUrls.map((url, index) => ({
      id: `captured-image-${index + 1}`,
      filename: `Captured image ${index + 1}`,
      contentType: 'image/unknown',
      url,
      role: 'browser-captured-image',
      reviewReason: 'This image came from an authenticated rendered page. Copy it to SniperPlug-owned storage or remove it before publishing if the URL is private or expiring.',
    })),
    reviewCount: capture.imageUrls.length,
    sourceType: 'browser-capture',
  };
  const storedIntegrity = {
    ...integrity,
    sourceType: 'browser-capture',
    sourceMeta,
    importPolicy: {
      code: 'authorized-rendered-page-capture',
      reason: 'Captured only from content rendered in the owner-authorized browser session. No Whop or third-party credential was copied to SniperPlug.',
    },
    contentFingerprint,
    autoPublishEligible: false,
    manualReviewCompleted: false,
  };

  const write = await session.db.prepare(`
    INSERT INTO guides (
      slug, title, description, category_slug, body_markdown, status, featured, sort_order,
      source_key, source_group, source_experience_id, source_post_id, source_fingerprint,
      attachment_json, integrity_json, author_json, source_created_at, source_updated_at,
      imported_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, 'draft', 0, 999, NULL, ?, ?, ?, ?, ?, ?, '{}', NULL, ?, ?, ?, NULL)
    ON CONFLICT(id) DO NOTHING
  `).bind(
    slug,
    capture.title,
    excerpt(prepared.body) || `Captured from ${capture.appName} for private review.`,
    category,
    prepared.body,
    CAPTURE_SOURCE_GROUP,
    capture.experienceId,
    sourcePostId,
    sourceFingerprint,
    JSON.stringify(attachment),
    JSON.stringify(storedIntegrity),
    now,
    existing?.imported_at || now,
    now,
  ).run();

  let guide;
  if (existing) {
    const update = await session.db.prepare(`
      UPDATE guides SET
        title = ?, description = ?, category_slug = ?, body_markdown = ?, status = 'draft', featured = 0,
        source_group = ?, source_experience_id = ?, source_post_id = ?, source_fingerprint = ?,
        attachment_json = ?, integrity_json = ?, author_json = '{}', source_updated_at = ?, updated_at = ?, published_at = NULL
      WHERE id = ? AND updated_at IS ?
    `).bind(
      capture.title,
      excerpt(prepared.body) || `Captured from ${capture.appName} for private review.`,
      category,
      prepared.body,
      CAPTURE_SOURCE_GROUP,
      capture.experienceId,
      sourcePostId,
      sourceFingerprint,
      JSON.stringify(attachment),
      JSON.stringify(storedIntegrity),
      now,
      now,
      Number(existing.id),
      expectedUpdatedAt,
    ).run();
    if (Number(update.meta?.changes || 0) !== 1) throw new HttpError(409, 'This captured guide changed while SniperPlug was preparing the update. Refresh the Control Center before capturing it again.');
    guide = await session.db.prepare('SELECT * FROM guides WHERE id = ?').bind(Number(existing.id)).first();
  } else {
    if (Number(write.meta?.changes || 0) !== 1) throw new HttpError(409, 'SniperPlug could not create the captured guide draft.');
    guide = await session.db.prepare(`
      SELECT * FROM guides
      WHERE source_key IS NULL AND source_group = ? AND source_post_id = ?
      ORDER BY id DESC LIMIT 1
    `).bind(CAPTURE_SOURCE_GROUP, sourcePostId).first();
  }

  if (!guide || guide.status !== 'draft' || String(guide.source_fingerprint || '') !== sourceFingerprint) {
    throw new HttpError(409, 'SniperPlug could not confirm the exact browser-captured draft in D1.');
  }
  return {
    guideId: Number(guide.id),
    slug: guide.slug,
    title: guide.title,
    category: guide.category_slug,
    action: existing ? 'updated-draft' : 'created-draft',
    imageReviewCount: capture.imageUrls.length,
  };
}

export function captureSourceGroupForTests() {
  return CAPTURE_SOURCE_GROUP;
}
