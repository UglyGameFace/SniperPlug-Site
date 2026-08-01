# Active Task

## Task
Make the entire `SniperPlug.com` route surface visually consistent and complete for a Newegg affiliate-program review.

## Status
Merged and production-validated. PR #11 unified the visual route surface, and PR #12 corrected the production-readiness poll so Cloudflare propagation cannot cause a false failure. Node 22, private-guide privacy, the Cloudflare branch preview, and the full production affiliate/visual matrix pass. One final owner visual confirmation in Samsung Internet remains before closing this task and submitting the Newegg affiliate application.

## Confirmed root causes
- The prior consistency check covered only selected marketing pages and mostly verified stylesheet links rather than the actual route shell.
- Terms, Privacy, Affiliate Disclosure, the 404 page, the locked private-guide page, generated guide pages, and the Control Center were outside that permanent visual contract.
- The visual rules were split ambiguously between foundational and richer marketing styles, making cascade order and page coverage easy to drift.
- `404.html` did not use the normal site header or footer.
- The locked private-guide page did not use the normal footer and did not load the shared brand runtime.
- Pages without `site.js` could fall back to the temporary text badge even though the exact logo artwork was already approved.
- Shared CSS, JavaScript, and branding assets had no explicit revalidation policy, allowing mixed browser/CDN generations after a deployment.
- The first production readiness loop enabled Bash `errexit` during a mixed-generation Cloudflare rollout and exited after its first retry.

## Implemented changes
### Ordered visual layers
- `assets/css/styles.css` is a two-line aggregator that loads `site-base.css` first and `site-shell.css` second.
- `assets/css/site-base.css` owns tokens and foundational components.
- `assets/css/site-shell.css` owns the global header, exact-logo fallback, navigation state, page heroes, legal layout, footer, private/owner surfaces, error shell, and responsive consistency.
- `assets/css/homepage.css` contains only richer marketing components and is loaded exactly once by the routes that use those components.
- The architecture avoids duplicate rule sets and ensures the global shell overrides the foundation before any page-specific layer.

### Exact branding
- Added the actual binary `assets/sniperplug-logo-exact.png`; no text-transcribed or recreated SVG remains.
- The PNG is 96×96 and must match SHA-256 `3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86`.
- Static fallback and JavaScript-enhanced rendering both enforce square, proportional `contain` behavior.
- Static and runtime logo bytes are compared in preview and production checks.

### Route shells
- Rebuilt `404.html` with the shared header, footer, logo, actions, and responsive error card.
- Separated the 404 container from its visual card for clean layout ownership.
- Brought the locked private-guide page into the shared header/footer/runtime path.
- Preserved generated guide and Control Center specialized styles after the shared shell.
- Added revalidation headers for shared CSS, JavaScript, and the exact PNG.

### Permanent validation
- Replaced the narrow theme test with a full route-surface audit covering 14 static routes, 10 marketing routes, legal pages, the 404 page, generated guide templates, the locked guide screen, Control Center ordering, exact logo bytes, and cache behavior.
- Expanded Cloudflare preview and production workflows to check ordered CSS layers, representative public/retailer/legal/error routes, branding bytes, retired URL behavior, sitemap safety, and affiliate readiness.
- Restored Cloudflare Pages' actual 28-character branch alias and added named checkpoints so failures identify the exact route or layer.
- Production polling now keeps unset-variable and pipe-failure protection active while delaying `errexit` until one complete Cloudflare generation is available.

## Validation completed
- Root execution paths, callers, templates, CSS layers, private gates, Control Center styles, redirects, and existing audits were inspected before implementation.
- PR #11 was squash-merged as `d5bcdf302c04acb0a747e8d586e11a181232e6c0`.
- PR #12 was squash-merged as `174ba33c4739fc6e0f3bd78ff76cd945136c831e`.
- The exact binary PNG was committed and verified against the approved derivative.
- Full Node 22 regression passed on the visual branch, the production-readiness hotfix, and current `main`.
- Cloudflare branch preview passed the complete named public, retailer, legal, 404, CSS-layer, exact-logo, retired URL, and sitemap matrix.
- Main production passed `ci/sniperplug-production-affiliate-readiness`.
- Main production passed `ci/sniperplug-production-guide-privacy`.
- Main production passed `ci/sniperplug-node22`.
- Changed-file scope, mergeability, stale-logo references, duplicate marketing imports, and review threads were inspected and clean.
- The first SVG wrapper attempt was rejected by checksum validation and removed rather than patched.
- The full-route audit correctly caught the combined 404 utility/card markup; that structure was cleaned up before merge.
- The accidental one-word placeholder created while resolving the GitHub branch API was immediately deleted from `main`; no application or deployment file was altered by it.
- Exact approved source SHA-256: `6d40df40afaa275f1816af789bb1975b38d26ab87a81cc61419d9a5aef0d1788`.
- Exact web derivative SHA-256: `3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86`.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] Root causes and real route/template execution paths inspected.
- [x] Ordered base, global shell, and page-specific component layers implemented.
- [x] Legal, error, locked-guide, generated-guide, and Control Center surfaces included in permanent audits.
- [x] Exact approved PNG remains checksum-protected and proportionally rendered.
- [x] Obsolete SVG-wrapper branding path removed.
- [x] Shared assets use explicit revalidation headers.
- [x] Targeted full-route visual audit passes.
- [x] Full Node 22 regression suite passes.
- [x] Cloudflare branch preview passes every named route/layer checkpoint.
- [x] No obsolete, duplicate, or conflicting theme implementation remains.
- [x] Changed-file and conflict inspection pass.
- [x] Visual-consistency PR is merged.
- [x] Production-propagation guard is merged.
- [x] Main production passes affiliate, private-security, and full visual-route checks.
- [ ] Owner confirms representative pages look consistent in Samsung Internet without navigation overflow.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
