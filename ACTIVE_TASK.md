# Active Task

## Task
Make the public `SniperPlug.com` website credible, visually consistent, and complete for a Newegg affiliate-program review.

## Status
Active. The affiliate-content and shared-theme work is merged and production-validated. The owner accepted the corrected Deals-page theme and requested the newly approved SniperPlug logo in the shared brand badge. The logo implementation is validated on a branch and still requires merge, production validation, and one final Samsung Internet check.

## Confirmed root causes
- Deals, retailer coverage, About, Partners, and Contact used shared homepage component classes without loading the stylesheet that defined them. PR #7 repaired that execution path.
- Headers and footers still rendered the temporary `<span class="brand-mark">SP</span>` badge even after a proper SniperPlug plug-mark logo was approved.
- Copying custom image markup into every page would create duplicate branding implementations and future drift.

## Implemented changes
### Public theme
- PR #7 loaded the shared green/blue visual layer on Deals, Walmart, Lowe’s, Best Buy, Home Depot, Amazon, About, Partners, and Contact.
- Added permanent static, Cloudflare preview, and production checks for shared cards, gradients, grids, and responsive rules.

### Shared SniperPlug logo on `feat/sniperplug-site-logo`
- Added `assets/sniperplug-logo.svg`, a compact scalable green/cyan SP monogram with an electrical plug on the existing dark rounded-square treatment.
- Reused the existing shared `assets/js/site.js` path instead of editing every header and footer separately.
- Every `.brand-mark` keeps its text fallback, then receives the shared logo after DOM readiness.
- Preserved the existing 42×42 footprint, rounded shape, mobile owner-link behavior, navigation spacing, and accessible brand-link label.
- Added build checks for the logo asset and runtime integration.
- Extended Cloudflare preview and production checks to retrieve and inspect the deployed SVG and shared runtime.

## Validation completed
- PR #7 was squash-merged as `2152b001f34322b5d31fd8f38672207a6e25d352`.
- PR #7 Node 22, branch preview, raw production, responsive-theme, private-guide, Whop, security, recovery, media, concurrency, and affiliate checks passed.
- Logo branch full Node 22 suite passed at `80df2493ab032168883c11dff2b572284b7699fc`.
- Logo branch Cloudflare preview passed at `feat-sniperplug-site-logo.sniperplug.pages.dev`.
- The preview confirmed the SVG, gradient monogram, shared `site.js` logo swap, affiliate pages, retailer pages, retired URLs, sitemap, and existing responsive theme.
- The logo branch is based directly on current `main`; no competing implementation or unrelated feature change was added.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] No demo/sample/launch-placeholder content or unverified public prices remain.
- [x] Exact-destination, legal, partner, private-guide, sitemap, and production safety requirements pass.
- [x] Shared public theme matches the green/blue SniperPlug homepage design.
- [x] A single reusable logo asset exists.
- [x] Existing shared brand locations use one runtime integration rather than duplicate page-specific patches.
- [x] Logo asset and runtime have permanent Node 22 and Cloudflare preview checks.
- [x] Logo branch full regression suite passes.
- [ ] PR #8 is merged.
- [ ] Main production serves the new logo asset and runtime.
- [ ] Owner confirms the header logo looks correct in Samsung Internet without navigation overflow.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
