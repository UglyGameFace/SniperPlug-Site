import { HttpError, requireDatabase } from './http.js';
import { prepareGuideBody } from './integrity.js';
import { renderMarkdown } from './markdown.js';

const CATEGORY_CATALOG = Object.freeze([
  ['general', 'General', 'Guides that do not fit a more specific category yet.', 10],
  ['announcements', 'Announcements', 'Important updates, notices, launches, and changes.', 20],
  ['guides-tutorials', 'Guides & Tutorials', 'Step-by-step instructions, onboarding, and educational material.', 30],
  ['money-makers', 'Money Makers', 'Income methods, side hustles, flips, and earning opportunities.', 40],
  ['money-savers', 'Money Savers', 'Discounts, savings methods, rebates, and cost-cutting strategies.', 50],
  ['freebies', 'Freebies', 'Free products, trials, credits, samples, and no-cost opportunities.', 60],
  ['deals-promos', 'Deals & Promos', 'Current deals, promotional offers, and limited-time opportunities.', 70],
  ['food-delivery', 'Food & Delivery', 'Food, restaurants, delivery apps, grocery, and dining methods.', 80],
  ['retail-shopping', 'Retail & Shopping', 'Retailers, online shopping, product sourcing, and store methods.', 90],
  ['reselling', 'Reselling', 'Sourcing, resale platforms, marketplace tactics, and profitable flips.', 100],
  ['sports-betting', 'Sports Betting', 'Sports books, arbitrage, lines, picks, and betting education.', 110],
  ['casino', 'Casino', 'Casino offers, entries, promotions, and casino-related methods.', 120],
  ['crypto-trading', 'Crypto & Trading', 'Crypto, markets, calls, trading, and financial education.', 130],
  ['auto-checkout', 'Auto Checkout', 'Checkout automation, monitoring, forms, and purchasing workflows.', 140],
  ['bots-automation', 'Bots & Automation', 'Bots, scripts, automation tools, and technical workflows.', 150],
  ['troubleshooting', 'Errors & Troubleshooting', 'Fixes, seller errors, account issues, and recovery steps.', 160],
  ['community-resources', 'Community Resources', 'Shared resources, templates, references, and community material.', 170],
]);
const LEGACY_CATEGORY_SLUGS = ['electronics', 'home', 'kitchen', 'outdoor', 'smart-home', 'tools'];
let catalogEnsured = false;

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

async function ensureCategoryCatalog(env) {
  if (catalogEnsured) return;
  const db = requireDatabase(env);
  const now = new Date().toISOString();
  const statements = CATEGORY_CATALOG.map(([slug, label, description, sortOrder]) => db.prepare(`
    INSERT INTO guide_categories (slug, label, description, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order,
      active = 1,
      updated_at = excluded.updated_at
  `).bind(slug, label, description, sortOrder, now, now));
  await db.batch(statements);
  const legacyPlaceholders = LEGACY_CATEGORY_SLUGS.map(() => '?').join(',');
  await db.prepare(`
    UPDATE guide_categories
    SET active = 0, updated_at = ?
    WHERE slug IN (${legacyPlaceholders})
      AND NOT EXISTS (SELECT 1 FROM guides WHERE guides.category_slug = guide_categories.slug)
  `).bind(now, ...LEGACY_CATEGORY_SLUGS).run();
  catalogEnsured = true;
}

async function category(env, slug) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const row = await db.prepare('SELECT * FROM guide_categories WHERE slug = ? AND active = 1').bind(slug).first();
  if (!row) throw new HttpError(422, 'Choose an active SniperPlug guide category.');
  return row;
}

