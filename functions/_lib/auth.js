import {
  base64urlDecode,
  base64urlEncode,
  constantTimeTextEqual,
  randomToken,
  sha256,
  signValue,
  verifyValue,
} from './crypto.js';
import {
  clearCookie,
  cookieValue,
  HttpError,
  requireDatabase,
  secureCookie,
} from './http.js';

const ADMIN_COOKIE = 'sniperplug_admin';
export const OWNER_PRINCIPAL_ID = 'sniperplug-owner';
export const SUBSCRIBER_PRINCIPAL_PREFIX = 'whop-user:';
// Backward-compatible alias. Existing importer code historically called the
// account principal a "session id"; browserSid now carries the real per-login id.
export const OWNER_SESSION_ID = OWNER_PRINCIPAL_ID;
const ACCOUNT_TTL_SECONDS = 12 * 60 * 60;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const textDecoder = new TextDecoder();

function sessionSecret(env) {
  const secret = String(env?.SNIPERPLUG_SESSION_SECRET || '').trim();
  if (!secret) throw new HttpError(503, 'SNIPERPLUG_SESSION_SECRET is not configured.');
  return secret;
}

function adminPassword(env) {
  const password = String(env?.SNIPERPLUG_ADMIN_PASSWORD || '').trim();
  if (!password) throw new HttpError(503, 'SNIPERPLUG_ADMIN_PASSWORD is not configured.');
  return password;
}

function exactWhopUserId(value) {
  const userId = String(value || '').trim();
  return /^user_[A-Za-z0-9_-]+$/.test(userId) ? userId : '';
}

export function whopUserIdFromProfile(profile) {
  return exactWhopUserId(profile?.sub) || exactWhopUserId(profile?.id);
}

export function subscriberPrincipalIdForUser(value) {
  const userId = exactWhopUserId(value);
  if (!userId) throw new HttpError(403, 'Whop did not return a stable user identity for this subscriber.', {
    code: 'subscriber_identity_missing',
  });
  return `${SUBSCRIBER_PRINCIPAL_PREFIX}${userId}`;
}

async function signedAccountSession(env, session) {
  const payload = base64urlEncode(JSON.stringify(session));
  const signature = await signValue(payload, sessionSecret(env));
  return {
    session,
    cookie: secureCookie(ADMIN_COOKIE, `${payload}.${signature}`, ACCOUNT_TTL_SECONDS),
  };
}

async function loginClientKey(request) {
  const address = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]
    || 'unknown';
  return sha256(`sniperplug-control:${String(address).trim().slice(0, 128)}`);
}

export async function checkLoginThrottle(request, env) {
  const db = requireDatabase(env);
  const key = await loginClientKey(request);
  const row = await db.prepare('SELECT * FROM admin_login_attempts WHERE client_key = ?').bind(key).first();
  const blockedUntil = row?.blocked_until ? Date.parse(row.blocked_until) : 0;
  if (blockedUntil > Date.now()) {
    throw new HttpError(429, `Too many failed login attempts. Try again in ${Math.max(1, Math.ceil((blockedUntil - Date.now()) / 60000))} minute(s).`);
  }
  return key;
}

export async function recordLoginFailure(request, env) {
  const db = requireDatabase(env);
  const key = await loginClientKey(request);
  const row = await db.prepare('SELECT * FROM admin_login_attempts WHERE client_key = ?').bind(key).first();
  const now = Date.now();
  const windowStarted = row?.window_started_at ? Date.parse(row.window_started_at) : 0;
  const withinWindow = windowStarted > 0 && now - windowStarted < LOGIN_WINDOW_MS;
  const failures = withinWindow ? Number(row.failures || 0) + 1 : 1;
  const windowStartedAt = new Date(withinWindow ? windowStarted : now).toISOString();
  const blockedUntil = failures >= LOGIN_MAX_FAILURES ? new Date(now + LOGIN_BLOCK_MS).toISOString() : null;
  await db.prepare(`
    INSERT INTO admin_login_attempts (client_key, failures, window_started_at, blocked_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(client_key) DO UPDATE SET
      failures = excluded.failures,
      window_started_at = excluded.window_started_at,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at
  `).bind(key, failures, windowStartedAt, blockedUntil, new Date(now).toISOString()).run();
  return { failures, blockedUntil };
}

