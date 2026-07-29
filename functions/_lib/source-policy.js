import { HttpError, requireDatabase } from './http.js';
import { experienceIdFrom } from './whop.js';

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

export async function sourceDecision(env, experience, requestedId) {
  const db = requireDatabase(env);
  const experienceId = experienceIdFrom(requestedId || experience?.id);
  if (!experienceId) throw new HttpError(422, 'A valid Whop experience ID is required.');
  const saved = await db.prepare('SELECT * FROM whop_sources WHERE experience_id = ?').bind(experienceId).first();
  const suggestion = suggestedGroup(experience);
  return {
    experienceId,
    label: saved?.label || experienceLabel(experience),
    decision: saved?.decision || 'pending',
    defaultGroup: saved?.default_group || suggestion?.key || null,
    builtInLabel: suggestion?.label || null,
    suggested: Boolean(suggestion),
    saved: Boolean(saved),
  };
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

export async function saveSourceDecisions(env, entries, decision) {
  if (!['approved', 'disapproved'].includes(decision)) throw new HttpError(422, 'Choose Approve or Disapprove.');
  const db = requireDatabase(env);
  const prepared = [];
  const seen = new Set();

  for (const entry of normalizedEntries(entries)) {
    const state = await sourceDecision(env, entry.experience, entry.requestedId);
    if (seen.has(state.experienceId)) continue;
    seen.add(state.experienceId);
    prepared.push({ experience: entry.experience, state });
  }
  if (!prepared.length) throw new HttpError(422, 'Choose at least one unique Whop source.');

  const now = new Date().toISOString();
  const statements = prepared.map(({ experience, state }) => db.prepare(`
    INSERT INTO whop_sources (
      experience_id, label, company_id, company_title, experience_name,
      decision, default_group, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(experience_id) DO UPDATE SET
      label = excluded.label,
      company_id = excluded.company_id,
      company_title = excluded.company_title,
      experience_name = excluded.experience_name,
      decision = excluded.decision,
      default_group = excluded.default_group,
      updated_at = excluded.updated_at
  `).bind(
    state.experienceId,
    experienceLabel(experience),
    String(experience?.company?.id || '') || null,
    String(experience?.company?.title || experience?.company?.name || '') || null,
    String(experience?.name || '') || null,
    decision,
    state.defaultGroup,
    now,
    now,
  ));
  await db.batch(statements);
  return prepared.map(({ state }) => ({ ...state, decision, saved: true }));
}

export async function saveSourceDecision(env, experience, requestedId, decision) {
  const saved = await saveSourceDecisions(env, [{ experience, requestedId }], decision);
  return saved[0];
}

export async function requireApprovedSource(env, experienceId) {
  const id = experienceIdFrom(experienceId);
  const db = requireDatabase(env);
  const source = id ? await db.prepare('SELECT * FROM whop_sources WHERE experience_id = ?').bind(id).first() : null;
  if (!source || source.decision !== 'approved') {
    throw new HttpError(403, 'Approve this exact Whop source before scanning or importing its content.');
  }
  return source;
}

export async function listSourceOptions(env) {
  const db = requireDatabase(env);
  const rows = await db.prepare('SELECT * FROM whop_sources ORDER BY label, experience_name, experience_id').all();
  const sources = rows.results || [];
  const output = [];
  for (const group of DEFAULT_WHOP_GROUPS) {
    const matches = sources.filter((source) => source.default_group === group.key);
    if (!matches.length) {
      output.push({ key: group.key, label: group.label, experienceId: null, decision: 'pending', builtIn: true, groupKey: group.key });
    } else {
      output.push(...matches.map((source) => ({
        key: source.experience_id,
        label: source.experience_name && normalizeGroupName(source.experience_name) !== normalizeGroupName(group.label)
          ? `${group.label} · ${source.experience_name}`
          : `${group.label} · …${source.experience_id.slice(-6)}`,
        experienceId: source.experience_id,
        decision: source.decision,
        builtIn: true,
        groupKey: group.key,
      })));
    }
  }
  output.push(...sources.filter((source) => !source.default_group).map((source) => ({
    key: source.experience_id,
    label: source.experience_name ? `${source.label} · ${source.experience_name}` : source.label,
    experienceId: source.experience_id,
    decision: source.decision,
    builtIn: false,
    groupKey: null,
  })));
  return output;
}
