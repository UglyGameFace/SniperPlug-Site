import {
  requireAccount,
  subscriberPrincipalIdForUser,
  whopUserIdFromProfile,
} from './auth.js';
import { randomToken } from './crypto.js';
import { loadWhopMemberships, membershipGrantsAccess } from './discovery.js';
import { HttpError, requireDatabase } from './http.js';
import { disconnectPrincipalWhop } from './whop-connection.js';
import { beginWhopOAuth, finishWhopOAuth, requireWhopSession } from './whop.js';

const PENDING_SUBSCRIBER_PREFIX = 'subscriber-pending:';
const ENTITLEMENT_CACHE_MS = 60_000;
const entitlementCache = new Map();

function exactProductId(value) {
  const productId = String(value || '').trim();
  return /^prod_[A-Za-z0-9_-]+$/.test(productId) ? productId : '';
}

export function subscriberProductId(env) {
  const productId = exactProductId(env?.WHOP_IMPORTER_PRODUCT_ID);
  if (!productId) {
    throw new HttpError(503, 'Paid subscriber access is not enabled because WHOP_IMPORTER_PRODUCT_ID is not configured with an exact Whop product ID.', {
      code: 'subscriber_product_unconfigured',
    });
  }
  return productId;
}

function membershipProductId(membership) {
  return exactProductId(membership?.product?.id) || exactProductId(membership?.product_id);
}

async function readSubscriberEntitlement(whopSession, productId) {
  let memberships;
  try {
    memberships = await loadWhopMemberships(whopSession);
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) {
      throw new HttpError(403, 'Whop could not verify this account’s SniperPlug importer entitlement. Sign in again with the account that owns the subscription.', {
        code: 'subscriber_entitlement_unauthorized',
      });
    }
    throw new HttpError(503, 'SniperPlug could not confirm the paid Whop entitlement right now, so subscriber access remains locked instead of guessing.', {
      code: 'subscriber_entitlement_unavailable',
      cause: String(error?.message || error || 'Whop membership verification failed.').slice(0, 240),
    });
  }

  const membership = memberships.find((entry) => (
    membershipProductId(entry) === productId
    && membershipGrantsAccess(entry)
  ));
  if (!membership) {
    throw new HttpError(403, 'This Whop account does not currently have access to the SniperPlug importer product.', {
      code: 'subscriber_entitlement_required',
      productId,
    });
  }

  return {
    productId,
    membershipId: String(membership?.id || '').trim() || null,
    status: String(membership?.status || '').trim().toLowerCase() || null,
    cancelationStatus: String(membership?.cancelation_status || membership?.cancellation_status || '').trim().toLowerCase() || null,
    verifiedAt: new Date().toISOString(),
  };
}

export async function verifySubscriberEntitlement(whopSession, env) {
  const productId = subscriberProductId(env);
  const whopUserId = whopUserIdFromProfile(whopSession?.profile || {});
  if (!whopUserId) {
    throw new HttpError(403, 'Whop did not return the stable user identity required for subscriber entitlement verification.', {
      code: 'subscriber_identity_missing',
    });
  }
  const cacheKey = `${whopUserId}:${productId}:${Number(whopSession?.tokenVersion || 1)}`;
  const cached = entitlementCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = readSubscriberEntitlement(whopSession, productId);
  entitlementCache.set(cacheKey, { promise, expiresAt: Date.now() + ENTITLEMENT_CACHE_MS });
  try {
    return await promise;
  } catch (error) {
    entitlementCache.delete(cacheKey);
    throw error;
  }
}

export async function requireImporterAccount(request, env) {
  const account = await requireAccount(request, env);
  if (account.kind === 'owner') return account;
  if (account.kind !== 'subscriber') throw new HttpError(403, 'This SniperPlug account type cannot use the importer.');

  const whopSession = await requireWhopSession(request, env, account);
  const whopUserId = whopUserIdFromProfile(whopSession.profile || {});
  if (!whopUserId || whopUserId !== String(account.whopUserId || '')) {
    throw new HttpError(403, 'The connected Whop account no longer matches this paid subscriber workspace. Sign out and authenticate again.', {
      code: 'subscriber_identity_mismatch',
    });
  }
  if (subscriberPrincipalIdForUser(whopUserId) !== account.principalId) {
    throw new HttpError(403, 'The paid subscriber principal no longer matches the connected Whop identity. Sign in again.', {
      code: 'subscriber_principal_mismatch',
    });
  }
  return { ...account, entitlement: await verifySubscriberEntitlement(whopSession, env) };
}

