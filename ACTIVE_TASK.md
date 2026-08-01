# Active Task

## Task
Make the public `SniperPlug.com` website credible, visually consistent, and complete for a Newegg affiliate-program review.

## Status
Active. The affiliate-content and production-safety overhaul from PR #6 passed, but the owner’s real Samsung Internet check exposed a visual regression on the Deals page. The affected public pages used shared homepage card, gradient, icon, and responsive classes without loading the stylesheet that defines them.

## Confirmed root cause
- `deals/index.html` and the retailer coverage pages render `section-soft`, `section-kicker`, `capability-grid`, and `capability-card` classes.
- About, Partners, and Contact also use the same shared visual components.
- Those classes are defined in `assets/css/homepage.css`, while the affected pages loaded only `assets/css/styles.css`.
- The browser therefore displayed plain stacked text on a mostly black background instead of SniperPlug’s green/blue gradient cards and responsive layout.
- The existing affiliate readiness checks validated content and deployment, but did not verify that pages loaded the visual layer required by their class names.

## Implemented changes on `fix/public-theme-consistency`
- Loaded the shared SniperPlug visual stylesheet after the base stylesheet on:
  - Deals;
  - Walmart, Lowe’s, Best Buy, Home Depot, and Amazon coverage;
  - About;
  - Partners;
  - Contact.
- Preserved the base-first cascade so colors, spacing variables, and typography exist before shared component rules.
- Added `tools/audit-public-theme.mjs` to verify:
  - every affected page loads both stylesheets in the correct order;
  - the shared stylesheet is not loaded twice;
  - the base green/blue theme variables and background treatment still exist;
  - the card, section, icon, grid, and mobile rules required by those pages remain present.
- Added the new theme audit to every Node 22 build.

## Previous validation retained
- PR #6 was squash-merged into `main` as `2c52db0e0d8bfe39a9cfe9c8d40eb878e599d5ae`.
- Affiliate content, legal pages, exact-destination rules, retired URLs, sitemap cleanup, private-guide isolation, and production safety checks passed.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] No demo/sample/launch-placeholder content or unverified public prices remain.
- [x] Exact-destination, legal, partner, private-guide, sitemap, and production safety requirements pass.
- [x] Root cause of the plain Deals-page rendering is identified in the real CSS execution path.
- [x] All affected public pages load the shared green/blue visual layer after the base theme.
- [x] A permanent public-theme regression audit is included in the build.
- [ ] Full Node 22 build and all existing regressions pass on the visual-fix branch.
- [ ] Cloudflare branch preview serves the corrected styled pages.
- [ ] Mobile and desktop visual checks confirm card backgrounds, green/blue accents, responsive grids, spacing, and footer consistency.
- [ ] The visual fix is merged and production-validated.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
