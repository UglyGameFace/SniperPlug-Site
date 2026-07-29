import { searchPublicGuides } from '../_lib/guide-search.js';
import { listCategories } from '../_lib/guides.js';
import { handleError, html } from '../_lib/http.js';
import { guideIndexTemplate } from '../_lib/templates.js';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const category = String(url.searchParams.get('category') || '').trim();
    const query = String(url.searchParams.get('q') || '').trim();
    const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
    const [result, categories] = await Promise.all([
      searchPublicGuides(context.env, { category, query, page }),
      listCategories(context.env),
    ]);
    return html(guideIndexTemplate(result, categories), 200, {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    });
  } catch (error) {
    return handleError(error);
  }
}
