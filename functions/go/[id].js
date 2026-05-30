const DEAL_URLS = {
  "walmart-shark-navigator-vacuum": "https://www.walmart.com/search?q=shark%20navigator%20lift-away%20vacuum",
  "lowes-blackstone-36-griddle": "https://www.lowes.com/search?searchTerm=blackstone%2036%20griddle",
  "bestbuy-samsung-odyssey-monitor": "https://www.bestbuy.com/site/searchpage.jsp?st=samsung%20odyssey%20gaming%20monitor",
  "homedepot-dewalt-drill-kit": "https://www.homedepot.com/s/dewalt%2020v%20drill%20kit",
  "amazon-ninja-air-fryer": "https://www.amazon.com/s?k=ninja%204%20qt%20air%20fryer",
  "walmart-lg-55-4k-tv": "https://www.walmart.com/search?q=lg%2055%204k%20smart%20tv",
  "amazon-ring-video-doorbell": "https://www.amazon.com/s?k=ring%20video%20doorbell",
  "lowes-kobalt-tool-storage": "https://www.lowes.com/search?searchTerm=kobalt%20tool%20storage"
};

export async function onRequestGet(context) {
  const id = context.params.id;
  const target = DEAL_URLS[id];

  if (!target) {
    return Response.redirect(new URL('/deals/', context.request.url), 302);
  }

  const url = new URL(target);
  url.searchParams.set('utm_source', 'sniperplug');
  url.searchParams.set('utm_medium', 'deal_click');
  url.searchParams.set('utm_campaign', id);

  return Response.redirect(url.toString(), 302);
}
