# SniperPlug Site v2 — Cloudflare Pages

A Cloudflare Pages-ready affiliate/deal publisher site for SniperPlug.

## What is included

- Homepage with partner-safe positioning
- `/deals/` deal board with search/store/category filters
- Store pages:
  - `/deals/walmart/`
  - `/deals/lowes/`
  - `/deals/best-buy/`
  - `/deals/home-depot/`
  - `/deals/amazon/`
- Individual deal detail pages under `/deal/<deal-id>/`
- Affiliate/tracked redirect structure under `/go/<deal-id>` using Cloudflare Pages Functions
- Partner page for retailer/API/affiliate approval reviewers
- Contact, privacy, terms, and affiliate disclosure pages
- `_headers`, `_redirects`, `robots.txt`, and `sitemap.xml`
- Seed data in `/data/deals.json`

## Cloudflare Pages deployment

Use these settings:

- Framework preset: None / Static HTML
- Build command: `exit 0`
- Build output directory: `/` or `.`

If Cloudflare does not accept `/`, use `.`.

## Important before public launch

The included deal records are seed/example content. Replace each deal in `/data/deals.json`, individual HTML pages, and `functions/go/[id].js` with live verified SniperPlug deal data before sending real traffic.

For affiliate links, replace each URL in `functions/go/[id].js` with the approved affiliate/tracking URL from Walmart, Lowe's, Best Buy, Home Depot, Amazon, FlexOffers, Impact, or another approved network.

## Email addresses used

- Support: `support@sniperplug.com`
- Partnerships: `partners@sniperplug.com`

## Editing store/deal pages

This package is static. To add a new deal quickly:

1. Copy an existing folder in `/deal/`.
2. Rename it to the new deal ID.
3. Edit the title, price, was price, savings, variant, status, and retailer notes.
4. Add a card to `/deals/index.html` and the matching `/deals/<store>/index.html`.
5. Add the redirect target to `functions/go/[id].js`.
6. Update `/data/deals.json` and `sitemap.xml`.

Later, your Discord bot can write deals into Supabase, Cloudflare D1/KV, or a JSON file and the website can render live deals automatically.
