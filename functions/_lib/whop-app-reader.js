import { whopApi } from './whop.js';

const APP_SEARCH_LIMIT = 25;
const APP_METADATA_CACHE_MS = 15 * 60_000;
const appMetadataCache = new Map();

function exactAppId(value) {
  const id = String(value || '').trim();
  return /^app_[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function publicOrigin(app) {
  const origin = safeHttpsUrl(app?.origin);
  if (origin) return origin;
  const hosted = safeHttpsUrl(app?.hosted_url);
  if (hosted) return hosted;
  const domainId = String(app?.domain_id || '').trim();
  if (/^[A-Za-z0-9-]+$/.test(domainId)) return `https://${domainId}.apps.whop.com/`;
  const route = String(app?.route || '').trim();
  if (/^[A-Za-z0-9-]+$/.test(route)) return `https://${route}.whop.site/`;
  return null;
}

function safeAppUrl(origin, path, experienceId) {
  try {
    if (!origin || !path) return null;
    const route = String(path).replace(/\[experienceId\]/g, encodeURIComponent(String(experienceId || '')));
    const url = new URL(route, origin);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function minimalMetadata(experience, metadataStatus) {
  const appId = exactAppId(experience?.app?.id);
  if (!appId) return null;
  return {
    id: appId,
    name: String(experience?.app?.name || 'Whop app').trim(),
    verified: false,
    appType: null,
    origin: null,
    experienceUrl: null,
    openapiUrl: null,
    skillsUrl: null,
    hasOpenapiView: false,
    hasSkillsView: false,
    metadataSource: 'public-app-list',
    metadataStatus,
  };
}

function normalizePublicApp(app, experience) {
  const appId = exactAppId(app?.id || experience?.app?.id);
  if (!appId) return null;
  const origin = publicOrigin(app);
  const experienceId = String(experience?.id || '').trim();
  return {
    id: appId,
    name: String(app?.name || experience?.app?.name || 'Whop app').trim(),
    verified: Boolean(app?.verified),
    appType: String(app?.app_type || '').trim() || null,
    origin,
    experienceUrl: safeAppUrl(origin, app?.experience_path, experienceId),
    openapiUrl: safeAppUrl(origin, app?.openapi_path, experienceId),
    skillsUrl: safeAppUrl(origin, app?.skills_path, experienceId),
    hasOpenapiView: Boolean(app?.openapi_path),
    hasSkillsView: Boolean(app?.skills_path),
    metadataSource: 'public-app-list',
    metadataStatus: 'resolved',
  };
}

export async function inspectWhopApp(session, experience) {
  const appId = exactAppId(experience?.app?.id);
  if (!appId) return null;
  const appName = String(experience?.app?.name || '').trim();
  const cached = appMetadataCache.get(appId);
  if (cached && Date.now() - cached.checkedAt < APP_METADATA_CACHE_MS) {
    return cached.app ? normalizePublicApp(cached.app, experience) : minimalMetadata(experience, cached.status);
  }

  try {
    const payload = await whopApi(session, 'apps', {
      ...(appName ? { query: appName } : {}),
      first: APP_SEARCH_LIMIT,
    });
    const apps = Array.isArray(payload?.data) ? payload.data : [];
    const exact = apps.find((app) => exactAppId(app?.id) === appId) || null;
    const status = exact ? 'resolved' : 'not-listed';
    appMetadataCache.set(appId, { app: exact, status, checkedAt: Date.now() });
    return exact ? normalizePublicApp(exact, experience) : minimalMetadata(experience, status);
  } catch {
    appMetadataCache.set(appId, { app: null, status: 'unavailable', checkedAt: Date.now() });
    return minimalMetadata(experience, 'unavailable');
  }
}

export function clearWhopAppMetadataCacheForTests() {
  appMetadataCache.clear();
}
