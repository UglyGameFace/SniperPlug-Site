import { searchPublicGuides } from '../_lib/guide-search.js';
import { listCategories } from '../_lib/guides.js';
import { handleError, html } from '../_lib/http.js';
import { privateGuidePageGate } from '../_lib/private-guides.js';
import { guideIndexTemplate } from '../_lib/templates.js';

export async function onRequestGet(context) {
  try {
    const gate = await privateGuidePageGate(context.request, context.env);
    if (gate) return gate;

    const url = new URL(context.request.url);
    const category = String(url.searchParams.get('category') || '').trim();
    const query = String(url.searchParams.get('q') || '').trim();
    const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
    const categories = await listCategories(context.env);
    const result = await searchPublicGuides(context.env, { category, query, page });
    return html(guideIndexTemplate(result, categories), 200, {
      'cache-control': 'private, no-store, max-age=0',
      'x-robots-tag': 'noindex, nofollow, noarchive',
    });
  } catch (error) {
    return handleError(error);
  }
}
