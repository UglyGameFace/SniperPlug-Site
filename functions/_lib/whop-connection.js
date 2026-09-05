import { openJson } from './crypto.js';
import { HttpError, requireDatabase } from './http.js';

const OAUTH_REVOKE_URL = 'https://api.whop.com/oauth/revoke';
const REVOKE_TIMEOUT_MS = 10_000;

export function principalIdForSession(session) {
  const principalId = String(session?.principalId || session?.sid || '').trim();
  if (!principalId) throw new HttpError(401, 'The SniperPlug account session is missing its principal identity. Sign in again.');
  return principalId;
}

function tokenSecret(env) {
  const secret = String(env?.WHOP_TOKEN_SECRET || '').trim();
  if (!secret) throw new HttpError(503, 'WHOP_TOKEN_SECRET is not configured.');
  return secret;
}

async function revokeSavedRefreshToken(row, env) {
  if (!row?.refresh_cipher) return;
  try {
    const refresh = await openJson(row.refresh_cipher, tokenSecret(env));
    const token = String(refresh?.token || '').trim();
    const clientId = String(env?.WHOP_CLIENT_ID || '').trim();
    if (!token || !clientId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS);
    try {
      await fetch(OAUTH_REVOKE_URL, {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, client_id: clientId }),
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Local account-scoped disconnect must still finish when Whop is unavailable.
  }
}

export async function disconnectPrincipalWhop(request, env, accountSession) {
  const db = requireDatabase(env);
  const principalId = principalIdForSession(accountSession);
  const row = await db.prepare('SELECT * FROM whop_sessions WHERE admin_session_id = ?').bind(principalId).first();
  await revokeSavedRefreshToken(row, env);

  await db.prepare('DELETE FROM whop_sessions WHERE admin_session_id = ?').bind(principalId).run();
  await db.prepare('DELETE FROM whop_oauth_states WHERE admin_session_id = ?').bind(principalId).run().catch(() => null);
  await db.prepare('DELETE FROM whop_refresh_leases WHERE admin_session_id = ?').bind(principalId).run().catch(() => null);
  return { disconnected: true, principalId };
}
