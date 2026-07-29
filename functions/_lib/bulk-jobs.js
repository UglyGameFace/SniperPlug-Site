import { randomToken } from './crypto.js';
import { importApprovedPosts, suggestedCategoryForText } from './guides.js';
import { HttpError, requireDatabase } from './http.js';
import { savePostDecision, scanApprovedSource } from './posts.js';
import { publishReadyGuides } from './publish.js';
import { saveSourceDecision } from './source-policy.js';
import { retrieveExperience, whopExperienceType } from './whop.js';

const MAX_SOURCES = 100;
const IMPORT_CHUNK = 50;
const LEASE_MS = 90_000;

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function sourceIds(value) {
  const ids = [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter((item) => /^exp_[A-Za-z0-9_-]+$/.test(item)))];
  if (!ids.length) throw new HttpError(422, 'Select at least one exact Whop source.');
  if (ids.length > MAX_SOURCES) throw new HttpError(422, `Process at most ${MAX_SOURCES} sources in one bulk job.`);
  return ids;
}

async function ensureTable(db) {
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
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_bulk_jobs_owner_status ON bulk_jobs (admin_session_id, status, updated_at DESC)').run();
}

function normalize(row) {
  if (!row) return null;
  const ids = safeJson(row.source_ids_json, []);
  const results = safeJson(row.results_json, []);
  const failures = safeJson(row.failures_json, []);
  const summary = safeJson(row.summary_json, {});
  return {
    id: row.id,
    status: row.status,
    sourceIds: ids,
    sourceIndex: Number(row.source_index || 0),
    totalSources: ids.length,
    completedSources: Math.min(Number(row.source_index || 0), ids.length),
    currentSourceId: ids[Number(row.source_index || 0)] || null,
    results,
    failures,
    summary,
    leaseUntil: row.lease_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

async function rowForOwner(db, admin, id) {
  return db.prepare('SELECT * FROM bulk_jobs WHERE id = ? AND admin_session_id = ?').bind(id, admin.sid).first();
}

export async function latestBulkJob(env, admin) {
  const db = requireDatabase(env);
  await ensureTable(db);
  return normalize(await db.prepare(`
    SELECT * FROM bulk_jobs
    WHERE admin_session_id = ?
    ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(admin.sid).first());
}

export async function startBulkJob(env, admin, input) {
  if (input?.rightsConfirmed !== true) throw new HttpError(422, 'Confirm republication rights before starting the bulk job.');
  const db = requireDatabase(env);
  await ensureTable(db);
  const existing = await db.prepare("SELECT * FROM bulk_jobs WHERE admin_session_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1")
    .bind(admin.sid).first();
  if (existing) return normalize(existing);
  const ids = sourceIds(input?.sourceIds);
  const now = new Date().toISOString();
  const id = `job_${randomToken(18)}`;
  await db.prepare(`
    INSERT INTO bulk_jobs (
      id, admin_session_id, status, source_ids_json, source_index,
      results_json, failures_json, summary_json, lease_until,
      created_at, updated_at, completed_at
    ) VALUES (?, ?, 'active', ?, 0, '[]', '[]', '{}', NULL, ?, ?, NULL)
  `).bind(id, admin.sid, JSON.stringify(ids), now, now).run();
  return normalize(await rowForOwner(db, admin, id));
}

function addSummary(summary, result, published) {
  const next = { ...summary };
  next.scanned = Number(next.scanned || 0) + Number(result.scanned || 0);
  next.approved = Number(next.approved || 0) + Number(result.approved || 0);
  next.imported = Number(next.imported || 0) + Number(result.imported || 0);
  next.unchanged = Number(next.unchanged || 0) + Number(result.unchanged || 0);
  next.blocked = Number(next.blocked || 0) + Number(result.blocked || 0);
  next.published = Number(next.published || 0) + Number(published.published || 0);
  next.heldFiles = Number(next.heldFiles || 0) + Number(published.skippedFiles?.length || 0);
  next.heldIntegrity = Number(next.heldIntegrity || 0) + Number(published.skippedIntegrity?.length || 0);
  next.heldLinks = Number(next.heldLinks || 0) + Number(published.skippedLinks?.length || 0);
  return next;
}

async function processSource(env, whopSession, experienceId) {
  const experience = await retrieveExperience(whopSession, experienceId);
  await saveSourceDecision(env, experience, experience.id, 'approved');
  const posts = await scanApprovedSource(env, whopSession, experience);
  const readyKeys = posts.filter((item) => item.decision !== 'blocked').map((item) => item.sourceKey).filter(Boolean);
  if (readyKeys.length) await savePostDecision(env, readyKeys, 'approved');
  const sourceType = whopExperienceType(experience);
  const category = suggestedCategoryForText([
    experience?.company?.title,
    experience?.name,
    sourceType,
    ...posts.slice(0, 100).flatMap((post) => [post.title, post.excerpt]),
  ].filter(Boolean).join(' '));
  const guideIds = [];
  let imported = 0;
  let unchanged = 0;
  let attachmentReviews = 0;
  for (const batch of chunks(readyKeys, IMPORT_CHUNK)) {
    const output = await importApprovedPosts(env, whopSession, {
      experienceId,
      sourceKeys: batch,
      category,
      rightsConfirmed: true,
    });
    imported += Number(output.imported || 0);
    unchanged += Number(output.unchanged || 0);
    attachmentReviews += Number(output.attachmentReviews || 0);
    for (const item of output.results || []) {
      const guideId = Number(item.guideId);
      if (Number.isFinite(guideId)) guideIds.push(guideId);
    }
  }
  const published = guideIds.length
    ? await publishReadyGuides(env, { guideIds })
    : { published: 0, skippedFiles: [], skippedIntegrity: [], skippedLinks: [], skippedStatus: [], alreadyPublished: [] };
  return {
    experienceId,
    title: experience?.name || experienceId,
    sourceType,
    category,
    scanned: posts.length,
    approved: readyKeys.length,
    blocked: posts.filter((item) => item.decision === 'blocked').length,
    imported,
    unchanged,
    attachmentReviews,
    guideIds,
    published,
  };
}

export async function stepBulkJob(env, admin, whopSession, id) {
  const db = requireDatabase(env);
  await ensureTable(db);
  const row = await rowForOwner(db, admin, id);
  if (!row) throw new HttpError(404, 'Bulk job not found.');
  if (row.status !== 'active') return normalize(row);
  const now = new Date();
  const leaseUntil = row.lease_until ? Date.parse(row.lease_until) : 0;
  if (leaseUntil > now.getTime()) throw new HttpError(409, 'This bulk job step is already running.');
  const nextLease = new Date(now.getTime() + LEASE_MS).toISOString();
  const lease = await db.prepare(`
    UPDATE bulk_jobs SET lease_until = ?, updated_at = ?
    WHERE id = ? AND admin_session_id = ? AND status = 'active'
      AND (lease_until IS NULL OR lease_until < ?)
  `).bind(nextLease, now.toISOString(), id, admin.sid, now.toISOString()).run();
  if (Number(lease.meta?.changes || 0) !== 1) throw new HttpError(409, 'This bulk job step is already running.');

  const ids = safeJson(row.source_ids_json, []);
  const index = Number(row.source_index || 0);
  if (index >= ids.length) {
    const completedAt = new Date().toISOString();
    await db.prepare("UPDATE bulk_jobs SET status = 'completed', lease_until = NULL, completed_at = ?, updated_at = ? WHERE id = ?")
      .bind(completedAt, completedAt, id).run();
    return normalize(await rowForOwner(db, admin, id));
  }

  const results = safeJson(row.results_json, []);
  const failures = safeJson(row.failures_json, []);
  let summary = safeJson(row.summary_json, {});
  const experienceId = ids[index];
  try {
    const result = await processSource(env, whopSession, experienceId);
    results.push(result);
    summary = addSummary(summary, result, result.published);
  } catch (error) {
    failures.push({
      experienceId,
      message: String(error?.message || 'Source processing failed.').slice(0, 500),
      at: new Date().toISOString(),
    });
  }

  const nextIndex = index + 1;
  const completed = nextIndex >= ids.length;
  const updatedAt = new Date().toISOString();
  await db.prepare(`
    UPDATE bulk_jobs
    SET source_index = ?, results_json = ?, failures_json = ?, summary_json = ?,
        status = ?, lease_until = NULL, updated_at = ?, completed_at = ?
    WHERE id = ? AND admin_session_id = ?
  `).bind(
    nextIndex,
    JSON.stringify(results),
    JSON.stringify(failures),
    JSON.stringify(summary),
    completed ? 'completed' : 'active',
    updatedAt,
    completed ? updatedAt : null,
    id,
    admin.sid,
  ).run();
  return normalize(await rowForOwner(db, admin, id));
}

export async function cancelBulkJob(env, admin, id) {
  const db = requireDatabase(env);
  await ensureTable(db);
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE bulk_jobs SET status = 'canceled', lease_until = NULL, completed_at = ?, updated_at = ?
    WHERE id = ? AND admin_session_id = ? AND status = 'active'
  `).bind(now, now, id, admin.sid).run();
  const row = await rowForOwner(db, admin, id);
  if (!row) throw new HttpError(404, 'Bulk job not found.');
  return normalize(row);
}
