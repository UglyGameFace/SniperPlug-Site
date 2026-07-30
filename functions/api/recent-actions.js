import { requireAdmin } from '../_lib/auth.js';
import { handleError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { dismissRecentActions, listRecentActions, undoRecentActions } from '../_lib/recent-actions.js';

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (context.request.method === 'GET') {
      return json(await listRecentActions(context.env, admin));
    }
    if (context.request.method !== 'POST') return methodNotAllowed(['GET', 'POST']);
    requireSameOrigin(context.request);
    const body = await readJson(context.request, { maxBytes: 100_000 });
    if (body.action === 'dismiss') return json(await dismissRecentActions(context.env, admin, body));
    return json(await undoRecentActions(context.env, admin, body));
  } catch (error) {
    return handleError(error);
  }
}
