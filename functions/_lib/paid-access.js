import { requireWhopSession } from './whop.js';
import { HttpError } from './http.js';

const WHOP_API_BASE = 'https://api.whop.com/api/v1';
const WHOP_V5_BASE = 'https://api.whop.com/api/v5';
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const ACCESS_CACHE_MS = 60_000;
const cache = new Map();

function required(env, name) {
  const value = String(env?.[name] || '').trim();
  if (!value) throw new HttpError(503, `${name} is required before customer access to the Whop importer can be enabled.`, { code: 'paid_access_configuration_missing', setting: name });
  return value;
}

function customerConfig(env) {
  const productId = required(env, 'WHOP_IMPORTER_PRODUCT_ID');
  if (!/^prod_[A-Za-z0-9_-]+$/.test(productId)) throw new HttpError(503, 'WHOP_IMPORTER_PRODUCT_ID must be an exact Whop product ID.', { code: 'paid_access_product_invalid' });
  const guildIds = required(env, 'SNIPERPLUG_REQUIRED_DISCORD_GUILD_IDS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!guildIds.length || guildIds.some((value) => !/^\d{15,22}$/.test(value))) {
    throw new HttpError(503, 'SNIPERPLUG_REQUIRED_DISCORD_GUILD_IDS must contain one or more comma-separated Discord guild IDs.', { code: 'paid_access_guilds_invalid' });
  }
  return {
    productId,
    guildIds: [...new Set(guildIds)],
    whopApiKey: required(env, 'WHOP_API_KEY'),
    discordBotToken: required(env, 'DISCORD_BOT_TOKEN'),
  };
}

async function jsonFetch(url, options, errorMessage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new HttpError(504, `${errorMessage} timed out. Access remains locked until it can be verified.`, { code: 'paid_access_check_timeout' });
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function customerWhopSession(request, env, adminSession) {
  let session;
  try {
    session = await requireWhopSession(request, env, adminSession);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      throw new HttpError(401, 'Connect the same Whop account that purchased the importer.', {
        code: 'paid_access_whop_session_missing',
      });
    }
    throw error;
  }
  const profile = session.profile && typeof session.profile === 'object' ? session.profile : {};
  const userId = String(profile?.sub || profile?.id || adminSession.whopUserId || '').trim();
  if (!/^user_[A-Za-z0-9_-]+$/.test(userId)) throw new HttpError(403, 'Whop did not provide a valid user identity for this importer session.', { code: 'paid_access_user_missing' });
  if (adminSession.whopUserId && String(adminSession.whopUserId) !== userId) throw new HttpError(403, 'This browser session belongs to a different Whop account.', { code: 'paid_access_identity_mismatch' });
  return { accessToken: session.accessToken, userId, profile };
}

async function verifyMembership(session, cfg) {
  const url = new URL(`${WHOP_API_BASE}/memberships`);
  url.searchParams.set('user_id', session.userId);
  url.searchParams.set('product_id', cfg.productId);
  url.searchParams.set('first', '20');
  const { response, body } = await jsonFetch(url, { headers: { authorization: `Bearer ${session.accessToken}` } }, 'Whop membership verification');
  if (response.status === 401 || response.status === 403) throw new HttpError(403, 'Whop could not verify this account’s importer membership. Sign in again with the purchasing account.', { code: 'paid_access_membership_unauthorized' });
  if (!response.ok) throw new HttpError(502, 'Whop membership verification is temporarily unavailable. Access remains locked rather than guessing.', { code: 'paid_access_membership_unavailable', status: response.status });
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  const validStatuses = new Set(['active', 'trialing', 'completed']);
  const membership = rows.find((row) => String(row?.product?.id || row?.product_id || '') === cfg.productId && validStatuses.has(String(row?.status || '').toLowerCase()));
  if (!membership) throw new HttpError(403, 'This Whop account does not currently have access to the SniperPlug importer product.', { code: 'paid_access_membership_required', productId: cfg.productId });
  return { membershipId: membership.id || null, membershipStatus: membership.status || null };
}

async function linkedDiscordAccount(userId, cfg) {
  const { response, body } = await jsonFetch(
    `${WHOP_V5_BASE}/company/users/${encodeURIComponent(userId)}/social_accounts`,
    { headers: { authorization: `Bearer ${cfg.whopApiKey}` } },
    'Whop linked Discord verification',
  );
  if (response.status === 401 || response.status === 403) throw new HttpError(503, 'The server-side Whop API key cannot read linked Discord accounts. Update the app permissions before selling access.', { code: 'paid_access_whop_app_permission_missing' });
  if (!response.ok) throw new HttpError(502, 'Whop could not verify the linked Discord account. Access remains locked.', { code: 'paid_access_discord_identity_unavailable', status: response.status });
  const accounts = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  const discord = accounts.find((account) => String(account?.service || '').toLowerCase() === 'discord' && /^\d{15,22}$/.test(String(account?.account_id || '')));
  if (!discord) throw new HttpError(403, 'Connect a Discord account to this Whop account before using the importer.', { code: 'paid_access_discord_not_linked' });
  return { id: String(discord.account_id), username: discord.username || null };
}

async function verifyDiscordGuilds(discordUserId, cfg) {
  const missing = [];
  for (const guildId of cfg.guildIds) {
    const { response } = await jsonFetch(
      `${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}`,
      { headers: { authorization: `Bot ${cfg.discordBotToken}` } },
      'Discord server membership verification',
    );
    if (response.status === 404) {
      missing.push(guildId);
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new HttpError(503, 'The Discord bot cannot verify required-server membership. Ensure it is in every configured server and the token is correct.', { code: 'paid_access_discord_bot_unavailable', guildId });
    if (!response.ok) throw new HttpError(502, 'Discord membership verification is temporarily unavailable. Access remains locked.', { code: 'paid_access_discord_unavailable', guildId, status: response.status });
  }
  if (missing.length) throw new HttpError(403, 'The Discord account linked to Whop is not inside every server required for importer access.', { code: 'paid_access_discord_membership_required', missingGuildIds: missing });
  return { guildIds: cfg.guildIds };
}

export function isCustomerSession(session) {
  return session?.kind === 'customer' && /^whop-user:user_[A-Za-z0-9_-]+$/.test(String(session?.sid || ''));
}

export async function assertPaidImporterAccess(request, env, adminSession) {
  if (!isCustomerSession(adminSession)) return { owner: true };
  const cfg = customerConfig(env);
  const cacheKey = `${adminSession.sid}:${cfg.productId}:${cfg.guildIds.join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const session = await customerWhopSession(request, env, adminSession);
  const membership = await verifyMembership(session, cfg);
  const discord = await linkedDiscordAccount(session.userId, cfg);
  const guilds = await verifyDiscordGuilds(discord.id, cfg);
  const value = { owner: false, whopUserId: session.userId, membership, discord, guilds, verifiedAt: new Date().toISOString() };
  cache.set(cacheKey, { value, expiresAt: Date.now() + ACCESS_CACHE_MS });
  return value;
}
