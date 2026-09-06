import { handleError, json, methodNotAllowed, requireSameOrigin } from '../_lib/http.js';
import { requireControlAccount } from '../_lib/subscriber-auth.js';
import { disconnectPrincipalWhop } from '../_lib/whop-connection.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const account = await requireControlAccount(context.request, context.env);
    await disconnectPrincipalWhop(context.request, context.env, account);
    const subscriber = account.kind === 'subscriber';
    return json({
      disconnected: true,
      switchReady: true,
      message: subscriber
        ? 'SniperPlug disconnected this subscriber workspace from Whop. Sign into the paid Whop account you want, then sign in again.'
        : 'SniperPlug disconnected this account’s saved Whop token. Sign out of Whop.com and into the account you want, then continue with Whop.',
      whopUrl: 'https://whop.com/',
      connectUrl: subscriber ? '/api/subscriber/oauth/start' : '/api/whop/oauth/start',
      accountKind: account.kind,
    });
  } catch (error) {
    return handleError(error);
  }
}
