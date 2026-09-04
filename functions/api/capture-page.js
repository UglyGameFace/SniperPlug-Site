import { saveAuthorizedCapturedPage } from '../_lib/authorized-page-capture.js';
import { handleError, json, methodNotAllowed, readJson } from '../_lib/http.js';

export async function onRequest(context) {
  try {
    if (context.request.method !== 'POST') return methodNotAllowed(['POST']);
    const body = await readJson(context.request, { maxBytes: 1_200_000 });
    const guide = await saveAuthorizedCapturedPage(context.request, context.env, body);
    return json({ guide });
  } catch (error) {
    return handleError(error);
  }
}
