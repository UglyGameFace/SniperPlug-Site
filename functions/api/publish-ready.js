import { requireAdmin } from '../_lib/auth.js';
import {
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireDatabase,
  requireSameOrigin,
} from '../_lib/http.js';

const MAX_GUIDES = 500;
const UPDATE_CHUNK = 100;

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

function uniqueGuideIds(value) {
  const ids = [...new Set((Array.isArray(value) ? value : [])
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0))];
  if (ids.length > MAX_GUIDES) throw new HttpError(422, `Publish at most ${MAX_GUIDES} guides at once.`);
  return ids;
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function rowsForRequest(db, body) {
  const ids = uniqueGuideIds(body?.guideIds);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.prepare(`
      SELECT id, title, status, source_key, attachment_json, integrity_json
      FROM guides
      WHERE id IN (${placeholders})
    `).bind(...ids).all();
    return { requestedIds: ids, rows: rows.results || [] };
  }
  if (body?.allImported === true) {
    const rows = await db.prepare(`
      SELECT id, title, status, source_key, attachment_json, integrity_json
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

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    await requireAdmin(context.request, context.env);
    const body = await readJson(context.request, { maxBytes: 100_000 });
    const db = requireDatabase(context.env);
    const { requestedIds, rows } = await rowsForRequest(db, body);

    const ready = [];
    const skippedFiles = [];
    const skippedIntegrity = [];
    const alreadyPublished = [];
    const skippedStatus = [];

    for (const row of rows) {
      const attachments = safeJson(row.attachment_json, {});
      const integrity = safeJson(row.integrity_json, {});
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
    const missing = requestedIds.filter((id) => !found.has(id));
    return json({
      requested: requestedIds.length,
      published: ready.length,
      publishedGuideIds: ready,
      skippedFiles,
      skippedIntegrity,
      skippedStatus,
      alreadyPublished,
      missing,
    });
  } catch (error) {
    return handleError(error);
  }
}
