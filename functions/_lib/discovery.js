import { HttpError, requireDatabase } from './http.js';
import { sourceDecision } from './source-policy.js';
import {
  inspectWhopApp,
  requiredScopeForType,
  requiredScopeForExperience,
  resolveWhopExperienceType,
  whopApi,
  whopExperienceType,
} from './whop.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_MEMBERSHIPS = 1000;
const MAX_ITEMS_PER_SCOPE = 500;
const MAX_COMPANIES = 100;
const CONCURRENCY = 5;
const SQL_BATCH_SIZE = 60;
const CAPABILITY_CACHE_TTL_MS = 24 * 60 * 60_000;
const TRANSIENT_CAPABILITY_RETRY_MS = 2 * 60_000;
export const MAX_CAPABILITY_PROBES_PER_REQUEST = 6;
const ACCESS_GRANTING_MEMBERSHIP_STATUSES = new Set([
  'active',
  'trialing',
  'canceling',
  'past_due',
  'completed',
]);
const DEFAULT_GROUPS = new Map([
  ['black box', 0],
  ['black box clips', 0],
  ['hidden files', 1],
]);
const SUPPORTED_TYPES = new Set(['forum', 'course', 'chat']);
const REQUIRED_CONTENT_SCOPES = ['forum:read', 'courses:read', 'chat:read'];
let capabilitySchemaPromise = null;

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function exactExperienceId(value) {
  const id = String(value || '').trim();
  return /^exp_[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

function scopeSet(session) {
  return new Set(String(session?.scopes || '').replaceAll('::', ':').split(/\s+/).map((scope) => scope.trim()).filter(Boolean));
}

function safeJson(value, fallback = null) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function chunks(values, size = SQL_BATCH_SIZE) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

export function isTransientDiscoveryError(error) {
  const status = Number(error?.status || 0);
  return !status || [408, 425, 429, 500, 502, 503, 504].includes(status);
}

export function capabilityCacheFresh(row, now = Date.now()) {
  if (!row?.checked_at) return false;
  const checked = Date.parse(String(row.checked_at));
  if (!Number.isFinite(checked) || now - checked > CAPABILITY_CACHE_TTL_MS) return false;
  if (String(row.probe_status || '') === 'transient') {
    const retryAfter = Date.parse(String(row.retry_after || ''));
    return Number.isFinite(retryAfter) && retryAfter > now;
  }
  return String(row.probe_status || '') === 'complete';
}

export function createCapabilityProbeBudget(limit = MAX_CAPABILITY_PROBES_PER_REQUEST) {
  const numericLimit = Math.max(0, Number.parseInt(limit, 10) || 0);
  return {
    limit: numericLimit,
    remaining: numericLimit,
    used: 0,
    take() {
      if (this.remaining <= 0) return false;
      this.remaining -= 1;
      this.used += 1;
      return true;
    },
  };
}

async function ensureCapabilityCache(env) {
  if (capabilitySchemaPromise) return capabilitySchemaPromise;
  const db = requireDatabase(env);
  capabilitySchemaPromise = db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS whop_experience_capabilities (
        experience_id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK (source_type IN ('forum', 'course', 'chat', 'unsupported')),
        app_json TEXT NOT NULL DEFAULT '{}',
        probe_status TEXT NOT NULL CHECK (probe_status IN ('complete', 'transient')),
        probe_error TEXT,
        retry_after TEXT,
        checked_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_whop_capabilities_checked ON whop_experience_capabilities (checked_at)'),
  ]).then(() => db).catch((error) => {
    capabilitySchemaPromise = null;
    throw error;
  });
  return capabilitySchemaPromise;
}

async function loadCapabilityCache(env, ids) {
  const exactIds = [...new Set(ids.map(exactExperienceId).filter(Boolean))];
  if (!exactIds.length) return new Map();
  try {
    const db = await ensureCapabilityCache(env);
    const output = new Map();
    for (const batch of chunks(exactIds)) {
      const placeholders = batch.map(() => '?').join(',');
      const rows = await db.prepare(`
        SELECT experience_id, source_type, app_json, probe_status, probe_error, retry_after, checked_at
        FROM whop_experience_capabilities
        WHERE experience_id IN (${placeholders})
      `).bind(...batch).all();
      for (const row of rows.results || []) output.set(String(row.experience_id), row);
    }
    return output;
  } catch (error) {
    console.warn('Whop capability cache is unavailable; discovery will continue with a bounded live probe.', error);
    return new Map();
  }
}

async function saveCapabilityRows(env, rows) {
  if (!rows.length) return;
  try {
    const db = await ensureCapabilityCache(env);
    const statements = rows.map((row) => db.prepare(`
      INSERT INTO whop_experience_capabilities (
        experience_id, source_type, app_json, probe_status, probe_error, retry_after, checked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(experience_id) DO UPDATE SET
        source_type = excluded.source_type,
        app_json = excluded.app_json,
        probe_status = excluded.probe_status,
        probe_error = excluded.probe_error,
        retry_after = excluded.retry_after,
        checked_at = excluded.checked_at,
        updated_at = excluded.updated_at
    `).bind(
      row.experienceId,
      row.sourceType,
      JSON.stringify(row.app || {}),
      row.probeStatus,
      row.probeError || null,
      row.retryAfter || null,
      row.checkedAt,
      row.updatedAt,
    ));
    for (const batch of chunks(statements, 50)) await db.batch(batch);
  } catch (error) {
    console.warn('Whop capability results could not be cached; current discovery results remain usable.', error);
  }
}

export function membershipGrantsAccess(membership) {
  const status = String(membership?.status || '').trim().toLowerCase();
  const cancelationStatus = String(membership?.cancelation_status || membership?.cancellation_status || '').trim().toLowerCase();
  if (!ACCESS_GRANTING_MEMBERSHIP_STATUSES.has(status)) return false;
  if (cancelationStatus === 'left') return false;
  if (membership?.user === null || membership?.member === null) return false;
  if (Object.prototype.hasOwnProperty.call(membership || {}, 'joined_at') && membership.joined_at === null) return false;
  return true;
}

async function allPages(session, path, query, maxItems, label) {
  const items = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await whopApi(session, path, {
      ...query,
      first: PAGE_SIZE,
      ...(after ? { after } : {}),
    });
    const data = Array.isArray(payload?.data) ? payload.data : [];
    items.push(...data);
    if (items.length > maxItems) throw new HttpError(422, `Whop returned more than ${maxItems} ${label}.`);
    if (!payload?.page_info?.has_next_page) return items;
    const next = String(payload?.page_info?.end_cursor || '');
    if (!next || next === after) throw new HttpError(502, 'Whop returned an invalid pagination cursor.');
    after = next;
  }
  throw new HttpError(502, 'Whop pagination exceeded the safe page limit.');
}

