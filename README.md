# SniperPlug Site — Cloudflare Pages

SniperPlug is a Cloudflare Pages retail deal-discovery and affiliate publisher site with an owner-only D1-backed guide/importer workflow.

## Public site

- Partner-ready homepage with independent-retailer and affiliate disclosures
- `/deals/` publishing standard and current verified-board status
- Retailer coverage pages for Walmart, Lowe's, Best Buy, Home Depot, and Amazon
- Exact-product-only click-out policy
- About, partner, contact, privacy, terms, and affiliate disclosure pages
- Dynamic sitemap and security headers

Unverified demonstration prices and generic retailer-search links are intentionally absent. A public deal record should not be created until the exact product, destination, offer evidence, and relevant context are available.

## Private owner workflow

- Existing owner Control Center at `/control-center/`
- Owner-only guides at `/guides/`
- Authorized Whop discovery/import, source decisions, draft review, media handling, recovery, and publishing
- D1-backed sessions, policy state, drafts, jobs, and guide records
- Private R2 media delivery with owner authorization

Imported private content is not committed to this repository and is not included in the public sitemap.

## Cloudflare Pages deployment

- Framework preset: None / Static HTML
- Build command: `npm run build`
- Build output directory: `.`
- Root directory: `/`

Cloudflare Pages Functions serve private application routes, the dynamic sitemap, retired-link redirects, and future exact deal click-outs.

## Required bindings and secrets

The project uses:

- `SNIPERPLUG_DB` — Cloudflare D1
- `SNIPERPLUG_MEDIA` — Cloudflare R2
- `SNIPERPLUG_ADMIN_PASSWORD`
- `SNIPERPLUG_SESSION_SECRET`
- `WHOP_TOKEN_SECRET`
- Whop OAuth configuration documented in `docs/WHOP_IMPORTER.md`

Apply the migrations in order and keep every private value in Cloudflare Preview and Production secrets rather than source control.

## Publishing a public deal

A future deal pipeline must fail closed unless it has:

1. Exact retailer and product/SKU identity
2. Exact official product page or approved affiliate deep link
3. Product-defining variant information
4. Current visible offer evidence
5. Seller, condition, fulfillment, location, coupon, reward, or eligibility context when relevant
6. Verification timestamp
7. Clear final-price and availability disclaimer

Do not publish a generic retailer search page as an exact deal destination.

## Email addresses

- Support and corrections: `support@sniperplug.com`
- Retailer, API, and affiliate partnerships: `partners@sniperplug.com`

## Validation

```bash
npm run build
```

The Node 22 build runs public affiliate-review audits plus the existing private-guide, Whop discovery/import, security, concurrency, recovery, media, and resilience regressions.
