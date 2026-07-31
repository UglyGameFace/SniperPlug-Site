# SniperPlug Site v2 — Cloudflare Pages

A Cloudflare Pages affiliate/deal publisher site with private D1-backed guide publishing.

## What is included

- Homepage with partner-safe positioning
- `/deals/` deal board with search/store/category filters
- Store pages for Walmart, Lowe's, Best Buy, Home Depot, and Amazon
- Individual deal detail pages under `/deal/<deal-id>/`
- Affiliate/tracked redirects under `/go/<deal-id>` using Cloudflare Pages Functions
- Public reviewed guides at `/guides/` and `/guides/<slug>/`
- Private guide Control Center at `/control-center/`
- Authorized Whop forum-post importer with source/post approval and draft-first publishing
- Partner, contact, privacy, terms, and affiliate disclosure pages
- Security headers, robots rules, and a guide-aware dynamic sitemap
- Seed deal data in `/data/deals.json`

## Cloudflare Pages deployment

Use these settings:

- Framework preset: None / Static HTML
- Build command: `npm run build`
- Build output directory: `.`
- Root directory: `/`

The build command runs the importer audit. Cloudflare Pages Functions serve the Control Center API, public guide pages, dynamic sitemap, and affiliate redirects.

## D1 guide storage

Create and bind a Cloudflare D1 database as `SNIPERPLUG_DB`, then apply:

```text
migrations/0001_whop_guides.sql
```

D1 privately stores OAuth sessions, exact source and post decisions, imported drafts, owner-managed guide categories, and published guide records. Imported Whop content is never committed to this public repository.

See `docs/WHOP_IMPORTER.md` and `.dev.vars.example` for the required private variables and owner workflow.

## Important before public launch

The included deal records are seed/example content. Replace each deal in `/data/deals.json`, individual HTML pages, and `functions/go/[id].js` with live verified SniperPlug deal data before sending real traffic.

For affiliate links, replace each URL in `functions/go/[id].js` with the approved affiliate/tracking URL from Walmart, Lowe's, Best Buy, Home Depot, Amazon, FlexOffers, Impact, or another approved network.

## Email addresses used

- Support: `support@sniperplug.com`
- Partnerships: `partners@sniperplug.com`

## Editing store/deal pages

The deal board remains static:

1. Copy an existing folder in `/deal/`.
2. Rename it to the new deal ID.
3. Edit the title, price, was price, savings, variant, status, and retailer notes.
4. Add a card to `/deals/index.html` and the matching store page.
5. Add the redirect target to `functions/go/[id].js`.
6. Update `/data/deals.json`.

The dynamic sitemap automatically includes every published D1 guide.

## Validation

```bash
npm run build
```

This checks JavaScript syntax, Unicode/Markdown round trips, unsafe-content rejection, source and post decision enforcement, OAuth security wiring, D1-only draft storage, attachment review gates, and published-only public queries.