async function mapConcurrent(values, mapper, concurrency = CONCURRENCY) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, values.length)) }, () => worker()));
  return output;
}

export function membershipCompanies(memberships) {
  const companies = new Map();
  for (const membership of memberships) {
    if (!membershipGrantsAccess(membership)) continue;
    const companyId = String(membership?.company?.id || '').trim();
    if (!companyId) continue;
    const status = String(membership?.status || '').trim().toLowerCase();
    const current = companies.get(companyId) || {
      id: companyId,
      title: String(membership?.company?.title || membership?.company?.name || 'Whop group').trim(),
      route: String(membership?.company?.route || '').trim() || null,
      statuses: new Set(),
      products: new Map(),
      memberships: 0,
    };
    current.statuses.add(status);
    const productId = String(membership?.product?.id || '').trim();
    if (productId) current.products.set(productId, String(membership?.product?.title || 'Whop product').trim());
    current.memberships += 1;
    companies.set(companyId, current);
  }
  const values = [...companies.values()];
  if (values.length > MAX_COMPANIES) {
    throw new HttpError(422, `Whop returned more than ${MAX_COMPANIES} active joined companies. Narrow the connected account before continuing.`);
  }
  return values;
}

function companySummary(company) {
  return {
    id: company.id,
    title: company.title,
    route: company.route,
  };
}

