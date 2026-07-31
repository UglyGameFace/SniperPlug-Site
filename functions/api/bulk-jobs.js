import { requireAdmin } from '../_lib/auth.js';
import {
  cancelBulkJob,
  latestBulkJob,
  startBulkJob,
  stepBulkJob,
} from '../_lib/bulk-jobs.js';
import {
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
} from '../_lib/http.js';
import { requireWhopSession } from '../_lib/whop.js';

function ownerFacingJob(job) {
  if (!job) return null;
  if (job.summary?.legacyCanceled === true) {
    return {
      ...job,
      failures: [],
      currentItem: null,
      displayNotice: 'The old bulk worker was stopped automatically. Its completed publications remain available in Undo recent bulk publications.',
    };
  }
  return job;
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (context.request.method === 'GET') {
      return json({ job: ownerFacingJob(await latestBulkJob(context.env, admin)) });
    }
    if (context.request.method !== 'POST') return methodNotAllowed(['GET', 'POST']);
    requireSameOrigin(context.request);
    const body = await readJson(context.request, { maxBytes: 100_000 });
    const action = String(body?.action || '').trim();
    if (action === 'start') {
      return json({ job: ownerFacingJob(await startBulkJob(context.env, admin, body)) }, 201);
    }
    if (action === 'step') {
      const id = String(body?.jobId || '').trim();
      if (!id) throw new HttpError(422, 'Choose a bulk job to resume.');
      const whop = await requireWhopSession(context.request, context.env, admin);
      return json({ job: ownerFacingJob(await stepBulkJob(context.env, admin, whop, id)) });
    }
    if (action === 'cancel') {
      const id = String(body?.jobId || '').trim();
      if (!id) throw new HttpError(422, 'Choose a bulk job to cancel.');
      return json({ job: ownerFacingJob(await cancelBulkJob(context.env, admin, id)) });
    }
    throw new HttpError(404, 'Unknown bulk job action.');
  } catch (error) {
    return handleError(error);
  }
}
