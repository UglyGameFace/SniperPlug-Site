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
const OWNER_SESSION_ID = 'sniperplug-owner';
const ADMIN_TTL_SECONDS = 12 * 60 * 60;
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

async function loginClientKey(request) {
  const address = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]
    || 'unknown';
  return sha256(`sniperplug-control:${String(address).trim().slice(0, 128)}`);
}

async function migrateOwnerWhopSession(env, legacySessionId) {
  const db = requireDatabase(env);
  try {
    const owner = await db.prepare('SELECT admin_session_id FROM whop_sessions WHERE admin_session_id = ?')
      .bind(OWNER_SESSION_ID)
      .first();
    if (owner) return;

    let legacy = null;
    if (legacySessionId && legacySessionId !== OWNER_SESSION_ID) {
      legacy = await db.prepare('SELECT * FROM whop_sessions WHERE admin_session_id = ?')
        .bind(legacySessionId)
        .first();
    }
    if (!legacy) legacy = await db.prepare('SELECT * FROM whop_sessions ORDER BY updated_at DESC LIMIT 1').first();
    if (!legacy) return;

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
        token_version = excluded.token_version,
        updated_at = excluded.updated_at
    `).bind(
      OWNER_SESSION_ID,
      legacy.access_cipher,
      legacy.refresh_cipher,
      legacy.token_type,
      legacy.scopes,
      legacy.expires_at,
      legacy.user_json,
      legacy.token_version,
      legacy.created_at,
      legacy.updated_at,
    ).run();
    await db.prepare('DELETE FROM whop_sessions WHERE admin_session_id <> ?').bind(OWNER_SESSION_ID).run();
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('no such table') && message.includes('whop_sessions')) return;
    throw error;
  }
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
  const session = {
    v: 1,
    sid: OWNER_SESSION_ID,
    nonce: randomToken(24),
    issuedAt: Date.now(),
    expiresAt: Date.now() + ADMIN_TTL_SECONDS * 1000,
  };
  const payload = base64urlEncode(JSON.stringify(session));
  const signature = await signValue(payload, sessionSecret(env));
  return {
    session,
    cookie: secureCookie(ADMIN_COOKIE, `${payload}.${signature}`, ADMIN_TTL_SECONDS),
  };
}

export async function readAdminSession(request, env) {
  try {
    const [payload, signature] = cookieValue(request, ADMIN_COOKIE).split('.', 2);
    if (!payload || !signature || !(await verifyValue(payload, signature, sessionSecret(env)))) return null;
    const session = JSON.parse(textDecoder.decode(base64urlDecode(payload)));
    if (session?.v !== 1 || !session.sid || Number(session.expiresAt) <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function requireAdmin(request, env) {
  const session = await readAdminSession(request, env);
  if (!session) throw new HttpError(401, 'Unlock the SniperPlug Control Center first.');
  await migrateOwnerWhopSession(env, session.sid);
  return { ...session, legacySid: session.sid, sid: OWNER_SESSION_ID };
}

export function clearAdminSession() {
  return clearCookie(ADMIN_COOKIE);
}
