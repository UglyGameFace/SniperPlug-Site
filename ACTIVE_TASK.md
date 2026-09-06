# Active Task

## Current state
IN PROGRESS — Whop account switching reliability hotfix; implementation and stale validation gate repaired, exact-head CI pending.

## User-visible failure
Pressing **Switch Whop account** can appear to reconnect the exact same Whop account instead of moving to a different account.

## Root cause
- PR #65 already added the correct server-side same-account switch guard: a deliberate switch records the Whop user being left in a signed short-lived callback cookie, and the OAuth callback rejects/revokes that same user if Whop browser SSO returns it again.
- However, `control-center/index.html` was still loading `control-center-v2.js?v=20260823.1`.
- `functions/_middleware.js` deliberately serves versioned Control Center assets as `public, max-age=31536000, immutable`.
- Therefore browsers that had the August asset could legally keep executing the old Control Center runtime for up to a year even after the September switch fix was deployed.

## Execution path
- The Control Center's **Switch Whop account** action calls the authenticated `/api/whop-switch` POST.
- The switch endpoint disconnects the saved Whop identity and records the identity being left in the signed switch-intent callback cookie.
- The subsequent OAuth callback checks that intent and rejects/revokes the connection if Whop browser SSO returns the same identity.
- The browser must therefore execute the current `control-center-v2.js` runtime for the intended switch flow to reach that server-side protection.

## Fix
- Bumped the canonical Control Center runtime URL to `control-center-v2.js?v=20260906.2` so browsers must fetch the current runtime that works with the server-side switch guard.
- Preserved the documented Whop OAuth PKCE/state/nonce flow and did not add guessed/undocumented Whop account-picker parameters.
- Repaired `tools/audit-control-mobile-flow.mjs`: its old grouped-recovery assertion incorrectly required `control-center-v2.js` to remain on `v=20260823.1`, which made the correct cache bust fail the full regression suite. The audit still pins the two unchanged group-recovery assets to their original version and now separately requires the account-switch-safe runtime key.

## Validation
- Initial PR head `a7a0dea55d5d668b06e6a503a0fbe42b2d55931d`: **Verify SniperPlug #1079 failed** in the full build/regression step because the mobile-flow audit still required the obsolete runtime cache key.
- Cloudflare Pages deployed that initial head successfully and Vercel reported no unresolved preview feedback.
- No inline review threads or submitted PR reviews are outstanding.
- Exact-head repository-native verification after the audit repair is still required before merge.

## Cleanup and conflicts
- No fallback, retry, OAuth parameter guess, duplicate switch implementation, or compatibility shim was added.
- The historical cache assertions for `control-center-hardening.css` and `control-center-whop-backups.js` remain intact.
- Scope is limited to the runtime cache key, the directly conflicting regression assertion, and this task record.

## Blockers / risks
- Do not merge while the current head's full verification is pending or red.

## Next step
Require **Verify SniperPlug** to pass on the exact current PR head, inspect the final diff/checks, then merge only if green.
