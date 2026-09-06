# Active Task

## Current state
COMPLETE — Whop account switching reliability hotfix implemented and validated; PR #67 is ready for its final unchanged-head merge gate.

## User-visible failure
Pressing **Switch Whop account** could appear to reconnect the exact same Whop account instead of moving to a different account.

## Root cause
- PR #65 already added the correct server-side same-account switch guard: a deliberate switch records the Whop user being left in a signed short-lived callback cookie, and the OAuth callback rejects/revokes that same user if Whop browser SSO returns it again.
- However, `control-center/index.html` was still loading `control-center-v2.js?v=20260823.1`.
- `functions/_middleware.js` deliberately serves versioned Control Center assets as `public, max-age=31536000, immutable`.
- Therefore browsers that had the August asset could legally keep executing the old Control Center runtime for up to a year even after the September switch fix was deployed.
- The first PR verification run exposed a directly conflicting regression assertion: `tools/audit-control-mobile-flow.mjs` still required the canonical runtime to remain on the August cache key because it had historically been grouped with two recovery assets.

## Execution path
- The Control Center's **Switch Whop account** action calls the authenticated `/api/whop-switch` POST.
- The switch endpoint disconnects the saved Whop identity and records the identity being left in the signed switch-intent callback cookie.
- The subsequent OAuth callback checks that intent and rejects/revokes the connection if Whop browser SSO returns the same identity.
- The browser must therefore execute the current `control-center-v2.js` runtime for the intended switch flow to reach that server-side protection.

## Changes
- Bumped the canonical Control Center runtime URL to `control-center-v2.js?v=20260906.2` so browsers must fetch the current runtime that works with the server-side switch guard.
- Preserved the documented Whop OAuth PKCE/state/nonce flow and did not add guessed/undocumented Whop account-picker parameters.
- Repaired `tools/audit-control-mobile-flow.mjs`: the two unchanged group-recovery assets remain pinned to `v=20260823.1`, while the canonical runtime is separately required to use the account-switch-safe `v=20260906.2` key.

## Validation
- Initial PR head `a7a0dea55d5d668b06e6a503a0fbe42b2d55931d`: **Verify SniperPlug #1079 failed** in the full build/regression step because the mobile-flow audit still required the obsolete runtime cache key.
- Repaired implementation head `f51ba090f70f5f5e183b4dd879afb092a4a6bcd6`: **Verify SniperPlug #1081 passed** the repository-native full Node 22 build/regression suite.
- On that same repaired implementation head, **Cloudflare Pages passed** and deployed the preview, and **Vercel Preview Comments passed** with no unresolved feedback.
- No inline review threads or submitted PR reviews are outstanding.

## Cleanup and conflicts
- Final implementation diff is limited to `control-center/index.html`, `tools/audit-control-mobile-flow.mjs`, and this task record.
- No fallback, retry, OAuth parameter guess, duplicate switch implementation, temporary/debug code, or compatibility shim was added.
- The historical cache assertions for `control-center-hardening.css` and `control-center-whop-backups.js` remain intact.
- The final task-record update does not change runtime behavior; the resulting exact head must still pass the repository-native merge gate before merge.

## Blockers / risks
- No known implementation blocker remains.
- Merge only if the exact current head remains mergeable and all required exact-head checks are green.

## Next step
Merge PR #67 after the final exact-head verification completes green; do not add unrelated changes.
