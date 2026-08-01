# Active Task

## Task
Make the public `SniperPlug.com` website credible, visually consistent, and complete for a Newegg affiliate-program review.

## Status
Merged and production-validated. The affiliate-content cleanup, shared green/blue theme, and approved SniperPlug logo are live. One final Samsung Internet visual confirmation remains before closing this task and submitting the Newegg affiliate application.

## Confirmed root causes
- Deals, retailer coverage, About, Partners, and Contact used shared homepage component classes without loading the stylesheet that defined them. PR #7 repaired that execution path.
- Headers and footers still rendered the temporary `<span class="brand-mark">SP</span>` badge after a proper SniperPlug plug-mark logo was approved.
- Copying custom image markup into every page would have created duplicate branding implementations and future drift.
- The first logo production check waited only for already-existing Deals-page markers, then tested the new logo before Cloudflare finished publishing it. PR #9 corrected that readiness gate.

## Implemented changes
### Public theme
- PR #7 loaded the shared green/blue visual layer on Deals, Walmart, Lowe’s, Best Buy, Home Depot, Amazon, About, Partners, and Contact.
- Added permanent static, Cloudflare preview, and production checks for shared cards, gradients, grids, and responsive rules.

### Shared SniperPlug logo
- PR #8 added `assets/sniperplug-logo.svg`, a compact scalable green/cyan SP monogram with an electrical plug on the dark rounded-square treatment.
- Reused the existing shared `assets/js/site.js` path instead of editing every header and footer separately.
- Every `.brand-mark` keeps its text fallback, then receives the shared logo after DOM readiness.
- Preserved the existing 42×42 footprint, rounded shape, mobile owner-link behavior, navigation spacing, and accessible brand-link label.
- Added build checks for the logo asset and runtime integration.
- Extended Cloudflare preview and production checks to retrieve and inspect the deployed SVG and shared runtime.
- PR #9 made production wait for the current Deals page, SVG logo, and runtime together before validating the rest of the deployment.

## Validation completed
- PR #7 was squash-merged as `2152b001f34322b5d31fd8f38672207a6e25d352`.
- PR #8 was squash-merged as `7486678c4a887cb55775d601aea572665b60c0eb`.
- PR #9 was squash-merged as `842b176e0e5103a0c4d4c3bcf245fa83e13e6d5e`.
- Full Node 22 suites passed for the theme, logo, and corrected production-readiness changes, including affiliate, private-guide, Whop, security, recovery, media, concurrency, and resilience regressions.
- Cloudflare branch preview passed for the shared theme and logo.
- Main production passed the corrected affiliate-readiness workflow, including the SVG, shared runtime, retailer pages, legal pages, retired URLs, sitemap, and custom-domain safety path.
- Main production private-guide protection passed.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] No demo/sample/launch-placeholder content or unverified public prices remain.
- [x] Exact-destination, legal, partner, private-guide, sitemap, and production safety requirements pass.
- [x] Shared public theme matches the green/blue SniperPlug homepage design.
- [x] A single reusable logo asset exists.
- [x] Existing shared brand locations use one runtime integration rather than duplicate page-specific patches.
- [x] Logo asset and runtime have permanent Node 22, preview, and production checks.
- [x] PR #8 is merged.
- [x] PR #9 removes the production propagation race.
- [x] Main production serves and validates the new logo asset and runtime.
- [ ] Owner confirms the header logo looks correct in Samsung Internet without navigation overflow.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
