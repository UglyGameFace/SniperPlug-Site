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

## Starting state
- Default branch before this audit: `main` at `54ca4f0901874fd8fa14f62ff2b16864a3ae6807`.
- Audit branch: `audit/site-wide-integrity`.
- No open pull requests existed when the audit began.
- Issue #20 is now the active task rather than backlog.
- Existing `npm run build`/`npm run audit` already executes a large Node 22 regression suite covering public theme/readiness, private guides, Whop importer/discovery/auth, browser capture, publish lifecycle, source access, tenant isolation, bulk jobs, Control Center hardening/mobile/network/versioning/recovery/backups, media, course import, and runtime resilience.

## Initial findings
- Public production smoke already checks the major marketing/legal/404 route surface, unified CSS layers, exact logo bytes, retired-deal behavior, sitemap safety, custom-domain behavior, and mixed-generation rollout readiness.
- The repository still contains four root static redirect shim pages (`contact.html`, `privacy.html`, `affiliate-disclosure.html`, `legal-disclaimer.html`) while `_redirects` independently owns the same legacy paths. These are duplicate route implementations and require caller/Cloudflare precedence verification before removal.
- `control-center-v2.js` remains the main runtime while several narrowly scoped compatibility/fix modules still exist. Each must be traced before consolidation; the prior Unpublish bug proved that assuming every `*-fix.js` is harmless is unsafe.
- `control-center-integrity-fix.js` now contains only preview-close compatibility and media repair. Its remaining capture-phase suppression is attached to those explicit controls and is not yet classified as redundant.
- Several intentionally named `legacy*` backend paths exist for migration/backward compatibility (old owner cookies, old recovery alias, old bulk jobs, legacy categories/sessions/source-policy inputs). These are not removable merely because of the name; references and active compatibility requirements must be checked first.

## Audit plan / Definition of Done
- [ ] Inventory every static/public/private/control route and every loaded/dynamically loaded client module.
- [ ] Check duplicate IDs, duplicate canonical controls, repeated scripts/styles, duplicate redirect/static route ownership, dead assets, stale compatibility modules, and mixed-generation paths.
- [ ] Trace high-risk event listeners/observers/timers and verify one authoritative mutation/render path per feature.
- [ ] Check API/middleware aliases, repeated requests/retries, stale response handling, and idempotency protections.
- [ ] Check D1 uniqueness/latest-scan/source/post/guide ownership paths for duplication that UI filtering could hide.
- [ ] Verify all removals against direct/indirect callers and existing tests.
- [ ] Implement the smallest complete repairs for every confirmed defect found in scope.
- [ ] Add a repository-wide surface/integrity regression that catches duplicate IDs, repeated local scripts/styles, conflicting legacy static redirects, broken local asset references, and other confirmed recurrence patterns.
- [ ] Strengthen preview/production smoke coverage where static analysis cannot protect deployment behavior.
- [ ] Run targeted tests and the full Node 22 build/regression suite on the exact branch head.
- [ ] Inspect final diff, review threads, accidental/generated/secret-bearing changes, and compatibility impact.
- [ ] Merge only after exact-head validation passes; then require post-merge Node 22 and production smoke/privacy checks.

## Cleanup / conflicts
- Do not stack another workaround on unclear behavior.
- Preserve intentional compatibility only when its consumer or migration purpose is still demonstrable.
- Prefer one canonical implementation plus a tested alias/adapter over parallel implementations.
- Protect unrelated user work and keep the PR limited to issue #20 findings and directly justified site-quality improvements.

## Blockers / risks
- Static/CI inspection cannot perfectly reproduce every authenticated Control Center touch interaction, so any client-path change that affects owner interactions may still need a short real-device confirmation after production deploy.
- GitHub code search can briefly lag branch updates; authoritative verification should use direct branch file reads and exact-head CI.

## Backlog
- Issue #25 custom Whop app readers beyond what is required to validate duplicate/unsupported paths.
- Paid subscriber authentication/billing onboarding.
- Larger product/brand redesign changes that are preference-driven rather than integrity/usability findings from this audit.

## Next step
Complete the issue #20 inventory and route/module/caller tracing, classify each suspicious duplicate as intentional compatibility or a real redundant/conflicting implementation, then repair the confirmed problems and add broad recurrence coverage before any merge.
