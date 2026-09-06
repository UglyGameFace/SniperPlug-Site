# Active Task

## Active task / outcome
Make the Better Content Firefox extension popup open and become usable quickly instead of blocking on slow candidate recovery, navigation recovery, or extension-version network work.

## Scope
In scope:
- trace the popup open path from `popup.js` through `sniperplug:popup-state`;
- remove slow recovery/network work from the popup-state critical path without weakening capture verification;
- preserve reliable Firefox Android iframe recovery in the background;
- keep command-time capture/start/auto operations authoritative and verified;
- add latency/regression coverage for cold/no-candidate and cached-candidate paths;
- patch-version metadata, Firefox Android packaging, exact-head CI, cleanup, merge, and post-merge validation.

Out of scope / backlog:
- changing Better Content traversal/capture behavior;
- redesigning the popup beyond what is needed for fast opening/status refresh;
- unrelated Control Center/importer work.

## Status
IN PROGRESS — root cause is identified on `main` commit `d7913861e029caad3b48fb3cac072255f0a7dab5`; implementation branch is `fix/extension-popup-latency`.

## Findings / root cause
- `popup.js` waits for `sniperplug:popup-state` before its first dynamic render.
- `sniperplug:popup-state` currently awaits `extensionVersionState()`. On a cold/stale cache this performs a live request to `sniperplug.com`, so network latency can directly delay popup state.
- The same handler awaits `resolveCandidate()`. With no usable cached candidate, recovery can inspect up to four Whop tabs sequentially.
- Per tab, recovery can wait up to 4 seconds after targeted iframe injection and another 4 seconds after broad fallback injection. In the theoretical worst case that is roughly 32 seconds before popup-state returns.
- `popup-state` can also synchronously call stale traversal recovery; retry backoff can add more delay while the user is merely opening the popup.
- These operations are required for reliability, but they do not need to block the initial popup-state response. Capture/start/auto commands already resolve/verify the candidate authoritatively before acting.

## Execution path
1. Firefox opens `popup.html` / `popup.js`.
2. `refresh()` queries the active tab and sends `sniperplug:popup-state`.
3. Background popup-state currently performs Whop tab lookup, version refresh, candidate verification/recovery, traversal repair, queue reads, and candidate enumeration before replying.
4. The fix will make popup-state return from cached/local state quickly, while scheduling candidate recovery, version refresh, and stale traversal repair asynchronously with deduplication.
5. The popup will briefly repoll while recovery is pending so recovered state appears without requiring the user to close/reopen it.
6. Capture/start/auto actions will continue to use the existing authoritative `resolveCandidate()` path before they do anything.

## Planned changes
- Add deduplicated background recovery jobs instead of awaiting deep candidate recovery from popup-state.
- Add cached-only extension version state for popup-state and refresh the network contract out of band.
- Move stale traversal repair off the popup open critical path.
- Expose a recovery-pending flag and make popup polling continue briefly while recovery is active.
- Preserve the existing 4-second Firefox Android recovery settle window rather than trading reliability for a cosmetically smaller timeout.
- Bump the extension patch version and add a regression that fails if popup-state waits for intentionally unresolved frame inventory or version fetch work.

## Validation required
- Targeted cold-popup latency regression.
- Existing Firefox candidate-retention and exact-frame-selection regressions updated for asynchronous recovery semantics.
- Recursive traversal, progress, browser capture/server roundtrip, security-boundary, and full repository audit suite.
- Firefox Android XPI package/upload on exact head.
- Final diff/review inspection and post-merge main validation.

## Cleanup / conflicts
- No second candidate store, crawler, authorization path, retry implementation, or compatibility shim is planned.
- Existing slow recovery remains authoritative for actions that actually need a candidate; only popup presentation stops blocking on it.

## Blockers / risks
- A cold popup may initially show “checking the rendered frame” for a short period while recovery continues, but the popup itself should be available immediately.
- Cached candidate state may be briefly optimistic; command-time verification remains the correctness gate before capture/traversal actions.

## Backlog
None discovered for this task.

## Next step
Implement cached/async popup-state recovery and latency regressions, then run repository-native validation.