import {
  appendCookie,
  handleError,
  json,
  methodNotAllowed,
  requireDatabase,
  requireSameOrigin,
} from '../_lib/http.js';
import { requireControlAccount } from '../_lib/subscriber-auth.js';
import { disconnectPrincipalWhop, principalIdForSession } from '../_lib/whop-connection.js';
import { whopSwitchIntentCookie } from '../_lib/whop-switch-intent.js';

async function currentWhopProfile(env, account) {
  const principalId = principalIdForSession(account);
  const row = await requireDatabase(env)
    .prepare('SELECT user_json FROM whop_sessions WHERE admin_session_id = ?')
    .bind(principalId)
    .first();
  if (!row?.user_json) return account?.whopUserId ? { sub: account.whopUserId } : {};
  try {
    return JSON.parse(row.user_json || '{}');
  } catch {
    return account?.whopUserId ? { sub: account.whopUserId } : {};
  }
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const account = await requireControlAccount(context.request, context.env);
    const profile = await currentWhopProfile(context.env, account);
    const switchCookie = await whopSwitchIntentCookie(context.env, account, profile);
    await disconnectPrincipalWhop(context.request, context.env, account);
    const subscriber = account.kind === 'subscriber';
    const response = json({
      disconnected: true,
      switchReady: true,
      sameAccountGuard: Boolean(switchCookie),
      message: subscriber
        ? 'SniperPlug disconnected this subscriber workspace from Whop. During this switch it will refuse to reconnect the same Whop user. Switch to the paid Whop account you want, then sign in again.'
        : 'SniperPlug disconnected this account’s saved Whop token. During this switch it will refuse to reconnect the same Whop user. Switch or sign out on Whop.com, then continue with Whop.',
      whopUrl: 'https://whop.com/',
      connectUrl: subscriber ? '/api/subscriber/oauth/start' : '/api/whop/oauth/start',
      accountKind: account.kind,
    });
    return appendCookie(response, switchCookie);
  } catch (error) {
    return handleError(error);
  }
}
