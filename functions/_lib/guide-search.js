import { requireDatabase } from './http.js';

const DEFAULT_PAGE_SIZE = 18;
const MAX_PAGE_SIZE = 48;

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function searchPattern(value) {
  const escaped = String(value || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
  return escaped ? `%${escaped}%` : '';
}

function normalize(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category_slug,
    categoryLabel: row.category_label || row.category_slug,
    featured: Boolean(row.featured),
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function searchPublicGuides(env, input = {}) {
  const db = requireDatabase(env);
  const page = clampInteger(input.page, 1, 100_000, 1);
  const pageSize = clampInteger(input.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const category = String(input.category || '').trim().slice(0, 48);
  const query = String(input.query || '').trim().slice(0, 100);
  const pattern = searchPattern(query);
  const clauses = ["guides.status = 'published'"];
  const bindings = [];
  if (category) {
    clauses.push('guides.category_slug = ?');
    bindings.push(category);
  }
  if (pattern) {
    clauses.push("(guides.title LIKE ? ESCAPE '\\' OR guides.description LIKE ? ESCAPE '\\' OR guide_categories.label LIKE ? ESCAPE '\\')");
    bindings.push(pattern, pattern, pattern);
  }
  const where = clauses.join(' AND ');
  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE ${where}
  `).bind(...bindings).first();
  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const rows = await db.prepare(`
    SELECT guides.id, guides.slug, guides.title, guides.description, guides.category_slug,
           guides.featured, guides.updated_at, guides.published_at,
           guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE ${where}
    ORDER BY guides.featured DESC, guides.sort_order ASC, guides.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, pageSize, offset).all();
  return {
    guides: (rows.results || []).map(normalize),
    query,
    category,
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}
