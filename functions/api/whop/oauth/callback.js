import { redirect } from '../../../_lib/http.js';
import { finishWhopOAuth } from '../../../_lib/whop.js';

export async function onRequest(context) {
  try {
    await finishWhopOAuth(context.request, context.env);
    return redirect(`${new URL(context.request.url).origin}/control-center/?whop=connected#whop-importer`);
  } catch (error) {
    const url = new URL('/control-center/', context.request.url);
    url.searchParams.set('whop', 'error');
    url.searchParams.set('message', String(error?.message || 'Whop login failed.').slice(0, 180));
    url.hash = 'whop-importer';
    return redirect(url.toString());
  }
}
