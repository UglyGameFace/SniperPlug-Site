import { appendCookie, redirect } from '../_lib/http.js';
import { createAdminSession } from '../_lib/auth.js';
import { randomToken } from '../_lib/crypto.js';
import { beginWhopOAuth } from '../_lib/whop.js';

export async function onRequest(context) {
  const pendingSid = `whop-customer-pending:${randomToken(24)}`;
  const result = await createAdminSession(context.env, { sid: pendingSid, kind: 'customer-pending' });
  const oauthUrl = await beginWhopOAuth(context.request, context.env, result.session);
  return appendCookie(redirect(oauthUrl), result.cookie);
}
