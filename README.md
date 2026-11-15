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

## Owner-only SniperPlug operations dashboard

The Android/desktop owner workspace at **/operations/** is a real operations
dashboard for the canonical Discloud SniperPlug bot, not a GitHub or release
viewer. It displays signed bot observations: live connection and guild readiness,
Walmart verification queue and exact-price items, actual public post receipts,
fanout decision reasons, worker failures and timeouts, catalog progress and
historical snapshots.

- `GET /api/sniperplug-ops/live` requires the existing owner Control Center
  session, is strictly read-only, returns only bounded sanitized telemetry and
  labels no-source and stale evidence explicitly.
- `POST /api/sniperplug-ops/pair` is available only through the separate /operations/settings/ owner setup view. Owner
  creates/rotates a one-time high-entropy connection token, stored only as a
  derived HMAC key in D1. The token must be installed in the Discloud bot's
  environment by the owner, never committed or shared in public.
- `POST /api/sniperplug-ops/ingest` accepts at most 64KB of recent HMAC-signed
  aggregate telemetry, with a 5-minute timestamp check, idempotent UUIDs and
  14-day retention. The only changed data store is the isolated site
  observability table (migration `0008_sniperplug_operations.sql`).
- Live data requires the paired telemetry-enabled SniperPlug bot to be **safely
  deployed** after an external backup of its Discloud local SQLite. This site
  cannot infer bot deployment from a GitHub merge.
- Independent missed-deal evidence, per-query revisit metrics, live retailer
  checkout proof, jewelry authenticity and net resale sold comps remain
  unknown until separately instrumented. No fake live metrics or product prices.
- The obsolete GitHub-only dashboard API, scheduled metadata exporter and
  repository snapshot have been removed.

Details: `migrations/0008_sniperplug_operations.sql` and the SniperPlug
bot's `docs/SNIPERPLUG_OPERATIONS_DASHBOARD.md`.

## Validation

```bash
npm run build
```

The Node 22 build runs public affiliate-review audits plus the existing private-guide, Whop discovery/import, security, concurrency, recovery, media, and resilience regressions.

The operation workspace deliberately does not equate an existing remote branch to an unmerged change; local-only branches cannot be observed from GitHub. The public GitHub snapshot is committed to the site repository and served only through the existing owner session at `/api/deal-ops`. GitHub Actions may fail to refresh during outages; old evidence remains dated and marked stale.

The operations homepage contains no key generation/rotation controls or cleartext
pairing instructions. Pairing and key rotation live at `/operations/settings/`,
reachable from Reliability. The existing owner session is enforced on both.
The one-time key is cleared from the browser UI on copy, dismiss, and page exit.
Paired-without-reports is shown separately from a connected Discloud bot; adding
a key to an already-running Discloud process requires a restart and verified
local SQLite backup. A paired key alone is **not** a live report.
