import { publicGuides } from './_lib/guides.js';

const STATIC_PATHS = [
  '/', '/deals/', '/guides/', '/about/', '/partners/', '/contact/',
  '/affiliate-disclosure/', '/privacy/', '/terms/',
  '/deals/walmart/', '/deals/lowes/', '/deals/best-buy/', '/deals/home-depot/', '/deals/amazon/',
  '/deal/walmart-shark-navigator-vacuum/', '/deal/lowes-blackstone-36-griddle/',
  '/deal/bestbuy-samsung-odyssey-monitor/', '/deal/homedepot-dewalt-drill-kit/',
  '/deal/amazon-ninja-air-fryer/', '/deal/walmart-lg-55-4k-tv/',
  '/deal/amazon-ring-video-doorbell/', '/deal/lowes-kobalt-tool-storage/',
];

function xml(value) {
  return String(value).replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
}

export async function onRequestGet(context) {
  const guides = await publicGuides(context.env);
  const urls = [
    ...STATIC_PATHS.map((path) => ({ loc: `https://sniperplug.com${path}`, lastmod: null })),
    ...guides.map((guide) => ({ loc: `https://sniperplug.com/guides/${encodeURIComponent(guide.slug)}/`, lastmod: guide.updatedAt || guide.publishedAt })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => `  <url><loc>${xml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xml(String(entry.lastmod).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
