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
  verifiedWhopResetContext,
} from '../_lib/whop-backups.js';
import { disconnectWhop, requireWhopSession, retrieveExperience } from '../_lib/whop.js';

function action(request) {
  return String(new URL(request.url).searchParams.get('action') || 'overview').trim();
}

function backupId(request, body = {}) {
  return String(body.backupId || new URL(request.url).searchParams.get('id') || '').trim();
}

function downloadResponse(backupIdValue, archiveJson) {
  const filename = `sniperplug-whop-backup-${backupIdValue}.json`;
  return new Response(String(archiveJson || ''), {
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
    const id = backupId(request, body);
    try {
      return json(await restoreWhopImportBackup(env, id, body));
    } catch (error) {
      if (error instanceof HttpError && [400, 401, 403, 404, 422].includes(error.status)) throw error;
      throw new HttpError(409, 'The restore did not finish. Any rows already restored are preserved, the verified backup is unchanged, and retrying the same restore is safe.', {
        code: 'backup_restore_retry_safe',
        backupId: id,
        cause: String(error?.message || 'Unknown restore interruption.').slice(0, 300),
      });
    }
  }
  if (currentAction === 'delete') {
    return json(await deleteWhopImportBackup(env, backupId(request, body), body.confirmation));
  }
  if (currentAction === 'reset') {
    const id = backupId(request, body);
    const resetContext = await verifiedWhopResetContext(env, id);
    let whop = null;
    let experience = null;
    if (resetContext.options.resync === true) {
      if (resetContext.scope !== 'source' || !resetContext.experienceId) {
        throw new HttpError(422, 'Automatic resync is available only when clearing one exact Whop source.');
      }
      whop = await requireWhopSession(request, env, admin);
      experience = await retrieveExperience(whop, resetContext.experienceId);
    }
    const result = await resetWhopImporter(env, id, body);
    const warnings = [];
    let resync = null;
    if (result.options.resync === true) {
      try {
        await saveSourceDecision(env, experience, result.experienceId, 'approved');
        const posts = await scanApprovedSource(env, whop, experience);
        resync = {
          complete: true,
          experienceId: result.experienceId,
          title: String(experience?.name || experience?.company?.title || result.experienceId),
          posts: posts.length,
          approved: posts.filter((post) => post.decision === 'approved').length,
          pending: posts.filter((post) => post.decision === 'pending').length,
          blocked: posts.filter((post) => post.decision === 'blocked').length,
        };
      } catch (error) {
        const message = String(error?.message || 'Whop resync did not finish.').slice(0, 300);
        resync = { complete: false, experienceId: result.experienceId, error: message };
        warnings.push(`The verified reset completed, but fresh Whop resync did not finish: ${message} Restore from backup ${result.backup.backupId} or retry the source scan.`);
      }
    }
    if (result.options.disconnectWhop === true) {
      try {
        await disconnectWhop(request, env, admin);
      } catch (error) {
        warnings.push(`The reset completed, but Whop disconnect did not finish: ${String(error?.message || 'retry disconnect from the Control Center.').slice(0, 240)}`);
      }
    }
    return json({ ...result, resync, warnings });
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
        const exported = await exportWhopImportBackup(context.env, id);
        return downloadResponse(id, exported.archiveJson);
      }
      return methodNotAllowed(['POST']);
    }
    if (context.request.method === 'POST') return postAction(context.request, context.env, admin, currentAction);
    return methodNotAllowed(['GET', 'POST']);
  } catch (error) {
    return handleError(error);
  }
}
