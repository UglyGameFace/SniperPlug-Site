# Active Task

## Current state
IN PROGRESS — Whop account switching reliability hotfix.

## User-visible failure
Pressing **Switch Whop account** can appear to reconnect the exact same Whop account instead of moving to a different account.

## Root cause
- PR #65 already added the correct server-side same-account switch guard: a deliberate switch records the Whop user being left in a signed short-lived callback cookie, and the OAuth callback rejects/revokes that same user if Whop browser SSO returns it again.
- However, `control-center/index.html` was still loading `control-center-v2.js?v=20260823.1`.
- `functions/_middleware.js` deliberately serves versioned Control Center assets as `public, max-age=31536000, immutable`.
- Therefore browsers that had the August asset could legally keep executing the old Control Center runtime for up to a year even after the September switch fix was deployed.

## Fix
- Bumped the canonical Control Center runtime URL to `control-center-v2.js?v=20260906.2` so browsers must fetch the current runtime that works with the server-side switch guard.
- Preserved the documented Whop OAuth PKCE/state/nonce flow and did not add guessed/undocumented Whop account-picker parameters.

## Validation required
- Confirm the branch diff changes only the Control Center runtime cache key plus this task record.
- Run the repository-native PR verification workflows.
- Require the Whop switch guard regression and full verification suite to pass on the exact PR head before merge.

## Next step
Open a scoped PR, wait for exact-head checks, then merge only if green.
