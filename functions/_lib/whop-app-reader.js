import { whopApi } from './whop.js';

const APP_SEARCH_LIMIT = 25;
const APP_METADATA_CACHE_MS = 15 * 60_000;
const appMetadataCache = new Map();

export const BETTER_CONTENT_APP_ID = 'app_zv9yxan92U9fNy';
const BETTER_CONTENT_CANONICAL_ORIGIN = 'https://better-content.apps.whop.com/';
const RENDERED_CONTENT_APP_NAMES = new Set(['better content', 'content']);

function exactAppId(value) {
  const id = String(value || '').trim();
  return /^app_[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
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

export function whopAppFrameHost(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.protocol === 'https:' ? url.hostname.toLowerCase() : '';
    return host.endsWith('.apps.whop.com') ? host : '';
  } catch {
    return '';
  }
}

export function resolveWhopAppReader(app, experience = null) {
  const appId = exactAppId(app?.id || experience?.app?.id);
  const appName = String(app?.name || experience?.app?.name || 'Whop app').trim() || 'Whop app';
  const normalizedName = normalizeName(appName);
  const metadataResolved = app?.metadataStatus === 'resolved';
  const resolvedOrigin = safeHttpsUrl(app?.origin);
  const metadataFrameHost = whopAppFrameHost(resolvedOrigin);

  if (appId === BETTER_CONTENT_APP_ID) {
    const origin = metadataFrameHost ? resolvedOrigin : BETTER_CONTENT_CANONICAL_ORIGIN;
    return {
      status: 'available',
      mode: 'browser-capture',
      appId,
      appName,
      origin,
      metadataFrameHost: whopAppFrameHost(origin),
      framePolicy: 'whop-app-frame',
      verifiedBy: metadataResolved && app?.verified ? 'whop-app-metadata+stable-app-id' : 'stable-app-id',
      requiresRenderedMemberPage: true,
      autoPublishEligible: false,
    };
  }

  if (
    appId
    && metadataResolved
    && app?.verified === true
    && RENDERED_CONTENT_APP_NAMES.has(normalizedName)
    && metadataFrameHost
  ) {
    return {
      status: 'available',
      mode: 'browser-capture',
      appId,
      appName,
      origin: resolvedOrigin,
      metadataFrameHost,
      framePolicy: 'whop-app-frame',
      verifiedBy: 'whop-app-metadata+stable-app-id',
      requiresRenderedMemberPage: true,
      autoPublishEligible: false,
    };
  }

  if (app?.hasOpenapiView && safeHttpsUrl(app?.openapiUrl)) {
    return {
      status: 'contract-advertised',
      mode: null,
      appId,
      appName,
      documentedInterface: 'openapi',
      contractUrl: safeHttpsUrl(app.openapiUrl),
      verifiedBy: 'published-app-metadata',
      requiresRenderedMemberPage: false,
      autoPublishEligible: false,
    };
  }

  if (app?.hasSkillsView && safeHttpsUrl(app?.skillsUrl)) {
    return {
      status: 'contract-advertised',
      mode: null,
      appId,
      appName,
      documentedInterface: 'skills',
      contractUrl: safeHttpsUrl(app.skillsUrl),
      verifiedBy: 'published-app-metadata',
      requiresRenderedMemberPage: false,
      autoPublishEligible: false,
    };
  }

  return {
    status: 'unavailable',
    mode: null,
    appId,
    appName,
    documentedInterface: null,
    contractUrl: null,
    verifiedBy: metadataResolved ? 'published-app-metadata' : null,
    requiresRenderedMemberPage: false,
    autoPublishEligible: false,
  };
}

export function browserCaptureMatchesReader(reader, pageUrl) {
  if (reader?.status !== 'available' || reader?.mode !== 'browser-capture') return false;
  if (reader?.framePolicy !== 'whop-app-frame') return false;
  return Boolean(whopAppFrameHost(pageUrl));
}

export function appReaderReason(reader) {
  if (reader?.status === 'available' && reader?.mode === 'browser-capture') {
    return `Access confirmed · reader available. SniperPlug supports this exact ${reader.appName || 'Whop app'} module through the rendered-app capture path. Captures must stay inside Whop’s HTTPS app-frame boundary; the server separately re-verifies the exact Experience, membership, and app identity before creating a private draft.`;
  }
  if (reader?.status === 'contract-advertised') {
    const interfaceName = reader.documentedInterface === 'skills' ? 'Skills interface' : 'OpenAPI contract';
    return `Access confirmed · documented ${interfaceName} advertised, but no normalized SniperPlug adapter is enabled for it yet. SniperPlug will not guess private endpoints or treat membership access as API permission.`;
  }
  return 'Access confirmed · reader unavailable. The membership is valid, but this app does not currently expose a SniperPlug-supported native reader or an explicitly supported app-specific reader.';
}

function minimalMetadata(experience, metadataStatus) {
  const appId = exactAppId(experience?.app?.id);
  if (!appId) return null;
  const base = {
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
  return { ...base, reader: resolveWhopAppReader(base, experience) };
}

function normalizePublicApp(app, experience) {
  const appId = exactAppId(app?.id || experience?.app?.id);
  if (!appId) return null;
  const origin = publicOrigin(app);
  const experienceId = String(experience?.id || '').trim();
  const base = {
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
  return { ...base, reader: resolveWhopAppReader(base, experience) };
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
    const exact = apps.find((candidate) => exactAppId(candidate?.id) === appId) || null;
    const status = exact ? 'resolved' : 'not-listed';
    appMetadataCache.set(appId, { app: exact, status, checkedAt: Date.now() });
    return exact ? normalizePublicApp(exact, experience) : minimalMetadata(experience, status);
  } catch {
    appMetadataCache.set(appId, { app: null, status: 'unavailable', checkedAt: Date.now() });
    return minimalMetadata(experience, 'unavailable');
  }
}

function annotateExternalEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const experience = entry.experience || null;
  const capability = entry.capability || {};
  const app = capability.app || minimalMetadata(experience, 'unavailable');
  const reader = resolveWhopAppReader(app, experience);
  return {
    ...entry,
    capability: {
      ...capability,
      readerStatus: reader.status,
      readerMode: reader.mode,
      reader,
      app: app ? { ...app, reader } : app,
      reason: capability.probeDeferred ? capability.reason : appReaderReason(reader),
    },
  };
}

export function annotateWhopAppReaders(discovery) {
  if (!discovery || !Array.isArray(discovery.groups)) return discovery;
  const groups = discovery.groups.map((group) => {
    const original = Array.isArray(group?.externalApps)
      ? group.externalApps
      : Array.isArray(group?.unsupported) ? group.unsupported : [];
    const externalApps = original.map(annotateExternalEntry);
    return {
      ...group,
      externalApps,
      unsupported: externalApps,
    };
  });
  return { ...discovery, groups };
}

export function clearWhopAppMetadataCacheForTests() {
  appMetadataCache.clear();
}
