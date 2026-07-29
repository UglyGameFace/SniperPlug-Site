import { rejectionReasonForGuide } from './content-policy.js';
import { requireDatabase } from './http.js';

const OWNER_KEY = 'sniperplug-owner';
const LOOKBACK_HOURS = 72;
const MAX_GUIDES = 2000;

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function resultGuideIds(result) {
  const values = [
    ...(Array.isArray(result?.guideIds) ? result.guideIds : []),
    ...(Array.isArray(result?.published?.publishedGuideIds) ? result.published.publishedGuideIds : []),
  ];
  return values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
}

async function recentBulkGuideIds(db) {
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const jobs = await db.prepare(`
    SELECT results_json FROM bulk_jobs
    WHERE admin_session_id = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 40
  `).bind(OWNER_KEY, cutoff).all().catch(() => ({ results: [] }));
  const ids = new Set();
  for (const job of jobs.results || []) {
    for (const result of safeJson(job.results_json, [])) {
      for (const id of resultGuideIds(result)) ids.add(id);
    }
  }
  return [...ids].slice(0, MAX_GUIDES);
}

function duplicateKey(row) {
  const title = String(row?.title || '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
  const body = String(row?.body_markdown || '').normalize('NFKC').trim();
  return title && body ? `${title}\u0000${body}` : '';
}

function preferredRow(rows) {
  return [...rows].sort((a, b) => {
    const statusScore = (row) => row.status === 'published' ? 0 : row.status === 'draft' ? 1 : 2;
    return statusScore(a) - statusScore(b) || String(a.imported_at || '').localeCompare(String(b.imported_at || '')) || Number(a.id) - Number(b.id);
  })[0];
}

async function reconcile(env) {
  const db = requireDatabase(env);
  const ids = await recentBulkGuideIds(db);
  if (!ids.length) return { checked: 0, rejected: 0, duplicates: 0, deferred: false };
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT id, title, body_markdown, status, source_key, source_created_at, imported_at,
           attachment_json, integrity_json
    FROM guides
    WHERE id IN (${placeholders}) AND source_key IS NOT NULL AND status != 'rejected'
  `).bind(...ids).all();
  const values = rows.results || [];
  if (!values.length) return { checked: 0, rejected: 0, duplicates: 0, deferred: false };
  const reasons = new Map();
  const duplicateGroups = new Map();

  for (const row of values) {
    const reason = rejectionReasonForGuide(row);
    if (reason) reasons.set(Number(row.id), reason);
    const key = duplicateKey(row);
    if (key) {
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
      if (!reasons.has(Number(row.id))) {
        reasons.set(Number(row.id), `Duplicate of “${keep.title}”.`);
        duplicateCount += 1;
      }
    }
  }

  if (!reasons.size) return { checked: values.length, rejected: 0, duplicates: 0, deferred: false };
  const now = new Date().toISOString();
  const statements = [];
  for (const row of values) {
    const reason = reasons.get(Number(row.id));
    if (!reason) continue;
    const integrity = safeJson(row.integrity_json, {});
    statements.push(db.prepare(`
      UPDATE guides
      SET status = 'rejected', published_at = NULL, updated_at = ?, integrity_json = ?
      WHERE id = ? AND status != 'rejected'
    `).bind(now, JSON.stringify({
      ...integrity,
      quarantined: true,
      quarantineReason: reason,
      quarantinedAt: now,
      cleanupVersion: 2,
    }), row.id));
    if (row.source_key) {
      statements.push(db.prepare(`
        UPDATE whop_posts
        SET decision = 'disapproved', decision_updated_at = ?
        WHERE source_key = ? AND decision != 'blocked'
      `).bind(now, row.source_key));
    }
  }
  if (statements.length) await db.batch(statements);
  return { checked: values.length, rejected: reasons.size, duplicates: duplicateCount, deferred: false };
}

export async function reconcileRecentBulkImports(env) {
  try {
    return await reconcile(env);
  } catch (error) {
    console.warn('Optional import reconciliation was deferred so the Control Center can remain available.');
    return {
      checked: 0,
      rejected: 0,
      duplicates: 0,
      deferred: true,
      reason: /no such table|no such column|has no column named/i.test(String(error?.message || ''))
        ? 'database-compatibility'
        : 'runtime-retry',
    };
  }
}