function listedExperience(experience, company, fallbackAppName = null) {
  const id = exactExperienceId(experience?.experience?.id || experience?.id);
  if (!id) return null;
  const raw = experience?.experience || experience;
  return {
    ...raw,
    id,
    name: String(raw?.name || experience?.name || 'Whop experience').trim(),
    company: companySummary(company),
    app: raw?.app ? {
      id: raw.app.id || null,
      name: raw.app.name || fallbackAppName,
    } : {
      id: null,
      name: fallbackAppName,
    },
  };
}

function discoveryFailure(label, error) {
  if (error instanceof HttpError && error.status === 403) return `${label} was denied`;
  if (error instanceof HttpError && error.status === 404) return `${label} was not found`;
  const message = String(error?.message || '').trim().slice(0, 160);
  return `${label} failed${message ? `: ${message}` : ''}`;
}

async function discoverCompanyListings(session, company) {
  const membershipProducts = [...company.products].map(([id, title]) => ({ id, title }));
  const scopes = [
    { id: null, title: 'company-wide access' },
    ...membershipProducts,
  ];
  const attempts = await mapConcurrent(scopes, async (product) => {
    const query = {
      company_id: company.id,
      ...(product.id ? { product_id: product.id } : {}),
    };
    const output = { product, forums: [], experiences: [], failures: [] };
    try {
      output.forums = await allPages(session, 'forums', query, MAX_ITEMS_PER_SCOPE, `${product.title} forums`);
    } catch (error) {
      output.failures.push(discoveryFailure(`${product.title} forum lookup`, error));
    }
    try {
      output.experiences = await allPages(session, 'experiences', query, MAX_ITEMS_PER_SCOPE, `${product.title} experiences`);
    } catch (error) {
      output.failures.push(discoveryFailure(`${product.title} experience lookup`, error));
    }
    return output;
  }, Math.min(3, CONCURRENCY));

  const discovered = new Map();
  const failures = new Set();
  for (const attempt of attempts) {
    for (const failure of attempt.failures) failures.add(failure);
    for (const forum of attempt.forums) {
      const experience = listedExperience(forum, company, 'Forums');
      if (experience) discovered.set(experience.id, experience);
    }
    for (const raw of attempt.experiences) {
      const experience = listedExperience(raw, company);
      if (experience) discovered.set(experience.id, experience);
    }
  }
  return { company, experiences: [...discovered.values()], failures: [...failures] };
}

function cachedCapability(row) {
  if (!row) return null;
  return {
    sourceType: String(row.source_type || 'unsupported'),
    app: safeJson(row.app_json, null),
    probeStatus: String(row.probe_status || ''),
    probeError: String(row.probe_error || '').trim() || null,
    retryAfter: row.retry_after || null,
  };
}