export async function listCategories(env, { includeInactive = false } = {}) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT * FROM guide_categories
    ${includeInactive ? '' : 'WHERE active = 1'}
    ORDER BY sort_order, label
  `).all();
  return rows.results || [];
}

export async function saveCategory(env, input) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const label = String(input?.label || '').trim().slice(0, 60);
  const slug = slugify(input?.slug || label).slice(0, 48);
  const description = String(input?.description || '').trim().slice(0, 220);
  const active = input?.active === false ? 0 : 1;
  const sortOrder = Math.max(0, Math.min(9999, Number.parseInt(input?.sortOrder, 10) || 100));
  if (label.length < 2 || !slug) throw new HttpError(422, 'Category label must be at least two characters.');
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO guide_categories (slug, label, description, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).bind(slug, label, description, sortOrder, active, now, now).run();
  return db.prepare('SELECT * FROM guide_categories WHERE slug = ?').bind(slug).first();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function suggestedCategoryForText(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase();
  const rules = [
    ['sports-betting', [/\b(?:sports? betting|sports?book|prizepicks?|underdog|sleeper picks?|parlay|betting arbitrage|moneyline|point spread|over\/?under|betting odds?|prop bets?|free square|protected play|discount play)\b/]],
    ['casino', [/\b(?:casino|slots?|blackjack|roulette|poker|sweepstakes casino)\b/]],
    ['crypto-trading', [/\b(?:crypto(?:currency)?|bitcoin|ethereum|forex|day trading|swing trading|stock trading|options? trading|futures? trading|technical analysis|market analysis|trading signals?)\b/]],
    ['auto-checkout', [/\b(?:auto checkout|automated checkout|checkout bot|aco|purchase monitor|restock monitor)\b/]],
    ['bots-automation', [/\b(?:bot|automation|script|webhook|api integration|workflow automation)\b/]],
    ['troubleshooting', [/\b(?:error|errors|fix|troubleshoot|failed|failure|issue|problem|recovery|appeal|deactivation)\b/]],
    ['food-delivery', [/\b(?:food delivery|restaurant|grocery delivery|doordash|uber eats|instacart|chipotle|meal delivery)\b/]],
    ['freebies', [/\b(?:freebie|freebies|free trial|free sample|no-cost|no cost|giveaway|welcome reward)\b/]],
    ['money-savers', [/\b(?:save money|money saver|discount|rebate|cashback|coupon|price match|credit card offer)\b/]],
    ['money-makers', [/\b(?:make money|money maker|income method|side hustle|profit method|earning opportunity)\b/]],
    ['reselling', [/\b(?:resell(?:ing)?|seller|selling|flip(?:ping)?|product sourcing|wholesale|marketplace|ebay|amazon fba|walmart marketplace|listing optimization)\b/]],
    ['deals-promos', [/\b(?:deal|promo|promotion|limited-time offer|sale event)\b/]],
    ['retail-shopping', [/\b(?:retail|shopping|retailer|walmart|target|home depot|lowe'?s|best buy|amazon shopping)\b/]],
    ['announcements', [/\b(?:announcement|update notice|launch notice|important update)\b/]],
    ['guides-tutorials', [/\b(?:guide|tutorial|course|lesson|start here|onboarding|how to|walkthrough|step-by-step|documentation)\b/]],
  ];
  return rules.find(([, patterns]) => includesAny(text, patterns))?.[0] || 'general';
}

function normalizeGuideRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category_slug,
    categoryLabel: row.category_label || row.category_slug,
    body: row.body_markdown,
    status: row.status,
    featured: Boolean(row.featured),
    sortOrder: row.sort_order,
    sourceKey: row.source_key,
    sourceGroup: row.source_group,
    sourceExperienceId: row.source_experience_id,
    sourcePostId: row.source_post_id,
    attachments: safeJson(row.attachment_json || '[]', []),
    integrity: safeJson(row.integrity_json || '{}', {}),
    author: safeJson(row.author_json || '{}', {}),
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function normalizeGuideSummaryRow(row) {
  const attachments = safeJson(row.attachment_json || '{}', {});
  const integrity = safeJson(row.integrity_json || '{}', {});
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category_slug,
    categoryLabel: row.category_label || row.category_slug,
    status: row.status,
    featured: Boolean(row.featured),
    sortOrder: row.sort_order,
    sourceKey: row.source_key,
    attachments: { reviewCount: Number(attachments.reviewCount || 0) },
    integrity: {
      quarantined: integrity.quarantined === true,
      manualReviewCompleted: integrity.manualReviewCompleted === true,
      publishHoldReason: integrity.publishHoldReason || null,
    },
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function listAdminGuideSummaries(env) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT guides.id, guides.slug, guides.title, guides.description,
           guides.category_slug, guide_categories.label AS category_label,
           guides.status, guides.featured, guides.sort_order, guides.source_key,
           guides.attachment_json, guides.integrity_json,
           guides.imported_at, guides.updated_at, guides.published_at
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    ORDER BY CASE guides.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
             guides.updated_at DESC
  `).all();
  return (rows.results || []).map(normalizeGuideSummaryRow);
}

