import { HttpError } from './http.js';
import { sourceDecision } from './source-policy.js';
import { whopApi } from './whop.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_MEMBERSHIPS = 1000;
const MAX_FORUMS_PER_COMPANY = 250;
const MAX_COMPANIES = 100;
const CONCURRENCY = 5;
const ACCESS_STATUSES = new Set(['trialing', 'active', 'past_due', 'completed', 'canceling']);
const DEFAULT_GROUPS = new Map([
  ['black box', 0],
  ['hidden files', 1],
]);

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
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

async function mapConcurrent(values, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, values.length)) }, () => worker()));
  return output;
}

function membershipCompanies(memberships) {
  const companies = new Map();
  for (const membership of memberships) {
    const status = String(membership?.status || '').toLowerCase();
    if (status && !ACCESS_STATUSES.has(status)) continue;
    const companyId = String(membership?.company?.id || '').trim();
    if (!companyId) continue;
    const current = companies.get(companyId) || {
      id: companyId,
      title: String(membership?.company?.title || membership?.company?.name || 'Whop group').trim(),
      route: String(membership?.company?.route || '').trim() || null,
      statuses: new Set(),
      products: new Map(),
    };
    if (status) current.statuses.add(status);
    const productId = String(membership?.product?.id || '').trim();
    if (productId) current.products.set(productId, String(membership?.product?.title || 'Whop product').trim());
    companies.set(companyId, current);
  }
  return [...companies.values()].slice(0, MAX_COMPANIES);
}

function forumExperience(forum, company) {
  const id = String(forum?.experience?.id || '').trim();
  if (!/^exp_[A-Za-z0-9_-]+$/.test(id)) return null;
  return {
    id,
    name: String(forum?.experience?.name || forum?.name || 'Forum').trim(),
    company: {
      id: company.id,
      title: company.title,
      route: company.route,
    },
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

  const companies = membershipCompanies(memberships);
  const results = await mapConcurrent(companies, async (company) => {
    try {
      const forums = await allPages(session, 'forums', { company_id: company.id }, MAX_FORUMS_PER_COMPANY, 'forums');
      const sources = [];
      for (const forum of forums) {
        const experience = forumExperience(forum, company);
        if (!experience) continue;
        sources.push({ experience, source: await sourceDecision(env, experience, experience.id) });
      }
      return { company, sources, error: null };
    } catch (error) {
      if (error instanceof HttpError && [403, 404].includes(error.status)) {
        return { company, sources: [], error: 'No readable forum experiences were returned for this membership.' };
      }
      return { company, sources: [], error: String(error?.message || 'Whop forum discovery failed.') };
    }
  });

  const groups = results.map(({ company, sources, error }) => ({
    company: {
      id: company.id,
      title: company.title,
      route: company.route,
      statuses: [...company.statuses],
      products: [...company.products].map(([id, title]) => ({ id, title })),
    },
    builtIn: DEFAULT_GROUPS.has(normalize(company.title)),
    defaultRank: DEFAULT_GROUPS.get(normalize(company.title)) ?? 100,
    sources,
    error,
  })).filter((group) => group.sources.length || group.builtIn || group.error);

  groups.sort((left, right) => left.defaultRank - right.defaultRank || left.company.title.localeCompare(right.company.title));
  const sources = groups.flatMap((group) => group.sources);

  return {
    groups,
    counts: {
      memberships: memberships.length,
      groups: groups.length,
      forums: sources.length,
      approved: sources.filter((entry) => entry.source.decision === 'approved').length,
      disapproved: sources.filter((entry) => entry.source.decision === 'disapproved').length,
      pending: sources.filter((entry) => entry.source.decision === 'pending').length,
    },
  };
}
