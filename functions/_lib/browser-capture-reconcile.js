import { sha256 } from './crypto.js';
import { loadWhopMemberships, membershipCompanies } from './discovery.js';
import { HttpError } from './http.js';
import { prepareGuideBody } from './integrity.js';
import { ensureImporterWorkspaceSchema, principalIdFrom } from './importer-workspace.js';
import { saveSourceDecision, sourceDecision } from './source-policy.js';
import { authorizeBrowserCaptureExperience, validateBrowserCaptureBatch } from './browser-capture.js';

const SENSITIVE_QUERY_KEY = /(?:token|auth|jwt|session|signature|secret|password|code|state|key)/i;

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
        || values.some((item) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item) || String(item || '').length > 180);
      if (looksSensitive) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function stableBodyForFingerprint(body) {
  return String(body || '').replace(/https:\/\/[^\s)]+/g, (raw) => safeHttpsUrl(raw) || raw.split('?')[0]);
}

async function sourceKeyForCapture(capture) {
  const digest = await sha256(`${capture.experienceId}\n${capture.pageIdentity}\n${capture.title.toLocaleLowerCase('en-US')}`);
  return `browser-capture:${capture.experienceId}:${digest.slice(0, 24)}`;
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

async function authorizedExperience(env, principalId, whopSession, capture, companies, experienceCache) {
  let experience = experienceCache.get(capture.experienceId);
  if (experience) return experience;

  experience = await authorizeBrowserCaptureExperience(whopSession, capture.experienceId, { pageUrl: capture.pageUrl });
  const appName = String(experience?._sniperplugAppReader?.appName || experience?.app?.name || 'Whop app').trim() || 'Whop app';
  if (!currentMembershipAllowsExperience(experience, companies)) {
    throw new HttpError(403, `The connected Whop account no longer has a current membership that grants access to this ${appName} experience.`);
  }

  const decision = await sourceDecision(env, principalId, experience, capture.experienceId);
  if (decision.decision === 'disapproved') {
    throw new HttpError(409, `This ${appName} source is disapproved in this SniperPlug account. Approve it before capturing pages from it.`);
  }
  if (decision.decision !== 'approved') {
    await saveSourceDecision(env, principalId, experience, capture.experienceId, 'approved');
  }

  experienceCache.set(capture.experienceId, experience);
  return experience;
}

async function classifyServerCapture(db, principalId, experience, capture, index) {
  const appName = String(experience?._sniperplugAppReader?.appName || experience?.app?.name || 'Whop app').trim() || 'Whop app';
  const prepared = await prepareGuideBody(capture.bodyMarkdown, { source: `${appName} browser capture “${capture.title}”` });
  const sourceKey = await sourceKeyForCapture(capture);
  const sourceFingerprint = await sourceFingerprintForCapture(sourceKey, capture, prepared.body);
  const existing = await db.prepare(`
    SELECT * FROM guides WHERE principal_id = ? AND upstream_source_key = ?
  `).bind(principalId, sourceKey).first();
  const existingIntegrity = safeJson(existing?.integrity_json, {});

  const base = {
    index,
    sourceKey,
    guideId: Number(existing?.id || 0) || null,
    slug: existing?.slug || null,
    title: existing?.title || capture.title,
    status: existing?.status || null,
    sourceFingerprint,
  };

  if (existing?.source_fingerprint === sourceFingerprint && existing.status !== 'rejected') {
    return { ...base, action: 'unchanged', needsImport: false, serverState: 'already-imported' };
  }
  if (existing?.status === 'published') {
    return {
      ...base,
      action: 'changed-published-held',
      needsImport: false,
      serverState: 'held',
      holdReason: 'The published guide changed at the source. SniperPlug preserved the published copy instead of overwriting it.',
    };
  }
  if (existing?.status === 'rejected') {
    return {
      ...base,
      action: 'removed-held',
      needsImport: false,
      serverState: 'held',
      holdReason: 'This captured page was previously removed in this account. SniperPlug preserved that decision instead of restoring it silently.',
    };
  }
  if (existingIntegrity.manualReviewCompleted === true) {
    return {
      ...base,
      action: 'changed-reviewed-held',
      needsImport: false,
      serverState: 'held',
      holdReason: 'This draft was already manually reviewed in this account. SniperPlug preserved the reviewed version instead of overwriting it with a new browser capture.',
    };
  }

  const duplicate = await db.prepare(`
    SELECT id, slug, title, status FROM guides
    WHERE principal_id = ? AND upstream_source_key IS NOT ?
      AND lower(title) = lower(?) AND body_markdown = ? AND status != 'rejected'
    ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(principalId, sourceKey, capture.title, prepared.body).first();
  if (duplicate) {
    return {
      ...base,
      guideId: Number(duplicate.id || 0) || null,
      slug: duplicate.slug || null,
      title: duplicate.title || capture.title,
      status: duplicate.status || null,
      action: 'duplicate-held',
      needsImport: false,
      serverState: 'duplicate',
      holdReason: 'An identical guide already exists in this account workspace.',
    };
  }

  return {
    ...base,
    action: existing ? 'changed' : 'new',
    needsImport: true,
    serverState: existing ? 'changed' : 'new',
  };
}

export async function reconcileBrowserCaptures(env, principalValue, whopSession, input) {
  const principalId = principalIdFrom(principalValue);
  const captures = validateBrowserCaptureBatch(input);
  const memberships = await loadWhopMemberships(whopSession);
  const companies = membershipCompanies(memberships);
  const db = await ensureImporterWorkspaceSchema(env);
  const experienceCache = new Map();
  const appIds = new Set();
  const results = [];

  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    const experience = await authorizedExperience(env, principalId, whopSession, capture, companies, experienceCache);
    const appId = String(experience?._sniperplugAppReader?.appId || experience?.app?.id || '').trim();
    if (appId) appIds.add(appId);
    results.push(await classifyServerCapture(db, principalId, experience, capture, index));
  }

  const resolvedAppIds = [...appIds];
  const alreadyImported = results.filter((result) => result.action === 'unchanged').length;
  const newCount = results.filter((result) => result.action === 'new').length;
  const changed = results.filter((result) => result.action === 'changed').length;
  const duplicates = results.filter((result) => result.action === 'duplicate-held').length;
  const held = results.filter((result) => result.action.endsWith('-held') && result.action !== 'duplicate-held').length;
  const needsImport = results.filter((result) => result.needsImport === true).length;

  return {
    mode: 'reconcile',
    captureMethod: 'extension-dom',
    appId: resolvedAppIds.length === 1 ? resolvedAppIds[0] : null,
    appIds: resolvedAppIds,
    received: captures.length,
    alreadyImported,
    unchanged: alreadyImported,
    new: newCount,
    changed,
    duplicates,
    held,
    needsImport,
    results,
  };
}
