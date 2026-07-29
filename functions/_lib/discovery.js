import { HttpError } from './http.js';
import { sourceDecision } from './source-policy.js';
import {
  requiredScopeForExperience,
  whopApi,
  whopExperienceType,
} from './whop.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_MEMBERSHIPS = 1000;
const MAX_ITEMS_PER_SCOPE = 500;
const MAX_COMPANIES = 100;
const CONCURRENCY = 5;
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

export function membershipGrantsAccess(membership) {
  const status = String(membership?.status || '').trim().toLowerCase();
  if (!ACCESS_GRANTING_MEMBERSHIP_STATUSES.has(status)) return false;
  if (membership?.user === null || membership?.member === null) return false;
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

function capability(experience, grantedScopes) {
  const sourceType = whopExperienceType(experience);
  const requiredScope = requiredScopeForExperience(experience);
  return {
    sourceType,
    supported: SUPPORTED_TYPES.has(sourceType),
    requiredScope,
    scopeGranted: !requiredScope || grantedScopes.has(requiredScope),
    appName: String(experience?.app?.name || 'Unknown app').trim() || 'Unknown app',
  };
}

async function discoverCompanySources(session, env, company, grantedScopes) {
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

  const sources = [];
  const externalApps = [];
  for (const experience of discovered.values()) {
    const details = capability(experience, grantedScopes);
    if (!details.supported) {
      externalApps.push({ experience, capability: details });
      continue;
    }
    sources.push({
      experience,
      capability: details,
      source: await sourceDecision(env, experience, experience.id),
    });
  }

  let error = null;
  if (!sources.length && !externalApps.length) {
    error = failures.size
      ? `Whop found the membership, but company-wide and product-scoped discovery could not read its modules: ${[...failures].join('; ')}.`
      : 'Whop found the membership product, but it has no current readable experiences attached.';
  }

  return {
    company,
    sources,
    externalApps,
    failures: [...failures],
    error,
  };
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
  const results = await mapConcurrent(companies, (company) => discoverCompanySources(session, env, company, grantedScopes));
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
  })).filter((group) => group.sources.length || group.externalApps.length);

  groups.sort((left, right) => left.defaultRank - right.defaultRank || left.company.title.localeCompare(right.company.title));
  const sources = groups.flatMap((group) => group.sources);
  const externalApps = groups.flatMap((group) => group.externalApps);
  const countsByType = sources.reduce((counts, entry) => {
    counts[entry.capability.sourceType] = (counts[entry.capability.sourceType] || 0) + 1;
    return counts;
  }, {});

  return {
    groups,
    missingScopes: REQUIRED_CONTENT_SCOPES.filter((scope) => !grantedScopes.has(scope)),
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
