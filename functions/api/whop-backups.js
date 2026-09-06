import {
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireDatabase,
  requireSameOrigin,
} from '../_lib/http.js';
import { principalIdFrom } from '../_lib/importer-workspace.js';
import { scanApprovedSource } from '../_lib/posts.js';
import { DEFAULT_WHOP_GROUPS, listSourceOptions, saveSourceDecision } from '../_lib/source-policy.js';
import { requireControlAccount } from '../_lib/subscriber-auth.js';
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
import { disconnectPrincipalWhop } from '../_lib/whop-connection.js';
import { requireWhopSession, retrieveExperience } from '../_lib/whop.js';

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

function sourceOverview(sourceOptions) {
  return sourceOptions.filter((source) => source.experienceId).map((source) => ({
    experienceId: source.experienceId,
    label: source.label,
    decision: source.decision,
    groupKey: source.groupKey || null,
  }));
}

function groupLabel(groupKey) {
  const key = String(groupKey || '');
  return DEFAULT_WHOP_GROUPS.find((group) => group.key === key)?.label || null;
}

async function enrichBackupIdentity(env, principalValue, backups, sources) {
  const principalId = principalIdFrom(principalValue);
  const byExperience = new Map((sources || []).map((source) => [String(source.experienceId || ''), source]));
  const db = requireDatabase(env);
  const updates = [];
  const enriched = (backups || []).map((backup) => {
    if (backup.scope !== 'source' || !backup.experienceId) {
      return { ...backup, displayLabel: backup.label || 'Entire Whop importer', groupKey: null, groupLabel: null };
    }
    const source = byExperience.get(String(backup.experienceId)) || null;
    const effectiveLabel = String(source?.label || backup.label || `Whop source · …${String(backup.experienceId).slice(-6)}`).trim();
    if (source?.label && source.label !== backup.label && backup.backupId) {
      updates.push(db.prepare(`
        UPDATE whop_import_backups SET label = ?
        WHERE backup_id = ? AND owner_session_id = ? AND deleted_at IS NULL
      `).bind(source.label, backup.backupId, principalId));
    }
    return {
      ...backup,
      label: effectiveLabel,
      displayLabel: effectiveLabel,
      groupKey: source?.groupKey || null,
      groupLabel: groupLabel(source?.groupKey),
    };
  });
  if (updates.length) await db.batch(updates);
  return enriched;
}

async function overview(env, account) {
  const [backupRows, sourceOptions] = await Promise.all([
    listWhopImportBackups(env, account),
    listSourceOptions(env, account),
  ]);
  const sources = sourceOverview(sourceOptions);
  const backups = await enrichBackupIdentity(env, account, backupRows, sources);
  const groups = DEFAULT_WHOP_GROUPS.map((group) => {
    const sourceCount = sources.filter((source) => source.groupKey === group.key).length;
    return sourceCount > 0 ? { groupKey: group.key, label: group.label, sourceCount } : null;
  }).filter(Boolean);
  return json({ backups, sources, groups });
}

async function postAction(request, env, account, currentAction) {
  requireSameOrigin(request);
  const body = await readJson(request, { maxBytes: 250_000 });
  if (currentAction === 'preview') return json(await previewWhopReset(env, account, body));
  if (currentAction === 'create') {
    const result = await createWhopImportBackup(env, account, body);
    const sources = sourceOverview(await listSourceOptions(env, account));
    const [backup] = await enrichBackupIdentity(env, account, [result.backup], sources);
    return json({ ...result, backup });
  }
  if (currentAction === 'authorize-reset') {
    return json({ authorization: await authorizeWhopReset(env, account, backupId(request, body), body) });
  }
  if (currentAction === 'restore') {
    const id = backupId(request, body);
    try {
      return json(await restoreWhopImportBackup(env, account, id, body));
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
    return json(await deleteWhopImportBackup(env, account, backupId(request, body), body.confirmation));
  }
  if (currentAction === 'reset') {
    const id = backupId(request, body);
    const resetContext = await verifiedWhopResetContext(env, account, id);
    let whop = null;
    let experience = null;
    if (resetContext.options.resync === true) {
      if (resetContext.scope !== 'source' || !resetContext.experienceId) {
        throw new HttpError(422, 'Automatic resync is available only when clearing one exact Whop source.');
      }
      whop = await requireWhopSession(request, env, account);
      experience = await retrieveExperience(whop, resetContext.experienceId);
    }
    const result = await resetWhopImporter(env, account, id, body);
    const warnings = [];
    let resync = null;
    if (result.options.resync === true) {
      try {
        await saveSourceDecision(env, account, experience, result.experienceId, 'approved');
        const posts = await scanApprovedSource(env, account, whop, experience);
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
        await disconnectPrincipalWhop(request, env, account);
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
    const account = await requireControlAccount(context.request, context.env);
    if (context.request.method === 'GET') {
      if (currentAction === 'overview') return overview(context.env, account);
      if (currentAction === 'download') {
        const id = backupId(context.request);
        const exported = await exportWhopImportBackup(context.env, account, id);
        return downloadResponse(id, exported.archiveJson);
      }
      return methodNotAllowed(['POST']);
    }
    if (context.request.method === 'POST') return postAction(context.request, context.env, account, currentAction);
    return methodNotAllowed(['GET', 'POST']);
  } catch (error) {
    return handleError(error);
  }
}
