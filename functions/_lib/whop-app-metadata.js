import { whopApi } from './whop.js';

const APP_SEARCH_LIMIT = 25;

function exactAppId(value) {
  const id = String(value || '').trim();
  return /^app_[A-Za-z0-9_-]+$/.test(id) ? id : '';
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

function publicOrigin(app) {
  const origin = String(app?.origin || '').trim();
  if (/^https:\/\//i.test(origin)) return origin;
  const domainId = String(app?.domain_id || '').trim();
  return domainId ? `https://${domainId}.apps.whop.com` : null;
}

export function publicWhopAppMetadata(app, experience) {
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
  };
}

export async function inspectPublicWhopApp(session, experience) {
  const appId = exactAppId(experience?.app?.id);
  if (!appId) return null;
  const appName = String(experience?.app?.name || '').trim();
  if (!appName) return publicWhopAppMetadata({ id: appId }, experience);

  try {
    const payload = await whopApi(session, 'apps', {
      query: appName,
      first: APP_SEARCH_LIMIT,
    });
    const apps = Array.isArray(payload?.data) ? payload.data : [];
    const exact = apps.find((app) => exactAppId(app?.id) === appId);
    return exact
      ? publicWhopAppMetadata(exact, experience)
      : publicWhopAppMetadata({ id: appId, name: appName }, experience);
  } catch {
    // App metadata is enrichment only. A public-list failure must not turn valid
    // Whop membership access into a source-access failure.
    return publicWhopAppMetadata({ id: appId, name: appName }, experience);
  }
}
