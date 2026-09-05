import { requireAdmin } from '../_lib/auth.js';
import {
  handleError,
  json,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
} from '../_lib/http.js';
import { publishReadyGuides } from '../_lib/publish.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    requireSameOrigin(context.request);
    const admin = await requireAdmin(context.request, context.env);
    const body = await readJson(context.request, { maxBytes: 100_000 });
    return json(await publishReadyGuides(context.env, admin, body));
  } catch (error) {
    return handleError(error);
  }
}
