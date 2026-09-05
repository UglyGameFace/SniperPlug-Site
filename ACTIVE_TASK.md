# Active Task

## Active task / outcome
Perform the complete SniperPlug production integrity audit requested in issue #20, eliminate confirmed duplicate/conflicting UI, route, script, request, handler, and persistence paths, then add the highest-value structural improvements that reduce recurrence without weakening existing safety or compatibility.

## Scope lock
- Active scope: issue #20 whole-site integrity audit and directly justified repairs/improvements across public routes, private guides, Control Center, middleware/API routes, Cloudflare Pages routing, client scripts/styles, persistence, and CI coverage.
- This task may remove or consolidate redundant implementations only after their callers and compatibility role are verified.
- Issue #25 and paid-subscriber onboarding remain backlog unless a finding is required for issue #20 correctness.
- Do not weaken auth, membership, tenant, origin, link, media, recovery, backup, publication, or private-guide isolation.

## Prior task closure
- PR #55 merged the Unpublish & edit lifecycle repair as `c9c26fcfb65755ff5543e4971fabfb1eedc6e98b`.
- Exact-head and post-merge full Node 22 validation passed, along with production private-guide privacy and affiliate/visual-route checks.
- The owner confirmed on the real tablet that **Unpublish & edit now works**, satisfying the remaining real-device acceptance gate for the previous task.

## Current status
- Audit branch: `audit/site-wide-integrity`, based on `main` at `54ca4f0901874fd8fa14f62ff2b16864a3ae6807`.
- PR #56: **Audit and eliminate duplicate site runtime paths**.
- The repository surface, routing layers, static pages, Control Center runtime loaders, compatibility modules, API aliases, persistence regressions, and production/preview workflows have been traced against the existing test contracts.
- Exact-head PR validation at `6337db48dbe1f307671eea58ee2072610e74eca4` passed the full Node 22 suite, affiliate-ready Cloudflare preview, and retired public route smoke.
- No inline PR review threads are open.

## Findings
### Confirmed redundant/conflicting behavior repaired
1. Four root meta-refresh pages duplicated Cloudflare `_redirects` ownership for `/contact.html`, `/privacy.html`, `/affiliate-disclosure.html`, and `/legal-disclaimer.html`. No runtime callers require those files; the authoritative 301 rules remain in `_redirects`. The duplicate static shims were removed.
2. `control-center-bulk-status.js` independently polled `/api/bulk-jobs` and rewrote the same bulk-job title, summary, progress, and hold surfaces already owned by `control-center-v2.js`. The canonical runtime already has durable `jobApi`, `loadBulkJob`, `progressSummary`, `renderJob`, resume/cancel, and lazy workflow loading. The duplicate poller and lifecycle loader were removed.
3. Root middleware gave ordinary public pages the same permissive style/frame CSP needed by private/control surfaces. Public static pages use shared external CSS and no frames, so middleware now has separate strict public, private/control compatibility, and course-video policies.

### Compatibility inspected and intentionally retained
- Retired `/deal/*` and `/go/*` protection remains intentionally layered across `_redirects`, middleware, and nested fail-closed Functions because mixed deployments must never expose stale public deals.
- The legacy `/api/recovery` alias remains a tested compatibility adapter to the canonical guide-repair implementation.
- Legacy owner cookies, source-policy/category migration inputs, old bulk-job rows, and session cleanup remain because current migrations/tests still consume them.
- `control-center-network-guard.js` remains the authoritative fetch/version/timeout layer; lifecycle only loads that same guard for a stale cached page when it is genuinely absent.
- `control-center-decision-lock.js` remains because it serializes opposite logical decision writes across different buttons, which the canonical per-button busy guard does not replace.
- `control-center-browser-compat.js` remains because it was introduced to prevent blank Control Center cards on Samsung Internet by neutralizing unstable content-visibility behavior on the affected cards.
- `control-center-post-history-fix.js`, `control-center-recovery.js`, `control-center-bulk-reset.js`, and the preview/media section of `control-center-integrity-fix.js` each retain distinct responsibilities after caller/path inspection. No second guide-status mutation remains in the integrity layer.