export async function adminGuide(env, id) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const row = await db.prepare(`
    SELECT guides.*, guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE guides.id = ?
  `).bind(id).first();
  return row ? normalizeGuideRow(row) : null;
}

export async function listAdminGuides(env) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const rows = await db.prepare(`
    SELECT guides.*, guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    ORDER BY CASE guides.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
             guides.updated_at DESC
  `).all();
  return (rows.results || []).map(normalizeGuideRow);
}

export async function saveGuideDraft(env, id, input) {
  const db = requireDatabase(env);
  const current = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'Guide draft not found.');
  const title = String(input?.title || '').trim().slice(0, 140);
  const description = String(input?.description || '').trim().slice(0, 260);
  if (title.length < 3 || description.length < 8) throw new HttpError(422, 'Add a complete title and card description.');
  await category(env, String(input?.category || '').trim());
  const prepared = await prepareGuideBody(String(input?.body || ''), { source: 'Guide draft' });
  const attachments = safeJson(current.attachment_json || '{}', {});
  if (input?.attachmentsResolved === true) attachments.reviewCount = 0;
  await db.prepare(`
    UPDATE guides SET title = ?, description = ?, category_slug = ?, body_markdown = ?,
      attachment_json = ?, integrity_json = ?, status = 'draft', featured = ?, updated_at = ?, published_at = NULL
    WHERE id = ?
  `).bind(
    title,
    description,
    String(input.category),
    prepared.body,
    JSON.stringify(attachments),
    JSON.stringify({ ...prepared, sourceType: attachments.sourceType || safeJson(current.integrity_json || '{}', {}).sourceType || null }),
    input?.featured === true ? 1 : 0,
    new Date().toISOString(),
    id,
  ).run();
  return normalizeGuideRow(await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first());
}

export async function setGuideStatus(env, id, status) {
  if (!['draft', 'published', 'rejected'].includes(status)) throw new HttpError(422, 'Choose Draft, Publish, or Reject.');
  const db = requireDatabase(env);
  const current = await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'Guide not found.');
  const attachments = safeJson(current.attachment_json || '{}', {});
  if (status === 'published' && Number(attachments.reviewCount || 0) > 0) {
    throw new HttpError(422, 'Resolve or replace every flagged private or expiring Whop file before publishing.');
  }
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE guides SET status = ?, updated_at = ?, published_at = ? WHERE id = ?
  `).bind(status, now, status === 'published' ? now : null, id).run();
  return normalizeGuideRow(await db.prepare('SELECT * FROM guides WHERE id = ?').bind(id).first());
}

export async function publicGuides(env, { category: categorySlug = null } = {}) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const query = `
    SELECT guides.*, guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE guides.status = 'published' ${categorySlug ? 'AND guides.category_slug = ?' : ''}
    ORDER BY guides.featured DESC, guides.sort_order ASC, guides.published_at DESC
  `;
  const rows = categorySlug ? await db.prepare(query).bind(categorySlug).all() : await db.prepare(query).all();
  return (rows.results || []).map(normalizeGuideRow);
}

export async function publicGuide(env, slug) {
  await ensureCategoryCatalog(env);
  const db = requireDatabase(env);
  const row = await db.prepare(`
    SELECT guides.*, guide_categories.label AS category_label
    FROM guides JOIN guide_categories ON guide_categories.slug = guides.category_slug
    WHERE guides.slug = ? AND guides.status = 'published'
  `).bind(slug).first();
  return row ? { ...normalizeGuideRow(row), html: renderMarkdown(row.body_markdown) } : null;
}
