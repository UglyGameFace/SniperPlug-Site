# Active Task

## Active task / outcome
Make the approved SniperPlug PNG the single authoritative public logo source. Remove the duplicate base64 logo payload and duplicate JavaScript logo renderer from `assets/js/site.js`, preserve the exact current visual result through the shared CSS/static asset path, update all logo-integrity contracts together, and validate the exact production behavior before merge.

## Scope lock
- Active scope: shared public logo delivery/rendering, `assets/js/site.js`, the global shell CSS contract, homepage/public-theme audits, and the Cloudflare preview/production logo smoke checks directly coupled to that implementation.
- Do not alter the approved PNG bytes, public brand appearance, navigation behavior, deal filtering, Control Center behavior, importer behavior, auth, tenant, publication, recovery, or private-guide safety.
- Bulk completed-with-issues copy, branch-protection governance, issue #25, paid-subscriber onboarding, and redesign work remain backlog.

## Starting state
- `main` is `803e152994d7b269ed9fecedbe077f3da5b6714c` after the completed issue #20 audit record.
- No open PR existed when this task began.
- Working branch: `optimize/logo-single-source`.
- `site-shell.css` already renders `.brand-mark` with `/assets/sniperplug-logo-exact.png` as a centered, contained background image.
- `site.js` independently embeds the same approved 96×96 PNG as a base64 array, creates an `<img>`, styles it inline, replaces every `.brand-mark` child, and marks the element with runtime data attributes.
- `audit-homepage.mjs` plus affiliate preview/production workflows currently require both copies and therefore must be changed in the same task rather than weakened or bypassed.

## Root cause / improvement
The logo currently has two authoritative render paths and two byte copies: static CSS/static PNG and a second embedded runtime PNG. The JavaScript path does not provide unique behavior because the global shell CSS already owns the exact logo rendering. Keeping both increases public JS weight, startup DOM work, and the chance that branding contracts drift.

## Definition of Done
- [ ] Remove the embedded base64 PNG from `site.js`.
- [ ] Remove the duplicate runtime logo DOM replacement/styling path rather than changing it to another duplicate image URL path.
- [ ] Preserve mobile Owner access pinning and deal-card filtering unchanged.
- [ ] Keep the exact static PNG checksum/dimensions contract intact.
- [ ] Update homepage audit to require the static single-source implementation and explicitly reject a reintroduced embedded/runtime logo renderer.
- [ ] Update Cloudflare preview and production smoke checks to validate the CSS/static asset path and reject a reintroduced embedded logo copy.
- [ ] Run exact-head full Node 22 build/regression plus affiliate preview and retired-route checks.
- [ ] Inspect final diff and review threads.
- [ ] Merge only after exact-head validation passes, then require post-merge Node 22, production visual/affiliate, private-guide privacy, and retired-route checks.

## Backlog
- Canonical bulk completed-with-issues UX wording refinement.
- Required branch-check governance if repository administration access is available.
- Issue #25 custom Whop app readers.
- Paid-subscriber authentication/billing onboarding.
- Larger product/brand redesign work.

## Next step
Implement the single-source logo change and update the coupled regression/smoke contracts, then validate the exact branch head before merge.