## Structural improvements added
- Added `tools/audit-site-integrity.mjs` to every build. It walks all site HTML and shared browser assets and fails on duplicate DOM IDs, repeated local scripts/styles, multiple canonicals, inline event handlers, missing local assets, duplicate redirect sources, duplicate legacy route ownership, conflicting Control Center runtime loaders, return-to-draft lifecycle regressions, exact duplicate browser scripts, or loss of public/private CSP separation.
- Public pages now use a tighter CSP with no `unsafe-inline` styles and `frame-src 'none'`; private/control surfaces keep only the compatibility they actually require.
- The existing full regression suite remains authoritative for D1 tenant uniqueness, source/post ownership, capture idempotency, scan persistence, import concurrency, guide versioning, publish/unpublish duplicate prevention, recovery ownership, and durable bulk jobs. Those checks all passed on this branch.

## Validation / results
- [x] Inventory static/public/private/control routes and loaded/dynamically loaded client modules.
- [x] Check duplicate IDs, scripts/styles, canonicals, static redirect ownership, shared browser-script byte duplicates, and local asset references.
- [x] Trace high-risk Control Center capture handlers, observers, timers, dynamic loaders, and mutation/render ownership.
- [x] Check API/middleware aliases, repeated requests, retry/version guards, stale response handling, and intended fail-closed compatibility layers.
- [x] Check D1/source/post/guide duplicate protections through existing tenant, persistence, concurrency, capture, versioning, and publish-roundtrip regressions.
- [x] Verify removed files and runtime layers against direct callers, history, existing tests, and Cloudflare routing behavior.
- [x] Remove confirmed duplicate route shims and duplicate bulk-status polling/render ownership.
- [x] Add a repository-wide recurrence audit and include it in `npm run build`/`npm run audit`.
- [x] Tighten the public CSP without changing the private/control/course-video compatibility contracts.
- [x] Exact-head full Node 22 build/regression suite passed in PR run #1030.
- [x] Cloudflare affiliate-ready preview run #108 passed on the same PR head.
- [x] Retired public route preview run #109 passed on the same PR head.
- [x] Final PR diff inspected for scope and accidental changes.
- [x] PR review-thread inspection found no inline review threads.
- [ ] Fresh exact-head validation after this final task-record update.
- [ ] Merge PR #56 only after that exact head is green.
- [ ] Post-merge full Node 22, production guide-privacy, affiliate/visual-route, and retired-route checks.

## Cleanup / conflicts
- `control-center-v2.js` remains the canonical bulk workflow and normal Control Center mutation/render runtime.
- The removed bulk-status file did not own persistence or mutation logic; it was a second read/render layer on top of the canonical durable workflow.
- No auth, Whop access, tenant, publication, backup, media, recovery, or private-guide gate was weakened.
- No unrelated redesign, importer feature, generated artifact, secret, or dependency change is in PR #56.

## Improvements identified but intentionally not mixed into this integrity PR
- `assets/js/site.js` still embeds an exact base64 copy of the logo even though `site-shell.css` already uses the same static PNG. Removing that duplicate payload would reduce public JS bytes, but the current preview/production logo-integrity workflows explicitly validate both copies; it should be a focused public-asset optimization with those contracts updated together rather than casually folded into this audit.
- The canonical bulk-job renderer can eventually absorb the richer completed-with-issues wording that the removed status adjunct used. Current canonical rendering still preserves durable state, counts, held totals, timelines, resume/cancel behavior, and warning state, so this is a UX refinement rather than a correctness blocker.
- Main branch protection/required-check policy is a repository-governance improvement worth enabling if repository administration access is available; it is outside the application-code integrity fix.

## Blockers / risks
- Static/CI inspection cannot perfectly reproduce every authenticated owner interaction, but PR #56 removes a passive duplicate poll/render layer rather than changing guide publish/edit controls. The prior real-device guide lifecycle remains unchanged.
- GitHub code search can briefly lag branch updates; direct branch reads and exact-head CI were used as the authority.

## Backlog
- Issue #25 custom Whop app readers beyond what is required to validate duplicate/unsupported paths.
- Paid subscriber authentication/billing onboarding.
- Public-logo payload consolidation and related smoke-contract simplification.
- Bulk completed-with-issues copy consolidation into the canonical v2 renderer.
- Larger product/brand redesign changes that are preference-driven rather than integrity/usability findings from this audit.

## Next step
Require a fresh exact-head PR #56 build after this record update, merge only if it remains green, run the post-merge production checks on `main`, then close issue #20 if those checks stay green.
