# Active Task

## Task
Make the entire `SniperPlug.com` route surface visually consistent and complete for a Newegg affiliate-program review.

## Status
Active on `fix/unified-site-visual-system`. The exact owner-approved logo remains protected. A second full-site review confirmed that the prior visual audit covered only selected marketing pages and did not enforce one shared shell across legal, error, private-guide, or owner-tool routes. Implementation is underway; regression, Cloudflare preview, cleanup, merge, production validation, and normal-browser acceptance are still required.

## Confirmed root causes
- The visual system was split between `assets/css/styles.css` and `assets/css/homepage.css`; pages could look different depending on whether a second stylesheet link was remembered.
- The old consistency audit covered only ten hand-picked pages and checked stylesheet presence rather than the rendered route structure.
- Terms, Privacy, Affiliate Disclosure, the 404 page, the locked private-guide page, generated guide pages, and the Control Center were outside that visual audit.
- `404.html` did not use the normal site header or footer.
- The locked private-guide page did not use the normal footer and did not load the shared brand runtime.
- Pages without `site.js` could fall back to the temporary text badge even though the exact logo artwork was already approved.
- Shared CSS and JavaScript assets had no explicit revalidation policy, so browser/CDN caching could preserve mixed generations after a deployment.
- Existing richer pages explicitly loaded `homepage.css`; after moving the shared layer behind `styles.css`, those duplicate links must be removed so only one visual execution path remains.

## Changes on the active branch
- Added `assets/sniperplug-logo-exact.svg`, a reusable self-contained wrapper around the exact approved 96×96 PNG with proportional rendering.
- Extended `assets/css/homepage.css` into the shared shell for headers, navigation, page heroes, legal content, footers, owner/private cards, error pages, and responsive behavior.
- Made `assets/css/styles.css` import the shared visual layer so every route already loading the base stylesheet inherits the same design.
- Rebuilt `404.html` with the shared header, footer, logo, actions, and responsive shell.
- Brought the locked private-guide page into the same header/footer/runtime path.
- Added revalidation headers for shared CSS, JavaScript, and the exact logo asset.
- Replaced the narrow ten-page theme audit with a full route-surface audit covering static public/legal/error routes, generated guide templates, the locked guide shell, Control Center ordering, exact logo bytes, and cache behavior.

## Validation completed
- Root execution paths, callers, templates, CSS layers, private gates, Control Center styles, redirects, and existing audits were inspected before implementation.
- The active branch was created from current `main` after the exact-logo production record.
- The accidental one-word placeholder created while resolving the GitHub branch API was immediately deleted; no application or deployment file was altered by it.
- Exact approved source SHA-256: `6d40df40afaa275f1816af789bb1975b38d26ab87a81cc61419d9a5aef0d1788`.
- Exact web derivative SHA-256: `3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86`.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] Root causes and real route/template execution paths inspected.
- [x] One shared visual layer is reachable from every page through `styles.css`.
- [x] Legal, error, locked-guide, generated-guide, and Control Center surfaces are included in permanent audits.
- [x] Exact approved logo artwork remains checksum-protected and proportionally rendered.
- [ ] Remove redundant explicit `homepage.css` links and update all callers/checks to the single-path architecture.
- [ ] Targeted full-route visual audit passes.
- [ ] Full Node 22 regression suite passes.
- [ ] No obsolete, duplicate, or conflicting theme implementation remains.
- [ ] Changed-file and conflict inspection pass.
- [ ] Cloudflare branch preview passes across public, legal, 404, private-guide, and owner routes.
- [ ] Visual-consistency PR is merged.
- [ ] Main production passes affiliate, private-security, and full visual-route checks.
- [ ] Owner confirms representative pages look consistent in Samsung Internet without navigation overflow.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
