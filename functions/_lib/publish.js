import { HttpError, requireDatabase } from './http.js';
import { auditGuideLinks, assertPublishableLinks } from './link-audit.js';

const MAX_GUIDES = 500;
const UPDATE_CHUNK = 100;

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function uniqueGuideIds(value) {
  const ids = [...new Set((Array.isArray(value) ? value : [])
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0))];
  if (ids.length > MAX_GUIDES) throw new HttpError(422, `Publish at most ${MAX_GUIDES} guides at once.`);
  return ids;
}

function allowedAttachmentUrls(attachments) {
  return (Array.isArray(attachments?.files) ? attachments.files : [])
    .filter((file) => file?.durable === true && file?.url)
    .map((file) => file.url);
}

async function auditRow(db, row) {
  const attachments = safeJson(row.attachment_json, {});
  const integrity = safeJson(row.integrity_json, {});
  const linkAudit = auditGuideLinks(row.body_markdown || '', {
    allowedWhopUrls: allowedAttachmentUrls(attachments),
  });
  const nextIntegrity = { ...integrity, linkAudit, linkAuditedAt: new Date().toISOString() };
  await db.prepare('UPDATE guides SET integrity_json = ? WHERE id = ?')
    .bind(JSON.stringify(nextIntegrity), row.id).run();
  return { attachments, integrity: nextIntegrity, linkAudit };
}

export async function assertGuidePublishable(env, id) {
  const db = requireDatabase(env);
  const row = await db.prepare(`
    SELECT id, title, status, source_key, body_markdown, attachment_json, integrity_json
    FROM guides WHERE id = ?
  `).bind(id).first();
  if (!row) throw new HttpError(404, 'Guide not found.');
  const { attachments, integrity } = await auditRow(db, row);
  if (Number(attachments.reviewCount || 0) > 0) {
    throw new HttpError(422, 'Resolve or replace every flagged private or expiring Whop file before publishing.', { code: 'attachment_review' });
  }
  if (integrity.blocked === true) {
    throw new HttpError(422, integrity.error || 'Guide integrity validation failed.', { code: 'integrity_blocked' });
  }
  assertPublishableLinks(integrity);
  return integrity.linkAudit;
}

async function rowsForRequest(db, input) {
  const ids = uniqueGuideIds(input?.guideIds);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.prepare(`
      SELECT id, title, status, source_key, body_markdown, attachment_json, integrity_json
      FROM guides WHERE id IN (${placeholders})
    `).bind(...ids).all();
    return { requestedIds: ids, rows: rows.results || [] };
  }
  if (input?.allImported === true) {
    const rows = await db.prepare(`
      SELECT id, title, status, source_key, body_markdown, attachment_json, integrity_json
      FROM guides
      WHERE source_key IS NOT NULL AND status = 'draft'
      ORDER BY updated_at DESC
      LIMIT ${MAX_GUIDES}
    `).all();
    const values = rows.results || [];
    return { requestedIds: values.map((row) => Number(row.id)), rows: values };
  }
  throw new HttpError(422, 'Choose imported drafts to publish.');
}

export async function publishReadyGuides(env, input) {
  const db = requireDatabase(env);
  const { requestedIds, rows } = await rowsForRequest(db, input);
  const ready = [];
  const skippedFiles = [];
  const skippedIntegrity = [];
  const skippedLinks = [];
  const alreadyPublished = [];
  const skippedStatus = [];

  for (const row of rows) {
    const { attachments, integrity, linkAudit } = await auditRow(db, row);
    if (!row.source_key) {
      skippedStatus.push({ id: row.id, title: row.title, reason: 'Not an imported Whop guide.' });
    } else if (row.status === 'published') {
      alreadyPublished.push({ id: row.id, title: row.title });
    } else if (row.status !== 'draft') {
      skippedStatus.push({ id: row.id, title: row.title, reason: `Status is ${row.status}.` });
    } else if (Number(attachments.reviewCount || 0) > 0) {
      skippedFiles.push({ id: row.id, title: row.title, reviewCount: Number(attachments.reviewCount || 0) });
    } else if (integrity.blocked === true) {
      skippedIntegrity.push({ id: row.id, title: row.title, reason: integrity.error || 'Integrity validation failed.' });
    } else if (Number(linkAudit.blockedCount || 0) > 0) {
      skippedLinks.push({ id: row.id, title: row.title, blocked: linkAudit.blocked || [] });
    } else {
      ready.push(Number(row.id));
    }
  }

  const now = new Date().toISOString();
  for (const group of chunks(ready, UPDATE_CHUNK)) {
    const placeholders = group.map(() => '?').join(',');
    await db.prepare(`
      UPDATE guides
      SET status = 'published', updated_at = ?, published_at = ?
      WHERE status = 'draft' AND id IN (${placeholders})
    `).bind(now, now, ...group).run();
  }

  const found = new Set(rows.map((row) => Number(row.id)));
  return {
    requested: requestedIds.length,
    published: ready.length,
    publishedGuideIds: ready,
    skippedFiles,
    skippedIntegrity,
    skippedLinks,
    skippedStatus,
    alreadyPublished,
    missing: requestedIds.filter((id) => !found.has(id)),
  };
}
