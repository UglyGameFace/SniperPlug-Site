import { whopUserIdFromProfile } from './auth.js';
import {
  base64urlDecode,
  base64urlEncode,
  signValue,
  verifyValue,
} from './crypto.js';
import { clearCookie, cookieValue, secureCookie } from './http.js';

const WHOP_SWITCH_INTENT_COOKIE = 'sniperplug_whop_switch_intent';
const WHOP_SWITCH_INTENT_TTL_SECONDS = 10 * 60;
const WHOP_OAUTH_CALLBACK_PATH = '/api/whop/oauth/callback';
const decoder = new TextDecoder('utf-8', { fatal: true });

function switchSecret(env) {
  return String(env?.SNIPERPLUG_SESSION_SECRET || '').trim();
}

function accountKind(value) {
  const kind = String(value || '').trim();
  return kind === 'owner' || kind === 'subscriber' ? kind : '';
}

function principalId(account) {
  return String(account?.principalId || account?.sid || '').trim();
}

export async function whopSwitchIntentCookie(env, account, profile) {
  const previousWhopUserId = whopUserIdFromProfile(profile || {});
  const previousPrincipalId = principalId(account);
  const previousAccountKind = accountKind(account?.kind);
  if (!previousWhopUserId || !previousPrincipalId || !previousAccountKind) return '';

  const payload = base64urlEncode(JSON.stringify({
    v: 1,
    previousWhopUserId,
    previousPrincipalId,
    accountKind: previousAccountKind,
    expiresAt: Date.now() + (WHOP_SWITCH_INTENT_TTL_SECONDS * 1000),
  }));
  const signature = await signValue(payload, switchSecret(env));
  return secureCookie(
    WHOP_SWITCH_INTENT_COOKIE,
    `${payload}.${signature}`,
    WHOP_SWITCH_INTENT_TTL_SECONDS,
    { sameSite: 'Lax', path: WHOP_OAUTH_CALLBACK_PATH },
  );
}

export async function readWhopSwitchIntent(request, env) {
  const raw = cookieValue(request, WHOP_SWITCH_INTENT_COOKIE);
  if (!raw) return null;
  const [payload, signature] = String(raw).split('.', 2);
  if (!payload || !signature || !(await verifyValue(payload, signature, switchSecret(env)))) return null;

  try {
    const parsed = JSON.parse(decoder.decode(base64urlDecode(payload)));
    const previousWhopUserId = whopUserIdFromProfile({ sub: parsed?.previousWhopUserId });
    const previousPrincipalId = String(parsed?.previousPrincipalId || '').trim();
    const previousAccountKind = accountKind(parsed?.accountKind);
    if (
      parsed?.v !== 1
      || !previousWhopUserId
      || !previousPrincipalId
      || !previousAccountKind
      || Number(parsed?.expiresAt || 0) <= Date.now()
    ) return null;
    return {
      previousWhopUserId,
      previousPrincipalId,
      accountKind: previousAccountKind,
      expiresAt: Number(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

export function clearWhopSwitchIntentCookie() {
  return clearCookie(WHOP_SWITCH_INTENT_COOKIE, {
    sameSite: 'Lax',
    path: WHOP_OAUTH_CALLBACK_PATH,
  });
}

export function whopSwitchReturnedSameAccount(intent, profile, expectedAccountKind) {
  if (!intent || intent.accountKind !== accountKind(expectedAccountKind)) return false;
  const currentWhopUserId = whopUserIdFromProfile(profile || {});
  return Boolean(currentWhopUserId && currentWhopUserId === intent.previousWhopUserId);
}
