import {
  checkLoginThrottle,
  clearAdminSession,
  clearLoginFailures,
  createAdminSession,
  recordLoginFailure,
  requireAdmin,
  verifyAdminPassword,
} from '../_lib/auth.js';
import {
  appendCookie,
  handleError,
  HttpError,
  json,
  methodNotAllowed,
  readJson,
  redirect,
  requireSameOrigin,
} from '../_lib/http.js';
import {
  importApprovedPosts,
  listAdminGuides,
  listCategories,
  saveCategory,
  saveGuideDraft,
  setGuideStatus,
  suggestedCategoryForText,
} from '../_lib/guides-media.js';
import {
  listSavedPosts,
  savePostDecision,
  scanApprovedSource,
} from '../_lib/posts.js';
import { assertGuidePublishable } from '../_lib/publish.js';
import {
  listSourceOptions,
  saveSourceDecision,
  saveSourceDecisions,
  sourceDecision,
} from '../_lib/source-policy.js';
import {
  beginWhopOAuth,
  disconnectWhop,
  finishWhopOAuth,
  requireWhopSession,
  retrieveExperience,
  whopExperienceType,
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

async function login(request, env) {
  if (request.method === 'GET') {
    try {
      const session = await requireAdmin(request, env);
      return json({ authenticated: true, expiresAt: session.expiresAt });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return json({ authenticated: false }, 200);
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
    return appendCookie(json({ authenticated: true, expiresAt: result.session.expiresAt }), result.cookie);
  }
  if (request.method === 'DELETE') {
    requireSameOrigin(request);
    return appendCookie(json({ authenticated: false }), clearAdminSession());
  }
  return methodNotAllowed(['GET', 'POST', 'DELETE']);
}

async function verifiedWhopSummary(request, env, admin) {
  try {
    const session = await requireWhopSession(request, env, admin);
    return {
      scopes: String(session.scopes || '').split(/\s+/).filter(Boolean),
      expiresAt: session.expiresAt,
      user: session.profile || {},
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) {
      await disconnectWhop(request, env, admin).catch(() => null);
      return null;
    }
    throw error;
  }
}

async function dashboard(request, env, admin) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  const [whop, sources, categories, guides] = await Promise.all([
    verifiedWhopSummary(request, env, admin),
    listSourceOptions(env),
    listCategories(env, { includeInactive: true }),
    listAdminGuides(env),
  ]);
  return json({
    whop: { connected: Boolean(whop), verified: Boolean(whop), session: whop },
    capabilities: {
      mediaStorage: Boolean(env?.SNIPERPLUG_MEDIA),
    },
    sources,
    categories,
    guides,
  });
}

async function oauthCallback(request, env) {
  try {
    await finishWhopOAuth(request, env);
    return redirect(`${new URL(request.url).origin}/control-center/?whop=connected#whop-importer`);
  } catch (error) {
    const url = new URL('/control-center/', request.url);
    url.searchParams.set('whop', 'error');
    url.searchParams.set('message', String(error?.message || 'Whop login failed.').slice(0, 180));
    url.hash = 'whop-importer';
    return redirect(url.toString());
  }
}

async function sourceCheck(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  const whop = await requireWhopSession(request, env, admin);
  const experience = await retrieveExperience(whop, body.source);
  return json({ experience, source: await sourceDecision(env, experience, experience.id), sources: await listSourceOptions(env) });
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
    ? [await saveSourceDecision(env, experiences[0], experiences[0].id, decision)]
    : await saveSourceDecisions(env, experiences.map((experience) => ({ experience, requestedId: experience.id })), decision);
  return json({ source: saved[0], saved, sources: await listSourceOptions(env) });
}

async function scan(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  const whop = await requireWhopSession(request, env, admin);
  const experience = await retrieveExperience(whop, body.source || body.experienceId);
  const posts = await scanApprovedSource(env, whop, experience);
  const sourceType = whopExperienceType(experience);
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
    source: await sourceDecision(env, experience, experience.id),
    posts,
    counts: {
      total: posts.length,
      approved: posts.filter((post) => post.decision === 'approved').length,
      disapproved: posts.filter((post) => post.decision === 'disapproved').length,
      pending: posts.filter((post) => post.decision === 'pending').length,
      blocked: posts.filter((post) => post.decision === 'blocked').length,
    },
  });
}

async function postDecision(request, env) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  return json({ changed: await savePostDecision(env, body.sourceKeys || body.sourceKey, String(body.decision || '')) });
}

async function importPosts(request, env, admin) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request, { maxBytes: 200_000 });
  return json(await importApprovedPosts(env, await requireWhopSession(request, env, admin), body));
}

async function categorySave(request, env) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const saved = await saveCategory(env, await readJson(request));
  return json({ category: saved, categories: await listCategories(env, { includeInactive: true }) });
}

async function guideSave(request, env) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request, { maxBytes: 1_200_000 });
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(422, 'Choose a valid guide draft.');
  return json({ guide: await saveGuideDraft(env, id, body) });
}

async function guideStatus(request, env) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  requireSameOrigin(request);
  const body = await readJson(request);
  const id = Number.parseInt(body.id, 10);
  if (!Number.isFinite(id)) throw new HttpError(422, 'Choose a valid guide.');
  const status = String(body.status || '');
  if (status === 'published') await assertGuidePublishable(env, id);
  return json({ guide: await setGuideStatus(env, id, status) });
}

export async function onRequest(context) {
  const currentAction = action(context.request);
  if (currentAction === 'oauth-callback') return oauthCallback(context.request, context.env);
  try {
    if (currentAction === 'session') return await login(context.request, context.env);
    const admin = await requireAdmin(context.request, context.env);
    if (currentAction === 'dashboard') return await dashboard(context.request, context.env, admin);
    if (currentAction === 'oauth-start') {
      if (context.request.method !== 'GET') return methodNotAllowed(['GET']);
      return redirect(await beginWhopOAuth(context.request, context.env, admin));
    }
    if (currentAction === 'whop-disconnect') {
      if (context.request.method !== 'DELETE') return methodNotAllowed(['DELETE']);
      requireSameOrigin(context.request);
      await disconnectWhop(context.request, context.env, admin);
      return json({ connected: false });
    }
    if (currentAction === 'source-check') return await sourceCheck(context.request, context.env, admin);
    if (currentAction === 'source-decision') return await sourceSave(context.request, context.env, admin);
    if (currentAction === 'scan') return await scan(context.request, context.env, admin);
    if (currentAction === 'post-decision') return await postDecision(context.request, context.env);
    if (currentAction === 'import') return await importPosts(context.request, context.env, admin);
    if (currentAction === 'category-save') return await categorySave(context.request, context.env);
    if (currentAction === 'guide-save') return await guideSave(context.request, context.env);
    if (currentAction === 'guide-status') return await guideStatus(context.request, context.env);
    if (currentAction === 'posts') {
      if (context.request.method !== 'GET') return methodNotAllowed(['GET']);
      return json({ posts: await listSavedPosts(context.env, new URL(context.request.url).searchParams.get('experienceId') || '') });
    }
    throw new HttpError(404, 'Unknown Control Center action.');
  } catch (error) {
    return handleError(error);
  }
}
