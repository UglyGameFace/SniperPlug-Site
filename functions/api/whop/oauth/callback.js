import { createSubscriberSession } from '../../../_lib/auth.js';
import { appendCookie, HttpError, redirect } from '../../../_lib/http.js';
import { finishSubscriberWhopOAuth } from '../../../_lib/subscriber-auth.js';
import { disconnectPrincipalWhop } from '../../../_lib/whop-connection.js';
import {
  clearSubscriberWhopOAuthFlowCookie,
  clearWhopOAuthFlowCookie,
  resolveWhopOAuthFlow,
} from '../../../_lib/whop-oauth-flow.js';
import {
  clearWhopSwitchIntentCookie,
  readWhopSwitchIntent,
  whopSwitchReturnedSameAccount,
} from '../../../_lib/whop-switch-intent.js';
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

async function rejectSameAccountSwitch(request, env, intent, accountKind, completed) {
  if (!whopSwitchReturnedSameAccount(intent, completed?.profile || {}, accountKind)) return;
  const principalId = String(
    accountKind === 'subscriber' ? completed?.principalId : completed?.adminSessionId,
  ).trim();
  if (principalId) {
    await disconnectPrincipalWhop(request, env, {
      sid: principalId,
      principalId,
      kind: accountKind,
    }).catch(() => null);
  }
  throw new HttpError(
    409,
    'Whop returned the same account you chose to leave. SniperPlug kept it disconnected. Switch or sign out on Whop, then continue with the different account.',
    { code: 'whop_switch_same_account' },
  );
}

export async function onRequest(context) {
  let response;
  let flowKind = null;
  let switchIntent = null;
  try {
    switchIntent = await readWhopSwitchIntent(context.request, context.env);
    const flow = await resolveWhopOAuthFlow(context.request);
    flowKind = flow.kind;
    if (flow.kind === 'subscriber') {
      const completed = await finishSubscriberWhopOAuth(context.request, context.env);
      await rejectSameAccountSwitch(context.request, context.env, switchIntent, 'subscriber', completed);
      const account = await createSubscriberSession(context.env, completed.profile);
      response = appendCookie(
        redirect(`${new URL(context.request.url).origin}/control-center/?subscriber=connected`),
        account.cookie,
      );
    } else {
      const completed = await finishWhopOAuth(context.request, context.env);
      await rejectSameAccountSwitch(context.request, context.env, switchIntent, 'owner', completed);
      response = redirect(`${new URL(context.request.url).origin}/control-center/?whop=connected#whop-importer`);
    }
  } catch (error) {
    response = oauthErrorRedirect(context.request, error, flowKind);
  }
  response = appendCookie(response, clearWhopOAuthFlowCookie());
  response = appendCookie(response, clearSubscriberWhopOAuthFlowCookie());
  return appendCookie(response, clearWhopSwitchIntentCookie());
}
