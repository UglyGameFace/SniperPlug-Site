import { constantTimeTextEqual } from './crypto.js';
import { clearCookie, cookieValue, HttpError, secureCookie } from './http.js';

const WHOP_OAUTH_CALLBACK_PATH = '/api/whop/oauth/callback';
const WHOP_OAUTH_FLOW_COOKIE = 'sniperplug_whop_oauth';
const WHOP_OAUTH_FLOW_TTL_SECONDS = 10 * 60;

function exactState(value) {
  return String(value || '').trim();
}

export function whopOAuthFlowCookie(state) {
  const value = exactState(state);
  if (!value) throw new HttpError(500, 'Whop OAuth state was not created.');
  return secureCookie(WHOP_OAUTH_FLOW_COOKIE, value, WHOP_OAUTH_FLOW_TTL_SECONDS, {
    sameSite: 'Lax',
    path: WHOP_OAUTH_CALLBACK_PATH,
  });
}

export function clearWhopOAuthFlowCookie() {
  return clearCookie(WHOP_OAUTH_FLOW_COOKIE, {
    sameSite: 'Lax',
    path: WHOP_OAUTH_CALLBACK_PATH,
  });
}

export async function requireWhopOAuthFlow(request) {
  const state = exactState(new URL(request.url).searchParams.get('state'));
  const cookieState = exactState(cookieValue(request, WHOP_OAUTH_FLOW_COOKIE));
  if (!state || !cookieState || !(await constantTimeTextEqual(state, cookieState))) {
    throw new HttpError(401, 'The Whop authorization return could not be matched to the connection you started. Start the connection again.');
  }
  return state;
}
