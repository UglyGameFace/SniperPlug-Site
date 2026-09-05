import { constantTimeTextEqual } from './crypto.js';
import { clearCookie, cookieValue, HttpError, secureCookie } from './http.js';

const WHOP_OAUTH_CALLBACK_PATH = '/api/whop/oauth/callback';
const WHOP_OAUTH_FLOW_COOKIE = 'sniperplug_whop_oauth';
const SUBSCRIBER_OAUTH_FLOW_COOKIE = 'sniperplug_subscriber_oauth';
const WHOP_OAUTH_FLOW_TTL_SECONDS = 10 * 60;

function exactState(value) {
  return String(value || '').trim();
}

function flowCookie(name, state) {
  const value = exactState(state);
  if (!value) throw new HttpError(500, 'Whop OAuth state was not created.');
  return secureCookie(name, value, WHOP_OAUTH_FLOW_TTL_SECONDS, {
    sameSite: 'Lax',
    path: WHOP_OAUTH_CALLBACK_PATH,
  });
}

function clearFlowCookie(name) {
  return clearCookie(name, {
    sameSite: 'Lax',
    path: WHOP_OAUTH_CALLBACK_PATH,
  });
}

export function whopOAuthFlowCookie(state) {
  return flowCookie(WHOP_OAUTH_FLOW_COOKIE, state);
}

export function subscriberWhopOAuthFlowCookie(state) {
  return flowCookie(SUBSCRIBER_OAUTH_FLOW_COOKIE, state);
}

export function clearWhopOAuthFlowCookie() {
  return clearFlowCookie(WHOP_OAUTH_FLOW_COOKIE);
}

export function clearSubscriberWhopOAuthFlowCookie() {
  return clearFlowCookie(SUBSCRIBER_OAUTH_FLOW_COOKIE);
}

async function stateMatchesCookie(request, cookieName) {
  const state = exactState(new URL(request.url).searchParams.get('state'));
  const cookieState = exactState(cookieValue(request, cookieName));
  return Boolean(state && cookieState && await constantTimeTextEqual(state, cookieState));
}

export async function requireWhopOAuthFlow(request) {
  if (!(await stateMatchesCookie(request, WHOP_OAUTH_FLOW_COOKIE))) {
    throw new HttpError(401, 'The Whop authorization return could not be matched to the connection you started. Start the connection again.');
  }
  return exactState(new URL(request.url).searchParams.get('state'));
}

export async function requireSubscriberWhopOAuthFlow(request) {
  if (!(await stateMatchesCookie(request, SUBSCRIBER_OAUTH_FLOW_COOKIE))) {
    throw new HttpError(401, 'The paid subscriber Whop return could not be matched to the sign-in you started. Start sign-in again.');
  }
  return exactState(new URL(request.url).searchParams.get('state'));
}

export async function resolveWhopOAuthFlow(request) {
  const subscriber = await stateMatchesCookie(request, SUBSCRIBER_OAUTH_FLOW_COOKIE);
  const accountConnection = await stateMatchesCookie(request, WHOP_OAUTH_FLOW_COOKIE);
  if (subscriber && accountConnection) {
    throw new HttpError(401, 'The Whop return matches more than one browser flow. Start the intended sign-in again.', {
      code: 'whop_oauth_flow_ambiguous',
    });
  }
  if (subscriber) return { kind: 'subscriber', state: exactState(new URL(request.url).searchParams.get('state')) };
  if (accountConnection) return { kind: 'account-connection', state: exactState(new URL(request.url).searchParams.get('state')) };
  throw new HttpError(401, 'The Whop authorization return could not be matched to a SniperPlug browser flow. Start again.');
}
