import { OWNER_SESSION_ID, requireAdmin } from '../../../_lib/auth.js';
import { redirect } from '../../../_lib/http.js';
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
    return redirect(await beginWhopOAuth(context.request, context.env, admin));
  } catch (error) {
    return oauthStartError(context.request, error);
  }
}