function pendingSubscriberKey() {
  return `${PENDING_SUBSCRIBER_PREFIX}${randomToken(24)}`;
}

export function isPendingSubscriberPrincipal(value) {
  return String(value || '').startsWith(PENDING_SUBSCRIBER_PREFIX);
}

export async function beginSubscriberWhopOAuth(request, env) {
  const pendingPrincipalId = pendingSubscriberKey();
  const authorizationUrl = await beginWhopOAuth(request, env, {
    sid: pendingPrincipalId,
    principalId: pendingPrincipalId,
    kind: 'subscriber-bootstrap',
  });
  return { authorizationUrl, pendingPrincipalId };
}

async function pendingPrincipalForState(request, env) {
  const state = String(new URL(request.url).searchParams.get('state') || '').trim();
  if (!state) throw new HttpError(401, 'The paid subscriber Whop return is missing its one-time state. Start sign-in again.');
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT admin_session_id, expires_at FROM whop_oauth_states WHERE state = ?').bind(state).first();
  const pendingPrincipalId = String(row?.admin_session_id || '').trim();
  if (!row || Date.parse(row.expires_at) <= Date.now() || !isPendingSubscriberPrincipal(pendingPrincipalId)) {
    throw new HttpError(401, 'The Whop return does not belong to a live paid-subscriber sign-in. Start sign-in again.', {
      code: 'subscriber_oauth_state_invalid',
    });
  }
  return pendingPrincipalId;
}

async function promotePendingWhopSession(env, pendingPrincipalId, principalId) {
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM whop_sessions WHERE admin_session_id = ?').bind(pendingPrincipalId).first();
  if (!row) {
    throw new HttpError(409, 'Whop sign-in completed, but the verified subscriber connection could not be found for promotion.', {
      code: 'subscriber_whop_session_missing',
    });
  }
  const now = new Date().toISOString();
  const writes = [
    db.prepare(`
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
        token_version = whop_sessions.token_version + 1,
        updated_at = excluded.updated_at
    `).bind(
      principalId,
      row.access_cipher,
      row.refresh_cipher,
      row.token_type,
      row.scopes,
      row.expires_at,
      row.user_json,
      Math.max(1, Number(row.token_version || 1)),
      row.created_at || now,
      now,
    ),
    db.prepare('DELETE FROM whop_sessions WHERE admin_session_id = ?').bind(pendingPrincipalId),
    db.prepare('DELETE FROM whop_oauth_states WHERE admin_session_id = ?').bind(pendingPrincipalId),
    db.prepare('DELETE FROM whop_refresh_leases WHERE admin_session_id = ?').bind(pendingPrincipalId),
  ];
  await db.batch(writes);
  const promoted = await db.prepare('SELECT admin_session_id, user_json FROM whop_sessions WHERE admin_session_id = ?').bind(principalId).first();
  if (!promoted || String(promoted.admin_session_id || '') !== principalId) {
    throw new HttpError(409, 'SniperPlug could not confirm the subscriber Whop connection under the stable account principal.', {
      code: 'subscriber_session_promotion_unconfirmed',
    });
  }
}

export async function finishSubscriberWhopOAuth(request, env) {
  const pendingPrincipalId = await pendingPrincipalForState(request, env);
  let completed = false;
  try {
    const result = await finishWhopOAuth(request, env);
    if (String(result?.adminSessionId || '') !== pendingPrincipalId) {
      throw new HttpError(403, 'The Whop callback changed subscriber identity during sign-in.', {
        code: 'subscriber_oauth_principal_mismatch',
      });
    }
    completed = true;

    const pendingAccount = { sid: pendingPrincipalId, principalId: pendingPrincipalId, kind: 'subscriber-bootstrap' };
    const whopSession = await requireWhopSession(request, env, pendingAccount);
    const profile = whopSession.profile || result.profile || {};
    const whopUserId = whopUserIdFromProfile(profile);
    const principalId = subscriberPrincipalIdForUser(whopUserId);
    const entitlement = await verifySubscriberEntitlement(whopSession, env);

    await promotePendingWhopSession(env, pendingPrincipalId, principalId);
    return { principalId, whopUserId, profile, entitlement };
  } catch (error) {
    if (completed) {
      await disconnectPrincipalWhop(request, env, {
        sid: pendingPrincipalId,
        principalId: pendingPrincipalId,
        kind: 'subscriber-bootstrap',
      }).catch(() => null);
    }
    throw error;
  }
}

export function clearSubscriberEntitlementCacheForTests() {
  entitlementCache.clear();
}
