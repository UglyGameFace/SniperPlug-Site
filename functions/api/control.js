import {
  OWNER_PRINCIPAL_ID,
  checkLoginThrottle,
  clearAccountSession,
  clearLoginFailures,
  createAdminSession,
  recordLoginFailure,
  verifyAdminPassword,
} from '../_lib/auth.js';
import {
  appendCookie,
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
} from '../_lib/http.js';
import {
  adminGuide,
  importApprovedPosts,
  listAdminGuideSummaries,
  listCategories,
  saveCategory,
  saveGuideDraft,
  setGuideStatus,
  suggestedCategoryForText,
} from '../_lib/guides-media.js';
import { reserveGuideVersion, restoreGuideVersion } from '../_lib/guide-versioning.js';
import { reconcileRecentBulkImports } from '../_lib/import-reconciliation.js';
import { getMediaStorageStatus, runMediaStorageMaintenance } from '../_lib/media-storage.js';
import {
  listSavedPosts,
  savePostDecision,
  savedPostDetail,
  scanApprovedSource,
  summarizePostForClient,
} from '../_lib/posts.js';
import { assertGuidePublishable } from '../_lib/publish.js';
import {
  listSourceOptions,
  saveSourceDecision,
  saveSourceDecisions,
  sourceDecision,
} from '../_lib/source-policy.js';
import { requireControlAccount } from '../_lib/subscriber-auth.js';
import { disconnectPrincipalWhop } from '../_lib/whop-connection.js';
import {
  requireWhopSession,
  resolveWhopExperienceType,
  whopSessionSummary,
  retrieveExperience,
} from '../_lib/whop.js';

const MAX_BATCH_SOURCES = 100;
const SOURCE_LOOKUP_CONCURRENCY = 6;

function action(request) {
  return String(new URL(request.url).searchParams.get('action') || '').trim();
}

async function mapConcurrent(values, mapper, concurrency = SOURCE_LOOKUP_CONCURRENCY) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, values.length)) }, () => worker()));
  return output;
}

