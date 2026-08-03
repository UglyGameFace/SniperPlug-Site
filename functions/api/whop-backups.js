import { requireAdmin } from '../_lib/auth.js';
import {
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
} from '../_lib/http.js';
import { scanApprovedSource } from '../_lib/posts.js';
import { listSourceOptions, saveSourceDecision } from '../_lib/source-policy.js';
import {
  authorizeWhopReset,
  createWhopImportBackup,
  deleteWhopImportBackup,
  exportWhopImportBackup,
  listWhopImportBackups,
  previewWhopReset,
  resetWhopImporter,
  restoreWhopImportBackup,
} from '../_lib/whop-backups.js';
import { disconnectWhop, requireWhopSession, retrieveExperience } from '../_lib/whop.js';

function action(request) {
  return String(new URL(request.url).searchParams.get('action') || 'overview').trim();
}

function backupId(request, body = {}) {
  return String(body.backupId || new URL(request.url).searchParams.get('id') || '').trim();
}

function downloadResponse(backupIdValue, payload) {
  const filename = `sniperplug-whop-backup-${backupIdValue}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'cache-control': 'private, no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    },
  });
}

async function overview(env) {
  const [backups, sources] = await Promise.all([
    listWhopImportBackups(env),
    listSourceOptions(env),
  ]);
  return json({
    backups,
    sources: sources.filter((source) => source.experienceId).map((source) => ({
      experienceId: source.experienceId,
      label: source.label,
      decision: source.decision,
      groupKey: source.groupKey || null,
    })),
  });
}

async function postAction(request, env, admin, currentAction) {
  requireSameOrigin(request);
  const body = await readJson(request, { maxBytes: 250_000 });
  if (currentAction === 'preview') return json(await previewWhopReset(env, body));
  if (currentAction === 'create') {
    return json(await createWhopImportBackup(env, admin.sid, body));
  }
  if (currentAction === 'authorize-reset') {
    return json({ authorization: await authorizeWhopReset(env, backupId(request, body), body) });
  }
  if (currentAction === 'restore') {
    return json(await restoreWhopImportBackup(env, backupId(request, body), body));
  }
  if (currentAction === 'delete') {
    return json(await deleteWhopImportBackup(env, backupId(request, body), body.confirmation));
  }
  if (currentAction === 'reset') {
    let whop = null;
    if (body.resync === true) whop = await requireWhopSession(request, env, admin);
    const result = await resetWhopImporter(env, backupId(request, body), body);
    let resync = null;
    if (result.options.resync === true) {
      if (result.scope !== 'source' || !result.experienceId) {
        throw new HttpError(422, 'Automatic resync is available only when clearing one exact Whop source.');
      }
      if (!whop) whop = await requireWhopSession(request, env, admin);
      const experience = await retrieveExperience(whop, result.experienceId);
      await saveSourceDecision(env, experience, result.experienceId, 'approved');
      const posts = await scanApprovedSource(env, whop, experience);
      resync = {
        experienceId: result.experienceId,
        title: String(experience?.name || experience?.company?.title || result.experienceId),
        posts: posts.length,
        approved: posts.filter((post) => post.decision === 'approved').length,
        pending: posts.filter((post) => post.decision === 'pending').length,
        blocked: posts.filter((post) => post.decision === 'blocked').length,
      };
    }
    if (result.options.disconnectWhop === true) await disconnectWhop(request, env, admin);
    return json({ ...result, resync });
  }
  throw new HttpError(404, 'Unknown Whop backup action.');
}

export async function onRequest(context) {
  try {
    const currentAction = action(context.request);
    const admin = await requireAdmin(context.request, context.env);
    if (context.request.method === 'GET') {
      if (currentAction === 'overview') return overview(context.env);
      if (currentAction === 'download') {
        const id = backupId(context.request);
        return downloadResponse(id, await exportWhopImportBackup(context.env, id));
      }
      return methodNotAllowed(['POST']);
    }
    if (context.request.method === 'POST') return postAction(context.request, context.env, admin, currentAction);
    return methodNotAllowed(['GET', 'POST']);
  } catch (error) {
    return handleError(error);
  }
}
