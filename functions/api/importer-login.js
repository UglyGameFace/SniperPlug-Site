import { redirect } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { beginWhopOAuth, disconnectWhop } from '../_lib/whop.js';

function oauthStartError(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('whop', 'error');
  url.searchParams.set('message', String(error?.message || 'Whop login could not start.').slice(0, 180));
  url.hash = 'whop-importer';
  return redirect(url.toString());
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (admin.kind !== 'owner') throw new Error('Unlock the Control Center with the owner password before connecting Whop.');

    await disconnectWhop(context.request, context.env, admin).catch(() => null);
    const oauthUrl = new URL(await beginWhopOAuth(context.request, context.env, admin));
    oauthUrl.searchParams.set('prompt', 'login');
    oauthUrl.searchParams.set('max_age', '0');
    return redirect(oauthUrl.toString());
  } catch (error) {
    return oauthStartError(context.request, error);
  }
}
