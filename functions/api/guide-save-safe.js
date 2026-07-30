import { requireAdmin } from '../_lib/auth.js';
import { saveGuideDraft } from '../_lib/guides-owner-save.js';
import { handleError, HttpError, json, methodNotAllowed, readJson, requireSameOrigin } from '../_lib/http.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    await requireAdmin(context.request, context.env);
    requireSameOrigin(context.request);
    const body = await readJson(context.request, { maxBytes: 1_200_000 });
    const id = Number.parseInt(body.id, 10);
    if (!Number.isFinite(id)) throw new HttpError(422, 'Choose a valid guide draft.');
    return json({ guide: await saveGuideDraft(context.env, id, body) });
  } catch (error) {
    return handleError(error);
  }
}
