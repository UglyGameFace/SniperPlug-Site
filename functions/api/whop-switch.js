import { requireAdmin } from '../_lib/auth.js';
import { handleError, json, methodNotAllowed, requireSameOrigin } from '../_lib/http.js';
import { disconnectPrincipalWhop } from '../_lib/whop-connection.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const admin = await requireAdmin(context.request, context.env);
    await disconnectPrincipalWhop(context.request, context.env, admin);
    return json({
      disconnected: true,
      switchReady: true,
      message: 'SniperPlug disconnected this account’s saved Whop token. Sign out of Whop.com and into the account you want, then continue with Whop.',
      whopUrl: 'https://whop.com/',
      connectUrl: '/api/whop/oauth/start',
    });
  } catch (error) {
    return handleError(error);
  }
}
