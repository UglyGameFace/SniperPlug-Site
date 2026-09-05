import { HttpError } from './http.js';
import { experienceIdFrom } from './whop.js';
import {
  ensureImporterWorkspaceSchema,
  principalIdFrom,
  sourceStorageId,
  upstreamExperienceId,
} from './importer-workspace.js';

const MAX_SOURCE_DECISIONS = 100;

export const DEFAULT_WHOP_GROUPS = Object.freeze([
  Object.freeze({ key: 'black-box', label: 'Black Box', aliases: Object.freeze(['black box', 'black box clips']) }),
  Object.freeze({ key: 'hidden-files', label: 'Hidden Files', aliases: Object.freeze(['hidden files']) }),
]);

export function normalizeGroupName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

function experienceNames(experience) {
  return [
    experience?.company?.title,
    experience?.company?.name,
    experience?.name,
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function suggestedGroup(experience) {
  const names = new Set(experienceNames(experience).map(normalizeGroupName));
  return DEFAULT_WHOP_GROUPS.find((group) => group.aliases.some((alias) => names.has(normalizeGroupName(alias)))) || null;
}

function experienceLabel(experience) {
  return String(experience?.company?.title || experience?.company?.name || experience?.name || 'Whop source').trim().slice(0, 120);
}

function clientSourceState(saved, experience, logicalExperienceId) {
  const suggestion = suggestedGroup(experience);
  return {
    experienceId: logicalExperienceId,
    label: saved?.label || experienceLabel(experience),
    decision: saved?.decision || 'pending',
    defaultGroup: saved?.default_group || suggestion?.key || null,
    builtInLabel: suggestion?.label || null,
    suggested: Boolean(suggestion),
    saved: Boolean(saved),
  };
}

function legacyDiscoveryRead(principalValue, experience, requestedId) {
  return principalValue && typeof principalValue === 'object'
    && typeof experience === 'string'
    && requestedId === undefined
    && /^exp_[A-Za-z0-9_-]+$/.test(experience);
}

export async function sourceDecision(env, principalValue, experience, requestedId) {
  // discovery.js historically called sourceDecision(env, experience, id) without
  // an authenticated principal. Never default that read to the owner tenant. It
  // returns pending only; /api/discover hydrates real saved decisions afterward
  // with the authenticated principal.
  if (legacyDiscoveryRead(principalValue, experience, requestedId)) {
    return clientSourceState(null, principalValue, experience);
  }

  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const logicalExperienceId = experienceIdFrom(requestedId || experience?.id);
  if (!logicalExperienceId) throw new HttpError(422, 'A valid Whop experience ID is required.');
  const saved = await db.prepare(`
    SELECT * FROM whop_sources
    WHERE principal_id = ? AND upstream_experience_id = ?
  `).bind(principalId, logicalExperienceId).first();
  return clientSourceState(saved, experience, logicalExperienceId);
}

function normalizedEntries(entries) {
  const values = Array.isArray(entries) ? entries : [entries];
  if (!values.length) throw new HttpError(422, 'Choose at least one Whop source.');
  if (values.length > MAX_SOURCE_DECISIONS) {
    throw new HttpError(422, `Choose at most ${MAX_SOURCE_DECISIONS} Whop sources at once.`);
  }
  return values.map((entry) => entry?.experience
    ? { experience: entry.experience, requestedId: entry.requestedId || entry.experience?.id }
    : { experience: entry, requestedId: entry?.id });
}

async function verifiedSourceRows(db, principalId, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT * FROM whop_sources
    WHERE principal_id = ? AND upstream_experience_id IN (${placeholders})
  `).bind(principalId, ...ids).all();
  return rows.results || [];
}

export async function saveSourceDecisions(env, principalValue, entries, decision) {
  if (!['approved', 'disapproved'].includes(decision)) throw new HttpError(422, 'Choose Approve or Disapprove.');
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const prepared = [];
  const seen = new Set();

  for (const entry of normalizedEntries(entries)) {
    const state = await sourceDecision(env, principalId, entry.experience, entry.requestedId);
    if (seen.has(state.experienceId)) continue;
    seen.add(state.experienceId);
    prepared.push({ experience: entry.experience, state });
  }
  if (!prepared.length) throw new HttpError(422, 'Choose at least one unique Whop source.');

  const now = new Date().toISOString();
  const statements = [];
  for (const { experience: itemExperience, state } of prepared) {
    const storageId = await sourceStorageId(principalId, state.experienceId);
    statements.push(db.prepare(`
      INSERT INTO whop_sources (
        experience_id, principal_id, upstream_experience_id,
        label, company_id, company_title, experience_name,
        decision, default_group, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(principal_id, upstream_experience_id) DO UPDATE SET
        label = excluded.label,
        company_id = excluded.company_id,
        company_title = excluded.company_title,
        experience_name = excluded.experience_name,
        decision = excluded.decision,
        default_group = excluded.default_group,
        updated_at = excluded.updated_at
    `).bind(
      storageId,
      principalId,
      state.experienceId,
      experienceLabel(itemExperience),
      String(itemExperience?.company?.id || '') || null,
      String(itemExperience?.company?.title || itemExperience?.company?.name || '') || null,
      String(itemExperience?.name || '') || null,
      decision,
      state.defaultGroup,
      now,
      now,
    ));
  }
  await db.batch(statements);

  const ids = prepared.map(({ state }) => state.experienceId);
  const rows = await verifiedSourceRows(db, principalId, ids);
  const byId = new Map(rows.map((row) => [upstreamExperienceId(row), row]));
  const missing = ids.filter((id) => !byId.has(id));
  const mismatched = ids.filter((id) => byId.get(id)?.decision !== decision);
  if (missing.length || mismatched.length) {
    throw new HttpError(500, 'SniperPlug could not confirm every Whop source decision in this account workspace. Refresh before retrying.', {
      code: 'source_decision_unconfirmed',
      requested: ids.length,
      confirmed: ids.length - new Set([...missing, ...mismatched]).size,
      missing,
      mismatched,
    });
  }

  return prepared.map(({ state }) => ({
    ...state,
    label: byId.get(state.experienceId)?.label || state.label,
    decision,
    saved: true,
    updatedAt: byId.get(state.experienceId)?.updated_at || now,
  }));
}

export async function saveSourceDecision(env, principalValue, experience, requestedId, decision) {
  const saved = await saveSourceDecisions(env, principalValue, [{ experience, requestedId }], decision);
  return saved[0];
}

export async function requireApprovedSource(env, principalValue, experienceId) {
  const principalId = principalIdFrom(principalValue);
  const id = experienceIdFrom(experienceId);
  const db = await ensureImporterWorkspaceSchema(env);
  const source = id ? await db.prepare(`
    SELECT * FROM whop_sources
    WHERE principal_id = ? AND upstream_experience_id = ?
  `).bind(principalId, id).first() : null;
  if (!source || source.decision !== 'approved') {
    throw new HttpError(403, 'Approve this exact Whop source in this SniperPlug account before scanning or importing its content.');
  }
  return source;
}

export async function listSourceOptions(env, principalValue) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const rows = await db.prepare(`
    SELECT * FROM whop_sources
    WHERE principal_id = ?
    ORDER BY label, experience_name, upstream_experience_id
  `).bind(principalId).all();
  const sources = rows.results || [];
  const output = [];
  for (const group of DEFAULT_WHOP_GROUPS) {
    const matches = sources.filter((source) => source.default_group === group.key);
    if (!matches.length) {
      output.push({ key: group.key, label: group.label, experienceId: null, decision: 'pending', builtIn: true, groupKey: group.key });
    } else {
      output.push(...matches.map((source) => {
        const logicalId = upstreamExperienceId(source);
        return {
          key: logicalId,
          label: source.experience_name && normalizeGroupName(source.experience_name) !== normalizeGroupName(group.label)
            ? `${group.label} · ${source.experience_name}`
            : `${group.label} · …${logicalId.slice(-6)}`,
          experienceId: logicalId,
          decision: source.decision,
          builtIn: true,
          groupKey: group.key,
        };
      }));
    }
  }
  output.push(...sources.filter((source) => !source.default_group).map((source) => {
    const logicalId = upstreamExperienceId(source);
    return {
      key: logicalId,
      label: source.experience_name ? `${source.label} · ${source.experience_name}` : source.label,
      experienceId: logicalId,
      decision: source.decision,
      builtIn: false,
      groupKey: null,
    };
  }));
  return output;
}
