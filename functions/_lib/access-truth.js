import { HttpError } from './http.js';
import { whopApi } from './whop.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 100;
const MAX_MEMBERSHIPS = 1000;
const ACCESS_STATUSES = new Set(['active', 'trialing', 'past_due', 'completed', 'canceling']);

function exactId(value, prefix) {
  const id = String(value || '').trim();
  return id.startsWith(prefix) ? id : '';
}

async function allMemberships(session) {
  const output = [];
  let after = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await whopApi(session, 'memberships', {
      first: PAGE_SIZE,
      ...(after ? { after } : {}),
    });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    output.push(...rows);
    if (output.length > MAX_MEMBERSHIPS) throw new HttpError(422, 'Whop returned too many memberships to verify safely.');
    if (!payload?.page_info?.has_next_page) return output;
    const next = String(payload?.page_info?.end_cursor || '').trim();
    if (!next || next === after) throw new HttpError(502, 'Whop returned an invalid membership cursor during access verification.');
    after = next;
  }
  throw new HttpError(502, 'Whop membership verification exceeded the safe page limit.');
}

function membershipLooksCurrent(membership) {
  const status = String(membership?.status || '').trim().toLowerCase();
  if (!ACCESS_STATUSES.has(status)) return false;
  if (membership?.joined_at === null) return false;
  const memberStatus = String(membership?.member?.status || '').trim().toLowerCase();
  const accessLevel = String(membership?.member?.access_level || '').trim().toLowerCase();
  if (memberStatus === 'left' || accessLevel === 'no_access') return false;
  return true;
}

async function retrieveMemberTruth(session, memberId) {
  try {
    const payload = await whopApi(session, `members/${encodeURIComponent(memberId)}`);
    const member = payload?.data || payload;
    const status = String(member?.status || '').trim().toLowerCase();
    const accessLevel = String(member?.access_level || '').trim().toLowerCase();
    return {
      verified: true,
      grantsAccess: status === 'joined' && ['customer', 'admin'].includes(accessLevel),
      status,
      accessLevel,
      companyId: exactId(member?.company?.id, 'biz_'),
      userId: exactId(member?.user?.id, 'user_'),
    };
  } catch (error) {
    if (error instanceof HttpError && [403, 404].includes(error.status)) {
      return { verified: true, grantsAccess: false, status: 'unavailable', accessLevel: 'no_access', companyId: '', userId: '' };
    }
    throw error;
  }
}

async function mapLimited(values, mapper, concurrency = 5) {
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

export async function enforceLiveWhopAccess(session, discovery) {
  const memberships = await allMemberships(session);
  const candidateMemberships = memberships.filter(membershipLooksCurrent);
  const byCompany = new Map();
  for (const membership of candidateMemberships) {
    const companyId = exactId(membership?.company?.id, 'biz_');
    const memberId = exactId(membership?.member?.id, 'mber_');
    if (!companyId || !memberId) continue;
    const current = byCompany.get(companyId) || new Set();
    current.add(memberId);
    byCompany.set(companyId, current);
  }

  const requestedCompanyIds = [...new Set((discovery?.groups || []).map((group) => exactId(group?.company?.id, 'biz_')).filter(Boolean))];
  const memberIds = [...new Set(requestedCompanyIds.flatMap((companyId) => [...(byCompany.get(companyId) || [])]))];
  const memberTruth = await mapLimited(memberIds, async (memberId) => [memberId, await retrieveMemberTruth(session, memberId)]);
  const truthByMember = new Map(memberTruth);

  const allowedCompanies = new Set();
  const accessChecks = [];
  for (const companyId of requestedCompanyIds) {
    const ids = [...(byCompany.get(companyId) || [])];
    const checks = ids.map((id) => truthByMember.get(id)).filter(Boolean);
    const granted = checks.some((check) => check.grantsAccess && (!check.companyId || check.companyId === companyId));
    if (granted) allowedCompanies.add(companyId);
    accessChecks.push({
      companyId,
      granted,
      memberIds: ids,
      results: checks.map((check) => ({ status: check.status, accessLevel: check.accessLevel })),
    });
  }

  const groups = (discovery?.groups || []).filter((group) => allowedCompanies.has(String(group?.company?.id || '')));
  const sources = groups.flatMap((group) => group.sources || []);
  const externalApps = groups.flatMap((group) => group.externalApps || group.unsupported || []);
  const countsByType = sources.reduce((counts, entry) => {
    const type = String(entry?.capability?.sourceType || '');
    if (type) counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  return {
    ...discovery,
    groups,
    connectedUser: {
      id: session?.profile?.sub || session?.profile?.id || null,
      username: session?.profile?.preferred_username || session?.profile?.username || null,
      name: session?.profile?.name || null,
      email: session?.profile?.email || null,
    },
    accessVerifiedAt: new Date().toISOString(),
    accessChecks,
    counts: {
      ...(discovery?.counts || {}),
      groups: groups.length,
      sources: sources.length,
      forums: countsByType.forum || 0,
      courses: countsByType.course || 0,
      chats: countsByType.chat || 0,
      externalApps: externalApps.length,
      unsupported: externalApps.length,
      approved: sources.filter((entry) => entry?.source?.decision === 'approved').length,
      disapproved: sources.filter((entry) => entry?.source?.decision === 'disapproved').length,
      pending: sources.filter((entry) => entry?.source?.decision === 'pending').length,
      deniedGroups: Math.max(0, requestedCompanyIds.length - groups.length),
    },
  };
}