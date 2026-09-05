import { sha256 } from './crypto.js';
import { loadWhopMemberships, membershipCompanies } from './discovery.js';
import { listCategories, slugify, suggestedCategoryForText } from './guides.js';
import { HttpError } from './http.js';
import { assertGuideRoundTrip, prepareGuideBody } from './integrity.js';
import {
  ensureImporterWorkspaceSchema,
  postStorageKey,
  principalIdFrom,
  upstreamSourceKey,
} from './importer-workspace.js';
import { requireApprovedSource, saveSourceDecision, sourceDecision } from './source-policy.js';
import {
  BETTER_CONTENT_APP_ID,
  browserCaptureMatchesReader,
  inspectWhopApp,
  resolveWhopAppReader,
} from './whop-app-reader.js';
import { retrieveExperience } from './whop.js';

export { BETTER_CONTENT_APP_ID };
export const BROWSER_CAPTURE_SOURCE_TYPE = 'browser-capture';

const MAX_CAPTURES_PER_BATCH = 25;
const MAX_CAPTURE_BODY_BYTES = 1_000_000;
const MAX_CAPTURE_BATCH_BYTES = 2_500_000;
const MAX_CAPTURE_IMAGES = 50;
const SENSITIVE_QUERY_KEY = /(?:token|auth|jwt|session|signature|secret|password|code|state|key)/i;

