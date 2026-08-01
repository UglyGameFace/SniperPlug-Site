# Active Task

## Task
Make the public `SniperPlug.com` website credible, visually consistent, and complete for a Newegg affiliate-program review.

## Status
Active. The affiliate-content and shared-theme work is production-validated. The first logo implementation used a substitute SVG instead of the exact artwork approved by the owner. The exact-artwork correction is implemented on `fix/exact-sniperplug-logo` and still requires full regression, preview, merge, production validation, and normal-browser acceptance.

## Confirmed root causes
- Deals, retailer coverage, About, Partners, and Contact used shared homepage component classes without loading the stylesheet that defined them. PR #7 repaired that execution path.
- The first branding implementation recreated the visual as SVG rather than using the exact owner-approved image.
- The owner-approved source contained a square 512×512 neon SP plug icon; rendering a substitute was not equivalent.
- Stretch risk existed unless the runtime enforced a square intrinsic size, `object-fit: contain`, and a fixed 1:1 aspect ratio.
- Keeping the substitute SVG after switching artwork would allow conflicting branding to return later.

## Implemented changes
### Public theme
- PR #7 loaded the shared green/blue visual layer on Deals, Walmart, Lowe’s, Best Buy, Home Depot, Amazon, About, Partners, and Contact.
- Added permanent static, Cloudflare preview, and production checks for shared cards, gradients, grids, and responsive rules.

### Exact SniperPlug logo on `fix/exact-sniperplug-logo`
- Losslessly resized the exact approved 512×512 source to a web-efficient 96×96 PNG for a 42px header display.
- Embedded those exact PNG bytes in the existing shared `assets/js/site.js` path, avoiding manual binary uploads and duplicate per-page markup.
- Preserved the text fallback and shared brand-link accessibility.
- Enforced `object-fit: contain`, `aspect-ratio: 1 / 1`, equal intrinsic dimensions, zero padding, hidden overflow, and the existing rounded-square footprint.
- Added `data-brand-artwork="owner-approved-exact"` runtime state for deployed verification.
- Removed the incorrect substitute `assets/sniperplug-logo.svg`.
- Added a Node audit that decodes the embedded PNG and verifies:
  - valid PNG signature;
  - exact 96×96 dimensions;
  - exact SHA-256 checksum `3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86`;
  - proportional, non-distorting rendering rules;
  - absence of the substitute SVG.
- Updated Cloudflare preview and production checks to validate the same PNG bytes and rendering contract after deployment.

## Validation completed
- PR #7 was squash-merged as `2152b001f34322b5d31fd8f38672207a6e25d352`.
- Earlier affiliate, legal, theme, private-guide, Whop, security, media, recovery, concurrency, and production checks passed.
- Exact approved source SHA-256: `6d40df40afaa275f1816af789bb1975b38d26ab87a81cc61419d9a5aef0d1788`.
- Exact web derivative SHA-256: `3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86`.
- Branch implementation and cleanup are complete; CI and deployment validation are pending.
- Vercel free-plan build-limit failures remain unrelated; Cloudflare Pages is the production runtime.

## Required acceptance
- [x] No demo/sample/launch-placeholder content or unverified public prices remain.
- [x] Exact-destination, legal, partner, private-guide, sitemap, and production safety requirements pass.
- [x] Shared public theme matches the green/blue SniperPlug homepage design.
- [x] The exact owner-approved logo artwork replaces the substitute recreation.
- [x] Rendering preserves a square aspect ratio without stretching or smushing.
- [x] The obsolete substitute SVG is removed.
- [x] Exact bytes, dimensions, checksum, and render contract have permanent audits.
- [ ] Full Node 22 suite passes on the exact-logo branch.
- [ ] Cloudflare branch preview serves and validates the exact-logo runtime.
- [ ] Changed-file and conflict inspection pass.
- [ ] Exact-logo PR is merged.
- [ ] Main production passes the exact-logo and existing affiliate/security checks.
- [ ] Owner confirms the exact logo looks flush and proportional in Samsung Internet without navigation overflow.

## Backlog after acceptance
- Submit the Newegg affiliate application through its Rakuten partnership flow.
- Add Newegg deal cards only after approval and only with exact deep links and verified product records.
- Large-video archival storage for private Whop content remains deferred.

## Scope lock
Do not start Discord deal-bot changes, large-video storage, or another feature until this Newegg readiness task satisfies its Definition of Done, unless the owner sends the exact FORCE SWITCH instruction.
