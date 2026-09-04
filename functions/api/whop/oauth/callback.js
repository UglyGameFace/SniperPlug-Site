import { OWNER_SESSION_ID } from '../../../_lib/auth.js';
import { appendCookie, HttpError, redirect } from '../../../_lib/http.js';
import { clearWhopOAuthFlowCookie, requireWhopOAuthFlow } from '../../../_lib/whop-oauth-flow.js';
import { finishWhopOAuth, purgeLegacyWhopSessions } from '../../../_lib/whop.js';

function oauthErrorRedirect(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('whop', 'error');
  url.searchParams.set('message', String(error?.message || 'Whop connection failed.').slice(0, 180));
  url.hash = 'whop-importer';
  return redirect(url.toString());
}

export async function onRequest(context) {
  let response;
  try {
    await requireWhopOAuthFlow(context.request);
    const result = await finishWhopOAuth(context.request, context.env);
    if (result.adminSessionId !== OWNER_SESSION_ID) {
      await purgeLegacyWhopSessions(context.env);
      throw new HttpError(403, 'Whop OAuth returned to a different Control Center session. Start the connection again.');
    }
    await purgeLegacyWhopSessions(context.env);
    response = redirect(`${new URL(context.request.url).origin}/control-center/?whop=connected#whop-importer`);
  } catch (error) {
    response = oauthErrorRedirect(context.request, error);
  }
  return appendCookie(response, clearWhopOAuthFlowCookie());
}
