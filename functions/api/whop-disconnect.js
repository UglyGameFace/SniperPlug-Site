import { OWNER_SESSION_ID, requireAdmin } from '../_lib/auth.js';
import { handleError, HttpError, json, methodNotAllowed, requireSameOrigin } from '../_lib/http.js';
import { disconnectWhop } from '../_lib/whop.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const admin = await requireAdmin(context.request, context.env);
    if (admin.sid !== OWNER_SESSION_ID) throw new HttpError(403, 'Only the Control Center owner can disconnect Whop.');
    await disconnectWhop(context.request, context.env, admin);
    return json({ disconnected: true });
  } catch (error) {
    return handleError(error);
  }
}
