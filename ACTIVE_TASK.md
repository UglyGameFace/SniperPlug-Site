# Active Task

## Task
Make the public `SniperPlug.com` website credible and complete for a Newegg affiliate-program review.

## Status
Merged and production-validated. The implementation, full regression suite, Cloudflare branch preview, raw Pages production deployment, and custom-domain safety check pass. One final human mobile/desktop visual confirmation remains before recommending application submission without reservation.

## Root causes repaired
- Eight static deal pages and store boards published invented example prices, discounts, timestamps, and availability language as current offers.
- Click-out routes sent those cards to broad retailer search results instead of exact product/SKU destinations.
- Public seed data and repository documentation identified the site as unfinished launch/example content.
- The privacy page called itself a starter policy and omitted current session, OAuth, affiliate, provider, retention, and user-choice disclosures.
- The homepage preview contained a specific unverified price.
- The sitemap advertised every demo deal page.

## Implemented changes
- Deleted all eight unverified static deal pages.
- Added a controlled `/deal/*` retirement route and removed broad retailer-search targets from legacy `/go/*` links.
- Emptied public seed deals and documented exact-product publication requirements.
- Replaced the deal board with an honest empty verified state and exact-destination policy.
- Rebuilt Walmart, Lowe’s, Best Buy, Home Depot, and Amazon coverage pages without invented offers or prices.
- Removed the unverified homepage price and labeled the interface example as non-live.
- Rewrote Privacy, Affiliate Disclosure, Terms, About, Contact, Partners, and repository documentation.
- Removed retired deal pages from the sitemap.
- Added permanent Node 22 affiliate-reviewer audits.
- Added Cloudflare preview and production smoke workflows for public reviewer pages, retired URLs, banned demo content, and sitemap output.

## Validation completed
- PR #6 was squash-merged into `main` as `2c52db0e0d8bfe39a9cfe9c8d40eb878e599d5ae`.
- `ci/sniperplug-node22` passed on the merged commit, including every existing private-guide, Whop, security, concurrency, recovery, media, and resilience regression.
- `ci/sniperplug-production-guide-privacy` passed on the merged commit.
- `ci/sniperplug-production-affiliate-readiness` passed on the merged commit.
- Raw Pages production served the new affiliate-ready homepage after deployment propagation.
- Production checks passed for Deals, Walmart, Best Buy, Partners, Privacy, Affiliate Disclosure, Terms, retired deal redirects, and sitemap output.
- The production sitemap contains the reviewer-critical public pages and no retired `/deal/*` entries.
- The custom domain returned no retired or banned content. Automated requests received Cloudflare’s bot challenge, while the raw Pages hostname proved the deployed application content.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] No demo/sample/launch-placeholder language remains on public pages or public data.
- [x] No public price, discount, availability, or last-checked claim exists without a verified exact product destination.
- [x] Demo deal pages are removed from the sitemap and retired safely.
- [x] The deal board and store pages truthfully show the current publishing state.
- [x] Privacy policy accurately describes current data handling and contact choices.
- [x] Affiliate disclosure and terms are complete and consistent with the site behavior.
- [x] Homepage, about, partners, contact, legal pages, and retailer pages pass a reviewer-style audit.
- [x] Node 22 build, targeted tests, conflict inspection, and cleanup pass.
- [x] Cloudflare preview and raw production deployment pass automated reviewer inspection.
- [x] PR #6 is merged and main production checks pass.
- [ ] `SniperPlug.com` receives one final human mobile/desktop visual check after the production deployment.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
