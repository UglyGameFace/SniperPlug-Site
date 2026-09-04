# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, keep legitimate membership access, discover native sources, and scan/import supported Whop content without false auth failures, redirect loops, stale-access lies, or source-loading hangs.

## Scope
1. Trace Control Center auth -> Whop OAuth -> saved Whop session -> membership discovery -> live access truth -> source scan/import.
2. Keep the owner Control Center session security model intact.
3. Use only permissions and APIs the importer actually needs; do not add unrelated scopes or guessed fallbacks.
4. Preserve current-membership security: inactive, explicitly-left, missing-user/member, or otherwise non-access-granting memberships must not become current source access.
5. Bound Whop discovery work so the owner UI cannot sit indefinitely on a source refresh.
6. Keep saved source decisions as recoverable history while clearly separating them from currently readable sources.
7. Keep native Forum/Course/Chat readers authoritative; custom apps require documented member-readable interfaces.
8. Add executable regressions, run the complete Node 22 build/audit suite, inspect final diff/review state, merge only validated fixes, then perform a real production owner retest.

## Status
PR #34 is merged and fixed false membership-access denial. PR #35 is merged and the real owner production retest confirmed that the Whop OAuth authorization loop is fixed: the Control Center now reports `Connected & verified` after returning from Whop.

That same production retest exposed the next defect in the same importer task: source discovery stayed on `Finding your active Whop content...` / `Checking current source access...`, while 36 saved approvals from earlier work remained visible. PR #36 (`fix/whop-discovery-loading-truth`) contains the structural discovery/load-state repair. The corrected implementation passed the complete Node 22 suite on Verify SniperPlug #932. This task-record-only commit now requires the exact final-head check before merge.

## Findings / root cause
- The owner OAuth connection is now genuinely established in production.
- `control-center-source-access.js` treated `truth.discovery === null` as `Checking current source access...` even when no `/api/discover` request was running.
- Every successful dashboard refresh unconditionally reset `truth.discovery = null`, so a previously successful live discovery could be erased by unrelated dashboard work.
- The source-truth fetch wrapper recorded only successful `/api/discover` JSON. A failed or unresolved request had no settled browser state, so the banner could remain `checking` indefinitely.
- The Control Center intentionally does not auto-discover on page load, which made the old `checking` copy factually wrong even before a source request started.
- Saved approvals in D1 are historical decisions. They must remain recoverable, but they are not current access until a successful live discovery proves the connected account can still read those exact experiences.
- `/api/discover` loaded the full Whop membership list in `discoverWhopSources()`, then `enforceLiveWhopAccess()` paginated `/memberships` again. The second network pass added latency without adding new truth.
- For each current company, discovery always queried one company-wide scope plus every membership product. Normal customer memberships already contain exact product IDs, so the unconditional company-wide sweep added unrelated fan-out.
- Each scope queried both `/forums` and `/experiences`. Whop’s Experiences collection is the module inventory; Forums is sufficient as a compatibility fallback when an experience inventory is empty rather than a mandatory second request on every scope.
- Versioned Control Center assets are served immutable for one year, so changing `control-center-source-access.js` without bumping its query version would leave Samsung Browser free to run the stale runtime.
- Custom app experiences such as Better Content remain a separate reader-availability limitation, not an OAuth-access failure.

## Execution path
Connection path:
`/api/whop/oauth/start` -> `requireAdmin()` -> Whop authorize -> `/api/whop/oauth/callback` -> transient OAuth state-cookie validation -> `finishWhopOAuth()` -> canonical owner Whop session.

Current discovery path in PR #36:
`/api/discover` -> `requireAdmin()` -> `requireWhopSession()` -> `loadWhopMemberships()` once -> same snapshot into `discoverWhopSources()` -> same snapshot into `enforceLiveWhopAccess()` -> live source browser.

Product-backed company path:
current membership product IDs -> `/experiences?company_id=...&product_id=...` -> `/forums` only when that experience inventory is empty -> exact-ID dedupe -> capability classification.

Browser truth path:
source-access fetch wrapper -> `idle | loading | error | success` -> current-access banner; a single `/api/discover` browser request is aborted after 25 seconds and settles to `Source refresh paused` instead of spinning forever.

