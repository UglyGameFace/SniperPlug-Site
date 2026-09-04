import { membershipGrantsAccess } from './discovery.js';

function exactId(value, prefix) {
  const id = String(value || '').trim();
  return id.startsWith(prefix) ? id : '';
}

function membershipAccessSummary(membership) {
  return {
    membershipId: exactId(membership?.id, 'mem_'),
    memberId: exactId(membership?.member?.id, 'mber_'),
    productId: exactId(membership?.product?.id, 'prod_'),
    status: String(membership?.status || '').trim().toLowerCase(),
    cancelationStatus: String(membership?.cancelation_status || membership?.cancellation_status || '').trim().toLowerCase() || null,
  };
}

export async function enforceLiveWhopAccess(session, discovery, membershipSnapshot = []) {
  const memberships = Array.isArray(membershipSnapshot) ? membershipSnapshot : [];
  const currentMemberships = memberships.filter(membershipGrantsAccess);
  const byCompany = new Map();

  for (const membership of currentMemberships) {
    const companyId = exactId(membership?.company?.id, 'biz_');
    if (!companyId) continue;
    const entries = byCompany.get(companyId) || [];
    entries.push(membershipAccessSummary(membership));
    byCompany.set(companyId, entries);
  }

  const requestedCompanyIds = [...new Set((discovery?.groups || [])
    .map((group) => exactId(group?.company?.id, 'biz_'))
    .filter(Boolean))];

  const allowedCompanies = new Set();
  const accessChecks = [];
  for (const companyId of requestedCompanyIds) {
    const entries = byCompany.get(companyId) || [];
    const granted = entries.length > 0;
    if (granted) allowedCompanies.add(companyId);
    accessChecks.push({
      companyId,
      granted,
      verifiedBy: 'membership-list',
      memberships: entries,
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
    accessVerification: 'membership-list',
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
