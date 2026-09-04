import { requireAdmin } from '../_lib/auth.js';
import { enforceLiveWhopAccess } from '../_lib/access-truth.js';
import { discoverWhopSources, isTransientDiscoveryError, loadWhopMemberships } from '../_lib/discovery.js';
import { HttpError, json, methodNotAllowed } from '../_lib/http.js';
import { requireWhopSession } from '../_lib/whop.js';

function discoveryError(error) {
  if (error instanceof HttpError) {
    return json({
      error: error.message,
      code: error.status === 401 || error.status === 403 ? 'DISCOVERY_AUTH' : 'DISCOVERY_REQUEST',
      retryable: isTransientDiscoveryError(error),
      ...(error.details ? { details: error.details } : {}),
    }, error.status);
  }
  console.error('Unexpected Whop discovery failure:', error);
  return json({
    error: 'Whop is still connected, but source discovery hit a temporary service limit. SniperPlug will retry without disconnecting your account.',
    code: 'DISCOVERY_TRANSIENT',
    retryable: true,
  }, 503);
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') return methodNotAllowed(['GET']);
    const admin = await requireAdmin(context.request, context.env);
    const session = await requireWhopSession(context.request, context.env, admin);
    const memberships = await loadWhopMemberships(session);
    const discovered = await discoverWhopSources(session, context.env, memberships);
    return json(await enforceLiveWhopAccess(session, discovered, memberships));
  } catch (error) {
    return discoveryError(error);
  }
}