Approved native source scan path remains:
`scanApprovedSource()` -> native reader -> normalize/integrity -> D1 -> guide review/import/publish.

## Changes
### Merged in PR #34
- Membership list became the authoritative access input.
- Removed accidental `member:phone:read` dependency and member-detail recheck.
- Added backend access-verifier regression.

### Merged in PR #35
- Main owner cookie remains `SameSite=Strict`.
- Added narrow 10-minute Lax OAuth callback correlation cookie bound to one-time state.
- Callback no longer depends on the Strict owner cookie on Whop’s cross-site return.
- Added OAuth callback regression and auth audit enforcement.

### PR #36
- Added reusable `loadWhopMemberships()` and made `/api/discover` load one membership snapshot.
- `discoverWhopSources()` and `enforceLiveWhopAccess()` receive that same snapshot; access verification performs no second Whop request.
- Product-scoped memberships no longer trigger an extra company-wide source sweep. Company-wide scope remains for current memberships that have no product ID.
- `/experiences` is the primary module inventory; `/forums` is a compatibility fallback when that inventory is empty.
- Source-access browser state now distinguishes idle, loading, error, and success.
- Ordinary dashboard refreshes preserve successful discovery truth for the same connected Whop account.
- Saved approvals are explicitly labeled history until a live refresh verifies them.
- Added a 25-second browser-side stop for an unresolved `/api/discover` request.
- Bumped source-access runtime asset version to `20260904.1` so immutable browser caches cannot retain the old behavior.
- Updated source-access and access-verifier regressions plus the discovery architecture audit.
- Updated importer documentation to the bounded request shape and truthful UI states.

## Validation / results
- [x] Production OAuth callback retest succeeded after PR #35; screenshot confirms `Connected & verified`.
- [x] Production screenshot/root execution path inspected for the source-loading hang.
- [x] Current discovery, access-verification, browser truth, cache headers, and callers inspected before edits.
- [x] Current Whop membership/experience contract checked before changing request shape.
- [x] Initial PR #36 discovery architecture audit passed.
- [x] Initial PR #36 build reached the new source-access regression; failure was isolated to a contradictory test fixture, not implementation behavior.
- [x] Contradictory test fixture corrected.
- [x] Verify SniperPlug #932 passed the complete Node 22.23.2 build/audit suite on implementation head `5e59a83484dea71da73f4cd072c2cebab5c65726`.
- [x] Source-access truth regression passed: idle/loading/error/success are distinct, dashboard refresh preserves same-account discovery, and the 25-second stop is enforced by the runtime architecture.
- [x] Shared-membership access-verifier regression passed and proves no second Whop membership fetch occurs inside access verification.
- [x] Retired public deal-route verification #53 passed on the same implementation head.
- [ ] Exact final-head CI passes after this task-record-only update.
- [ ] PR #36 diff/review/branch inspection is clean.
- [ ] PR #36 merges and post-merge `main` workflows pass.
- [ ] Production `Load sources` resolves to a current source list or a bounded explicit error instead of hanging.
- [ ] One native source scan/import succeeds against the real owner account.

## Cleanup / conflicts
- No extra OAuth scopes or phone permission.
- No second membership-access implementation.
- No destructive deletion of old source decisions; they remain history/recovery data rather than being mislabeled current.
- No custom-app scraping, guessed endpoints, browser-session proxy, or developer-permission bypass.
- No weakening of owner-cookie security.
- No unrelated site feature, database schema change, generated artifact, or secret-bearing file is part of this repair.

## Blockers / risks
- CI cannot exercise the owner’s private Whop memberships; repository regressions validate request shape/state semantics, while Definition of Done still requires the real production source load and one native scan/import.
- Content stored exclusively inside third-party Whop custom apps still requires a documented member-readable API/interface from that publisher or Whop.

## Backlog
- Issue #20: full website duplication audit remains unrelated and locked out of this task.
- Issue #25: add Better Content/other custom-app adapters only when a documented member-readable interface exists.

## Next step
Require green CI on the exact PR #36 final head, inspect the complete diff/review/branch state, merge only if clean, verify post-merge `main` workflows, then repeat production **Load sources** and one native scan/import.
