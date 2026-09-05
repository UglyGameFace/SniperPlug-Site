# Active Task

## Active task / outcome
Make the approved SniperPlug PNG the single authoritative public logo source. Remove the duplicate base64 logo payload and duplicate JavaScript logo renderer from `assets/js/site.js`, preserve the current visual result through the shared CSS/static asset path, update all coupled logo-integrity contracts, and validate the exact production behavior before closing the task.

## Scope lock
- Active scope: shared public logo delivery/rendering, `assets/js/site.js`, the global shell CSS contract, homepage/public-theme audits, and the Cloudflare preview/production logo smoke checks directly coupled to that implementation.
- Do not alter the approved PNG bytes, public brand appearance, navigation behavior, deal filtering, Control Center behavior, importer behavior, auth, tenant, publication, recovery, or private-guide safety.
- Bulk completed-with-issues copy, branch-protection governance, issue #25, paid-subscriber onboarding, and redesign work remain backlog.

## Starting state / root cause
- Starting `main`: `803e152994d7b269ed9fecedbe077f3da5b6714c`.
- Working branch: `optimize/logo-single-source`.
- PR #57: **Make the public logo single-source**.
- `site-shell.css` already rendered `.brand-mark` from `/assets/sniperplug-logo-exact.png` as a centered/contained background image.
- `site.js` independently embedded the same approved 96×96 PNG as base64, created another image element, restyled the mark inline, and replaced the mark contents at startup.
- The duplicate runtime path provided no unique logo behavior. It increased public JavaScript bytes and DOM work while creating a second branding contract that could drift.

## Implementation
- [x] Removed the embedded base64 PNG from `site.js`.
- [x] Removed the duplicate `.brand-mark` query/image creation/DOM replacement/runtime branding path instead of replacing it with another JavaScript image URL.
- [x] Preserved the mobile Owner access pinning code and deal-card filtering code in `site.js` unchanged in responsibility.
- [x] Removed the now-dead `.brand-mark img` CSS rule.
- [x] Kept `.brand-mark` rendering the exact static PNG through the global shell CSS.
- [x] Kept the approved static PNG unchanged: 96×96 and SHA-256 `3df6e4d5fc89940a406c2a938c1e30d23e8e96ed54fc5328386d82e780a5fd86`.
- [x] Updated `audit-homepage.mjs` to require the single CSS/static asset owner and fail if base64/runtime logo rendering returns.
- [x] Updated `audit-public-theme.mjs` to enforce the unchanged static PNG and reject dead runtime-image styling.
- [x] Updated affiliate preview and production workflows to validate the exact static PNG, a single CSS logo reference, absence of the runtime duplicate, and retention of Owner-pin/deal-filter behavior.

## Validation / results
- [x] PR #57 implementation diff inspected: seven scoped files only; no Control Center/importer/auth/tenant/publication/recovery/private-guide code changed.
- [x] PR head `0c7ccc54cf2a79885c7f5087f19b2a55c0eb3e3e` passed **Verify SniperPlug #1034**, including the complete Node 22 build/regression suite and Firefox Android extension packaging.
- [x] The same PR head passed **Verify affiliate-ready preview #110** against the Cloudflare branch preview with the new single-source logo contract.
- [x] PR #57 is mergeable and has no inline review threads.
- [x] The retired-route PR workflow correctly did not trigger because none of this PR's changed paths are in that workflow's pull-request path filter. The full Node suite still includes the static retired-deal regression; no retired route implementation is changed here.
- [ ] Fresh exact-head validation after this final task-record commit.
- [ ] Merge PR #57 only after the fresh exact head remains green.
- [ ] Post-merge full Node 22 validation.
- [ ] Post-merge production affiliate/visual validation of the single-source logo.
- [ ] Post-merge private-guide privacy validation.
- [ ] Retired-route production workflow is expected only when its configured path filter is touched; do not fabricate a run when GitHub intentionally does not schedule one.

## Safety / compatibility
- No approved artwork bytes changed.
- CSS remains the visual owner, so logo rendering no longer waits for JavaScript or mutates the brand mark after DOMContentLoaded.
- The fallback `SP` text remains in markup but is visually suppressed by the same `.brand-mark` CSS that owns the PNG, preserving a non-empty mark in the HTML without a second image source.
- No auth, Whop access, tenant, publication, backup, media, recovery, billing, or private-guide gate was weakened.

## Backlog
- Canonical bulk completed-with-issues UX wording refinement.
- Required branch-check governance if repository administration access becomes available; current `main` branch protection is disabled.
- Issue #25 custom Whop app readers.
- Paid-subscriber authentication/billing onboarding.
- Larger product/brand redesign work.

## Next step
Require fresh CI on this exact task-record head. If the Node 22 and Cloudflare preview checks remain green and review state stays clean, merge PR #57 and verify the resulting `main` production deployment before closing this task.
