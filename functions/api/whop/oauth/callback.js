import { readAdminSession } from '../../../_lib/auth.js';
import { HttpError, redirect } from '../../../_lib/http.js';
import { finishWhopOAuth } from '../../../_lib/whop.js';

function oauthErrorRedirect(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('whop', 'error');
  url.searchParams.set('message', String(error?.message || 'Whop login failed.').slice(0, 180));
  url.hash = 'whop-importer';
  return redirect(url.toString());
}

export async function onRequest(context) {
  try {
    const browserSession = await readAdminSession(context.request, context.env).catch(() => null);
    if (!browserSession || browserSession.kind !== 'owner') {
      throw new HttpError(401, 'Unlock the Control Center with the owner password before connecting Whop.');
    }

    await finishWhopOAuth(context.request, context.env);
    return redirect(`${new URL(context.request.url).origin}/control-center/?whop=connected#whop-importer`);
  } catch (error) {
    return oauthErrorRedirect(context.request, error);
  }
}
