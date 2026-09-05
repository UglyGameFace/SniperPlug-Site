import { requireAdmin } from '../_lib/auth.js';
import { saveGuideDraft } from '../_lib/guides-owner-save.js';
import { handleError, HttpError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';
import { runMediaStorageMaintenance } from '../_lib/media-storage.js';

function scheduleMediaMaintenance(context) {
  if (!context.env?.SNIPERPLUG_MEDIA || typeof context.waitUntil !== 'function') return;
  context.waitUntil(runMediaStorageMaintenance(context.env).catch(() => {
    console.warn('Optional SniperPlug media maintenance was deferred after a safe account save.');
  }));
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    const admin = await requireAdmin(context.request, context.env);
    requireSameOrigin(context.request);
    const body = await readJson(context.request, { maxBytes: 1_200_000 });
    const id = Number.parseInt(body.id, 10);
    if (!Number.isFinite(id)) throw new HttpError(422, 'Choose a valid guide draft.');
    const guide = await saveGuideDraft(context.env, admin, id, body);
    scheduleMediaMaintenance(context);
    return json({ guide });
  } catch (error) {
    return handleError(error);
  }
}
