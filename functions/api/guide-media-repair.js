import { requireAdmin } from '../_lib/auth.js';
import { adminGuide, importApprovedPosts } from '../_lib/guides-media.js';
import {
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireDatabase,
  requireSameOrigin,
} from '../_lib/http.js';
import { requireWhopSession, retrieveExperience } from '../_lib/whop.js';

function guideId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(422, 'Choose a valid guide to repair.');
  return id;
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);

    const input = await readJson(context.request, { maxBytes: 20_000 });
    if (input?.rightsConfirmed !== true) {
      throw new HttpError(422, 'Confirm that you own this content or have permission to republish it.');
    }

    const id = guideId(input?.guideId);
    const db = requireDatabase(context.env);
    const row = await db.prepare(`
      SELECT id, status, source_key, source_experience_id, category_slug
      FROM guides WHERE id = ?
    `).bind(id).first();

    if (!row) throw new HttpError(404, 'Guide not found.');
    if (row.status === 'rejected') {
      throw new HttpError(409, 'Restore this removed guide before repairing its media.');
    }
    if (!row.source_key || !row.source_experience_id) {
      throw new HttpError(422, 'This guide is not linked to a recoverable Whop item.');
    }

    const whop = await requireWhopSession(context.request, context.env, admin);
    const experience = await retrieveExperience(whop, row.source_experience_id);
    const output = await importApprovedPosts(context.env, whop, {
      experienceId: experience.id,
      sourceKeys: [row.source_key],
      category: row.category_slug || undefined,
      autoCategorize: !row.category_slug,
      automaticWorkflow: false,
      rightsConfirmed: true,
    });

    const result = (output.results || []).find((item) => String(item.sourceKey) === String(row.source_key));
    if (!result || !['created-draft', 'updated-draft', 'unchanged'].includes(result.action)) {
      throw new HttpError(409, result?.holdReason || 'Whop returned the item, but SniperPlug could not rebuild its media section.');
    }

    const repaired = await adminGuide(context.env, id);
    if (!repaired) throw new HttpError(409, 'The media repair finished but the guide could not be reloaded.');
    return json({ repaired: true, action: result.action, guide: repaired, import: output });
  } catch (error) {
    return handleError(error);
  }
}
