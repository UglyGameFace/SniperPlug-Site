import { requireAdmin } from '../_lib/auth.js';
import { importBrowserCaptures } from '../_lib/browser-capture.js';
import { handleError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { requireWhopSession } from '../_lib/whop.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const admin = await requireAdmin(context.request, context.env);
    const whop = await requireWhopSession(context.request, context.env, admin);
    const body = await readJson(context.request, { maxBytes: 2_750_000 });
    return json(await importBrowserCaptures(context.env, whop, body));
  } catch (error) {
    return handleError(error);
  }
}
