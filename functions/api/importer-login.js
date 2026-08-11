import { appendCookie, redirect } from '../_lib/http.js';
import { createAdminSession } from '../_lib/auth.js';
import { randomToken } from '../_lib/crypto.js';
import { beginWhopOAuth } from '../_lib/whop.js';

function oauthStartError(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('whop', 'error');
  url.searchParams.set('message', String(error?.message || 'Whop login could not start.').slice(0, 180));
  url.hash = 'whop-importer';
  return redirect(url.toString());
}

export async function onRequest(context) {
  const pendingSid = `whop-customer-pending:${randomToken(24)}`;
  const result = await createAdminSession(context.env, { sid: pendingSid, kind: 'customer-pending' });
  try {
    const oauthUrl = await beginWhopOAuth(context.request, context.env, result.session);
    return appendCookie(redirect(oauthUrl), result.cookie);
  } catch (error) {
    return oauthStartError(context.request, error);
  }
}
