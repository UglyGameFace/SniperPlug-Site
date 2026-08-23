import { requireAdmin } from '../_lib/auth.js';
import { redirect, requireDatabase } from '../_lib/http.js';
import { beginWhopOAuth, disconnectWhop } from '../_lib/whop.js';

function backToControlCenter(request, error) {
  const url = new URL('/control-center/', request.url);
  url.searchParams.set('whop', 'error');
  url.searchParams.set('message', String(error?.message || 'Whop account switch could not start.').slice(0, 180));
  url.hash = 'whop-importer';
  return redirect(url.toString());
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (admin.kind !== 'owner') throw new Error('Unlock the Control Center with the owner password before switching Whop accounts.');

    // Revoke/delete the current owner token first. Local cleanup is authoritative;
    // a temporary Whop revoke failure must never keep the old account attached.
    await disconnectWhop(context.request, context.env, admin).catch(() => null);

    // Older customer/legacy rows can otherwise be adopted back into the owner
    // session by compatibility migration on the next dashboard request. The
    // Control Center is password-owner-only now, so purge all obsolete OAuth
    // sessions and pending states before beginning a replacement connection.
    const db = requireDatabase(context.env);
    await db.prepare('DELETE FROM whop_oauth_states').run();
    await db.prepare('DELETE FROM whop_refresh_leases').run().catch(() => null);
    await db.prepare('DELETE FROM whop_sessions').run();

    const oauthUrl = new URL(await beginWhopOAuth(context.request, context.env, admin));
    oauthUrl.searchParams.set('prompt', 'select_account');
    oauthUrl.searchParams.set('max_age', '0');
    return redirect(oauthUrl.toString());
  } catch (error) {
    return backToControlCenter(context.request, error);
  }
}
