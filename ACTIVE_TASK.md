# Active Task

## Task
Make the public `SniperPlug.com` website credible, visually consistent, and complete for a Newegg affiliate-program review.

## Status
Merged and production-validated at the code, deployment, stylesheet, and responsive-rule levels. The owner’s final Samsung Internet refresh is the only remaining acceptance item before the Newegg application task can be closed without reservation.

## Confirmed root cause
- Deals, retailer coverage, About, Partners, and Contact rendered shared `section-soft`, `section-kicker`, `capability-grid`, and `capability-card` classes.
- Those classes are defined in `assets/css/homepage.css`, but the affected pages loaded only `assets/css/styles.css`.
- The browser therefore displayed plain stacked text on a mostly black background instead of SniperPlug’s green/blue gradient cards, icons, and responsive grids.
- Earlier affiliate tests validated content and deployment but did not validate the stylesheet execution path required by the markup.

## Implemented changes
- PR #7 loaded the shared visual stylesheet after the base stylesheet on:
  - Deals;
  - Walmart, Lowe’s, Best Buy, Home Depot, and Amazon coverage;
  - About;
  - Partners;
  - Contact.
- Preserved the base-first cascade so color variables, spacing, and typography exist before shared component rules.
- Added `tools/audit-public-theme.mjs` to verify stylesheet presence, order, uniqueness, base theme variables, backgrounds, card rules, icons, grids, and mobile behavior.
- Added that audit to every Node 22 build.
- Strengthened Cloudflare preview and production workflows to inspect every affected deployed page, the stylesheet links, the live shared CSS asset, responsive rules, affiliate safeguards, retired URLs, and sitemap output.

## Validation completed
- PR #7 was squash-merged as `2152b001f34322b5d31fd8f38672207a6e25d352`.
- Full Node 22 build passed, including affiliate, private-guide, Whop, security, media, recovery, concurrency, and resilience regressions.
- The public-theme regression audit passed.
- Cloudflare branch preview passed at `fix-public-theme-consistency.sniperplug.pages.dev`.
- Preview checks confirmed all affected pages load the base and shared stylesheets exactly once and in the correct order.
- Preview checks confirmed the deployed CSS contains `section-soft`, capability grid/card, icon, and mobile breakpoint rules.
- Raw Pages production serves the themed Deals, retailer, About, Partners, and Contact pages.
- The first production smoke ran during deployment propagation and failed; the unchanged rerun passed after propagation.
- The successful production rerun checked all affected pages, the live CSS asset, retired URLs, sitemap output, and custom-domain safety.
- The custom domain returned Cloudflare’s bot challenge to automation rather than stale content; the owner’s normal browser remains the authoritative final visual check.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] No demo/sample/launch-placeholder content or unverified public prices remain.
- [x] Exact-destination, legal, partner, private-guide, sitemap, and production safety requirements pass.
- [x] Root cause of the plain Deals-page rendering was identified in the real CSS execution path.
- [x] All affected public pages load the shared green/blue visual layer after the base theme.
- [x] Permanent static, preview, and production theme regressions are included.
- [x] Full Node 22 build and all existing regressions pass.
- [x] Cloudflare branch preview serves the corrected theme.
- [x] PR #7 is merged and raw production is validated.
- [ ] Owner confirms the production Deals page visually matches the homepage in Samsung Internet, including card backgrounds, green/blue accents, responsive spacing, and footer consistency.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
