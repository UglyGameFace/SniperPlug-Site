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
Implementation in progress on `fix/whop-importer-access-and-readers`.

## Findings / root cause
- The owner OAuth defaults request `forum:read`, `courses:read`, `chat:read`, `member:basic:read`, and `member:email:read` plus OIDC scopes.
- Whop’s list-memberships endpoint is authorized by `member:basic:read` + `member:email:read` and returns the caller’s readable memberships.
- `functions/_lib/access-truth.js` then redundantly called `GET /members/{id}` for every discovered company member.
- Whop’s retrieve-member endpoint additionally requires `member:phone:read`. A 403 from that unrelated permission was converted into `grantsAccess: false`, so a legitimate current membership could be filtered out after successful discovery.
- The discovery path already has one authoritative membership-currentness predicate, `membershipGrantsAccess()`. Reusing that predicate avoids contradictory access implementations.
- Custom app experiences such as Better Content are not equivalent to native Whop Course/Forum/Chat resources. Whop’s app-detail endpoint requires developer permissions belonging to the app publisher/developer context; owner membership access does not grant those permissions.
- Whop’s current list-experiences documentation is internally inconsistent: the generated SDK example uses `company_id`, while the query schema currently labels `account_id` required. No discovery-query flip will be made without stronger runtime evidence because replacing a working legacy parameter based on contradictory docs would be a blind fix.

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

## Validation / results
- [x] Current `main` and merged PR history inspected; previous Issue #19 active-task record was stale and Issue #19 / PR #28 are already closed/merged.
- [x] Current Whop docs checked for OAuth/member/app permissions and API stability.
- [x] Confirmed retrieve-member permission mismatch is real, not inferred.
- [x] Confirmed Experiences/Forum/Course/Chat remain Legacy-only resources supported by Whop.
- [ ] New regression runs in GitHub CI.
- [ ] Complete Node 22 build/audit suite passes on the branch.
- [ ] PR diff contains only importer-correctness changes.
- [ ] PR review threads/status checks are clean.
- [ ] Production owner retest confirms current native sources remain visible and scan/import correctly.

## Cleanup / conflicts
- No extra OAuth phone scope was added.
- No custom-app scraping, guessed endpoint, browser-cookie reuse, or private-session proxy was added.
- No second membership-access implementation was introduced; the existing discovery predicate is now reused.
- No discovery parameter compatibility shim has been stacked onto contradictory documentation.

## Blockers / risks
- Content stored exclusively inside third-party Whop custom apps cannot be imported through Whop’s native Course/Forum/Chat APIs. Implementing an actual reader for Better Content or another custom app requires a documented member-readable API/interface from that publisher or Whop. Membership access alone is not an API credential for another developer’s backend.
- Production Whop data cannot be exercised from repository CI because CI has no owner OAuth token; the regression therefore validates request shape and access semantics with controlled Whop responses, followed by a required production owner retest.

## Backlog
- Issue #20: full website duplication audit remains unrelated and locked out of this task.
- If Better Content or another custom-app publisher exposes a documented member-readable API, add the adapter under Issue #25 without changing native source semantics.

## Next step
Open the branch PR, run the full repository workflow, inspect any failures, repair only importer-related regressions, then perform diff/review cleanup and report the remaining production validation gate.
