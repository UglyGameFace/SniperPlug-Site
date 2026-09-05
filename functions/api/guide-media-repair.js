import { requireAdmin } from '../_lib/auth.js';
import { adminGuide, importApprovedPosts } from '../_lib/guides-media.js';
import {
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
} from '../_lib/http.js';
import { ensureImporterWorkspaceSchema, principalIdFrom, upstreamSourceKey } from '../_lib/importer-workspace.js';
import { mediaRepairReview, whopRecoveryError } from '../_lib/recovery-media.js';
import { requireWhopSession, retrieveExperience } from '../_lib/whop.js';

function guideId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(422, 'Choose a valid guide to repair.');
  return id;
}

function deploymentInfo(env) {
  return {
    commit: String(env?.CF_PAGES_COMMIT_SHA || '').trim() || null,
    branch: String(env?.CF_PAGES_BRANCH || '').trim() || null,
    pagesUrl: String(env?.CF_PAGES_URL || '').trim() || null,
  };
}

async function liveExperience(request, env, admin, row) {
  const logicalSourceKey = upstreamSourceKey(row);
  let whop;
  try {
    whop = await requireWhopSession(request, env, admin);
  } catch (error) {
    throw whopRecoveryError(error, { experienceId: row.source_experience_id, sourceKey: logicalSourceKey, operation: 'repair this guide’s media' });
  }
  try {
    return { whop, experience: await retrieveExperience(whop, row.source_experience_id) };
  } catch (error) {
    throw whopRecoveryError(error, { experienceId: row.source_experience_id, sourceKey: logicalSourceKey, operation: 'repair this guide’s media' });
  }
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    const principalId = principalIdFrom(admin);
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);

    const input = await readJson(context.request, { maxBytes: 20_000 });
    if (input?.rightsConfirmed !== true) throw new HttpError(422, 'Confirm that you own this content or have permission to republish it.');

    const id = guideId(input?.guideId);
    const db = await ensureImporterWorkspaceSchema(context.env);
    const row = await db.prepare(`
      SELECT id, status, source_key, upstream_source_key, source_experience_id, category_slug
      FROM guides WHERE principal_id = ? AND id = ?
    `).bind(principalId, id).first();

    if (!row) throw new HttpError(404, 'Guide not found in this account workspace.');
    if (row.status === 'rejected') throw new HttpError(409, 'Restore this removed guide before repairing its media.');
    const logicalSourceKey = upstreamSourceKey(row);
    if (!row.source_key || !logicalSourceKey || !row.source_experience_id) throw new HttpError(422, 'This guide is not linked to a recoverable Whop item.');
    if (!context.env?.SNIPERPLUG_MEDIA) {
      throw new HttpError(503, 'The active Pages Function cannot see the SNIPERPLUG_MEDIA binding. The dashboard binding may exist, but this exact deployment or environment is not receiving it.', {
        code: 'media_storage_not_connected', binding: 'SNIPERPLUG_MEDIA', bucket: 'sniperplug-media', storageConnected: false,
        guideId: id, deployment: deploymentInfo(context.env),
      });
    }

    const { whop, experience } = await liveExperience(context.request, context.env, admin, row);
    const output = await importApprovedPosts(context.env, principalId, whop, {
      experienceId: experience.id,
      sourceKeys: [logicalSourceKey],
      category: row.category_slug || undefined,
      autoCategorize: !row.category_slug,
      automaticWorkflow: false,
      rightsConfirmed: true,
    });

    const result = (output.results || []).find((item) => String(item.sourceKey) === logicalSourceKey);
    if (!result || !['created-draft', 'updated-draft', 'unchanged'].includes(result.action)) {
      throw new HttpError(409, result?.holdReason || 'Whop returned the item, but SniperPlug could not rebuild its media section.', {
        code: 'media_repair_import_rejected', guideId: id, storageConnected: true,
        action: result?.action || null, deployment: deploymentInfo(context.env),
      });
    }

    const repaired = await adminGuide(context.env, principalId, id);
    if (!repaired) throw new HttpError(409, 'The media repair finished but the guide could not be reloaded in this account workspace.');

    const review = mediaRepairReview(repaired);
    if (!review.complete) {
      const count = Math.max(1, review.reviewCount);
      const reason = review.reasons[0] || 'The source still did not provide a permanent copy that SniperPlug can safely publish.';
      throw new HttpError(409, `Whop was re-fetched and R2 is connected, but ${count} media ${count === 1 ? 'item is' : 'items are'} still unresolved. ${reason}`, {
        code: 'media_repair_incomplete', guideId: id, storageConnected: true, reviewCount: count,
        reasons: review.reasons, action: result.action, deployment: deploymentInfo(context.env), guide: repaired,
      });
    }

    return json({ repaired: true, complete: true, storageConnected: true, action: result.action, deployment: deploymentInfo(context.env), guide: repaired, import: output });
  } catch (error) {
    return handleError(error);
  }
}
