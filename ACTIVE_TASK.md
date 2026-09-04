# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, keep legitimate membership access, discover native sources, and scan/import supported Whop content without false auth failures or redirect loops.

## Scope
1. Trace Control Center auth -> Whop OAuth start -> Whop authorize -> OAuth callback -> saved Whop session -> membership discovery -> source scan/import.
2. Keep the owner Control Center session security model intact; do not weaken the main admin cookie merely to make OAuth redirects work.
3. Remove access checks that require permissions unrelated to the importer’s declared OAuth scopes.
4. Preserve current-membership security: inactive, explicitly-left, missing-user/member, or otherwise non-access-granting memberships must not become current source access.
5. Keep native Forum/Course/Chat readers authoritative.
6. For custom Whop apps, use only a publisher/Whop documented member-readable interface. Do not scrape private app sessions, guess endpoints, or request unrelated developer permissions merely to inspect another publisher’s app.
7. Add executable regressions, run the complete Node 22 build/audit suite, inspect the final diff/review state, merge only validated fixes, then perform a real production owner retest.

## Status
PR #34 is merged and fixed the false membership-access denial. Production testing then exposed a second root cause in the same importer task: the Whop OAuth callback required a `SameSite=Strict` owner cookie that browsers correctly withhold on the cross-site return from Whop. PR #35 (`fix/whop-oauth-callback-cookie`) contains the callback-loop repair and has passed its initial full Node 22 validation. Final-head validation and merge remain before the live production retest.

## Findings / root cause
- The owner OAuth defaults request `forum:read`, `courses:read`, `chat:read`, `member:basic:read`, and `member:email:read` plus OIDC scopes.
- PR #34 removed the redundant `GET /members/{id}` access recheck that could require `member:phone:read` and falsely filter out legitimate memberships.
- The Control Center owner cookie is created through `secureCookie(...)`, whose default is `SameSite=Strict`.
- `/api/whop/oauth/start` requires the owner session and redirects the browser to Whop.
- Whop returns by top-level cross-site GET to `/api/whop/oauth/callback`.
- With `SameSite=Strict`, the browser does not send the owner cookie on that Whop -> SniperPlug callback request.
- The callback nevertheless called `requireAdmin()` before finishing OAuth, so it produced `Sign in to the SniperPlug Control Center first.`
- The callback then redirected to `/control-center/`; that next navigation is same-site, so the existing owner cookie became visible again. The UI therefore appeared to sign in by itself and returned to `Connect Whop`, exactly matching the production symptom.
- OAuth already has a server-side one-time `state` row plus PKCE. The correct browser-binding fix is a separate short-lived OAuth-only correlation cookie that is allowed on the top-level callback, not weakening the main owner cookie.
- Custom app experiences such as Better Content remain a separate reader-availability limitation, not an OAuth-access failure.

## Execution path
Connection path:
`/api/whop/oauth/start` -> `requireAdmin()` -> `beginWhopOAuth()` -> Whop authorize -> `/api/whop/oauth/callback` -> transient OAuth state-cookie validation -> `finishWhopOAuth()` -> canonical `sniperplug-owner` Whop session -> `/control-center/?whop=connected`.

Discovery/import path:
`/api/discover` -> `requireAdmin()` -> `requireWhopSession()` -> `discoverWhopSources()` -> `enforceLiveWhopAccess()` -> source browser -> `scanApprovedSource()` -> native item reader -> D1 -> guide review/import.

## Changes
### Merged in PR #34
- Membership list is the authoritative live-access input.
- Removed the accidental `member:phone:read` dependency.
- Added executable backend access-verifier regression.
- Removed a stale backup audit dependency on obsolete Issue #19 task text.

### PR #35
- Added `functions/_lib/whop-oauth-flow.js` for one narrow OAuth callback correlation cookie.
- OAuth start now sets `sniperplug_whop_oauth=<state>` for 10 minutes with `HttpOnly; Secure; SameSite=Lax` and path restricted to `/api/whop/oauth/callback`.
- Main `sniperplug_admin` owner cookie remains unchanged and therefore remains `SameSite=Strict`.
- OAuth callback no longer calls `requireAdmin()` on the cross-site return.
- Callback requires the query `state` to match the transient browser cookie in constant time before token exchange.
- Callback still rejects any completed OAuth flow not bound to `OWNER_SESSION_ID`.
- Transient OAuth cookie is cleared on success and failure.
- Added `tools/test-whop-oauth-callback-cookie.mjs` and registered it in the normal build.
- Updated `audit-whop-auth.mjs` so CI enforces the intended split: Strict owner session, narrow Lax OAuth callback state, same-origin POST for destructive Whop actions.

## Validation / results
- [x] Current production symptom traced to the exact cookie/callback execution path.
- [x] Browser SameSite behavior checked against current MDN guidance; `Strict` excludes cross-site navigation while `Lax` permits top-level safe-method navigation.
- [x] Current OAuth browser guidance checked; PKCE and unique verified OAuth state remain required CSRF protections.
- [x] PR #35 targeted OAuth callback-cookie regression passed in CI.
- [x] PR #35 complete Node 22 build/audit suite passed on Verify SniperPlug run #926.
- [x] PR #35 affiliate-ready preview verification passed.
- [x] PR #35 retired public deal-route verification passed.
- [x] PR #35 diff inspected: only OAuth callback/start flow, OAuth auth audit, regression registration/test, and task-state files are involved.
- [ ] Final-head CI passes after this task-record update.
- [ ] PR #35 review/status inspection is clean and branch is current with `main`.
- [ ] PR #35 merges and post-merge production workflows pass.
- [ ] Real production Whop authorization completes without the sign-in/connect loop.
- [ ] Real native source discovery plus one native source scan/import succeeds.

## Cleanup / conflicts
- No change to the owner admin-cookie SameSite policy.
- No extra OAuth scopes or phone permission.
- No duplicate OAuth implementation.
- No guessed Whop endpoints, browser-session scraping, or custom-app bypass.
- Disconnect/switch remain same-origin owner-authenticated POST actions.
- No unrelated site feature, UI redesign, database schema change, generated artifact, or secret-bearing file is part of this repair.

## Blockers / risks
- CI cannot perform the real Whop authorization because it does not possess the owner browser session or private Whop account. The cross-site cookie/state behavior is regression-tested, but the final Definition of Done still requires the production owner flow.
- Content stored exclusively inside third-party Whop custom apps still requires a documented member-readable API/interface from that publisher or Whop. Membership access alone is not an API credential for another developer’s backend.

## Backlog
- Issue #20: full website duplication audit remains unrelated and locked out of this task.
- Issue #25: add adapters for Better Content/other custom apps only when a documented member-readable interface is available.

## Next step
Require green CI on the exact PR #35 final head, inspect review/diff/branch state, merge, verify post-merge production workflows, then rerun the live Whop authorization followed by one native discovery and scan/import.
