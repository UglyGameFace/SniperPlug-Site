import { principalIdFrom } from './importer-workspace.js';
import { sourceDecision } from './source-policy.js';

export async function hydrateDiscoveryWorkspace(env, principalValue, discovered) {
  const principalId = principalIdFrom(principalValue);
  const groups = Array.isArray(discovered?.groups) ? discovered.groups : [];
  const sources = [];

  for (const group of groups) {
    for (const entry of Array.isArray(group?.sources) ? group.sources : []) {
      entry.source = await sourceDecision(env, principalId, entry.experience, entry.experience?.id);
      sources.push(entry);
    }
  }

  const counts = {
    ...(discovered?.counts || {}),
    sources: sources.length,
    approved: sources.filter((entry) => entry.source?.decision === 'approved').length,
    disapproved: sources.filter((entry) => entry.source?.decision === 'disapproved').length,
    pending: sources.filter((entry) => entry.source?.decision === 'pending').length,
  };
  return { ...discovered, groups, counts };
}
