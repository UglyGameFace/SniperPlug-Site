import { restoreCourseVideos, snapshotCourseVideos } from './course-video.js';
import { restoreGuideSnapshot, snapshotGuide } from './guide-snapshots.js';
import { saveGuideDraft as saveGuideDraftWithCleanup } from './guides-media.js';
import { HttpError, requireDatabase } from './http.js';
import { prepareGuideBody } from './integrity.js';
import { assertGuideNotRecovering } from './recovery-leases.js';

function submittedStateMatches(row, input, preparedBody) {
  if (!row || row.status !== 'draft') return false;
  if (String(row.title || '') !== String(input?.title || '').trim().slice(0, 140)) return false;
  if (String(row.description || '') !== String(input?.description || '').trim().slice(0, 260)) return false;
  if (String(row.category_slug || '') !== String(input?.category || '').trim()) return false;
  if (String(row.body_markdown || '') !== String(preparedBody || '')) return false;
  return Boolean(row.featured) === Boolean(input?.featured === true);
}

export async function saveGuideDraft(env, id, input) {
  await assertGuideNotRecovering(env, id);
  const snapshot = await snapshotGuide(env, id);
  if (!snapshot) throw new HttpError(404, 'Guide draft not found.');
  const videoSnapshot = await snapshotCourseVideos(env, id);
  const prepared = await prepareGuideBody(String(input?.body || ''), { source: 'Guide draft rollback guard' });

  try {
    return await saveGuideDraftWithCleanup(env, id, input);
  } catch (error) {
    const db = requireDatabase(env);
    const current = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first().catch(() => null);

    // A stale-tab conflict or another workflow's newer write must always win.
    // Roll back only when the current row still exactly matches this failed save.
    if (!submittedStateMatches(current, input, prepared.body)) throw error;

    try {
      await restoreGuideSnapshot(env, snapshot, { expectedUpdatedAt: current.updated_at });
      await restoreCourseVideos(env, id, videoSnapshot);
    } catch (rollbackError) {
      throw new HttpError(500, 'The draft save failed after changing guide or video state, and SniperPlug could not completely restore the previous version.', {
        code: 'guide_save_rollback_failed',
        guideId: Number(id),
        saveError: String(error?.message || error),
        rollbackError: String(rollbackError?.message || rollbackError),
      });
    }

    throw error;
  }
}
