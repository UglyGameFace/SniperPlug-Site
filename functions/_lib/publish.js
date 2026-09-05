import { OWNER_PRINCIPAL_ID } from './auth.js';
import { HttpError } from './http.js';
import { ensureImporterWorkspaceSchema, principalIdFrom } from './importer-workspace.js';
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

function requirePublicPublisher(principalValue) {
  const principalId = principalIdFrom(principalValue);
  if (principalId !== OWNER_PRINCIPAL_ID) {
    throw new HttpError(403, 'Subscription workspaces cannot publish onto SniperPlug’s public guide site.');
  }
  return principalId;
}

function allowedAttachmentUrls(attachments) {
  return (Array.isArray(attachments?.files) ? attachments.files : [])
    .filter((file) => file?.durable === true && file?.url)
    .map((file) => file.url);
}

function publishHoldReason(integrity) {
  if (integrity?.quarantined === true) {
    return integrity.quarantineReason || 'This imported guide was quarantined and must be reviewed and saved before publishing again.';
  }
  const policy = integrity?.importPolicy || integrity?.sourceMeta?.importPolicy || integrity?.policy;
  const expiresAt = Date.parse(String(policy?.expiresAt || ''));
  if (policy?.timeSensitive === true && Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    return 'This time-sensitive sports post expired before publication. Review it manually instead of publishing stale picks.';
  }
  if (policy?.autoPublishEligible === false && integrity?.manualReviewCompleted !== true) {
    return policy.reason || 'This item requires manual guide review before publication.';
  }
  return null;
}

async function auditRow(db, principalId, row, { manualReviewConfirmed = false } = {}) {
  const attachments = safeJson(row.attachment_json, {});
  const previousIntegrity = safeJson(row.integrity_json, {});
  const now = new Date().toISOString();
  const integrity = manualReviewConfirmed
    ? {
        ...previousIntegrity,
        manualReviewCompleted: true,
        manualReviewConfirmedAt: now,
        manualReviewConfirmedByPrincipalId: principalId,
      }
    : previousIntegrity;
  const linkAudit = auditGuideLinks(row.body_markdown || '', {
    allowedWhopUrls: allowedAttachmentUrls(attachments),
  });
  const holdReason = publishHoldReason(integrity);
  const nextIntegrity = { ...integrity, linkAudit, publishHoldReason: holdReason, linkAuditedAt: now };
  await db.prepare('UPDATE guides SET integrity_json = ? WHERE principal_id = ? AND id = ?')
    .bind(JSON.stringify(nextIntegrity), principalId, row.id).run();
  return { attachments, integrity: nextIntegrity, linkAudit, holdReason };
}

export async function assertGuidePublishable(env, principalValue, id) {
  const principalId = requirePublicPublisher(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const row = await db.prepare(`
    SELECT id, title, status, source_key, body_markdown, attachment_json, integrity_json
    FROM guides WHERE principal_id = ? AND id = ?
  `).bind(principalId, id).first();
  if (!row) throw new HttpError(404, 'Guide not found in this account workspace.');

  // This function has one production caller: the version-reserved manual guide-status
  // publish path. Clicking Publish is therefore the explicit account review action for
  // an unchanged imported draft. Bulk/automatic publishing calls auditRow directly
  // without this flag and still cannot bypass manual-review-only policy.
  const { attachments, integrity, holdReason } = await auditRow(db, principalId, row, { manualReviewConfirmed: true });
  if (Number(attachments.reviewCount || 0) > 0) {
    throw new HttpError(422, 'Resolve or replace every flagged private or expiring Whop file before publishing.', { code: 'attachment_review' });
  }
  if (integrity.blocked === true) {
    throw new HttpError(422, integrity.error || 'Guide integrity validation failed.', { code: 'integrity_blocked' });
  }
  if (holdReason) {
    throw new HttpError(422, holdReason, { code: integrity.quarantined ? 'quarantined_import' : 'manual_or_expired_review' });
  }
  assertPublishableLinks(integrity);
  return integrity.linkAudit;
}

async function rowsForRequest(db, principalId, input) {
  const ids = uniqueGuideIds(input?.guideIds);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.prepare(`
      SELECT id, title, status, source_key, body_markdown, attachment_json, integrity_json
      FROM guides WHERE principal_id = ? AND id IN (${placeholders})
    `).bind(principalId, ...ids).all();
    return { requestedIds: ids, rows: rows.results || [] };
  }
  if (input?.allImported === true) {
    const rows = await db.prepare(`
      SELECT id, title, status, source_key, body_markdown, attachment_json, integrity_json
      FROM guides
      WHERE principal_id = ? AND source_key IS NOT NULL AND status = 'draft'
      ORDER BY updated_at DESC
      LIMIT ${MAX_GUIDES}
    `).bind(principalId).all();
    const values = rows.results || [];
    return { requestedIds: values.map((row) => Number(row.id)), rows: values };
  }
  throw new HttpError(422, 'Choose imported drafts to publish.');
}

