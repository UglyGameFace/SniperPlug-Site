import { HttpError, requireDatabase } from './http.js';

const OWNER_KEY = 'sniperplug-owner';
const HISTORY_HOURS = 48;
const MAX_ACTIONS = 1000;

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

async function ensureBulkTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY,
      admin_session_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'canceled')),
      source_ids_json TEXT NOT NULL,
      source_index INTEGER NOT NULL DEFAULT 0,
      results_json TEXT NOT NULL DEFAULT '[]',
      failures_json TEXT NOT NULL DEFAULT '[]',
      summary_json TEXT NOT NULL DEFAULT '{}',
      lease_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `).run();
}

async function ensureDismissalTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS recent_action_dismissals (
      admin_session_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      dismissed_at TEXT NOT NULL,
      PRIMARY KEY (admin_session_id, action_id)
    )
  `).run();
}

function actionId(jobId, guideId) {
  return `${jobId}:${guideId}`;
}

function idsFromResult(result) {
  const published = Array.isArray(result?.published?.publishedGuideIds) ? result.published.publishedGuideIds : [];
  const imported = Array.isArray(result?.guideIds) ? result.guideIds : [];
  return [...new Set([...published, ...imported].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
}

async function recentJobs(db) {
  await ensureBulkTable(db);
  const cutoff = new Date(Date.now() - HISTORY_HOURS * 3_600_000).toISOString();
  const rows = await db.prepare(`
    SELECT * FROM bulk_jobs
    WHERE admin_session_id = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 30
  `).bind(OWNER_KEY, cutoff).all();
  return rows.results || [];
}

export async function listRecentActions(env, admin) {
  if (!admin?.sid) throw new HttpError(401, 'Unlock the SniperPlug Control Center first.');
  const db = requireDatabase(env);
  await ensureDismissalTable(db);
  const jobs = await recentJobs(db);
  const references = [];
  for (const job of jobs) {
    for (const result of safeJson(job.results_json, [])) {
      for (const guideId of idsFromResult(result)) {
        references.push({
          actionId: actionId(job.id, guideId),
          jobId: job.id,
          jobStatus: job.status,
          jobCreatedAt: job.created_at,
          sourceId: result.experienceId || null,
          sourceTitle: result.title || result.experienceId || 'Whop source',
          guideId,
        });
      }
    }
  }
  const cutoff = new Date(Date.now() - HISTORY_HOURS * 3_600_000).toISOString();
  const rejected = await db.prepare(`
    SELECT id, source_key, source_group, updated_at
    FROM guides
    WHERE status = 'rejected' AND source_key IS NOT NULL AND updated_at >= ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(cutoff, MAX_ACTIONS).all();
  for (const guide of rejected.results || []) {
    references.push({
      actionId: `manual-reject:${guide.id}`,
      jobId: null,
      jobStatus: 'manual',
      jobCreatedAt: guide.updated_at,
      sourceId: null,
      sourceTitle: guide.source_group || 'Imported Whop source',
      guideId: Number(guide.id),
    });
  }
  const dismissedRows = await db.prepare(`
    SELECT action_id FROM recent_action_dismissals
    WHERE admin_session_id = ?
  `).bind(OWNER_KEY).all();
  const dismissed = new Set((dismissedRows.results || []).map((row) => String(row.action_id)));
  const unique = new Map(references.filter((item) => !dismissed.has(item.actionId)).map((item) => [item.actionId, item]));
  const values = [...unique.values()].slice(0, MAX_ACTIONS);
  if (!values.length) return { windowHours: HISTORY_HOURS, actions: [], reversibleCount: 0 };
  const ids = [...new Set(values.map((item) => item.guideId))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT guides.id, guides.title, guides.status, guides.category_slug, guides.source_key,
           guides.source_group, guides.published_at, guides.updated_at,
           guide_categories.label AS category_label
    FROM guides
    LEFT JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE guides.id IN (${placeholders})
  `).bind(...ids).all();
  const guideById = new Map((rows.results || []).map((row) => [Number(row.id), row]));
  const actions = values.map((reference) => {
    const guide = guideById.get(reference.guideId);
    if (!guide || !['published', 'rejected'].includes(String(guide.status || ''))) return null;
    return {
      ...reference,
      title: guide.title,
      status: guide.status,
      category: guide.category_slug,
      categoryLabel: guide.category_label || guide.category_slug,
      sourceKey: guide.source_key,
      sourceGroup: guide.source_group,
      publishedAt: guide.published_at,
      updatedAt: guide.updated_at,
      reversible: true,
    };
  }).filter(Boolean).sort((a, b) => String(b.publishedAt || b.updatedAt || '').localeCompare(String(a.publishedAt || a.updatedAt || '')));
  return {
    windowHours: HISTORY_HOURS,
    actions,
    reversibleCount: actions.length,
  };
}

export async function dismissRecentActions(env, admin, input = {}) {
  if (!admin?.sid) throw new HttpError(401, 'Unlock the SniperPlug Control Center first.');
  const db = requireDatabase(env);
  await ensureDismissalTable(db);
  const history = await listRecentActions(env, admin);
  const requested = new Set((Array.isArray(input.actionIds) ? input.actionIds : []).map((value) => String(value || '').trim()).filter(Boolean));
  const allRejected = input.allRejected === true;
  const selected = history.actions.filter((item) => (allRejected && item.status === 'rejected') || requested.has(item.actionId));
  if (!selected.length) return { dismissed: 0, history };
  if (selected.length > MAX_ACTIONS) throw new HttpError(422, `Clear at most ${MAX_ACTIONS} history rows at once.`);
  const now = new Date().toISOString();
  await db.batch(selected.map((item) => db.prepare(`
    INSERT INTO recent_action_dismissals (admin_session_id, action_id, dismissed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(admin_session_id, action_id) DO UPDATE SET dismissed_at = excluded.dismissed_at
  `).bind(OWNER_KEY, item.actionId, now)));
  return { dismissed: selected.length, history: await listRecentActions(env, admin) };
}

export async function undoRecentActions(env, admin, input = {}) {
  if (!admin?.sid) throw new HttpError(401, 'Unlock the SniperPlug Control Center first.');
  const db = requireDatabase(env);
  const history = await listRecentActions(env, admin);
  const requested = new Set((Array.isArray(input.actionIds) ? input.actionIds : []).map((value) => String(value || '').trim()).filter(Boolean));
  const all = input.all === true;
  const selected = history.actions.filter((item) => item.reversible && (all || requested.has(item.actionId)));
  if (!selected.length) throw new HttpError(422, all ? 'No published or rejected imported actions from the last 48 hours remain to undo.' : 'Select at least one published or rejected action to undo.');
  if (selected.length > MAX_ACTIONS) throw new HttpError(422, `Undo at most ${MAX_ACTIONS} actions at once.`);

  const now = new Date().toISOString();
  const guideRows = await Promise.all(selected.map((item) => db.prepare('SELECT integrity_json FROM guides WHERE id = ?').bind(item.guideId).first()));
  const statements = [];
  selected.forEach((item, index) => {
    const integrity = safeJson(guideRows[index]?.integrity_json, {});
    statements.push(db.prepare(`
      UPDATE guides
      SET status = 'draft', published_at = NULL, updated_at = ?, integrity_json = ?
      WHERE id = ? AND status IN ('published', 'rejected')
    `).bind(now, JSON.stringify({ ...integrity, undone: true, undoneAt: now, undoReason: item.status === 'rejected' ? 'Owner restored a rejected imported guide.' : 'Owner reversed a recent bulk-publish action.' }), item.guideId));
    if (item.sourceKey) {
      statements.push(db.prepare(`
        UPDATE whop_posts SET decision = 'pending', decision_updated_at = NULL
        WHERE source_key = ? AND decision != 'blocked'
      `).bind(item.sourceKey));
    }
  });
  if (statements.length) await db.batch(statements);

  if (all || input.cancelActive === true) {
    await ensureBulkTable(db);
    await db.prepare(`
      UPDATE bulk_jobs
      SET status = 'canceled', lease_until = NULL, completed_at = ?, updated_at = ?
      WHERE admin_session_id = ? AND status = 'active'
    `).bind(now, now, OWNER_KEY).run();
  }

  return {
    undone: selected.length,
    guideIds: selected.map((item) => item.guideId),
    canceledActiveJobs: all || input.cancelActive === true,
    history: await listRecentActions(env, admin),
  };
}
