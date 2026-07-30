import { appendCookie, redirect } from '../_lib/http.js';
import { createAdminSession } from '../_lib/auth.js';
import { randomToken } from '../_lib/crypto.js';

export async function onRequest(context) {
  const pendingSid = `whop-customer-pending:${randomToken(24)}`;
  const result = await createAdminSession(context.env, { sid: pendingSid, kind: 'customer-pending' });
  return appendCookie(redirect('/api/control?action=oauth-start'), result.cookie);
}
