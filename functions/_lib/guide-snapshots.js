import { HttpError, requireDatabase } from './http.js';

export const GUIDE_RESTORE_COLUMNS = Object.freeze([
  'slug', 'title', 'description', 'category_slug', 'body_markdown', 'status', 'featured', 'sort_order',
  'source_key', 'source_group', 'source_experience_id', 'source_post_id', 'source_fingerprint',
  'attachment_json', 'integrity_json', 'author_json', 'source_created_at', 'source_updated_at',
  'imported_at', 'updated_at', 'published_at',
]);

export async function snapshotGuide(env, id) {
  const db = requireDatabase(env);
  return db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
}

export async function restoreGuideSnapshot(env, row, { expectedUpdatedAt = null } = {}) {
  if (!row?.id) throw new HttpError(500, 'A guide rollback snapshot is missing its guide ID.');
  const db = requireDatabase(env);
  const assignments = GUIDE_RESTORE_COLUMNS.map((column) => `${column} = ?`).join(', ');
  const condition = expectedUpdatedAt == null ? 'id = ?' : 'id = ? AND updated_at = ?';
  const values = GUIDE_RESTORE_COLUMNS.map((column) => row[column] ?? null);
  const result = await db.prepare(`UPDATE guides SET ${assignments} WHERE ${condition}`)
    .bind(...values, row.id, ...(expectedUpdatedAt == null ? [] : [expectedUpdatedAt]))
    .run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new HttpError(409, 'The guide changed again before rollback could complete. The newer version was preserved.', {
      code: 'guide_rollback_stale',
      guideId: Number(row.id),
      expectedUpdatedAt,
    });
  }
  return row;
}
