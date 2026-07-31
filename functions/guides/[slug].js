import { handleError, html } from '../_lib/http.js';
import { privateGuidePageGate } from '../_lib/private-guides.js';
import { publicGuide } from '../_lib/guides-public.js';
import { guideDetailTemplate, notFoundTemplate } from '../_lib/templates.js';

export async function onRequestGet(context) {
  try {
    const gate = await privateGuidePageGate(context.request, context.env);
    if (gate) return gate;

    const slug = String(context.params.slug || '').trim();
    const guide = slug ? await publicGuide(context.env, slug) : null;
    if (!guide) {
      return html(notFoundTemplate(), 404, {
        'cache-control': 'private, no-store, max-age=0',
        'x-robots-tag': 'noindex, nofollow, noarchive',
      });
    }
    return html(guideDetailTemplate(guide), 200, {
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    });
  } catch (error) {
    return handleError(error);
  }
}
