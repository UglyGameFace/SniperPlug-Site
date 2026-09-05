import { HttpError } from './http.js';
import { ensureImporterWorkspaceSchema, principalIdFrom } from './importer-workspace.js';

export const GUIDE_RESTORE_COLUMNS = Object.freeze([
  'principal_id', 'upstream_source_key',
  'slug', 'title', 'description', 'category_slug', 'body_markdown', 'status', 'featured', 'sort_order',
  'source_key', 'source_group', 'source_experience_id', 'source_post_id', 'source_fingerprint',
  'attachment_json', 'integrity_json', 'author_json', 'source_created_at', 'source_updated_at',
  'imported_at', 'updated_at', 'published_at',
]);

function comparable(value) {
  return value == null ? null : value;
}

export function guideSnapshotMatches(current, snapshot) {
  if (!current || !snapshot || Number(current.id) !== Number(snapshot.id)) return false;
  return GUIDE_RESTORE_COLUMNS.every((column) => comparable(current[column]) === comparable(snapshot[column]));
}

export async function snapshotGuide(env, principalValue, id) {
  const principalId = principalIdFrom(principalValue);
  const db = await ensureImporterWorkspaceSchema(env);
  return db.prepare('SELECT * FROM guides WHERE principal_id = ? AND id = ?').bind(principalId, id).first();
}

export async function restoreGuideSnapshot(env, principalValue, row, { expectedUpdatedAt = null } = {}) {
  const principalId = principalIdFrom(principalValue);
  if (!row?.id) throw new HttpError(500, 'A guide rollback snapshot is missing its guide ID.');
  if (String(row.principal_id || '') !== principalId) throw new HttpError(403, 'This rollback snapshot belongs to a different SniperPlug account.');
  const db = await ensureImporterWorkspaceSchema(env);
  const assignments = GUIDE_RESTORE_COLUMNS.map((column) => `${column} = ?`).join(', ');
  const condition = expectedUpdatedAt == null
    ? 'principal_id = ? AND id = ?'
    : 'principal_id = ? AND id = ? AND updated_at = ?';
  const values = GUIDE_RESTORE_COLUMNS.map((column) => row[column] ?? null);
  const result = await db.prepare(`UPDATE guides SET ${assignments} WHERE ${condition}`)
    .bind(...values, principalId, row.id, ...(expectedUpdatedAt == null ? [] : [expectedUpdatedAt]))
    .run();
  if (Number(result.meta?.changes || 0) !== 1) {
    const current = await db.prepare('SELECT * FROM guides WHERE principal_id = ? AND id = ?').bind(principalId, row.id).first();
    if (guideSnapshotMatches(current, row)) return row;
    throw new HttpError(409, 'The guide changed again before rollback could complete. The newer version was preserved.', {
      code: 'guide_rollback_stale',
      guideId: Number(row.id),
      expectedUpdatedAt,
      currentUpdatedAt: current?.updated_at || null,
    });
  }
  return row;
}
