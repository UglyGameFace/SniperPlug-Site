import { randomToken } from './crypto.js';
import { importApprovedPosts } from './guides-media.js';
import { HttpError, requireDatabase } from './http.js';
import { savePostDecision, scanApprovedSource } from './posts.js';
import { publishReadyGuides } from './publish.js';
import { saveSourceDecision } from './source-policy.js';
import { requiredScopeForType, resolveWhopExperienceType, retrieveExperience } from './whop.js';

const MAX_SOURCES = 100;
const LEASE_MS = 90_000;
const JOB_VERSION = 4;

function jobOwnerKey(admin) {
  const sid = String(admin?.sid || '').trim();
  if (!sid) throw new HttpError(401, 'Unlock the SniperPlug Control Center first.');
  return sid;
}

function safeJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
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

function partialProgress(summary) {
  const current = summary?.current;
  const total = Number(current?.readyKeys?.length || 0);
  return total ? Math.min(1, Number(current.cursor || 0) / total) : 0;
}

function issueCount(summary, failures) {
  return Number(failures?.length || 0)
    + Number(summary?.itemFailures || 0)
    + Number(summary?.heldFiles || 0)
    + Number(summary?.heldIntegrity || 0)
    + Number(summary?.heldLinks || 0)
    + Number(summary?.heldPermissions || 0);
}

