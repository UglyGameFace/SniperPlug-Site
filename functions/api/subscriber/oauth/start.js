import { appendCookie, redirect } from '../../../_lib/http.js';
import { subscriberWhopOAuthFlowCookie } from '../../../_lib/whop-oauth-flow.js';
import { beginSubscriberWhopOAuth } from '../../../_lib/subscriber-auth.js';

function subscriberStartError(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('subscriber', 'error');
  url.searchParams.set('message', String(error?.message || 'Paid subscriber sign-in could not start.').slice(0, 180));
  return redirect(url.toString());
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    const { authorizationUrl } = await beginSubscriberWhopOAuth(context.request, context.env);
    const state = new URL(authorizationUrl).searchParams.get('state');
    return appendCookie(redirect(authorizationUrl), subscriberWhopOAuthFlowCookie(state));
  } catch (error) {
    return subscriberStartError(context.request, error);
  }
}