function requestedSourceValues(body) {
  if (!Array.isArray(body?.experienceIds)) {
    const single = String(body?.source || body?.experienceId || '').trim();
    if (!single) throw new HttpError(422, 'Choose at least one Whop source.');
    return [single];
  }
  const values = [...new Set(body.experienceIds.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!values.length) throw new HttpError(422, 'Choose at least one Whop source.');
  if (values.length > MAX_BATCH_SOURCES) throw new HttpError(422, `Choose at most ${MAX_BATCH_SOURCES} Whop sources at once.`);
  for (const value of values) {
    if (!/^exp_[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(422, 'Bulk source decisions require exact Whop experience IDs.');
  }
  return values;
}

function accountSummary(session) {
  const subscriber = session?.kind === 'subscriber';
  return {
    principalId: String(session?.principalId || session?.sid || ''),
    kind: String(session?.kind || 'owner'),
    ...(subscriber ? {
      paidSubscriber: true,
      entitlement: session.entitlement ? {
        productId: session.entitlement.productId || null,
        status: session.entitlement.status || null,
        verifiedAt: session.entitlement.verifiedAt || null,
      } : null,
    } : { paidSubscriber: false }),
  };
}

function requireOwnerPrincipal(session, actionLabel = 'change global SniperPlug settings') {
  const principalId = String(session?.principalId || session?.sid || '');
  if (principalId !== OWNER_PRINCIPAL_ID) {
    throw new HttpError(403, `Only the SniperPlug owner account can ${actionLabel}.`);
  }
  return principalId;
}

async function login(request, env) {
  if (request.method === 'GET') {
    try {
      const session = await requireControlAccount(request, env);
      return json({ authenticated: true, expiresAt: session.expiresAt, account: accountSummary(session) });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return json({ authenticated: false }, 200);
      if (error instanceof HttpError && [403, 503].includes(error.status)) {
        return json({
          authenticated: false,
          subscriberBlocked: true,
          error: error.message,
          code: error.details?.code || 'SUBSCRIBER_ACCESS_BLOCKED',
          retryable: error.status === 503,
        }, 200);
      }
      throw error;
    }
  }
  if (request.method === 'POST') {
    requireSameOrigin(request);
    await checkLoginThrottle(request, env);
    const body = await readJson(request, { maxBytes: 10_000 });
    if (!(await verifyAdminPassword(env, body.password))) {
      await recordLoginFailure(request, env);
      throw new HttpError(401, 'Incorrect Control Center password.');
    }
    await clearLoginFailures(request, env);
    const result = await createAdminSession(env);
    return appendCookie(json({ authenticated: true, expiresAt: result.session.expiresAt, account: accountSummary(result.session) }), result.cookie);
  }
  if (request.method === 'DELETE') {
    requireSameOrigin(request);
    return appendCookie(json({ authenticated: false }), clearAccountSession());
  }
  return methodNotAllowed(['GET', 'POST', 'DELETE']);
}

async function verifiedWhopSummary(request, env, admin) {
  try {
    const session = await requireWhopSession(request, env, admin);
    return {
      connected: true,
      verified: true,
      status: 'connected',
      message: 'Whop OAuth session verified.',
      session: {
        scopes: String(session.scopes || '').split(/\s+/).filter(Boolean),
        expiresAt: session.expiresAt,
        user: session.profile || {},
        verifiedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) {
      await disconnectPrincipalWhop(request, env, admin).catch(() => null);
      return {
        connected: false,
        verified: false,
        status: 'disconnected',
        message: 'Whop is not connected.',
        session: null,
      };
    }
    const saved = await whopSessionSummary(env, admin).catch(() => null);
    if (saved) {
      return {
        connected: true,
        verified: false,
        status: 'checking',
        message: 'Saved Whop connection found. Live verification is retrying before source access is enabled.',
        session: saved,
      };
    }
    throw error;
  }
}

function scheduleMediaMaintenance(context, env) {
  if (!env?.SNIPERPLUG_MEDIA || typeof context?.waitUntil !== 'function') return;
  context.waitUntil(runMediaStorageMaintenance(env).catch(() => {
    console.warn('Optional SniperPlug media maintenance was deferred so the Control Center can remain responsive.');
  }));
}

async function safeMediaStorageStatus(env) {
  try {
    return await getMediaStorageStatus(env);
  } catch {
    console.warn('SniperPlug media budget accounting is temporarily unavailable; new media copies remain fail-closed.');
    return {
      connected: Boolean(env?.SNIPERPLUG_MEDIA),
      mode: 'hard-free',
      hardStopped: Boolean(env?.SNIPERPLUG_MEDIA),
      stopReason: 'accounting-unavailable',
      limitBytes: 8_000_000_000,
      maxFileBytes: 50_000_000,
      maxObjects: 25_000,
      maxCopiesPerMonth: 50_000,
      maxCopiesPerDay: 2_000,
      maxOriginReadsPerDay: 10_000,
      usedBytes: 0,
      reservedBytes: 0,
      totalCommittedBytes: 0,
      remainingBytes: 8_000_000_000,
      objectCount: 0,
      copiesThisMonth: 0,
      copiesToday: 0,
      originReadsToday: 0,
      usagePercent: 0,
      inventoryDue: false,
      cleanupDue: false,
      unavailable: true,
    };
  }
}

async function dashboard(request, env, admin, context) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const cleanup = await reconcileRecentBulkImports(env, admin);
  const [whop, sources, categories, guides, mediaStorageUsage] = await Promise.all([
    verifiedWhopSummary(request, env, admin),
    listSourceOptions(env, admin),
    listCategories(env, { includeInactive: true }),
    listAdminGuideSummaries(env, admin),
    safeMediaStorageStatus(env),
  ]);
  const visibleGuides = guides.filter((guide) => guide.status !== 'rejected' && guide.integrity?.quarantined !== true);
  if (mediaStorageUsage.inventoryDue || mediaStorageUsage.cleanupDue) scheduleMediaMaintenance(context, env);
  const owner = String(admin?.principalId || admin?.sid || '') === OWNER_PRINCIPAL_ID;
  return json({
    account: accountSummary(admin),
    whop,
    capabilities: {
      mediaStorage: Boolean(env?.SNIPERPLUG_MEDIA),
      mediaStorageUsage,
      cleanup,
      publicPublishing: owner,
      categoryManagement: owner,
      ownerAccount: owner,
    },
    sources,
    categories,
    guides: visibleGuides,
  });
}

async function sourceCheck(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  const whop = await requireWhopSession(request, env, admin);
  const experience = await retrieveExperience(whop, body.source);
  return json({
    experience,
    source: await sourceDecision(env, admin, experience, experience.id),
    sources: await listSourceOptions(env, admin),
  });
}

async function sourceSave(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request, { maxBytes: 50_000 });
  const decision = String(body.decision || '');
  const values = requestedSourceValues(body);
  const whop = await requireWhopSession(request, env, admin);
  const experiences = await mapConcurrent(values, (value) => retrieveExperience(whop, value));
  const saved = values.length === 1
    ? [await saveSourceDecision(env, admin, experiences[0], experiences[0].id, decision)]
    : await saveSourceDecisions(env, admin, experiences.map((experience) => ({ experience, requestedId: experience.id })), decision);
  return json({ source: saved[0], saved, sources: await listSourceOptions(env, admin) });
}

async function scan(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  const whop = await requireWhopSession(request, env, admin);
  const experience = await retrieveExperience(whop, body.source || body.experienceId);
  const posts = await scanApprovedSource(env, admin, whop, experience);
  const sourceType = await resolveWhopExperienceType(whop, experience);
  const suggestedCategory = suggestedCategoryForText([
    experience?.company?.title,
    experience?.name,
    sourceType,
    ...posts.slice(0, 100).flatMap((post) => [post.title, post.excerpt]),
  ].filter(Boolean).join(' '));
  return json({
    experience,
    sourceType,
    suggestedCategory,
    source: await sourceDecision(env, admin, experience, experience.id),
    posts: posts.map(summarizePostForClient),
    counts: {
      total: posts.length,
      approved: posts.filter((post) => post.decision === 'approved').length,
      disapproved: posts.filter((post) => post.decision === 'disapproved').length,
      pending: posts.filter((post) => post.decision === 'pending').length,
      blocked: posts.filter((post) => post.decision === 'blocked').length,
    },
  });
}

async function postDecision(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  return json({ changed: await savePostDecision(env, admin, body.sourceKeys || body.sourceKey, String(body.decision || '')) });
}

async function importPosts(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request, { maxBytes: 200_000 });
  const whop = await requireWhopSession(request, env, admin);
  return json(await importApprovedPosts(env, admin, whop, body));
}

async function categorySave(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  requireOwnerPrincipal(admin, 'change the shared guide category catalog');
  const saved = await saveCategory(env, await readJson(request));
  return json({ category: saved, categories: await listCategories(env, { includeInactive: true }) });
}

async function guideDetail(request, env, admin) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const id = Number.parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (!Number.isFinite(id)) throw new HttpError(422, 'Choose a valid guide.');
  const guide = await adminGuide(env, admin, id);
  if (!guide || guide.status === 'rejected' || guide.integrity?.quarantined === true) {
    throw new HttpError(404, 'Guide not found in this account’s active review queue.');
  }
  return json({ guide });
}