function exactExperienceId(value) {
  const id = String(value || '').trim();
  return /^exp_[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

function normalizeWhitespace(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      const values = url.searchParams.getAll(key);
      const looksSensitive = SENSITIVE_QUERY_KEY.test(key)
        || values.some((item) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item) || item.length > 180);
      if (looksSensitive) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedImages(value) {
  const images = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    if (images.length >= MAX_CAPTURE_IMAGES) break;
    const url = safeHttpsUrl(raw?.url || raw?.src);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push({
      url,
      alt: normalizeWhitespace(raw?.alt || raw?.title || 'Captured image').slice(0, 160) || 'Captured image',
      width: Math.max(0, Number.parseInt(raw?.width, 10) || 0) || null,
      height: Math.max(0, Number.parseInt(raw?.height, 10) || 0) || null,
    });
  }
  return images;
}

export function normalizeBrowserCapture(raw) {
  const experienceId = exactExperienceId(raw?.experienceId);
  if (!experienceId) throw new HttpError(422, 'Browser capture requires an exact Whop experience ID beginning with exp_.');

  const title = normalizeWhitespace(raw?.title || raw?.documentTitle || '').slice(0, 140);
  if (!/[\p{L}\p{N}]/u.test(title)) throw new HttpError(422, 'Browser capture could not identify a usable page title.');

  const pageUrl = safeHttpsUrl(raw?.pageUrl || raw?.frameUrl);
  if (!pageUrl) throw new HttpError(422, 'Browser capture requires the HTTPS page URL that rendered the content.');

  const bodyMarkdown = String(raw?.bodyMarkdown || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
  const bodyBytes = new TextEncoder().encode(bodyMarkdown).byteLength;
  if (bodyBytes < 40 || !/[\p{L}\p{N}]/u.test(bodyMarkdown)) {
    throw new HttpError(422, `“${title}” did not contain enough rendered guide content to capture.`);
  }
  if (bodyBytes > MAX_CAPTURE_BODY_BYTES) throw new HttpError(422, `“${title}” exceeds the ${Math.round(MAX_CAPTURE_BODY_BYTES / 1_000_000)} MB browser-capture limit.`);

  const pageIdentity = normalizeWhitespace(raw?.pageIdentity || pageUrl).slice(0, 600) || pageUrl;
  const capturedAt = new Date().toISOString();
  return {
    experienceId,
    title,
    pageUrl,
    pageIdentity,
    documentTitle: normalizeWhitespace(raw?.documentTitle || '').slice(0, 180) || null,
    appHint: normalizeWhitespace(raw?.appHint || '').slice(0, 120) || null,
    bodyMarkdown,
    bodyBytes,
    images: normalizedImages(raw?.images),
    capturedAt,
  };
}

export function validateBrowserCaptureBatch(input) {
  if (input?.rightsConfirmed !== true) {
    throw new HttpError(422, 'Confirm that you own this content or have explicit permission to republish it before sending browser captures to SniperPlug.');
  }
  const rawCaptures = Array.isArray(input?.captures)
    ? input.captures
    : input?.capture ? [input.capture] : [];
  if (!rawCaptures.length) throw new HttpError(422, 'Capture at least one rendered supported Whop app page.');
  if (rawCaptures.length > MAX_CAPTURES_PER_BATCH) throw new HttpError(422, `Send at most ${MAX_CAPTURES_PER_BATCH} captured pages at once.`);
  const captures = rawCaptures.map(normalizeBrowserCapture);
  const totalBytes = captures.reduce((sum, capture) => sum + capture.bodyBytes, 0);
  if (totalBytes > MAX_CAPTURE_BATCH_BYTES) throw new HttpError(422, 'The browser-capture batch is too large. Send fewer pages at a time.');
  return captures;
}

export async function authorizeBrowserCaptureExperience(whopSession, experienceId, options = {}) {
  const retrieve = options.retrieveExperienceFn || retrieveExperience;
  const inspect = options.inspectWhopAppFn || inspectWhopApp;
  const experience = await retrieve(whopSession, experienceId);
  const metadata = await inspect(whopSession, experience);
  const reader = resolveWhopAppReader(metadata, experience);
  if (reader.status !== 'available' || reader.mode !== 'browser-capture') {
    throw new HttpError(422, `SniperPlug does not have an authorized rendered-app reader for ${String(experience?.app?.name || 'this Whop app').trim() || 'this Whop app'}. Access can still be valid without a supported reader.`);
  }
  if (options.pageUrl && !browserCaptureMatchesReader(reader, options.pageUrl)) {
    throw new HttpError(422, `Browser capture was rejected because the rendered frame host does not match Whop’s resolved ${reader.appName || 'app'} origin.`);
  }
  return { ...experience, _sniperplugAppReader: reader };
}

function currentMembershipAllowsExperience(experience, companies) {
  const companyIds = new Set((companies || []).map((company) => String(company?.id || '')).filter(Boolean));
  const productIds = new Set((companies || []).flatMap((company) => [...company.products.keys()]));
  const experienceCompanyId = String(
    experience?.company?.id
    || experience?.company_id
    || experience?.account?.id
    || experience?.account_id
    || '',
  ).trim();
  const experienceProductId = String(experience?.product?.id || experience?.product_id || '').trim();
  if (experienceCompanyId) return companyIds.has(experienceCompanyId);
  if (experienceProductId) return productIds.has(experienceProductId);
  return true;
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

async function sourceKeyForCapture(capture) {
  const digest = await sha256(`${capture.experienceId}\n${capture.pageIdentity}\n${capture.title.toLocaleLowerCase('en-US')}`);
  return `browser-capture:${capture.experienceId}:${digest.slice(0, 24)}`;
}

function stableBodyForFingerprint(body) {
  return String(body || '').replace(/https:\/\/[^\s)]+/g, (raw) => safeHttpsUrl(raw) || raw.split('?')[0]);
}

async function sourceFingerprintForCapture(sourceKey, capture, body) {
  return sha256(JSON.stringify({
    sourceKey,
    title: capture.title,
    pageUrl: capture.pageUrl,
    body: stableBodyForFingerprint(body),
    images: capture.images.map((image) => ({ url: image.url, alt: image.alt })),
  }));
}

async function uniqueSlug(title, storageSourceKey, existingSlug = null) {
  if (existingSlug) return existingSlug;
  const base = slugify(title) || 'captured-guide';
  const suffix = (await sha256(storageSourceKey)).slice(0, 12);
  return `${base.slice(0, 62)}-${suffix}`;
}

async function captureCategory(env, capture, renderedBody) {
  const categories = await listCategories(env);
  if (!categories.length) throw new HttpError(503, 'Create at least one active SniperPlug category before importing browser captures.');
  const allowed = new Set(categories.map((category) => category.slug));
  const suggested = suggestedCategoryForText(`${capture.title}\n${renderedBody}`);
  if (allowed.has(suggested)) return suggested;
  if (allowed.has('general')) return 'general';
  return categories[0].slug;
}

function captureImportPolicy() {
  return {
    autoPublishEligible: false,
    blocked: false,
    code: 'browser_capture_manual_review',
    reason: 'Browser-captured app content always requires explicit account review before publication or export.',
  };
}

async function upsertBrowserCaptureSourceRow(
  db,
  principalId,
  storageExperienceId,
  capture,
  logicalSourceKey,
  storageSourceKey,
  sourceFingerprint,
  body,
  images,
  sourceMeta,
  policy,
  now,
) {
  const attachmentJson = JSON.stringify(images);
  const integrityJson = JSON.stringify({
    blocked: false,
    sourceType: BROWSER_CAPTURE_SOURCE_TYPE,
    sourceMeta,
    autoPublishEligible: false,
    policy,
    rightsConfirmed: true,
  });

  await db.prepare(`
    INSERT INTO whop_posts (
      source_key, principal_id, upstream_source_key, experience_id, upstream_experience_id,
      post_id, title, excerpt, body_markdown, author_json, attachment_json,
      source_created_at, source_updated_at, source_fingerprint, integrity_json,
      decision, decision_updated_at, last_scanned_at, stale_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, 'approved', ?, ?, NULL)
    ON CONFLICT(principal_id, upstream_source_key) DO UPDATE SET
      experience_id = excluded.experience_id,
      upstream_experience_id = excluded.upstream_experience_id,
      post_id = excluded.post_id,
      title = excluded.title,
      excerpt = excluded.excerpt,
      body_markdown = excluded.body_markdown,
      attachment_json = excluded.attachment_json,
      source_updated_at = excluded.source_updated_at,
      source_fingerprint = excluded.source_fingerprint,
      integrity_json = excluded.integrity_json,
      decision = 'approved',
      decision_updated_at = excluded.decision_updated_at,
      last_scanned_at = excluded.last_scanned_at,
      stale_at = NULL
  `).bind(
    storageSourceKey,
    principalId,
    logicalSourceKey,
    storageExperienceId,
    capture.experienceId,
    logicalSourceKey,
    capture.title,
    excerpt(body),
    body,
    attachmentJson,
    capture.capturedAt,
    capture.capturedAt,
    sourceFingerprint,
    integrityJson,
    now,
    now,
  ).run();

  const saved = await db.prepare(`
    SELECT source_key, upstream_source_key, experience_id, upstream_experience_id, source_fingerprint, decision
    FROM whop_posts
    WHERE principal_id = ? AND upstream_source_key = ?
  `).bind(principalId, logicalSourceKey).first();
  if (!saved
    || String(saved.source_key || '') !== storageSourceKey
    || upstreamSourceKey(saved) !== logicalSourceKey
    || String(saved.experience_id || '') !== storageExperienceId
    || String(saved.upstream_experience_id || '') !== capture.experienceId
    || String(saved.source_fingerprint || '') !== sourceFingerprint
    || saved.decision !== 'approved') {
    throw new HttpError(409, 'SniperPlug could not confirm the browser-captured source row in this account workspace. The queued page was preserved for retry.', {
      code: 'browser_capture_source_unconfirmed',
      sourceKey: logicalSourceKey,
    });
  }
}

async function writeCaptureDraft(env, principalValue, experience, capture) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const approvedSource = await requireApprovedSource(env, principalId, capture.experienceId);
  const storageExperienceId = String(approvedSource.experience_id || '').trim();
  const appName = String(experience?._sniperplugAppReader?.appName || experience?.app?.name || 'Whop app').trim() || 'Whop app';
  if (!storageExperienceId) throw new HttpError(409, `The approved ${appName} source is missing its account-scoped storage identity. Refresh the source before retrying.`);

  const prepared = await prepareGuideBody(capture.bodyMarkdown, { source: `${appName} browser capture “${capture.title}”` });
  if (new TextEncoder().encode(prepared.body).byteLength > MAX_CAPTURE_BODY_BYTES) throw new HttpError(422, `“${capture.title}” is too large to import safely.`);

  const sourceKey = await sourceKeyForCapture(capture);
  const storageSourceKey = await postStorageKey(principalId, sourceKey);
  const sourceFingerprint = await sourceFingerprintForCapture(sourceKey, capture, prepared.body);
  const existing = await db.prepare(`
    SELECT * FROM guides WHERE principal_id = ? AND upstream_source_key = ?
  `).bind(principalId, sourceKey).first();
  const existingIntegrity = safeJson(existing?.integrity_json, {});

  if (existing?.source_fingerprint === sourceFingerprint && existing.status !== 'rejected') {
    return { sourceKey, guideId: existing.id, slug: existing.slug, title: existing.title, status: existing.status, action: 'unchanged' };
  }
  if (existing?.status === 'published') {
    return { sourceKey, guideId: existing.id, slug: existing.slug, title: existing.title, status: existing.status, action: 'changed-published-held', holdReason: 'The published guide changed at the source. SniperPlug preserved the published copy instead of overwriting it.' };
  }
  if (existing?.status === 'rejected') {
    return { sourceKey, guideId: existing.id, slug: existing.slug, title: existing.title, status: existing.status, action: 'removed-held', holdReason: 'This captured page was previously removed in this account. SniperPlug preserved that decision instead of restoring it silently.' };
  }
  if (existingIntegrity.manualReviewCompleted === true) {
    return { sourceKey, guideId: existing.id, slug: existing.slug, title: existing.title, status: existing.status, action: 'changed-reviewed-held', holdReason: 'This draft was already manually reviewed in this account. SniperPlug preserved the reviewed version instead of overwriting it with a new browser capture.' };
  }

  const duplicate = await db.prepare(`
    SELECT id, slug, title, status FROM guides
    WHERE principal_id = ? AND upstream_source_key IS NOT ?
      AND lower(title) = lower(?) AND body_markdown = ? AND status != 'rejected'
    ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(principalId, sourceKey, capture.title, prepared.body).first();
  if (duplicate) {
    return { sourceKey, guideId: duplicate.id, slug: duplicate.slug, title: duplicate.title, status: duplicate.status, action: 'duplicate-held', holdReason: 'An identical guide already exists in this account workspace.' };
  }

  const category = await captureCategory(env, capture, prepared.body);
  const slug = await uniqueSlug(capture.title, storageSourceKey, existing?.slug || null);
  const now = new Date().toISOString();
  const integrity = await assertGuideRoundTrip(prepared.body, prepared.body);
  const policy = captureImportPolicy();
  const sourceGroup = String(experience?.company?.title || experience?.company?.name || appName).trim().slice(0, 120);
  const images = capture.images.map((image, index) => ({
    id: `browser-image-${index + 1}`,
    filename: image.alt || `Captured image ${index + 1}`,
    contentType: null,
    url: image.url,
    role: 'browser-captured-image',
    reviewReason: `This image URL came from the rendered ${appName} page. Confirm it is durable or replace it with account-owned media before publishing or exporting.`,
  }));
  const reader = experience?._sniperplugAppReader || {};
  const sourceMeta = {
    type: BROWSER_CAPTURE_SOURCE_TYPE,
    captureMethod: 'extension-dom',
    appId: String(reader.appId || experience?.app?.id || '').trim() || null,
    appName,
    readerVerifiedBy: reader.verifiedBy || null,
    readerFrameHost: reader.frameHost || null,
    experienceTitle: String(experience?.name || '').trim() || null,
    pageUrl: capture.pageUrl,
    pageIdentity: capture.pageIdentity,
    documentTitle: capture.documentTitle,
    capturedAt: capture.capturedAt,
  };
  const expectedUpdatedAt = existing?.updated_at == null ? null : String(existing.updated_at);

  await upsertBrowserCaptureSourceRow(
    db,
    principalId,
    storageExperienceId,
    capture,
    sourceKey,
    storageSourceKey,
    sourceFingerprint,
    prepared.body,
    images,
    sourceMeta,
    policy,
    now,
  );

  const write = await db.prepare(`
    INSERT INTO guides (
      principal_id, upstream_source_key,
      slug, title, description, category_slug, body_markdown, status, featured, sort_order,
      source_key, source_group, source_experience_id, source_post_id, source_fingerprint,
      attachment_json, integrity_json, author_json, source_created_at, source_updated_at,
      imported_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 0, 999, ?, ?, ?, ?, ?, ?, ?, '{}', NULL, ?, ?, ?, NULL)
    ON CONFLICT(source_key) DO UPDATE SET
      principal_id = excluded.principal_id,
      upstream_source_key = excluded.upstream_source_key,
      title = excluded.title,
      description = excluded.description,
      category_slug = excluded.category_slug,
      body_markdown = excluded.body_markdown,
      status = 'draft',
      featured = 0,
      source_group = excluded.source_group,
      source_experience_id = excluded.source_experience_id,
      source_post_id = excluded.source_post_id,
      source_fingerprint = excluded.source_fingerprint,
      attachment_json = excluded.attachment_json,
      integrity_json = excluded.integrity_json,
      source_updated_at = excluded.source_updated_at,
      updated_at = excluded.updated_at,
      published_at = NULL
    WHERE guides.principal_id = excluded.principal_id AND guides.updated_at IS ?
  `).bind(
    principalId,
    sourceKey,
    slug,
    capture.title,
    excerpt(prepared.body) || `Captured from ${sourceGroup} for private review.`,
    category,
    prepared.body,
    storageSourceKey,
    sourceGroup,
    capture.experienceId,
    sourceKey,
    sourceFingerprint,
    JSON.stringify({ files: images, reviewCount: images.length, sourceType: BROWSER_CAPTURE_SOURCE_TYPE }),
    JSON.stringify({
      ...integrity,
      sourceType: BROWSER_CAPTURE_SOURCE_TYPE,
      sourceMeta,
      importPolicy: policy,
      manualReviewCompleted: false,
      rightsConfirmed: true,
      quarantined: false,
    }),
    capture.capturedAt,
    existing?.imported_at || now,
    now,
    expectedUpdatedAt,
  ).run();

  if (Number(write.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'This guide changed while SniperPlug was saving the browser capture. The newer saved version was preserved; refresh before retrying.', {
      code: 'browser_capture_stale',
      sourceKey,
      guideId: Number(existing?.id || 0) || null,
    });
  }

  const saved = await db.prepare(`
    SELECT id, slug, title, status, source_fingerprint
    FROM guides WHERE principal_id = ? AND upstream_source_key = ?
  `).bind(principalId, sourceKey).first();
  if (!saved || saved.status !== 'draft' || String(saved.source_fingerprint || '') !== sourceFingerprint) {
    throw new HttpError(409, 'SniperPlug could not confirm the exact browser-captured draft in this account workspace. Refresh before retrying.', {
      code: 'browser_capture_unconfirmed',
      sourceKey,
    });
  }
  return {
    sourceKey,
    guideId: saved.id,
    slug: saved.slug,
    title: saved.title,
    status: saved.status,
    category,
    appId: sourceMeta.appId,
    appName,
    action: existing ? 'updated-draft' : 'created-draft',
    imageReviewCount: images.length,
  };
}

export async function importBrowserCaptures(env, principalValue, whopSession, input) {
  const principalId = principalIdFrom(principalValue);
  const captures = validateBrowserCaptureBatch(input);
  const memberships = await loadWhopMemberships(whopSession);
  const companies = membershipCompanies(memberships);
  const experienceCache = new Map();
  const results = [];
  const appIds = new Set();

  for (const capture of captures) {
    let experience = experienceCache.get(capture.experienceId);
    if (!experience) {
      experience = await authorizeBrowserCaptureExperience(whopSession, capture.experienceId, { pageUrl: capture.pageUrl });
      const appName = String(experience?._sniperplugAppReader?.appName || experience?.app?.name || 'Whop app').trim() || 'Whop app';
      if (!currentMembershipAllowsExperience(experience, companies)) {
        throw new HttpError(403, `The connected Whop account no longer has a current membership that grants access to this ${appName} experience.`);
      }
      const decision = await sourceDecision(env, principalId, experience, capture.experienceId);
      if (decision.decision === 'disapproved') {
        throw new HttpError(409, `This ${appName} source is disapproved in this SniperPlug account. Approve it before capturing pages from it.`);
      }
      if (decision.decision !== 'approved') await saveSourceDecision(env, principalId, experience, capture.experienceId, 'approved');
      experienceCache.set(capture.experienceId, experience);
    }
    const appId = String(experience?._sniperplugAppReader?.appId || experience?.app?.id || '').trim();
    if (appId) appIds.add(appId);
    results.push(await writeCaptureDraft(env, principalId, experience, capture));
  }

  const resolvedAppIds = [...appIds];
  return {
    captureMethod: 'extension-dom',
    appId: resolvedAppIds.length === 1 ? resolvedAppIds[0] : null,
    appIds: resolvedAppIds,
    received: captures.length,
    created: results.filter((result) => result.action === 'created-draft').length,
    updated: results.filter((result) => result.action === 'updated-draft').length,
    unchanged: results.filter((result) => result.action === 'unchanged').length,
    held: results.filter((result) => result.action.endsWith('-held')).length,
    results,
  };
}
