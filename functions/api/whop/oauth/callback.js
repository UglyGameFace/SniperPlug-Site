import { createAdminSession } from '../../../_lib/auth.js';
import { appendCookie, HttpError, redirect, requireDatabase } from '../../../_lib/http.js';
import { finishWhopOAuth } from '../../../_lib/whop.js';

function customerUserId(profile) {
  const id = String(profile?.id || '').trim();
  if (!/^user_[A-Za-z0-9_-]+$/.test(id)) throw new HttpError(403, 'Whop did not return a valid customer identity.');
  return id;
}

async function promoteCustomerSession(env, pendingSid, profile) {
  if (!String(pendingSid || '').startsWith('whop-customer-pending:')) return null;
  const userId = customerUserId(profile);
  const finalSid = `whop-user:${userId}`;
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM whop_sessions WHERE admin_session_id = ?').bind(pendingSid).first();
  if (!row) throw new HttpError(401, 'The Whop customer login could not be finalized. Start the sign-in again.');
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO whop_sessions (
      admin_session_id, access_cipher, refresh_cipher, token_type, scopes, expires_at,
      user_json, token_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(admin_session_id) DO UPDATE SET
      access_cipher = excluded.access_cipher,
      refresh_cipher = excluded.refresh_cipher,
      token_type = excluded.token_type,
      scopes = excluded.scopes,
      expires_at = excluded.expires_at,
      user_json = excluded.user_json,
      token_version = whop_sessions.token_version + 1,
      updated_at = excluded.updated_at
  `).bind(
    finalSid,
    row.access_cipher,
    row.refresh_cipher,
    row.token_type,
    row.scopes,
    row.expires_at,
    row.user_json,
    Math.max(1, Number(row.token_version || 1)),
    row.created_at || now,
    now,
  ).run();
  await db.prepare('DELETE FROM whop_sessions WHERE admin_session_id = ?').bind(pendingSid).run();
  const session = await createAdminSession(env, { sid: finalSid, kind: 'customer', whopUserId: userId });
  return session.cookie;
}

export async function onRequest(context) {
  try {
    const result = await finishWhopOAuth(context.request, context.env);
    const customerCookie = await promoteCustomerSession(context.env, result.adminSessionId, result.profile);
    const response = redirect(`${new URL(context.request.url).origin}/control-center/?whop=connected#whop-importer`);
    return customerCookie ? appendCookie(response, customerCookie) : response;
  } catch (error) {
    const url = new URL('/control-center/', context.request.url);
    url.searchParams.set('whop', 'error');
    url.searchParams.set('message', String(error?.message || 'Whop login failed.').slice(0, 180));
    url.hash = 'whop-importer';
    return redirect(url.toString());
  }
}
