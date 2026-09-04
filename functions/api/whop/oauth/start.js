import { OWNER_SESSION_ID, requireAdmin } from '../../../_lib/auth.js';
import { appendCookie, redirect } from '../../../_lib/http.js';
import { whopOAuthFlowCookie } from '../../../_lib/whop-oauth-flow.js';
import { beginWhopOAuth, purgeLegacyWhopSessions } from '../../../_lib/whop.js';

function oauthStartError(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('whop', 'error');
  url.searchParams.set('message', String(error?.message || 'Whop connection could not start.').slice(0, 180));
  url.hash = 'whop-importer';
  return redirect(url.toString());
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    const admin = await requireAdmin(context.request, context.env);
    if (admin.sid !== OWNER_SESSION_ID) throw new Error('Unlock the Control Center before connecting Whop.');
    await purgeLegacyWhopSessions(context.env);
    const authorizationUrl = await beginWhopOAuth(context.request, context.env, admin);
    const state = new URL(authorizationUrl).searchParams.get('state');
    return appendCookie(redirect(authorizationUrl), whopOAuthFlowCookie(state));
  } catch (error) {
    return oauthStartError(context.request, error);
  }
}
