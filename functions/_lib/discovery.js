import { HttpError } from './http.js';
import { sourceDecision } from './source-policy.js';
import { whopApi } from './whop.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_MEMBERSHIPS = 1000;
const MAX_ITEMS_PER_PRODUCT = 250;
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
  ['hidden files', 1],
]);

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function exactExperienceId(value) {
  const id = String(value || '').trim();
  return /^exp_[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

export function membershipGrantsAccess(membership) {
  return ACCESS_GRANTING_MEMBERSHIP_STATUSES.has(String(membership?.status || '').trim().toLowerCase());
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

function forumExperience(forum, company) {
  const id = exactExperienceId(forum?.experience?.id || forum?.id);
  if (!id) return null;
  return {
    id,
    name: String(forum?.experience?.name || forum?.name || 'Forum').trim(),
    is_public: Boolean(forum?.experience?.is_public),
    company: companySummary(company),
    app: {
      id: forum?.experience?.app?.id || null,
      name: forum?.experience?.app?.name || 'Forums',
    },
  };
}

function listedExperience(experience, company) {
  const id = exactExperienceId(experience?.id);
  if (!id) return null;
  return {
    ...experience,
    id,
    name: String(experience?.name || 'Whop experience').trim(),
    company: companySummary(company),
    app: experience?.app ? {
      id: experience.app.id || null,
      name: experience.app.name || null,
    } : null,
  };
}

function isForumExperience(experience) {
  return normalize(experience?.app?.name || '').includes('forum');
}

function discoveryFailure(label, error) {
  if (error instanceof HttpError && error.status === 403) return `${label} was denied`;
  if (error instanceof HttpError && error.status === 404) return `${label} was not found`;
  const message = String(error?.message || '').trim().slice(0, 160);
  return `${label} failed${message ? `: ${message}` : ''}`;
}

async function discoverCompanyForumSources(session, env, company) {
  const membershipProducts = [...company.products].map(([id, title]) => ({ id, title }));
  const scopes = membershipProducts.length ? membershipProducts : [{ id: null, title: 'company access' }];
  const attempts = await mapConcurrent(scopes, async (product) => {
    const query = {
      company_id: company.id,
      ...(product.id ? { product_id: product.id } : {}),
    };
    const output = { product, forums: [], experiences: [], failures: [] };
    try {
      output.forums = await allPages(session, 'forums', query, MAX_ITEMS_PER_PRODUCT, `${product.title} forums`);
    } catch (error) {
      output.failures.push(discoveryFailure(`${product.title} forum lookup`, error));
    }
    try {
      output.experiences = await allPages(session, 'experiences', query, MAX_ITEMS_PER_PRODUCT, `${product.title} experiences`);
    } catch (error) {
      output.failures.push(discoveryFailure(`${product.title} experience lookup`, error));
    }
    return output;
  }, Math.min(3, CONCURRENCY));

  const discovered = new Map();
  const experienceTypes = new Set();
  const failures = new Set();
  for (const attempt of attempts) {
    for (const failure of attempt.failures) failures.add(failure);
    for (const forum of attempt.forums) {
      const experience = forumExperience(forum, company);
      if (experience) discovered.set(experience.id, experience);
    }
    for (const raw of attempt.experiences) {
      const experience = listedExperience(raw, company);
      if (!experience) continue;
      const appName = String(experience.app?.name || 'Unknown app').trim() || 'Unknown app';
      experienceTypes.add(appName);
      if (isForumExperience(experience)) discovered.set(experience.id, experience);
    }
  }

  const sources = [];
  for (const experience of discovered.values()) {
    sources.push({ experience, source: await sourceDecision(env, experience, experience.id) });
  }

  let error = null;
  if (!sources.length) {
    if (experienceTypes.size) {
      error = `No native Whop forum is attached to this membership product. Available experience types: ${[...experienceTypes].sort().join(', ')}.`;
    } else if (failures.size) {
      error = `Whop found the membership, but product-scoped discovery could not read its modules: ${[...failures].join('; ')}.`;
    } else {
      error = 'Whop found the membership product, but it has no readable forum or experience modules attached.';
    }
  }

  return {
    company,
    sources,
    experienceTypes: [...experienceTypes].sort(),
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

  const activeMemberships = memberships.filter(membershipGrantsAccess);
  const companies = membershipCompanies(activeMemberships);
  const results = await mapConcurrent(companies, (company) => discoverCompanyForumSources(session, env, company));
  const groups = results.map(({ company, sources, experienceTypes, error }) => ({
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
    experienceTypes,
    error,
  })).filter((group) => group.sources.length || group.builtIn);

  groups.sort((left, right) => left.defaultRank - right.defaultRank || left.company.title.localeCompare(right.company.title));
  const sources = groups.flatMap((group) => group.sources);

  return {
    groups,
    counts: {
      memberships: activeMemberships.length,
      ignoredMemberships: memberships.length - activeMemberships.length,
      groups: groups.length,
      forums: sources.length,
      approved: sources.filter((entry) => entry.source.decision === 'approved').length,
      disapproved: sources.filter((entry) => entry.source.decision === 'disapproved').length,
      pending: sources.filter((entry) => entry.source.decision === 'pending').length,
    },
  };
}