export async function clearLoginFailures(request, env) {
  const db = requireDatabase(env);
  await db.prepare('DELETE FROM admin_login_attempts WHERE client_key = ?').bind(await loginClientKey(request)).run();
}

export async function verifyAdminPassword(env, submitted) {
  return constantTimeTextEqual(String(submitted || ''), adminPassword(env));
}

export async function createAdminSession(env) {
  return signedAccountSession(env, {
    v: 4,
    // `sid` remains the stable account/principal storage key for compatibility
    // with the existing importer. `browserSid` is the actual login-session id.
    sid: OWNER_PRINCIPAL_ID,
    principalId: OWNER_PRINCIPAL_ID,
    browserSid: `admin_${randomToken(24)}`,
    kind: 'owner',
    nonce: randomToken(24),
    issuedAt: Date.now(),
    expiresAt: Date.now() + ACCOUNT_TTL_SECONDS * 1000,
  });
}

export async function createSubscriberSession(env, profile) {
  const whopUserId = whopUserIdFromProfile(profile);
  const principalId = subscriberPrincipalIdForUser(whopUserId);
  return signedAccountSession(env, {
    v: 5,
    sid: principalId,
    principalId,
    browserSid: `subscriber_${randomToken(24)}`,
    kind: 'subscriber',
    whopUserId,
    nonce: randomToken(24),
    issuedAt: Date.now(),
    expiresAt: Date.now() + ACCOUNT_TTL_SECONDS * 1000,
  });
}

export async function readAccountSession(request, env) {
  try {
    const [payload, signature] = cookieValue(request, ADMIN_COOKIE).split('.', 2);
    if (!payload || !signature || !(await verifyValue(payload, signature, sessionSecret(env)))) return null;
    const session = JSON.parse(textDecoder.decode(base64urlDecode(payload)));
    if (![1, 2, 3, 4, 5].includes(session?.v) || Number(session.expiresAt) <= Date.now()) return null;

    // Legacy cookies and the current owner cookie remain owner-only. They are
    // normalized onto the stable owner principal until they expire naturally.
    if (session.v <= 4) {
      if (session.v > 1 && (session.sid !== OWNER_PRINCIPAL_ID || session.kind !== 'owner')) return null;
      if (session.v === 4) {
        if (session.principalId !== OWNER_PRINCIPAL_ID || session.sid !== session.principalId) return null;
        if (!/^admin_[A-Za-z0-9_-]{16,}$/.test(String(session.browserSid || ''))) return null;
        return session;
      }
      return {
        ...session,
        sid: OWNER_PRINCIPAL_ID,
        principalId: OWNER_PRINCIPAL_ID,
        browserSid: `legacy_${String(session.nonce || 'owner')}`,
        kind: 'owner',
      };
    }

    if (session.kind !== 'subscriber') return null;
    const whopUserId = exactWhopUserId(session.whopUserId);
    if (!whopUserId) return null;
    const principalId = subscriberPrincipalIdForUser(whopUserId);
    if (session.principalId !== principalId || session.sid !== principalId) return null;
    if (!/^subscriber_[A-Za-z0-9_-]{16,}$/.test(String(session.browserSid || ''))) return null;
    return session;
  } catch {
    return null;
  }
}

export async function readAdminSession(request, env) {
  const session = await readAccountSession(request, env);
  return session?.kind === 'owner' ? session : null;
}

export async function requireAccount(request, env) {
  const session = await readAccountSession(request, env);
  if (!session) throw new HttpError(401, 'Sign in to the SniperPlug Control Center first.');
  return session;
}

export async function requireAdmin(request, env) {
  const session = await requireAccount(request, env);
  if (session.kind !== 'owner' || session.principalId !== OWNER_PRINCIPAL_ID) {
    throw new HttpError(403, 'This action is restricted to the SniperPlug owner account.');
  }
  return session;
}

export function clearAdminSession() {
  return clearCookie(ADMIN_COOKIE);
}

export const clearAccountSession = clearAdminSession;
