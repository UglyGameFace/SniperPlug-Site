import { requireAdmin } from '../_lib/auth.js';
import { discoverWhopSources } from '../_lib/discovery.js';
import { handleError, json, methodNotAllowed } from '../_lib/http.js';
import { requireWhopSession } from '../_lib/whop.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') return methodNotAllowed(['GET']);
    const admin = await requireAdmin(context.request, context.env);
    const session = await requireWhopSession(context.request, context.env, admin);
    return json(await discoverWhopSources(session, context.env));
  } catch (error) {
    return handleError(error);
  }
}
