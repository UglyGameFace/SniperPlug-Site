import { handleError, json, methodNotAllowed, requireSameOrigin } from '../_lib/http.js';
import { requireControlAccount } from '../_lib/subscriber-auth.js';
import { disconnectPrincipalWhop } from '../_lib/whop-connection.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const account = await requireControlAccount(context.request, context.env);
    await disconnectPrincipalWhop(context.request, context.env, account);
    return json({ disconnected: true, accountKind: account.kind });
  } catch (error) {
    return handleError(error);
  }
}