function normalize(row) {
  if (!row) return null;
  const ids = safeJson(row.source_ids_json, []);
  const results = safeJson(row.results_json, []);
  const failures = safeJson(row.failures_json, []);
  const summary = safeJson(row.summary_json, {});
  const completedSources = Math.min(Number(row.source_index || 0), ids.length);
  const progress = ids.length ? ((completedSources + partialProgress(summary)) / ids.length) * 100 : 0;
  const issues = issueCount(summary, failures);
  return {
    id: row.id,
    status: row.status,
    outcome: row.status === 'completed' ? (issues ? 'completed-with-issues' : 'completed-successfully') : row.status,
    issueCount: issues,
    sourceIds: ids,
    sourceIndex: Number(row.source_index || 0),
    totalSources: ids.length,
    completedSources,
    percent: Math.max(0, Math.min(100, Math.round(progress))),
    currentSourceId: ids[Number(row.source_index || 0)] || null,
    currentItem: summary.current ? {
      cursor: Number(summary.current.cursor || 0),
      total: Number(summary.current.readyKeys?.length || 0),
      title: summary.current.title || null,
    } : null,
    results,
    failures,
    summary,
    leaseUntil: row.lease_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

async function rowForOwner(db, id, ownerKey) {
  return db.prepare('SELECT * FROM bulk_jobs WHERE id = ? AND admin_session_id = ?').bind(id, ownerKey).first();
}

async function cancelLegacyRow(db, row, ownerKey) {
  if (!row || row.status !== 'active') return row;
  const summary = safeJson(row.summary_json, {});
  if (Number(summary.jobVersion || 0) === JOB_VERSION) return row;
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE bulk_jobs
    SET status = 'canceled', lease_until = NULL, completed_at = ?, updated_at = ?, summary_json = ?
    WHERE id = ? AND admin_session_id = ? AND status = 'active'
  `).bind(now, now, JSON.stringify({
    ...summary,
    legacyCanceled: true,
    legacyCancelReason: 'Canceled automatically because the previous worker did not guarantee exclusive lease ownership through its final save.',
    canceledAt: now,
  }), row.id, ownerKey).run();
  return rowForOwner(db, row.id, ownerKey);
}

export async function latestBulkJob(env, admin) {
  const ownerKey = jobOwnerKey(admin);
  const db = requireDatabase(env);
  await ensureTable(db);
  let row = await db.prepare(`
    SELECT * FROM bulk_jobs
    WHERE admin_session_id = ?
    ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1
  `).bind(ownerKey).first();
  row = await cancelLegacyRow(db, row, ownerKey);
  return normalize(row);
}

export async function startBulkJob(env, admin, input) {
  const ownerKey = jobOwnerKey(admin);
  if (input?.rightsConfirmed !== true) throw new HttpError(422, 'Confirm republication rights before starting the bulk job.');
  const db = requireDatabase(env);
  await ensureTable(db);
  let existing = await db.prepare("SELECT * FROM bulk_jobs WHERE admin_session_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1")
    .bind(ownerKey).first();
  existing = await cancelLegacyRow(db, existing, ownerKey);
  if (existing?.status === 'active') return normalize(existing);
  const ids = sourceIds(input?.sourceIds);
  const now = new Date().toISOString();
  const id = `job_${randomToken(18)}`;
  await db.prepare(`
    INSERT INTO bulk_jobs (
      id, admin_session_id, status, source_ids_json, source_index,
      results_json, failures_json, summary_json, lease_until,
      created_at, updated_at, completed_at
    ) VALUES (?, ?, 'active', ?, 0, '[]', '[]', ?, NULL, ?, ?, NULL)
  `).bind(id, ownerKey, JSON.stringify(ids), JSON.stringify({ jobVersion: JOB_VERSION }), now, now).run();
  return normalize(await rowForOwner(db, id, ownerKey));
}

function addSummary(summary, result) {
  const next = { ...summary, current: null, jobVersion: JOB_VERSION };
  next.scanned = Number(next.scanned || 0) + Number(result.scanned || 0);
  next.approved = Number(next.approved || 0) + Number(result.approved || 0);
  next.imported = Number(next.imported || 0) + Number(result.imported || 0);
  next.unchanged = Number(next.unchanged || 0) + Number(result.unchanged || 0);
  next.blocked = Number(next.blocked || 0) + Number(result.blocked || 0);
  next.manualReview = Number(next.manualReview || 0) + Number(result.manualReview || 0);
  next.expired = Number(next.expired || 0) + Number(result.expired || 0);
  next.mediaMirrored = Number(next.mediaMirrored || 0) + Number(result.mediaMirrored || 0);
  next.published = Number(next.published || 0) + Number(result.published?.published || 0);
  next.itemFailures = Number(next.itemFailures || 0) + Number(result.itemFailures?.length || 0);
  next.failedSources = Number(next.failedSources || 0) + Number(result.itemFailures?.length ? 1 : 0);
  next.heldFiles = Number(next.heldFiles || 0) + Number(result.published?.skippedFiles?.length || 0);
  next.heldIntegrity = Number(next.heldIntegrity || 0) + Number(result.published?.skippedIntegrity?.length || 0) + Number(result.heldPolicy || 0);
  next.heldLinks = Number(next.heldLinks || 0) + Number(result.published?.skippedLinks?.length || 0);
  next.heldPermissions = Number(next.heldPermissions || 0) + Number(result.permissionRequired ? 1 : 0);
  return next;
}

function emptyPublished() {
  return { published: 0, publishedGuideIds: [], skippedFiles: [], skippedIntegrity: [], skippedLinks: [], skippedStatus: [], alreadyPublished: [] };
}

function scopeSet(session) {
  return new Set(String(session?.scopes || '').split(/\s+/).filter(Boolean));
}

function shouldPauseWorkflow(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.details?.code || '');
  return [401, 403, 409, 429, 502, 503, 504].includes(status)
    || ['guide_import_in_progress', 'guide_import_lease_lost', 'whop_refresh_in_progress'].includes(code);
}

function permissionMessage(error) {
  const message = String(error?.message || '');
  const match = message.match(/requires?:?\s*['"]?([a-z]+:[a-z:]+)['"]?/i);
  if (match) return match[1];
  if (/courses?:read/i.test(message)) return 'courses:read';
  if (/forum:read/i.test(message)) return 'forum:read';
  if (/chat:read/i.test(message)) return 'chat:read';
  if (error?.status === 403 || /not authorized/i.test(message)) return 'reconnect Whop';
  return null;
}

async function prepareSource(env, whopSession, experienceId) {
  let experience;
  try {
    experience = await retrieveExperience(whopSession, experienceId);
  } catch (error) {
    const required = permissionMessage(error);
    if (required) return { held: true, result: { experienceId, title: experienceId, sourceType: 'unknown', category: 'per-item', scanned: 0, approved: 0, blocked: 0, manualReview: 0, expired: 0, imported: 0, unchanged: 0, heldPolicy: 0, attachmentReviews: 0, mediaMirrored: 0, guideIds: [], itemFailures: [], permissionRequired: required, published: emptyPublished() } };
    throw error;
  }
  const sourceType = await resolveWhopExperienceType(whopSession, experience);
  const required = requiredScopeForType(sourceType);
  if (required && !scopeSet(whopSession).has(required)) {
    return { held: true, result: { experienceId, title: experience?.name || experienceId, sourceType, category: 'per-item', scanned: 0, approved: 0, blocked: 0, manualReview: 0, expired: 0, imported: 0, unchanged: 0, heldPolicy: 0, attachmentReviews: 0, mediaMirrored: 0, guideIds: [], itemFailures: [], permissionRequired: required, published: emptyPublished() } };
  }
  await saveSourceDecision(env, experience, experience.id, 'approved');
  let posts;
  try {
    posts = await scanApprovedSource(env, whopSession, experience);
  } catch (error) {
    const missing = permissionMessage(error);
    if (missing) return { held: true, result: { experienceId, title: experience?.name || experienceId, sourceType, category: 'per-item', scanned: 0, approved: 0, blocked: 0, manualReview: 0, expired: 0, imported: 0, unchanged: 0, heldPolicy: 0, attachmentReviews: 0, mediaMirrored: 0, guideIds: [], itemFailures: [], permissionRequired: missing, published: emptyPublished() } };
    throw error;
  }
  const guideReady = posts.filter((item) => item.decision !== 'blocked' && item.integrity?.autoPublishEligible === true);
  const readyKeys = guideReady.map((item) => item.sourceKey).filter(Boolean);
  if (readyKeys.length) await savePostDecision(env, readyKeys, 'approved');
  return {
    held: false,
    current: {
      experienceId,
      title: experience?.name || experienceId,
      sourceType,
      readyKeys,
      cursor: 0,
      scanned: posts.length,
      approved: readyKeys.length,
      blocked: posts.filter((item) => item.decision === 'blocked').length,
      manualReview: posts.filter((item) => item.decision !== 'blocked' && item.integrity?.autoPublishEligible !== true).length,
      expired: posts.filter((item) => item.integrity?.code === 'expired_sports_pick').length,
      imported: 0,
      unchanged: 0,
      heldPolicy: 0,
      attachmentReviews: 0,
      mediaMirrored: 0,
      guideIds: [],
      itemFailures: [],
      published: emptyPublished(),
    },
  };
}

function mergePublished(target, value) {
  target.published += Number(value?.published || 0);
  for (const key of ['publishedGuideIds', 'skippedFiles', 'skippedIntegrity', 'skippedLinks', 'skippedStatus', 'alreadyPublished']) {
    target[key].push(...(Array.isArray(value?.[key]) ? value[key] : []));
  }
}

async function processCurrentItem(env, whopSession, current) {
  const sourceKey = current.readyKeys[current.cursor];
  if (!sourceKey) throw new HttpError(409, 'Bulk job item cursor no longer matches its saved source list.');
  try {
    const output = await importApprovedPosts(env, whopSession, {
      experienceId: current.experienceId,
      sourceKeys: [sourceKey],
      autoCategorize: true,
      automaticWorkflow: true,
      rightsConfirmed: true,
    });
    current.imported += Number(output.imported || 0);
    current.unchanged += Number(output.unchanged || 0);
    current.heldPolicy += Number(output.heldPolicy || 0);
    current.attachmentReviews += Number(output.attachmentReviews || 0);
    current.mediaMirrored += Number(output.mirroredMedia || 0);
    const guideIds = (output.results || [])
      .filter((item) => ['created-draft', 'updated-draft'].includes(item.action))
      .map((item) => Number(item.guideId))
      .filter((id) => Number.isFinite(id));
    current.guideIds.push(...guideIds);
    if (guideIds.length) mergePublished(current.published, await publishReadyGuides(env, { guideIds }));
  } catch (error) {
    if (shouldPauseWorkflow(error)) throw error;
    current.itemFailures.push({ sourceKey, message: String(error?.message || 'Item import failed.').slice(0, 400) });
    current.heldPolicy += 1;
  }
  current.cursor += 1;
  return current;
}

function resultFromCurrent(current) {
  const { readyKeys, cursor, itemFailures, ...result } = current;
  return { ...result, category: 'per-item', itemFailures };
}

async function releaseStepLease(db, row, ownerKey, leaseToken) {
  await db.prepare(`
    UPDATE bulk_jobs
    SET lease_until = NULL, updated_at = ?
    WHERE id = ? AND admin_session_id = ? AND status = 'active' AND lease_until = ?
  `).bind(new Date().toISOString(), row.id, ownerKey, leaseToken).run();
}

async function persistStep(db, row, ownerKey, leaseToken, { sourceIndex, results, failures, summary, completed }) {
  const updatedAt = new Date().toISOString();
  const saved = await db.prepare(`
    UPDATE bulk_jobs
    SET source_index = ?, results_json = ?, failures_json = ?, summary_json = ?,
        status = ?, lease_until = NULL, updated_at = ?, completed_at = ?
    WHERE id = ? AND admin_session_id = ? AND status = 'active' AND lease_until = ?
  `).bind(
    sourceIndex,
    JSON.stringify(results),
    JSON.stringify(failures),
    JSON.stringify(summary),
    completed ? 'completed' : 'active',
    updatedAt,
    completed ? updatedAt : null,
    row.id,
    ownerKey,
    leaseToken,
  ).run();
  if (Number(saved.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'This bulk step lost its server lease, so stale progress was not saved. Refresh the job before continuing.');
  }
}

export async function stepBulkJob(env, admin, whopSession, id) {
  const ownerKey = jobOwnerKey(admin);
  const db = requireDatabase(env);
  await ensureTable(db);
  let row = await rowForOwner(db, id, ownerKey);
  if (!row) throw new HttpError(404, 'Bulk job not found.');
  row = await cancelLegacyRow(db, row, ownerKey);
  if (row.status !== 'active') return normalize(row);
  const now = new Date();
  const leaseUntil = row.lease_until ? Date.parse(row.lease_until) : 0;
  if (leaseUntil > now.getTime()) throw new HttpError(409, 'This bulk job step is already running.');
  const nextLease = new Date(now.getTime() + LEASE_MS).toISOString();
  const lease = await db.prepare(`
    UPDATE bulk_jobs SET lease_until = ?, updated_at = ?
    WHERE id = ? AND admin_session_id = ? AND status = 'active'
      AND (lease_until IS NULL OR lease_until < ?)
  `).bind(nextLease, now.toISOString(), id, ownerKey, now.toISOString()).run();
  if (Number(lease.meta?.changes || 0) !== 1) throw new HttpError(409, 'This bulk job step is already running.');

  const ids = safeJson(row.source_ids_json, []);
  let index = Number(row.source_index || 0);
  const results = safeJson(row.results_json, []);
  const failures = safeJson(row.failures_json, []);
  let summary = safeJson(row.summary_json, { jobVersion: JOB_VERSION });

  try {
    if (summary.current) {
      summary.current = await processCurrentItem(env, whopSession, summary.current);
      if (summary.current.cursor >= summary.current.readyKeys.length) {
        const result = resultFromCurrent(summary.current);
        results.push(result);
        summary = addSummary(summary, result);
        index += 1;
      }
    } else if (index < ids.length) {
      const prepared = await prepareSource(env, whopSession, ids[index]);
      if (prepared.held) {
        results.push(prepared.result);
        summary = addSummary(summary, prepared.result);
        index += 1;
      } else if (!prepared.current.readyKeys.length) {
        const result = resultFromCurrent(prepared.current);
        results.push(result);
        summary = addSummary(summary, result);
        index += 1;
      } else {
        summary = { ...summary, jobVersion: JOB_VERSION, current: prepared.current };
      }
    }
  } catch (error) {
    if (shouldPauseWorkflow(error)) {
      await releaseStepLease(db, row, ownerKey, nextLease).catch(() => null);
      throw error;
    }
    failures.push({
      experienceId: summary.current?.experienceId || ids[index] || null,
      message: String(error?.message || 'Source processing failed.').slice(0, 500),
      code: String(error?.details?.code || error?.name || 'source_error').slice(0, 80),
      at: new Date().toISOString(),
    });
    summary = { ...summary, current: null, jobVersion: JOB_VERSION };
    index += 1;
  }

  const completed = index >= ids.length && !summary.current;
  await persistStep(db, row, ownerKey, nextLease, { sourceIndex: index, results, failures, summary, completed });
  return normalize(await rowForOwner(db, id, ownerKey));
}

export async function cancelBulkJob(env, admin, id) {
  const ownerKey = jobOwnerKey(admin);
  const db = requireDatabase(env);
  await ensureTable(db);
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE bulk_jobs SET status = 'canceled', lease_until = NULL, completed_at = ?, updated_at = ?
    WHERE id = ? AND admin_session_id = ? AND status = 'active'
  `).bind(now, now, id, ownerKey).run();
  const row = await rowForOwner(db, id, ownerKey);
  if (!row) throw new HttpError(404, 'Bulk job not found.');
  return normalize(row);
}
