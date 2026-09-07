import { importBrowserCaptures } from '../_lib/browser-capture.js';
import { reconcileBrowserCaptures } from '../_lib/browser-capture-reconcile.js';
import { requireWhopAppFrameCaptures } from '../_lib/browser-capture-origin.js';
import { handleError, HttpError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { requireControlAccount } from '../_lib/subscriber-auth.js';
import { requireWhopSession } from '../_lib/whop.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const account = await requireControlAccount(context.request, context.env);
    const whop = await requireWhopSession(context.request, context.env, account);
    const body = await readJson(context.request, { maxBytes: 2_750_000 });
    requireWhopAppFrameCaptures(body);
    const mode = String(body?.mode || 'import').trim().toLowerCase();
    if (!['import', 'reconcile'].includes(mode)) throw new HttpError(422, 'Unsupported browser-capture mode.');
    if (mode === 'reconcile') return json(await reconcileBrowserCaptures(context.env, account, whop, body));
    return json(await importBrowserCaptures(context.env, account, whop, body));
  } catch (error) {
    return handleError(error);
  }
}
