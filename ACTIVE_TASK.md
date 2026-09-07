# Active Task

## Active task / outcome
Add authoritative SniperPlug server reconciliation for Better Content browser captures so a fresh Firefox/Android install can identify pages that already exist in the account workspace before importing anything.

## Status
IN PROGRESS — branch `feature/browser-server-reconciliation`.

## Problem
The extension already keeps local capture fingerprints after a successful handoff, and the server import path is idempotent. But local browser history is device-specific. A fresh phone, cleared Firefox storage, or a new extension install can therefore queue pages that SniperPlug already has and only discover that fact during the write attempt.

## Correct behavior
- The signed-in SniperPlug page must ask the server to reconcile every queued capture before import.
- Server reconciliation must use the current SniperPlug tenant, current connected Whop session, current membership/access verification, canonical rendered-app reader boundary, and the existing server-side guide/source identities.
- It must classify pages as already imported, changed, new, duplicate, or held.
- Only genuinely new or safely updatable draft captures should proceed to the import write path.
- Identical legacy/alternate-source content should be detected from the server workspace even when no browser-local capture history exists.
- A successful reconciliation/import handoff should hydrate the extension's local history so later scans on that device become fast local skips again.

## Implementation
- Added `functions/_lib/browser-capture-reconcile.js` with authenticated server-side reconciliation against the account-scoped `guides` workspace.
- Reconciliation reproduces the canonical browser-capture source identity/fingerprint rules and is regression-tested against the real import path so the two cannot silently drift.
- `/api/browser-capture` now supports explicit `mode: reconcile` and `mode: import`; unknown modes fail closed.
- The Control Center relay reconciles all queued pages first, displays authoritative counts, filters server-known unchanged/duplicate/held pages, and imports only `needsImport` captures.
- The existing preserved pending queue remains intact on any failed reconciliation/import; retries remain safe.
- On complete success, the existing `clear-pending` success path commits local extension history for the confirmed handoff.
- Added a server reconciliation regression covering never-imported, already-imported on a fresh device, changed draft, and legacy/alternate-source duplicate cases.
- Firefox Android extension/version contract advanced to `0.2.6`.

## Safety preserved
- Rendered Whop app content remains DOM-only in the verified `*.apps.whop.com` frame.
- The extension still never reads Whop cookies/credentials and never calls Whop private APIs directly.
- Reconciliation runs only through the signed-in same-origin SniperPlug endpoint and re-verifies current Whop access server-side.
- Published, manually reviewed, rejected/removed, and duplicate guides remain held instead of being overwritten.
- The existing 25-page / payload bounds and private-draft review gate remain unchanged.

## Validation required before merge
- Full repository audit/regression suite.
- New server reconciliation regression.
- Existing browser capture server roundtrip and extension safety regressions.
- Firefox Android `0.2.6` XPI packaging/upload.
- Exact-head PR checks, no unresolved reviews, then post-merge `main` checks and production artifact handoff.
