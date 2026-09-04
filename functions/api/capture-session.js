import { requireAdmin } from '../_lib/auth.js';
import { createAuthorizedCaptureSession } from '../_lib/authorized-page-capture.js';
import { handleError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { requireWhopSession } from '../_lib/whop.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const admin = await requireAdmin(context.request, context.env);
    await requireWhopSession(context.request, context.env, admin);
    const body = await readJson(context.request, { maxBytes: 10_000 });
    const session = await createAuthorizedCaptureSession(context.env, admin, {
      rightsConfirmed: body.rightsConfirmed === true,
    });
    return json({
      capture: {
        token: session.token,
        expiresAt: session.expiresAt,
        maxUses: session.maxUses,
        helperUrl: '/sniperplug-capture.user.js',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
