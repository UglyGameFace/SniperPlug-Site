import { createSubscriberSession } from '../../../_lib/auth.js';
import { appendCookie, redirect } from '../../../_lib/http.js';
import { finishSubscriberWhopOAuth } from '../../../_lib/subscriber-auth.js';
import {
  clearSubscriberWhopOAuthFlowCookie,
  clearWhopOAuthFlowCookie,
  resolveWhopOAuthFlow,
} from '../../../_lib/whop-oauth-flow.js';
import { finishWhopOAuth } from '../../../_lib/whop.js';

function oauthErrorRedirect(request, error, flowKind = null) {
  const url = new URL('/control-center/', request.url);
  if (flowKind === 'subscriber') {
    url.searchParams.set('subscriber', 'error');
  } else {
    url.searchParams.set('whop', 'error');
    url.hash = 'whop-importer';
  }
  url.searchParams.set('message', String(error?.message || 'Whop connection failed.').slice(0, 180));
  return redirect(url.toString());
}

export async function onRequest(context) {
  let response;
  let flowKind = null;
  try {
    const flow = await resolveWhopOAuthFlow(context.request);
    flowKind = flow.kind;
    if (flow.kind === 'subscriber') {
      const completed = await finishSubscriberWhopOAuth(context.request, context.env);
      const account = await createSubscriberSession(context.env, completed.profile);
      response = appendCookie(
        redirect(`${new URL(context.request.url).origin}/control-center/?subscriber=connected`),
        account.cookie,
      );
    } else {
      await finishWhopOAuth(context.request, context.env);
      response = redirect(`${new URL(context.request.url).origin}/control-center/?whop=connected#whop-importer`);
    }
  } catch (error) {
    response = oauthErrorRedirect(context.request, error, flowKind);
  }
  response = appendCookie(response, clearWhopOAuthFlowCookie());
  return appendCookie(response, clearSubscriberWhopOAuthFlowCookie());
}
