import {
  base64urlDecode,
  base64urlEncode,
  constantTimeTextEqual,
  randomToken,
  signValue,
  verifyValue,
} from './crypto.js';
import {
  clearCookie,
  cookieValue,
  HttpError,
  secureCookie,
} from './http.js';

const ADMIN_COOKIE = 'sniperplug_admin';
const ADMIN_TTL_SECONDS = 12 * 60 * 60;
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

export async function verifyAdminPassword(env, submitted) {
  return constantTimeTextEqual(String(submitted || ''), adminPassword(env));
}

export async function createAdminSession(env) {
  const session = {
    v: 1,
    sid: randomToken(24),
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
  return session;
}

export function clearAdminSession() {
  return clearCookie(ADMIN_COOKIE);
}