async function guideSave(request, env, admin, context) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request, { maxBytes: 1_200_000 });
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(422, 'Choose a valid guide draft.');
  const guide = await saveGuideDraft(env, admin, id, body);
  scheduleMediaMaintenance(context, env);
  return json({ guide });
}

async function guideStatus(request, env, admin, context) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(422, 'Choose a valid guide.');
  const status = String(body.status || '');
  if (status === 'published') requireOwnerPrincipal(admin, 'publish guides to the public SniperPlug site');
  const operation = status === 'published' ? 'publish' : status === 'rejected' ? 'reject' : 'return-to-draft';
  const reservation = await reserveGuideVersion(env, admin, id, body.expectedUpdatedAt, operation);
  try {
    if (status === 'published') await assertGuidePublishable(env, admin, id);
    const guide = await setGuideStatus(env, admin, id, status);
    scheduleMediaMaintenance(context, env);
    return json({ guide });
  } catch (error) {
    await restoreGuideVersion(env, reservation).catch(() => null);
    throw error;
  }
}

export async function onRequest(context) {
  const currentAction = action(context.request);
  try {
    if (currentAction === 'session') return await login(context.request, context.env);
    const admin = await requireControlAccount(context.request, context.env);
    if (currentAction === 'dashboard') return await dashboard(context.request, context.env, admin, context);
    if (currentAction === 'source-check') return await sourceCheck(context.request, context.env, admin);
    if (currentAction === 'source-decision') return await sourceSave(context.request, context.env, admin);
    if (currentAction === 'scan') return await scan(context.request, context.env, admin);
    if (currentAction === 'post-decision') return await postDecision(context.request, context.env, admin);
    if (currentAction === 'import') return await importPosts(context.request, context.env, admin);
    if (currentAction === 'category-save') return await categorySave(context.request, context.env, admin);
    if (currentAction === 'guide-detail') return await guideDetail(context.request, context.env, admin);
    if (currentAction === 'guide-save') return await guideSave(context.request, context.env, admin, context);
    if (currentAction === 'guide-status') return await guideStatus(context.request, context.env, admin, context);
    if (currentAction === 'post-detail') {
      if (context.request.method !== 'GET') return methodNotAllowed(['GET']);
      return json({ post: await savedPostDetail(context.env, admin, new URL(context.request.url).searchParams.get('sourceKey') || '') });
    }
    if (currentAction === 'posts') {
      if (context.request.method !== 'GET') return methodNotAllowed(['GET']);
      const posts = await listSavedPosts(context.env, admin, new URL(context.request.url).searchParams.get('experienceId') || '');
      return json({ posts: posts.map(summarizePostForClient) });
    }
    throw new HttpError(404, 'Unknown Control Center action.');
  } catch (error) {
    return handleError(error);
  }
}