async function confirmedRows(db, principalId, ids) {
  const output = [];
  for (const group of chunks(ids, UPDATE_CHUNK)) {
    if (!group.length) continue;
    const placeholders = group.map(() => '?').join(',');
    const rows = await db.prepare(`
      SELECT id, title, status FROM guides
      WHERE principal_id = ? AND id IN (${placeholders})
    `).bind(principalId, ...group).all();
    output.push(...(rows.results || []));
  }
  return output;
}

export async function publishReadyGuides(env, principalValue, input) {
  const principalId = requirePublicPublisher(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  const { requestedIds, rows } = await rowsForRequest(db, principalId, input);
  const ready = [];
  const skippedFiles = [];
  const skippedIntegrity = [];
  const skippedLinks = [];
  const alreadyPublished = [];
  const skippedStatus = [];
  const publishFailures = [];

  for (const row of rows) {
    const { attachments, integrity, linkAudit, holdReason } = await auditRow(db, principalId, row);
    if (!row.source_key) {
      skippedStatus.push({ id: row.id, title: row.title, reason: 'Not an imported Whop guide.' });
    } else if (row.status === 'published') {
      alreadyPublished.push({ id: row.id, title: row.title });
    } else if (row.status !== 'draft') {
      skippedStatus.push({ id: row.id, title: row.title, reason: `Status is ${row.status}.` });
    } else if (Number(attachments.reviewCount || 0) > 0) {
      skippedFiles.push({ id: row.id, title: row.title, reviewCount: Number(attachments.reviewCount || 0) });
    } else if (integrity.blocked === true || holdReason) {
      skippedIntegrity.push({ id: row.id, title: row.title, reason: holdReason || integrity.error || 'Integrity validation failed.' });
    } else if (Number(linkAudit.blockedCount || 0) > 0) {
      skippedLinks.push({ id: row.id, title: row.title, blocked: linkAudit.blocked || [] });
    } else {
      ready.push(Number(row.id));
    }
  }

  const now = new Date().toISOString();
  for (const group of chunks(ready, UPDATE_CHUNK)) {
    const placeholders = group.map(() => '?').join(',');
    try {
      await db.prepare(`
        UPDATE guides
        SET status = 'published', updated_at = ?, published_at = ?
        WHERE principal_id = ? AND status = 'draft' AND id IN (${placeholders})
      `).bind(now, now, principalId, ...group).run();
    } catch (error) {
      const message = String(error?.message || 'Database publication update failed.').slice(0, 500);
      publishFailures.push({ guideIds: group, message });
      for (const id of group) {
        const row = rows.find((candidate) => Number(candidate.id) === id);
        skippedIntegrity.push({ id, title: row?.title || `Guide ${id}`, reason: `Publication could not be confirmed: ${message}` });
      }
    }
  }

  const confirmation = await confirmedRows(db, principalId, ready);
  const confirmedById = new Map(confirmation.map((row) => [Number(row.id), row]));
  const publishedGuideIds = ready.filter((id) => confirmedById.get(id)?.status === 'published');
  for (const id of ready) {
    const final = confirmedById.get(id);
    if (final?.status === 'published') continue;
    const title = final?.title || rows.find((row) => Number(row.id) === id)?.title || `Guide ${id}`;
    const reason = final ? `Status changed to ${final.status} before publication could be confirmed.` : 'Guide disappeared before publication could be confirmed.';
    skippedStatus.push({ id, title, reason });
    if (!skippedIntegrity.some((entry) => Number(entry.id) === id)) {
      skippedIntegrity.push({ id, title, reason: `Publication held: ${reason}` });
    }
  }

  const found = new Set(rows.map((row) => Number(row.id)));
  return {
    requested: requestedIds.length,
    attempted: ready.length,
    published: publishedGuideIds.length,
    publishedGuideIds,
    skippedFiles,
    skippedIntegrity,
    skippedLinks,
    skippedStatus,
    alreadyPublished,
    publishFailures,
    missing: requestedIds.filter((id) => !found.has(id)),
  };
}