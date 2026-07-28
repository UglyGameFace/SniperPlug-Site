import { handleError, html } from '../_lib/http.js';
import { publicGuide } from '../_lib/guides.js';
import { guideDetailTemplate, notFoundTemplate } from '../_lib/templates.js';

export async function onRequestGet(context) {
  try {
    const slug = String(context.params.slug || '').trim();
    const guide = slug ? await publicGuide(context.env, slug) : null;
    if (!guide) {
      return html(notFoundTemplate(), 404, { 'cache-control': 'public, max-age=30' });
    }
    return html(guideDetailTemplate(guide), 200, {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    });
  } catch (error) {
    return handleError(error);
  }
}
