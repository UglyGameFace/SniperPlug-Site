# Active Task

## Active task / outcome
No implementation task is currently active. The public-logo single-source optimization is completed and merged.

## Completed outcome
PR #57, **Make the public logo single-source**, removed the duplicate embedded/runtime SniperPlug logo path and made `/assets/sniperplug-logo-exact.png` the sole authoritative logo image source.

## Root cause removed
- `site-shell.css` already rendered `.brand-mark` from the approved static PNG.
- `site.js` separately embedded the exact same PNG as a large base64 payload, created an `<img>`, restyled the mark inline, and replaced its contents after DOMContentLoaded.
- That second renderer provided no unique behavior while increasing public JavaScript payload, startup DOM work, and branding drift risk.

## Changes merged
- Removed the embedded base64 PNG from `assets/js/site.js`.
- Removed the duplicate `.brand-mark` runtime query, image creation, inline logo styling, DOM replacement, and branding data attributes.
- Preserved mobile Owner access pinning and deal-card filtering behavior in `site.js`.
- Removed dead `.brand-mark img` CSS left behind by the runtime renderer.
- Kept `.brand-mark` rendering the approved static PNG through the global shell CSS.
- Kept the approved PNG unchanged at 96×96 with SHA-256 `3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86`.
- Updated homepage/public-theme audits to require the single static/CSS owner and fail if an embedded/runtime logo renderer reappears.
- Updated Cloudflare preview and production smoke checks to validate the exact static PNG, the single CSS reference, absence of the old runtime duplicate, and retention of the remaining public runtime behavior.

## Validation / results
- [x] Implementation diff inspected: seven scoped files only; no Control Center, importer, auth, tenant, publication, recovery, billing, or private-guide implementation changed.
- [x] PR head `0c7ccc54cf2a79885c7f5087f19b2a55c0eb3e3e` passed Verify SniperPlug #1034 and affiliate-ready preview #110.
- [x] Final PR head `c04eb5a789f5c74cd9463e0b2e327da98384647f` passed Verify SniperPlug #1035 and affiliate-ready preview #111.
- [x] Final PR state was mergeable with no inline review threads.
- [x] PR #57 merged to `main` as `85894041773d48a76e0b70834fa112676dfdf52f`.
- [x] Post-merge Verify SniperPlug #1036 passed, including the complete Node 22 build/regression suite and Firefox Android extension packaging.
- [x] Post-merge affiliate-ready production #80 passed against the deployed public visual route surface and the new single-source logo contract.
- [x] Post-merge production guide privacy #84 passed.
- [x] Retired-route workflow did not run because none of this task's changed paths are included in that workflow's push/pull-request path filter. The full Node suite still includes the retired-deal static regression, and no retired route implementation changed.

## Safety / compatibility
- No approved artwork bytes changed.
- Logo rendering is now available directly through CSS/static asset delivery and no longer waits for JavaScript or mutates the brand mark after DOMContentLoaded.
- The fallback `SP` markup remains but is visually suppressed by the same `.brand-mark` CSS that owns the PNG, so there is no second image source.
- No auth, Whop access, tenant, publication, backup, media, recovery, billing, or private-guide safety gate was weakened.

## Backlog
- Canonical bulk completed-with-issues UX wording refinement.
- Required branch-check governance if repository administration access becomes available; current `main` branch protection is disabled.
- Issue #25 custom Whop app readers.
- Paid-subscriber authentication/billing onboarding.
- Larger product/brand redesign work.

## Next step
No coding task is active. Select the next focused improvement from the backlog rather than combining unrelated changes into this completed optimization.
