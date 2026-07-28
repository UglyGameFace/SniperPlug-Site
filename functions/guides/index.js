import { handleError, html } from '../_lib/http.js';
import { listCategories, publicGuides } from '../_lib/guides.js';
import { guideIndexTemplate } from '../_lib/templates.js';

export async function onRequestGet(context) {
  try {
    const category = String(new URL(context.request.url).searchParams.get('category') || '').trim();
    const [guides, categories] = await Promise.all([
      publicGuides(context.env, { category: category || null }),
      listCategories(context.env),
    ]);
    return html(guideIndexTemplate(guides, categories, category), 200, {
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    });
  } catch (error) {
    return handleError(error);
  }
}
