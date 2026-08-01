# Active Task

## Task
Make the public `SniperPlug.com` website credible and complete for a Newegg affiliate-program review.

## Status
Implemented on PR #6 and awaiting the final merge/production verification. The previous Whop/owner workflow is closed for now after the owner cleared the unrecoverable removed import and asked to move on.

## Root causes confirmed
- Eight static deal pages and every store board published invented example prices, discounts, timestamps, and availability language as though they were current offers.
- Click-out routes sent those cards to broad retailer search-result pages instead of exact product/SKU destinations.
- `data/deals.json` explicitly identified the public records as launch/example content that had to be replaced before launch.
- The privacy page called itself a starter policy and omitted operational logs, sessions, OAuth connections, affiliate click-outs, service providers, retention, and user choices.
- The homepage preview contained a specific price without a verified live offer.
- The sitemap advertised every demo deal page.
- The repository README still instructed maintainers to replace public seed data before launch.

## Implemented changes
- Deleted all eight unverified static deal pages.
- Added a controlled `/deal/*` retirement route that redirects old links to the verified deal-board standard.
- Removed every broad retailer-search destination from the legacy `/go/*` route.
- Emptied public seed deals and documented the exact-product publication requirements.
- Replaced the deal board with an honest empty verified state and exact-destination policy.
- Rebuilt Walmart, Lowe’s, Best Buy, Home Depot, and Amazon coverage pages without invented offers or prices.
- Removed the unverified homepage price and explicitly labeled its interface as a non-live record example.
- Rewrote Privacy, Affiliate Disclosure, Terms, About, Contact, Partners, and repository documentation.
- Removed retired deal pages from the sitemap.
- Added an executable affiliate-reviewer audit to every Node 22 build.
- Added a Cloudflare branch-preview smoke test for public reviewer pages, retired links, banned demo content, and sitemap output.
- Added a permanent post-merge production smoke workflow for `sniperplug.pages.dev` and `sniperplug.com`.

## Validation completed
- Full Node 22 build and all existing private-guide, Whop, security, concurrency, recovery, media, and resilience regressions passed on PR head `acb65c987c77a195562e68667433e78e380f5069`.
- The affiliate reviewer audit passed and confirmed:
  - no public demo/sample/starter/replacement language;
  - no unverified public price cards;
  - no broad retailer-search click-outs;
  - all eight static demo pages are absent;
  - retired URLs redirect safely;
  - retailer coverage pages disclose their current empty verified state;
  - privacy, disclosure, terms, partner, contact, and sitemap requirements are present.
- Cloudflare deployed the branch preview successfully.
- The live preview smoke checked the homepage, deal board, Walmart, Best Buy, Partners, Privacy, Affiliate Disclosure, Terms, a retired deal URL, and the sitemap successfully.
- The branch is zero commits behind `main`, mergeable, and contains only the public-reviewer implementation, tests, documentation, and deployment checks.
- Vercel free-plan build-limit failures are unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] No demo/sample/launch-placeholder language remains on public pages or public data.
- [x] No public price, discount, availability, or last-checked claim exists without a verified exact product destination.
- [x] Demo deal pages are removed from the sitemap and retired safely.
- [x] The deal board and store pages truthfully show the current publishing state.
- [x] Privacy policy accurately describes current data handling and contact choices.
- [x] Affiliate disclosure and terms are complete and consistent with the site behavior.
- [x] Homepage, about, partners, contact, legal pages, and retailer pages pass a reviewer-style audit.
- [x] Node 22 build, targeted tests, conflict inspection, and cleanup pass on the validated PR head.
- [x] Cloudflare branch preview passes automated reviewer-page inspection.
- [ ] PR #6 is merged and the main production checks pass.
- [ ] `SniperPlug.com` receives one final human mobile/desktop visual check after the production deployment.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
