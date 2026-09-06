# Active Task

## Current state
COMPLETE AND MERGED — Whop account switching reliability hotfix shipped in PR #67. No implementation task is currently active.

## User-visible failure addressed
Pressing **Switch Whop account** could appear to reconnect the exact same Whop account instead of moving to a different account.

## Root cause
- PR #65 already added the correct server-side same-account switch guard: a deliberate switch records the Whop user being left in a signed short-lived callback cookie, and the OAuth callback rejects/revokes that same user if Whop browser SSO returns it again.
- `control-center/index.html` was still loading `control-center-v2.js?v=20260823.1`.
- `functions/_middleware.js` serves versioned Control Center assets as `public, max-age=31536000, immutable`, so browsers could legally keep the August runtime for up to a year.
- The first PR verification run then exposed a stale regression assertion in `tools/audit-control-mobile-flow.mjs` that incorrectly required the canonical runtime to remain on that August cache key.

## Execution path preserved
- The Control Center's **Switch Whop account** action calls the authenticated `/api/whop-switch` POST.
- The switch endpoint disconnects the saved Whop identity and records the identity being left in the signed switch-intent callback cookie.
- The subsequent OAuth callback rejects/revokes the connection if Whop browser SSO returns that same identity.
- No guessed Whop account-picker parameter, retry loop, fallback auth path, or duplicate switch implementation was added.

## Changes merged
- `control-center/index.html` now loads `control-center-v2.js?v=20260906.2`, forcing browsers off the stale immutable runtime.
- `tools/audit-control-mobile-flow.mjs` still pins the two unchanged group-recovery assets to `v=20260823.1`, while separately requiring the canonical runtime's account-switch-safe `v=20260906.2` key.
- PR #67 was squash-merged to `main` as `9437681cd9453802a842fe8c0a9694fb66eb49aa`.

## Validation
- Initial PR head `a7a0dea55d5d668b06e6a503a0fbe42b2d55931d`: **Verify SniperPlug #1079 failed** because the stale mobile-flow assertion rejected the correct runtime cache bust.
- Repaired implementation head `f51ba090f70f5f5e183b4dd879afb092a4a6bcd6`: **Verify SniperPlug #1081 passed**; Cloudflare Pages and Vercel Preview Comments also passed.
- Final PR head `902e92a5f2892a2c731e926bbbf6359e7d9979f4`: **Verify SniperPlug #1082 passed** and Cloudflare Pages deployed successfully.
- Post-merge `main` commit `9437681cd9453802a842fe8c0a9694fb66eb49aa`: **Verify SniperPlug #1083 passed**, **Verify production guide privacy #98 passed**, **Verify affiliate-ready production #94 passed**, and **Cloudflare Pages passed/deployed**.
- PR #67 had no inline review threads or submitted reviews outstanding at merge.

## Cleanup and conflicts
- Runtime implementation scope remained limited to the Control Center cache key and its directly conflicting regression assertion.
- No temporary/debug code, unrelated redesign, compatibility shim, duplicate logic, or secret-bearing change was introduced.
- The merged PR diff was rechecked before merge and contained only `control-center/index.html`, `tools/audit-control-mobile-flow.mjs`, and this task record.

## Blockers / risks
- No known blocker remains for PR #67.
- Live behavior still depends on Whop's own browser session/account selection, but SniperPlug now refuses the same Whop identity during a deliberate switch instead of silently accepting it again.

## Next step
Select the next implementation task separately; do not mix unrelated work into this completed PR #67 record.