async function capability(session, experience, grantedScopes, cache, budget, writes) {
  const appName = String(experience?.app?.name || 'Unknown app').trim() || 'Unknown app';
  const knownType = whopExperienceType(experience);
  let sourceType = knownType;
  let app = null;
  let detectedBy = knownType === 'unsupported' ? 'unresolved' : 'app-metadata';
  let probeAttempted = false;
  let probeDeferred = false;
  let probeFailed = false;
  let probeError = null;
  let cached = false;

  if (knownType === 'unsupported') {
    const row = cache.get(experience.id);
    if (capabilityCacheFresh(row)) {
      const saved = cachedCapability(row);
      sourceType = saved.sourceType;
      app = saved.app;
      cached = true;
      detectedBy = saved.probeStatus === 'complete' ? 'capability-cache' : 'temporary-probe-hold';
      probeAttempted = true;
      probeFailed = saved.probeStatus === 'transient';
      probeError = saved.probeError;
      probeDeferred = probeFailed;
    } else if (!budget.take()) {
      probeDeferred = true;
      detectedBy = 'queued-probe';
    } else {
      probeAttempted = true;
      const now = new Date();
      try {
        sourceType = await resolveWhopExperienceType(session, experience);
        detectedBy = sourceType === 'unsupported' ? 'official-endpoint-probe' : 'official-endpoint-probe';
        if (sourceType === 'unsupported') app = await inspectWhopApp(session, experience);
        writes.push({
          experienceId: experience.id,
          sourceType,
          app,
          probeStatus: 'complete',
          probeError: null,
          retryAfter: null,
          checkedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      } catch (error) {
        probeFailed = true;
        probeDeferred = true;
        probeError = discoveryFailure('Native content probe', error);
        detectedBy = 'temporary-probe-failure';
        if (!isTransientDiscoveryError(error)) console.warn(`Whop capability probe failed for ${experience.id}.`, error);
        const retryAt = new Date(now.getTime() + TRANSIENT_CAPABILITY_RETRY_MS).toISOString();
        writes.push({
          experienceId: experience.id,
          sourceType: 'unsupported',
          app: null,
          probeStatus: 'transient',
          probeError,
          retryAfter: retryAt,
          checkedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
        sourceType = 'unsupported';
      }
    }
  }

  const requiredScope = requiredScopeForType(sourceType) || requiredScopeForExperience(experience);
  return {
    sourceType,
    supported: SUPPORTED_TYPES.has(sourceType),
    requiredScope,
    scopeGranted: !requiredScope || grantedScopes.has(requiredScope),
    appName,
    detectedBy,
    app,
    probeAttempted,
    probeDeferred,
    probeFailed,
    probeError,
    cached,
  };
}

async function classifyCompanySources(session, env, listing, grantedScopes, capabilityCache, budget, writes) {
  const sources = [];
  const externalApps = [];
  const failures = new Set(listing.failures || []);
  const inspected = await mapConcurrent(listing.experiences || [], async (experience) => ({
    experience,
    details: await capability(session, experience, grantedScopes, capabilityCache, budget, writes),
  }), Math.min(3, CONCURRENCY));

  for (const { experience, details } of inspected) {
    if (!details.supported) {
      externalApps.push({
        experience,
        capability: {
          ...details,
          probeAttempted: details.probeAttempted,
          reason: details.probeDeferred
            ? details.probeError || 'This app-specific module is queued for a bounded automatic capability check. Whop remains connected while SniperPlug finishes checking modules in the background.'
            : details.app?.hasOpenapiView
              ? 'Whop’s native Course, Forum, and Chat endpoints were checked and returned no readable items. This app advertises its own OpenAPI view, which still requires the app publisher’s documented authorization contract.'
              : 'Whop’s native Course, Forum, and Chat endpoints were checked and returned no readable items. This is app-specific content, so it requires an API published by that app rather than a guessed or scraped endpoint.',
        },
      });
      continue;
    }

    experience.resolved_source_type = details.sourceType;
    let savedSource;
    try {
      savedSource = await sourceDecision(env, experience, experience.id);
    } catch (error) {
      failures.add(discoveryFailure(`${experience.name || experience.id} saved decision`, error));
      savedSource = {
        experienceId: experience.id,
        label: experience.name || experience.id,
        appName: details.appName,
        decision: 'pending',
      };
    }
    sources.push({ experience, capability: details, source: savedSource });
  }

  let error = null;
  if (!sources.length && !externalApps.length) {
    error = failures.size
      ? `Whop found the membership, but its source checks need attention: ${[...failures].join('; ')}.`
      : 'Whop found the membership product, but it has no current readable experiences attached.';
  }
  return { company: listing.company, sources, externalApps, failures: [...failures], error };
}

export async function discoverWhopSources(session, env) {
  let memberships;
  try {
    memberships = await allPages(session, 'memberships', {}, MAX_MEMBERSHIPS, 'memberships');
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      throw new HttpError(403, 'Reconnect Whop after enabling member:basic:read and member:email:read so joined groups can be discovered automatically.');
    }
    throw error;
  }

  const grantedScopes = scopeSet(session);
  const activeMemberships = memberships.filter(membershipGrantsAccess);
  const companies = membershipCompanies(activeMemberships);
  const listings = await mapConcurrent(companies, async (company) => {
    try {
      return await discoverCompanyListings(session, company);
    } catch (error) {
      return {
        company,
        experiences: [],
        failures: [discoveryFailure(`${company.title} discovery`, error)],
      };
    }
  });

  const unknownIds = listings.flatMap((listing) => listing.experiences || [])
    .filter((experience) => whopExperienceType(experience) === 'unsupported')
    .map((experience) => experience.id);
  const capabilityCache = await loadCapabilityCache(env, unknownIds);
  const budget = createCapabilityProbeBudget();
  const writes = [];
  const results = await mapConcurrent(listings, (listing) => classifyCompanySources(
    session,
    env,
    listing,
    grantedScopes,
    capabilityCache,
    budget,
    writes,
  ), Math.min(3, CONCURRENCY));
  await saveCapabilityRows(env, writes);

  const emptyGroups = results.filter((result) => !result.sources.length && !result.externalApps.length).length;
  const groups = results.map(({ company, sources, externalApps, failures, error }) => ({
    company: {
      id: company.id,
      title: company.title,
      route: company.route,
      statuses: [...company.statuses],
      products: [...company.products].map(([id, title]) => ({ id, title })),
      memberships: company.memberships,
    },
    builtIn: DEFAULT_GROUPS.has(normalize(company.title)),
    defaultRank: DEFAULT_GROUPS.get(normalize(company.title)) ?? 100,
    sources,
    externalApps,
    unsupported: externalApps,
    failures,
    error,
  })).filter((group) => group.sources.length || group.externalApps.length || group.error);

  groups.sort((left, right) => left.defaultRank - right.defaultRank || left.company.title.localeCompare(right.company.title));
  const sources = groups.flatMap((group) => group.sources);
  const externalApps = groups.flatMap((group) => group.externalApps);
  const countsByType = sources.reduce((counts, entry) => {
    counts[entry.capability.sourceType] = (counts[entry.capability.sourceType] || 0) + 1;
    return counts;
  }, {});
  const pendingProbes = externalApps.filter((entry) => entry.capability?.probeDeferred).length;
  const failedProbes = externalApps.filter((entry) => entry.capability?.probeFailed).length;

  return {
    groups,
    missingScopes: REQUIRED_CONTENT_SCOPES.filter((scope) => !grantedScopes.has(scope)),
    capabilityProbe: {
      limit: budget.limit,
      checked: budget.used,
      pending: pendingProbes,
      failed: failedProbes,
      complete: pendingProbes === 0,
      cacheReady: capabilityCache.size > 0 || unknownIds.length === 0,
    },
    counts: {
      memberships: activeMemberships.length,
      ignoredMemberships: memberships.length - activeMemberships.length,
      emptyGroups,
      groups: groups.length,
      sources: sources.length,
      forums: countsByType.forum || 0,
      courses: countsByType.course || 0,
      chats: countsByType.chat || 0,
      externalApps: externalApps.length,
      unsupported: externalApps.length,
      approved: sources.filter((entry) => entry.source.decision === 'approved').length,
      disapproved: sources.filter((entry) => entry.source.decision === 'disapproved').length,
      pending: sources.filter((entry) => entry.source.decision === 'pending').length,
    },
  };
}
