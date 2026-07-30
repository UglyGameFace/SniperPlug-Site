import { requireAdmin } from '../_lib/auth.js';
import { handleError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { dismissRecentActions, listRecentActions, undoRecentActions } from '../_lib/recent-actions.js';

function ownerFacingHistory(history) {
  if (!history || !Array.isArray(history.actions)) return history;
  const byGuide = new Map();
  for (const action of history.actions) {
    const id = Number(action?.guideId || 0);
    if (!Number.isFinite(id) || id <= 0 || byGuide.has(id)) continue;
    byGuide.set(id, action);
  }
  const actions = [...byGuide.values()];
  return { ...history, actions, reversibleCount: actions.filter((item) => item.reversible).length };
}

function ownerFacingResult(result) {
  if (!result || typeof result !== 'object') return result;
  if (result.history) return { ...result, history: ownerFacingHistory(result.history) };
  return ownerFacingHistory(result);
}

export async function onRequest(context) {
  try {
    const admin = await requireAdmin(context.request, context.env);
    if (context.request.method === 'GET') {
      return json(ownerFacingHistory(await listRecentActions(context.env, admin)));
    }
    if (context.request.method !== 'POST') return methodNotAllowed(['GET', 'POST']);
    requireSameOrigin(context.request);
    const body = await readJson(context.request, { maxBytes: 100_000 });
    if (body.action === 'dismiss') return json(ownerFacingResult(await dismissRecentActions(context.env, admin, body)));
    return json(ownerFacingResult(await undoRecentActions(context.env, admin, body)));
  } catch (error) {
    return handleError(error);
  }
}
