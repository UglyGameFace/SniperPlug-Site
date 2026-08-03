import { classifyWhopItem, whopContentToMarkdown } from './content-policy.js';
import { randomToken, sha256 } from './crypto.js';
import { HttpError, requireDatabase } from './http.js';
import { prepareGuideBody } from './integrity.js';
import { listExperienceItemsLite, sourceKeyForWhopItem } from './whop-items.js';
import { resolveWhopExperienceType } from './whop.js';
import { requireApprovedSource } from './source-policy.js';
import { ensureWhopBackupSchema, reattachPreservedWhopGuides } from './whop-backups.js';

const SCAN_LEASE_MS = 5 * 60_000;
const D1_BATCH_SIZE = 100;

function plainExcerpt(value, limit = 260) {
  return String(value || '').replace(/^ {0,3}#{1,6}\s+/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_~>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function fallbackTitle(content, sourceType) {
  const heading = String(content || '').match(/^ {0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  const fallback = sourceType === 'course' ? 'Untitled course lesson' : sourceType === 'chat' ? 'Chat item for review' : 'Untitled Whop post';
  const candidate = heading || plainExcerpt(content, 110) || fallback;
  return /[\p{L}\p{N}]/u.test(candidate) ? candidate.slice(0, 140) : fallback;
}

function normalizeAttachments(value) {
  return (Array.isArray(value) ? value : []).map((attachment) => ({
    id: String(attachment?.id || '').trim(),
    filename: String(attachment?.filename || 'attachment').slice(0, 180),
    contentType: String(attachment?.content_type || attachment?.contentType || '').slice(0, 120),
    url: /^https:\/\//i.test(String(attachment?.url || '')) ? String(attachment.url) : null,
    visibility: String(attachment?.visibility || '').slice(0, 40) || null,
    uploadStatus: String(attachment?.upload_status || attachment?.uploadStatus || '').slice(0, 40) || null,
    role: String(attachment?.role || 'attachment').slice(0, 80),
    durationSeconds: Number(attachment?.duration_seconds || attachment?.durationSeconds || 0) || null,
    reviewReason: String(attachment?.reviewReason || '').slice(0, 400) || null,
  })).filter((attachment) => attachment.id || attachment.url || attachment.reviewReason);
}

function sourceTypeFromKey(sourceKey) {
  if (String(sourceKey || '').startsWith('course-lesson:')) return 'course';
  if (String(sourceKey || '').startsWith('chat-message:')) return 'chat';
  return 'forum';
}

async function normalizeItem(item, experienceId, sourceType) {
  const sourceKey = sourceKeyForWhopItem(item);
  const body = whopContentToMarkdown(item?.content);
  const attachments = normalizeAttachments(item?.attachments);
  const title = String(item?.title || fallbackTitle(body, sourceType)).trim().slice(0, 140);
  const policy = classifyWhopItem({ ...item, sourceType, title, content: body, attachments });
  const base = {
    sourceKey,
    experienceId,
    postId: String(item?.id || ''),
    contentType: sourceType,
    title,
    excerpt: plainExcerpt(body),
    author: item?.user ? { id: item.user.id || null, name: item.user.name || null, username: item.user.username || null } : null,
    attachments,
    sourceCreatedAt: item?.created_at || null,
    sourceUpdatedAt: item?.updated_at || item?.created_at || null,
    sourceMeta: { type: sourceType, ...(item?.sourceMeta || {}), importPolicy: policy },
  };

  if (policy.blocked) {
    return {
      ...base,
      body,
      sourceFingerprint: null,
      integrity: { blocked: true, sourceType, sourceMeta: base.sourceMeta, error: policy.reason, code: policy.code, autoPublishEligible: false, policy },
      scanDecision: 'blocked',
    };
  }

  try {
    const integrity = await prepareGuideBody(body, { source: `Whop ${sourceType} item ${base.postId}` });
    const sourceFingerprint = await sha256(JSON.stringify({ sourceKey, title: base.title, body: integrity.body, attachments: base.attachments, sourceUpdatedAt: base.sourceUpdatedAt, sourceMeta: base.sourceMeta }));
    return {
      ...base,
      body: integrity.body,
      sourceFingerprint,
      integrity: { blocked: false, sourceType, sourceMeta: base.sourceMeta, autoPublishEligible: policy.autoPublishEligible, policy, ...integrity },
      scanDecision: 'pending',
    };
  } catch (error) {
    return {
      ...base,
      body,
      sourceFingerprint: null,
      integrity: { blocked: true, sourceType, sourceMeta: base.sourceMeta, error: error?.message || 'Formatting integrity validation failed.', code: error?.details?.code || 'invalid_content', autoPublishEligible: false, policy },
      scanDecision: 'blocked',
    };
  }
}

function rowToItem(row) {
  const integrity = JSON.parse(row.integrity_json || '{}');
  return {
    sourceKey: row.source_key,
    experienceId: row.experience_id,
    postId: row.post_id,
    contentType: integrity.sourceType || sourceTypeFromKey(row.source_key),
    title: row.title,
    excerpt: row.excerpt,
    body: row.body_markdown,
    author: JSON.parse(row.author_json || '{}'),
    attachments: JSON.parse(row.attachment_json || '[]'),
    sourceCreatedAt: row.source_created_at,
    sourceUpdatedAt: row.source_updated_at,
    sourceFingerprint: row.source_fingerprint,
    integrity,
    decision: row.decision,
  };
}

export function summarizePostForClient(item) {
  const integrity = item?.integrity || {};
  const policy = integrity.policy || integrity.sourceMeta?.importPolicy || null;
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  return {
    sourceKey: item?.sourceKey || '',
    experienceId: item?.experienceId || '',
    postId: item?.postId || '',
    contentType: item?.contentType || 'forum',
    title: item?.title || 'Untitled Whop item',
    excerpt: item?.excerpt || '',
    author: item?.author || null,
    attachments: attachments
      .filter((file) => ['course-thumbnail', 'hosted-video'].includes(file?.role))
      .map((file) => ({
        id: file.id || null,
        filename: file.filename || null,
        contentType: file.contentType || null,
        url: file.url || null,
        role: file.role || null,
        durationSeconds: file.durationSeconds || null,
        uploadStatus: file.uploadStatus || null,
      })),
    attachmentCount: attachments.length,
    sourceCreatedAt: item?.sourceCreatedAt || null,
    sourceUpdatedAt: item?.sourceUpdatedAt || null,
    sourceFingerprint: item?.sourceFingerprint || null,
    integrity: {
      blocked: integrity.blocked === true,
      code: integrity.code || null,
      error: integrity.error || null,
      autoPublishEligible: integrity.autoPublishEligible === true,
      policy: policy ? { code: policy.code || null, reason: policy.reason || null } : null,
    },
    decision: item?.decision || 'pending',
  };
}

async function runStatementBatches(db, statements) {
  const results = [];
  for (let index = 0; index < statements.length; index += D1_BATCH_SIZE) {
    results.push(...await db.batch(statements.slice(index, index + D1_BATCH_SIZE)));
  }
  return results;
}

async function ensureScanLeaseTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS whop_scan_leases (
      experience_id TEXT PRIMARY KEY,
      lease_token TEXT NOT NULL,
      lease_until TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function acquireScanLease(db, experienceId) {
  await ensureScanLeaseTable(db);
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseToken = `scan_${randomToken(18)}`;
  const leaseUntil = new Date(now.getTime() + SCAN_LEASE_MS).toISOString();
  await db.prepare('DELETE FROM whop_scan_leases WHERE experience_id = ? AND lease_until <= ?').bind(experienceId, nowIso).run();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO whop_scan_leases (experience_id, lease_token, lease_until, started_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(experienceId, leaseToken, leaseUntil, nowIso, nowIso).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'This Whop Experience is already being scanned. Wait for that scan to finish, then refresh.', {
      code: 'source_scan_in_progress',
      experienceId,
    });
  }
  return leaseToken;
}

async function renewScanLease(db, experienceId, leaseToken) {
  const now = new Date();
  const result = await db.prepare(`
    UPDATE whop_scan_leases
    SET lease_until = ?, updated_at = ?
    WHERE experience_id = ? AND lease_token = ?
  `).bind(new Date(now.getTime() + SCAN_LEASE_MS).toISOString(), now.toISOString(), experienceId, leaseToken).run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'This source scan lost ownership before its results could be saved. Refresh instead of retrying blindly.', {
      code: 'source_scan_lease_lost',
      experienceId,
    });
  }
}

async function releaseScanLease(db, experienceId, leaseToken) {
  await db.prepare('DELETE FROM whop_scan_leases WHERE experience_id = ? AND lease_token = ?').bind(experienceId, leaseToken).run();
}

async function verifySavedScan(db, experienceId, scanMarker, posts) {
  if (!posts.length) return [];
  const saved = await db.prepare(`
    SELECT * FROM whop_posts
    WHERE experience_id = ? AND last_scanned_at = ?
    ORDER BY CASE decision WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 WHEN 'disapproved' THEN 2 ELSE 3 END,
             source_updated_at DESC, title ASC
  `).bind(experienceId, scanMarker).all();
  const rows = saved.results || [];
  const byKey = new Map(rows.map((row) => [String(row.source_key), row]));
  const missing = posts.filter((post) => !byKey.has(post.sourceKey)).map((post) => post.sourceKey);
  const mismatched = posts.filter((post) => {
    const row = byKey.get(post.sourceKey);
    return row && (String(row.experience_id) !== experienceId || String(row.source_fingerprint || '') !== String(post.sourceFingerprint || ''));
  }).map((post) => post.sourceKey);
  if (missing.length || mismatched.length || rows.length !== posts.length) {
    throw new HttpError(409, 'SniperPlug could not confirm the complete Whop scan in D1. The source was not presented as a complete refresh.', {
      code: 'source_scan_unconfirmed',
      experienceId,
      expected: posts.length,
      confirmed: rows.length,
      missing,
      mismatched,
    });
  }
  return rows.map(rowToItem);
}

export async function scanApprovedSource(env, whopSession, experience) {
  await ensureWhopBackupSchema(env);
  const db = requireDatabase(env);
  const experienceId = String(experience?.id || '');
  await requireApprovedSource(env, experienceId);
  const sourceType = await resolveWhopExperienceType(whopSession, experience);
  if (!['forum', 'course', 'chat'].includes(sourceType)) {
    throw new HttpError(422, `SniperPlug checked Whop’s official Course, Forum, and Chat read endpoints for “${String(experience?.app?.name || 'Unknown')}”, but none returned readable content. This app needs its publisher’s documented API and authorization method; SniperPlug will not guess or scrape a private app session.`);
  }

  const leaseToken = await acquireScanLease(db, experienceId);
  try {
    const rawItems = await listExperienceItemsLite(whopSession, experience);
    const topLevelItems = rawItems.filter((item) => sourceType !== 'chat' || !item?.sourceMeta?.replyingTo);
    const posts = await Promise.all(topLevelItems.map((item) => normalizeItem(item, experienceId, sourceType)));
    await renewScanLease(db, experienceId, leaseToken);
    const scanMarker = new Date().toISOString();

    const statements = posts.map((post) => db.prepare(`
      INSERT INTO whop_posts (
        source_key, experience_id, post_id, title, excerpt, body_markdown, author_json, attachment_json,
        source_created_at, source_updated_at, source_fingerprint, integrity_json,
        decision, decision_updated_at, last_scanned_at, stale_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)
      ON CONFLICT(source_key) DO UPDATE SET
        experience_id = excluded.experience_id,
        post_id = excluded.post_id,
        title = excluded.title,
        excerpt = excluded.excerpt,
        body_markdown = excluded.body_markdown,
        author_json = excluded.author_json,
        attachment_json = excluded.attachment_json,
        source_created_at = excluded.source_created_at,
        source_updated_at = excluded.source_updated_at,
        source_fingerprint = excluded.source_fingerprint,
        integrity_json = excluded.integrity_json,
        decision = CASE
          WHEN excluded.decision = 'blocked' THEN 'blocked'
          WHEN whop_posts.source_fingerprint IS NOT excluded.source_fingerprint THEN 'pending'
          WHEN whop_posts.decision = 'blocked' THEN 'pending'
          ELSE whop_posts.decision
        END,
        decision_updated_at = CASE
          WHEN whop_posts.source_fingerprint IS NOT excluded.source_fingerprint THEN NULL
          ELSE whop_posts.decision_updated_at
        END,
        last_scanned_at = excluded.last_scanned_at,
        stale_at = NULL
    `).bind(
      post.sourceKey, post.experienceId, post.postId, post.title, post.excerpt, post.body,
      JSON.stringify(post.author || {}), JSON.stringify(post.attachments), post.sourceCreatedAt,
      post.sourceUpdatedAt, post.sourceFingerprint, JSON.stringify(post.integrity), post.scanDecision, scanMarker,
    ));
    if (statements.length) await runStatementBatches(db, statements);
    await db.prepare(`
      UPDATE whop_posts
      SET stale_at = ?
      WHERE experience_id = ? AND last_scanned_at != ? AND stale_at IS NULL
    `).bind(scanMarker, experienceId, scanMarker).run();
    await reattachPreservedWhopGuides(env, experienceId);
    return verifySavedScan(db, experienceId, scanMarker, posts);
  } finally {
    await releaseScanLease(db, experienceId, leaseToken).catch(() => null);
  }
}

function normalizedSourceKeys(sourceKeys) {
  const keys = [...new Set((Array.isArray(sourceKeys) ? sourceKeys : [sourceKeys]).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!keys.length) throw new HttpError(422, 'Choose at least one content item.');
  if (keys.length > 2000) throw new HttpError(422, 'Too many content decisions were submitted at once.');
  return keys;
}

async function rowsForSourceKeys(db, keys) {
  if (!keys.length) return [];
  const output = [];
  for (let index = 0; index < keys.length; index += 500) {
    const group = keys.slice(index, index + 500);
    const placeholders = group.map(() => '?').join(',');
    const rows = await db.prepare(`
      SELECT source_key, experience_id, title, decision, decision_updated_at
      FROM whop_posts WHERE source_key IN (${placeholders})
    `).bind(...group).all();
    output.push(...(rows.results || []));
  }
  return output;
}

export async function savePostDecisionVerified(env, sourceKeys, decision) {
  if (!['approved', 'disapproved', 'pending'].includes(decision)) throw new HttpError(422, 'Choose Approve, Disapprove, or Undo.');
  const keys = normalizedSourceKeys(sourceKeys);
  const db = requireDatabase(env);
  const now = new Date().toISOString();
  const statements = keys.map((key) => db.prepare(`
    UPDATE whop_posts
    SET decision = ?, decision_updated_at = ?
    WHERE source_key = ? AND decision != 'blocked'
  `).bind(decision, decision === 'pending' ? null : now, key));
  const results = await runStatementBatches(db, statements);
  const changed = results.reduce((sum, result) => sum + Number(result.meta?.changes || 0), 0);
  const rows = await rowsForSourceKeys(db, keys);
  const byKey = new Map(rows.map((row) => [String(row.source_key), row]));
  const missing = keys.filter((key) => !byKey.has(key));
  const blocked = keys.filter((key) => byKey.get(key)?.decision === 'blocked');
  const mismatched = keys.filter((key) => {
    const row = byKey.get(key);
    return row && row.decision !== 'blocked' && row.decision !== decision;
  });
  const confirmed = keys.filter((key) => byKey.get(key)?.decision === decision);
  return {
    requested: keys.length,
    changed,
    confirmed: confirmed.length,
    confirmedKeys: confirmed,
    blocked,
    missing,
    mismatched,
    complete: missing.length === 0 && mismatched.length === 0 && blocked.length === 0 && confirmed.length === keys.length,
    rows: rows.map((row) => ({ sourceKey: row.source_key, experienceId: row.experience_id, title: row.title, decision: row.decision, decisionUpdatedAt: row.decision_updated_at })),
  };
}

export async function savePostDecision(env, sourceKeys, decision) {
  const result = await savePostDecisionVerified(env, sourceKeys, decision);
  if (!result.complete) {
    throw new HttpError(409, 'SniperPlug could not confirm every content decision in D1. Refresh the source before retrying.', {
      code: 'post_decision_unconfirmed',
      requested: result.requested,
      confirmed: result.confirmed,
      blocked: result.blocked,
      missing: result.missing,
      mismatched: result.mismatched,
    });
  }
  return result.changed;
}

export async function savedPostDetail(env, sourceKey) {
  await ensureWhopBackupSchema(env);
  const key = String(sourceKey || '').trim();
  if (!key) throw new HttpError(422, 'Choose a valid Whop content item.');
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM whop_posts WHERE source_key = ? AND stale_at IS NULL').bind(key).first();
  if (!row) throw new HttpError(404, 'That Whop content item is no longer available in the current scan.');
  return rowToItem(row);
}

export async function listSavedPosts(env, experienceId) {
  await ensureWhopBackupSchema(env);
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT * FROM whop_posts WHERE experience_id = ? AND stale_at IS NULL
    ORDER BY source_updated_at DESC, title ASC
  `).bind(experienceId).all();
  return (rows.results || []).map(rowToItem);
}
