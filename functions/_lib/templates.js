import { escapeHtml } from './markdown.js';

function shell({ title, description, body, canonical = 'https://sniperplug.com/guides/' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="theme-color" content="#0b0f17">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/styles.css">
  <link rel="stylesheet" href="/assets/css/guides.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header"><div class="container header-inner"><a class="brand" href="/" aria-label="SniperPlug home"><span class="brand-mark">SP</span><span>SniperPlug</span></a><nav class="nav" aria-label="Main navigation"><a href="/">Home</a><a href="/deals/">Deals</a><a class="active" href="/guides/">Guides</a><a href="/partners/">Partners</a></nav><a class="header-cta" href="/contact/">Get alerts</a></div></header>
  <main id="main">${body}</main>
  <footer class="site-footer"><div class="container footer-grid"><div><a class="brand footer-brand" href="/"><span class="brand-mark">SP</span><span>SniperPlug</span></a><p>Verified retail deal alerts and practical shopping guides.</p><p class="mini">Verify prices, availability, rules, and final terms before acting.</p></div><div><h4>Explore</h4><a href="/deals/">Deals</a><a href="/guides/">Guides</a><a href="/partners/">Partners</a></div><div><h4>Company</h4><a href="/about/">About</a><a href="/contact/">Contact</a></div><div><h4>Legal</h4><a href="/affiliate-disclosure/">Affiliate disclosure</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a></div></div><div class="container footer-bottom">© 2026 SniperPlug. Built for deal discovery and clear methods.</div></footer>
</body>
</html>`;
}

function guideUrl({ category = '', query = '', page = 1 } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (query) params.set('q', query);
  if (page > 1) params.set('page', String(page));
  const suffix = params.toString();
  return `/guides/${suffix ? `?${suffix}` : ''}`;
}

function pagination(result) {
  if (result.totalPages <= 1) return '';
  const pages = [];
  const start = Math.max(1, result.page - 2);
  const end = Math.min(result.totalPages, result.page + 2);
  if (result.page > 1) pages.push(`<a class="btn ghost" href="${guideUrl({ category: result.category, query: result.query, page: result.page - 1 })}">← Previous</a>`);
  for (let page = start; page <= end; page += 1) {
    pages.push(`<a class="page-link${page === result.page ? ' active' : ''}" href="${guideUrl({ category: result.category, query: result.query, page })}"${page === result.page ? ' aria-current="page"' : ''}>${page}</a>`);
  }
  if (result.page < result.totalPages) pages.push(`<a class="btn ghost" href="${guideUrl({ category: result.category, query: result.query, page: result.page + 1 })}">Next →</a>`);
  return `<nav class="guide-pagination" aria-label="Guide pages">${pages.join('')}</nav>`;
}

export function guideIndexTemplate(result, categories) {
  const categoryLinks = [
    `<a class="store-chip${result.category ? '' : ' active'}" href="${guideUrl({ query: result.query })}">All guides</a>`,
    ...categories.map((category) => `<a class="store-chip${result.category === category.slug ? ' active' : ''}" href="${guideUrl({ category: category.slug, query: result.query })}">${escapeHtml(category.label)}</a>`),
  ].join('');
  const cards = result.guides.length ? result.guides.map((guide) => `
    <article class="guide-card">
      <div class="guide-card-meta"><span>${escapeHtml(guide.categoryLabel)}</span>${guide.featured ? '<span>Featured</span>' : ''}</div>
      <h2><a href="/guides/${encodeURIComponent(guide.slug)}/">${escapeHtml(guide.title)}</a></h2>
      <p>${escapeHtml(guide.description)}</p>
      <div class="guide-card-foot"><span>${guide.publishedAt ? escapeHtml(new Date(guide.publishedAt).toLocaleDateString('en-US')) : 'Published guide'}</span><a class="btn ghost" href="/guides/${encodeURIComponent(guide.slug)}/">Read guide</a></div>
    </article>`).join('') : '<div class="guide-empty"><strong>No published guides match these filters.</strong><p>Try another search or category.</p></div>';
  const rangeStart = result.total ? ((result.page - 1) * result.pageSize) + 1 : 0;
  const rangeEnd = Math.min(result.total, result.page * result.pageSize);
  return shell({
    title: 'SniperPlug Guides | Shopping methods and deal knowledge',
    description: 'Browse reviewed SniperPlug guides for retail deals, product research, coupons, tools, electronics, and more.',
    body: `<section class="page-hero compact"><div class="container"><span class="eyebrow">📚 Reviewed methods</span><h1>SniperPlug guides.</h1><p>Practical guides imported, checked, categorized, and explicitly published after owner review.</p><form class="guide-search" action="/guides/" method="get"><label><span class="sr-only">Search guides</span><input type="search" name="q" value="${escapeHtml(result.query)}" placeholder="Search guides and categories"></label>${result.category ? `<input type="hidden" name="category" value="${escapeHtml(result.category)}">` : ''}<button class="btn primary" type="submit">Search</button>${result.query ? `<a class="btn ghost" href="${guideUrl({ category: result.category })}">Clear</a>` : ''}</form><div class="store-strip guide-categories">${categoryLinks}</div><p class="guide-result-count">${result.total ? `Showing ${rangeStart}–${rangeEnd} of ${result.total} guide${result.total === 1 ? '' : 's'}` : 'No matching guides'}</p></div></section><section class="section"><div class="container guide-grid">${cards}</div>${pagination(result)}</section>`,
  });
}

export function guideDetailTemplate(guide) {
  const published = guide.publishedAt ? new Date(guide.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Published guide';
  const reviewed = guide.updatedAt ? new Date(guide.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : published;
  const readingMinutes = Math.max(1, Math.ceil(String(guide.body || '').trim().split(/\s+/).filter(Boolean).length / 220));
  return shell({
    title: `${guide.title} | SniperPlug Guide`,
    description: guide.description,
    canonical: `https://sniperplug.com/guides/${encodeURIComponent(guide.slug)}/`,
    body: `<section class="page-hero compact"><div class="container narrow"><a class="guide-back" href="/guides/">← All guides</a><span class="eyebrow">${escapeHtml(guide.categoryLabel)}</span><h1>${escapeHtml(guide.title)}</h1><p>${escapeHtml(guide.description)}</p><div class="guide-byline"><span>Published ${escapeHtml(published)}</span><span>Last reviewed ${escapeHtml(reviewed)}</span><span>${readingMinutes} min read</span><span>Reviewed by SniperPlug</span></div></div></section><section class="section guide-section"><article class="container guide-article">${guide.html}</article></section><section class="section"><div class="container notice">Methods, promotions, availability, and retailer rules can change. Verify current terms before acting. <a href="/contact/?subject=outdated-guide&guide=${encodeURIComponent(guide.slug)}">Report outdated information</a>.</div></section>`,
  });
}

export function notFoundTemplate() {
  return shell({
    title: 'Guide not found | SniperPlug',
    description: 'The requested SniperPlug guide is not published or no longer available.',
    body: '<section class="page-hero"><div class="container narrow"><span class="eyebrow">404</span><h1>That guide is not available.</h1><p>It may still be under review, rejected, or removed.</p><a class="btn primary" href="/guides/">Browse guides</a></div></section>',
  });
}
