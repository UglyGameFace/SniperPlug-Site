import { rejectionReasonForGuide } from './content-policy.js';
import { requireDatabase } from './http.js';

const MAX_GUIDES = 4000;
const UPDATE_BATCH_SIZE = 75;
const RECONCILE_THROTTLE_MS = 30_000;

let lastRunAt = 0;
let lastResult = null;
let inFlight = null;

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function duplicateKey(row) {
  const title = String(row?.title || '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
  const body = String(row?.body_markdown || '').normalize('NFKC').trim();
  return title && body ? `${title}\u0000${body}` : '';
}

function preferredRow(rows) {
  return [...rows].sort((a, b) => {
    const statusScore = (row) => row.status === 'published' ? 0 : row.status === 'draft' ? 1 : 2;
    return statusScore(a) - statusScore(b)
      || String(a.imported_at || '').localeCompare(String(b.imported_at || ''))
      || Number(a.id) - Number(b.id);
  })[0];
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function reconcile(env) {
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT id, title, body_markdown, status, source_key, source_created_at, imported_at,
           updated_at, attachment_json, integrity_json
    FROM guides
    WHERE source_key IS NOT NULL AND status IN ('draft', 'published')
    ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT ${MAX_GUIDES}
  `).all();
  const values = rows.results || [];
  if (!values.length) {
    return { checked: 0, rejected: 0, duplicates: 0, unpublished: 0, draftsRemoved: 0, capped: false, deferred: false };
  }

  const reasons = new Map();
  const duplicateGroups = new Map();
  for (const row of values) {
    const reason = rejectionReasonForGuide(row);
    if (reason) reasons.set(Number(row.id), reason);
    const key = duplicateKey(row);
    if (key && !reason) {
      const group = duplicateGroups.get(key) || [];
      group.push(row);
      duplicateGroups.set(key, group);
    }
  }

  let duplicateCount = 0;
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const keep = preferredRow(group);
    for (const row of group) {
      if (Number(row.id) === Number(keep.id)) continue;
      reasons.set(Number(row.id), `Duplicate of “${keep.title}”.`);
      duplicateCount += 1;
    }
  }

  if (!reasons.size) {
    return {
      checked: values.length,
      rejected: 0,
      duplicates: 0,
      unpublished: 0,
      draftsRemoved: 0,
      capped: values.length >= MAX_GUIDES,
      deferred: false,
    };
  }

  const now = new Date().toISOString();
  const statements = [];
  let unpublished = 0;
  let draftsRemoved = 0;
  for (const row of values) {
    const reason = reasons.get(Number(row.id));
    if (!reason) continue;
    if (row.status === 'published') unpublished += 1;
    else draftsRemoved += 1;
    const integrity = safeJson(row.integrity_json, {});
    statements.push(db.prepare(`
      UPDATE guides
      SET status = 'rejected', published_at = NULL, updated_at = ?, integrity_json = ?
      WHERE id = ? AND status IN ('draft', 'published')
    `).bind(now, JSON.stringify({
      ...integrity,
      quarantined: true,
      quarantineReason: reason,
      quarantinedAt: now,
      cleanupVersion: 3,
    }), row.id));
    if (row.source_key) {
      statements.push(db.prepare(`
        UPDATE whop_posts
        SET decision = 'disapproved', decision_updated_at = ?
        WHERE source_key = ? AND decision != 'blocked'
      `).bind(now, row.source_key));
    }
  }
  for (const group of chunks(statements, UPDATE_BATCH_SIZE)) await db.batch(group);

  return {
    checked: values.length,
    rejected: reasons.size,
    duplicates: duplicateCount,
    unpublished,
    draftsRemoved,
    capped: values.length >= MAX_GUIDES,
    deferred: false,
  };
}

export async function reconcileImportedGuides(env, { force = false } = {}) {
  const now = Date.now();
  if (!force && lastResult && now - lastRunAt < RECONCILE_THROTTLE_MS) return lastResult;
  if (inFlight) return inFlight;
  inFlight = reconcile(env)
    .then((result) => {
      lastRunAt = Date.now();
      lastResult = result;
      return result;
    })
    .catch((error) => {
      console.warn('Importer reconciliation was deferred so the site can remain available.');
      return {
        checked: 0,
        rejected: 0,
        duplicates: 0,
        unpublished: 0,
        draftsRemoved: 0,
        capped: false,
        deferred: true,
        reason: /no such table|no such column|has no column named/i.test(String(error?.message || ''))
          ? 'database-compatibility'
          : 'runtime-retry',
      };
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

export async function reconcileRecentBulkImports(env) {
  return reconcileImportedGuides(env);
}
