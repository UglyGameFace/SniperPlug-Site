# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, retain legitimate membership access, discover every authorized Whop experience, and scan/import every content type for which a documented member-readable interface exists.

## Scope
1. Trace owner auth -> Whop OAuth -> membership snapshot -> experience discovery -> live access truth -> reader selection -> scan/import.
2. Preserve the strict owner-session security model and current-membership filters.
3. Use current documented Whop contracts only; no guessed endpoint aliases, private-session scraping, unrelated OAuth scopes, or third-party credential leakage.
4. Keep native Forum/Course/Chat readers authoritative.
5. Keep custom app experiences visible even when no safe reader exists, and distinguish valid access from reader availability.
6. Add executable regressions, run the complete Node 22 suite, inspect final diff/review state, merge only validated fixes, and confirm behavior against the real owner account.

## Status
- PR #34 merged: removed the false membership denial caused by the phone-gated member-detail recheck.
- PR #35 merged: fixed the Whop OAuth callback/login loop without weakening the Strict owner cookie.
- PR #36 merged at `7673bcabf075c202e07024e4476c4d6968f8afcf`: fixed stale source-access truth, duplicate membership loading, excessive discovery fan-out, and indefinite browser loading. Post-merge `Verify SniperPlug #934` passed.
- Production evidence now shows Hidden Files contains native and app-specific experiences including `Make Money Here` powered by Better Content.
- PR #37 (`fix/whop-experience-account-id`) fixes a current Whop Experiences API contract mismatch that can hide custom experiences while Forums still appear. Initial full Node 22 validation passed on Verify SniperPlug #935. Exact final-head validation remains after this task-record update.

## Findings / root cause
- The connected Hidden Files membership is valid; missing Better Content experiences are not explained by the earlier OAuth/access bugs.
- Whop’s current generated TypeScript SDK sends `account_id` on `GET /experiences`, with optional `product_id`.
- SniperPlug was still sending `company_id` to `/experiences`, because it reused one query object for both Experiences and Forums.
- `/forums` legitimately uses `company_id`. Therefore an Experiences request could fail while the Forum compatibility fallback still succeeded, producing the exact misleading state where native forums appear but custom modules such as Better Content vanish.
- The importer’s actual item reader still supports only native `forum`, `course`, and `chat`. Better Content remains a separate reader-adapter problem after its experience is correctly discovered.
- Better Content must not be read by guessing private iframe endpoints or forwarding the owner OAuth token to a third-party origin. A reader requires a documented member-readable interface and compatible authentication contract.

## Execution path
Connection:
`/api/whop/oauth/start` -> Whop -> `/api/whop/oauth/callback` -> canonical owner Whop session.

Discovery after PR #37:
`/api/discover` -> one membership snapshot -> membership companies/products -> endpoint-specific query builder -> `/experiences?account_id=...&product_id=...` -> `/forums?company_id=...&product_id=...` only as empty-inventory compatibility fallback -> exact experience dedupe -> native capability probe -> native source or app-specific source.

Native scan/import:
`scanApprovedSource()` -> `listExperienceItemsLite()` -> Forum/Course/Chat reader -> normalize/integrity -> D1 -> review/import/publish.

## Changes in PR #37
- Added `discoveryScopeQueries(companyId, productId)` as the single source of truth for endpoint query shapes.
- Experiences now use `account_id` plus optional `product_id`.
- Forums retain `company_id` plus optional `product_id`.
- No dual-request alias fallback was added.
- Added executable regressions proving the two endpoint contracts cannot leak into each other for product-scoped or company-wide discovery.

## Validation / results
- [x] Current Whop generated SDK inspected before changing request shape.
- [x] Production symptom matches the stale Experiences query contract plus successful Forum fallback.
- [x] PR #37 diff is limited to discovery and its regression before this task-record update.
- [x] Verify SniperPlug #935 passed the complete Node 22 build/audit suite on implementation head `0cec574206e89ca1631a05b419abaafb8a3156ac`.
- [x] Executable discovery regression verifies `{ account_id, product_id }` for Experiences and `{ company_id, product_id }` for Forums.
- [ ] Exact final-head CI passes after this task-record update.
- [ ] PR #37 review/diff/branch state remains clean and current with `main`.
- [ ] PR #37 merges and post-merge `main` workflows pass.
- [ ] Production `Load sources` shows `Make Money Here` as a Better Content app-specific experience.
- [ ] Determine Better Content’s actual documented reader/auth contract from returned app capability metadata or publisher documentation.
- [ ] If such a contract exists, implement and validate the Better Content adapter; otherwise keep `access confirmed · reader unavailable` explicit.
- [ ] One native source scan/import succeeds against the real owner account.

## Cleanup / conflicts
- No extra OAuth scopes or phone permission.
- No weakening of owner-cookie security.
- No guessed Whop aliases or duplicate discovery implementation.
- No Better Content private endpoint guesses, iframe scraping, or third-party token forwarding.
- No unrelated UI/site/database work is included.

## Blockers / risks
- CI cannot enumerate the owner’s private Hidden Files membership, so the Make Money Here visibility check requires the real production account after deployment.
- Access to a Whop product does not automatically provide a server-side API for a third-party app’s private content store.

## Backlog
- Issue #20 remains unrelated and locked out.
- Issue #25 is now the custom-app reader portion of this same importer outcome, with Better Content as the first concrete target.

## Next step
Require green CI on the exact PR #37 final head, inspect diff/review/branch state, merge if clean, verify post-merge workflows, then run production **Load sources** and confirm whether **Hidden Files → Make Money Here → Better Content** is now returned.