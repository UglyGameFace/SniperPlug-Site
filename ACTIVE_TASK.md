# Active Task

## Active task / outcome
Make the Better Content Firefox extension popup open and become usable quickly instead of blocking on slow candidate recovery, navigation recovery, or extension-version network work.

## Scope
Completed in this task:
- traced the popup open path from `popup.js` through `sniperplug:popup-state`;
- removed deep candidate recovery, version-network refresh, and stale traversal retry/backoff from the popup-state critical path;
- preserved the existing reliable Firefox Android candidate recovery path for actions that actually need a verified frame;
- added visible background-recovery status plus short popup repolling while a cold candidate is being found;
- added a hard latency regression plus updated cached/cold candidate recovery coverage;
- bumped the Firefox extension to `0.2.2` and updated the version contract;
- ran repository-native regression/build, Firefox Android packaging, preview workflows, deployment checks, and PR review inspection on the implementation head.

Out of scope / backlog:
- changing Better Content traversal/capture behavior;
- redesigning the popup beyond what is needed for fast opening/status refresh;
- unrelated Control Center/importer work.

## Status
VALIDATED — implementation head `88b233a5e5363eef08b6e963817e153f17057c57` passed the full merge gate. This task-record-only commit must also pass the repository checks before merge so the final PR head is validated exactly.

## Findings / root cause
- `popup.js` waits for `sniperplug:popup-state` before its first dynamic render.
- `sniperplug:popup-state` previously awaited `extensionVersionState()`. On a cold/stale cache that performed a live request to `sniperplug.com`, so network latency directly delayed popup state.
- The same handler awaited `resolveCandidate()`. With no usable cached candidate, recovery could inspect up to four Whop tabs sequentially.
- Per tab, recovery could wait up to 4 seconds after targeted iframe injection and another 4 seconds after broad fallback injection. The theoretical candidate-recovery worst case was roughly 32 seconds before popup-state returned.
- Popup-state could also synchronously call stale traversal recovery; retry backoff could add more delay while the user was merely opening the popup.
- Those operations are needed for reliability, but not for presentation. `capture-current`, `start-traversal`, and `set-auto-request` already use the authoritative `resolveCandidate()` path before acting.

## Execution path
1. Firefox opens `popup.html` / `popup.js`.
2. `refresh()` queries the active tab and requests `sniperplug:popup-state`.
3. Popup-state now returns using local Whop-tab state, cached candidate metadata, persisted traversal/queue data, auto-capture state, and cached extension-version metadata.
4. If no candidate is cached, a deduplicated background job runs the existing verified recovery path without delaying the popup response.
5. If version metadata is stale, a deduplicated background version refresh runs without delaying the popup response.
6. If a traversal navigation is stale, repair runs under the existing traversal lock without delaying the popup response.
7. While candidate recovery is active, the popup shows `Finding Better Content…` and polls every 300 ms so the recovered frame appears without requiring the user to close and reopen the extension.
8. Any capture/start/auto action still resolves and verifies the actual Whop app frame before it can act.

## Changes
- Added deduplicated `popupRecoveryJobs` with a short failed-attempt cooldown to prevent recovery storms.
- Added cache-only extension version reads for popup state and an out-of-band deduplicated version refresh.
- Added deduplicated, traversal-locked stale-navigation repair outside the popup critical path.
- Popup state uses cached candidate metadata only when its tab is still present among current Whop tabs.
- Added `candidateRecoveryPending` to popup state.
- Popup displays immediate recovery feedback and repolls at 300 ms while recovery is active; normal crawl polling remains 900 ms.
- Preserved `APP_FRAME_SETTLE_MS = 4000` and the existing exact-frame-then-broad-fallback recovery path rather than weakening Firefox Android reliability to make a benchmark look prettier.
- Extension version advanced from `0.2.1` to `0.2.2`; minimum compatible version remains `0.2.0`.
- Added `tools/test-browser-popup-latency.mjs` and wired it into the normal audit/build chain.
- Candidate-retention regression now proves opening with cached state does not synchronously probe/frame-inventory, while capture actions still verify before use.
- Exact-frame selection regression now proves cold recovery is asynchronous and becomes visible on the next popup state poll.

## Validation / results
Implementation head `88b233a5e5363eef08b6e963817e153f17057c57`:
- **Verify SniperPlug #1093 passed**, including the full repository audit/regression suite.
- Firefox Android extension packaging and artifact upload passed in the same workflow.
- New popup latency regression is part of the full audit chain. It intentionally leaves both Firefox frame inventory and the extension-version fetch unresolved; popup-state must still return from cached/local state within its 250 ms regression ceiling.
- **Verify affiliate-ready preview #138 passed**.
- **Verify retired public deal routes #142 passed**.
- Cloudflare Pages preview deployment passed.
- Firefox Android artifact `sniperplug-firefox-android-xpi` was produced on the exact implementation head; artifact ZIP digest: `sha256:8465020e92606e5c538234122cf6749c9f6616a1f172ac3d138788bc5b80737e`.
- No inline PR review threads and no submitted PR reviews are outstanding.
- The two Vercel statuses are account quota failures (`api-deployments-free-per-day` / `build-rate-limit`), not application build or regression failures.

## Cleanup / conflicts
- Final changed-file set is limited to the active-task record, extension popup/background implementation, patch-version metadata, audit wiring, and directly affected regressions.
- No second crawler, candidate store, authorization path, retry implementation, or compatibility shim was introduced.
- Existing command-time candidate verification remains authoritative.
- Existing traversal limits, retry limits, capture limits, Whop authorization boundaries, content readers, and server handoff policy are unchanged.
- No cookie permission, token forwarding, private-API probing, debug bypass, conflict marker, secret-bearing behavior, or unrelated Control Center/importer redesign was introduced.

## Blockers / risks
- A cold popup may briefly show `Finding Better Content…` while the real frame is recovered, but the popup itself no longer waits for that slow work before becoming visible/usable.
- Cached candidate metadata can be briefly optimistic. Correctness is still enforced by authoritative command-time verification before capture/traversal/auto actions.
- Vercel remains externally rate-limited until the account quota resets or plan changes. GitHub regression workflows and Cloudflare deployment are green.

## Backlog
None discovered for this task.

## Next step
Wait for repository-native checks on this final task-record head. If they pass with no new review findings, merge PR #70 and run post-merge main validation before declaring the task complete.