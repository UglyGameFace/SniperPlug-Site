import { OWNER_SESSION_ID, requireAdmin } from '../../../_lib/auth.js';
import { HttpError, redirect } from '../../../_lib/http.js';
import { finishWhopOAuth, purgeLegacyWhopSessions } from '../../../_lib/whop.js';

function oauthErrorRedirect(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('whop', 'error');
  url.searchParams.set('message', String(error?.message || 'Whop connection failed.').slice(0, 180));
  url.hash = 'whop-importer';
  return redirect(url.toString());
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (admin.sid !== OWNER_SESSION_ID) throw new HttpError(401, 'Unlock the Control Center before connecting Whop.');
    const result = await finishWhopOAuth(context.request, context.env);
    if (result.adminSessionId !== OWNER_SESSION_ID || result.adminSessionId !== admin.sid) {
      await purgeLegacyWhopSessions(context.env);
      throw new HttpError(403, 'Whop OAuth returned to a different Control Center session. Start the connection again.');
    }
    await purgeLegacyWhopSessions(context.env);
    return redirect(`${new URL(context.request.url).origin}/control-center/?whop=connected#whop-importer`);
  } catch (error) {
    return oauthErrorRedirect(context.request, error);
  }
}
