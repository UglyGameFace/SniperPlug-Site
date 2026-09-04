# Active Task

## Active task / outcome
Repair the Whop importer so legitimate owner OAuth access is not rejected by SniperPlug, native Whop Forum/Course/Chat sources remain discoverable and importable, and app-specific experiences report their real reader state instead of being confused with access denial.

## Scope
1. Trace OAuth -> memberships -> company/source discovery -> live access verification -> source scan -> guide import.
2. Remove any access check that requires permissions unrelated to the importer’s declared OAuth scopes.
3. Preserve current-membership security: inactive, explicitly-left, missing-user/member, or otherwise non-access-granting memberships must not become current source access.
4. Verify the current Whop API contract before changing discovery query keys; do not guess around contradictory documentation.
5. Keep native Forum/Course/Chat readers authoritative.
6. For custom Whop apps, use only a publisher/Whop documented member-readable interface. Do not scrape private app sessions, guess endpoints, or request unrelated developer permissions merely to inspect another publisher’s app.
7. Add executable backend regressions, run the complete Node 22 build/audit suite, inspect the final diff, and review CI/PR state.

## Status
Implementation and repository validation are complete on PR #34 (`fix/whop-importer-access-and-readers`). Production owner validation against the real connected Whop account remains required before claiming the importer task fully complete.

## Findings / root cause
- The owner OAuth defaults request `forum:read`, `courses:read`, `chat:read`, `member:basic:read`, and `member:email:read` plus OIDC scopes.
- Whop’s list-memberships endpoint is authorized by `member:basic:read` + `member:email:read` and returns the caller’s readable memberships.
- `functions/_lib/access-truth.js` then redundantly called `GET /members/{id}` for every discovered company member.
- Whop’s retrieve-member endpoint additionally requires `member:phone:read`. A 403 from that unrelated permission was converted into `grantsAccess: false`, so a legitimate current membership could be filtered out after successful discovery.
- The discovery path already has one authoritative membership-currentness predicate, `membershipGrantsAccess()`. Reusing that predicate avoids contradictory access implementations.
- Custom app experiences such as Better Content are not equivalent to native Whop Course/Forum/Chat resources. Whop’s app-detail endpoint requires developer permissions belonging to the app publisher/developer context; owner membership access does not grant those permissions.
- Whop’s current list-experiences documentation is internally inconsistent: the generated SDK example uses `company_id`, while the query schema currently labels `account_id` required. No discovery-query flip was made because replacing a working legacy parameter based on contradictory docs would be a blind fix.
- The first PR validation exposed a stale backup audit that required `ACTIVE_TASK.md` to forever mention closed Issue #19 and R2. That assertion tested project-management text rather than backup behavior and prevented later legitimate tasks from passing CI.

## Execution path
`/api/discover` -> `requireAdmin()` -> `requireWhopSession()` -> `discoverWhopSources()` -> `enforceLiveWhopAccess()` -> Control Center source browser.

Approved native source scan path:
`scanApprovedSource()` -> `resolveWhopExperienceType()` -> `listExperienceItemsLite()` -> normalize/integrity -> D1 `whop_posts` -> guide import/publish flow.

## Changes
- `access-truth.js` now verifies current company access directly from the OAuth-authorized memberships list and reuses `membershipGrantsAccess()`.
- Removed the member-detail recheck and therefore the accidental `member:phone:read` dependency.
- Access diagnostics now record `verifiedBy: membership-list` and membership/product/status identifiers without exposing membership email data.
- Added `tools/test-whop-access-verifier.mjs`, an executable backend regression that fails if access verification calls `/members/{id}`, drops a valid current group, restores explicitly-left history, or loses custom-app visibility for an allowed company.
- Added the regression to the normal `npm run audit` / `npm run build` chain.
- Removed the stale `ACTIVE_TASK.md` / Issue #19 assertion from `audit-whop-backups.mjs`; the backup audit still validates the actual R2 backup implementation, documentation, schema, reset/restore safety, syntax, and inclusion in the build.

## Validation / results
- [x] Current `main` and merged PR history inspected; previous Issue #19 active-task record was stale and Issue #19 / PR #28 are already closed/merged.
- [x] Current Whop docs checked for OAuth/member/app permissions and API stability.
- [x] Confirmed retrieve-member permission mismatch is real, not inferred.
- [x] Confirmed Experiences/Forum/Course/Chat remain Legacy-only resources supported by Whop.
- [x] New backend access-verifier regression passed in GitHub CI.
- [x] Complete Node 22.23.2 `npm run build` / regression suite passed on Verify SniperPlug run #923.
- [x] Affiliate-ready preview verification passed.
- [x] Retired public deal-route verification passed.
- [x] `npm install --ignore-scripts` reported zero vulnerabilities.
- [x] PR is 0 commits behind `main` and mergeable.
- [x] Diff contains only five directly relevant files: task record, access verifier, build test registration, backend regression, and the stale audit dependency cleanup.
- [x] PR has no inline review threads. Qodo is billing-paused rather than reporting a code finding; Vercel deployments are intentionally ignored by repository configuration while Cloudflare Pages remains authoritative.
- [ ] Production owner retest confirms current native sources remain visible and scan/import correctly with the real connected Whop account.

## Cleanup / conflicts
- No extra OAuth phone scope was added.
- No custom-app scraping, guessed endpoint, browser-cookie reuse, or private-session proxy was added.
- No second membership-access implementation was introduced; the existing discovery predicate is now reused.
- No discovery parameter compatibility shim has been stacked onto contradictory documentation.
- No unrelated site feature, route, UI redesign, database schema change, generated artifact, or secret-bearing file is in the PR.

## Blockers / risks
- Content stored exclusively inside third-party Whop custom apps cannot be imported through Whop’s native Course/Forum/Chat APIs. Implementing an actual reader for Better Content or another custom app requires a documented member-readable API/interface from that publisher or Whop. Membership access alone is not an API credential for another developer’s backend.
- Production Whop data cannot be exercised from repository CI because CI has no owner OAuth token; the regression validates request shape and access semantics with controlled Whop responses, followed by the required production owner retest.

## Backlog
- Issue #20: full website duplication audit remains unrelated and locked out of this task.
- If Better Content or another custom-app publisher exposes a documented member-readable API, add the adapter under Issue #25 without changing native source semantics.

## Next step
After PR #34 is deployed to the authoritative Cloudflare production runtime, reconnect/refresh the owner Whop session if necessary and run one real source discovery plus one native source scan/import. Record the live result before closing the task or Issue #25.