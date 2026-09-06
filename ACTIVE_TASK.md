# Active Task

## Active task / outcome
PR #70 — make the Better Content Firefox extension popup open and become usable quickly instead of blocking on slow candidate recovery, navigation recovery, or extension-version network work.

## Scope
Completed in this task:
- traced the popup open path from `popup.js` through `sniperplug:popup-state`;
- removed deep candidate recovery, version-network refresh, and stale traversal retry/backoff from the popup-state critical path;
- preserved the reliable Firefox Android candidate recovery path for actions that actually need a verified frame;
- added visible background-recovery status plus short popup repolling while a cold candidate is being found;
- added a hard latency regression plus updated cached/cold candidate recovery coverage;
- bumped the Firefox extension to `0.2.2` and updated the version contract;
- completed exact-head PR validation, merge, and post-merge `main` validation.

Out of scope / backlog:
- changing Better Content traversal/capture behavior;
- redesigning the popup beyond what is needed for fast opening/status refresh;
- unrelated Control Center/importer work.

## Status
COMPLETE AND MERGED — PR #70 was squash-merged into `main` as `804ece13741c5d40c14b1afa6b3f7302ace32608` after final PR head `c046593cbd3a713c53c693e36b4edeceab6e5e2c` passed the merge gate. Post-merge `main` validation also passed.

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
- Preserved `APP_FRAME_SETTLE_MS = 4000` and the existing exact-frame-then-broad-fallback recovery path instead of weakening Firefox Android reliability.
- Extension version advanced from `0.2.1` to `0.2.2`; minimum compatible version remains `0.2.0`.
- Added `tools/test-browser-popup-latency.mjs` and wired it into the normal audit/build chain.
- Candidate-retention regression proves opening with cached state does not synchronously probe/frame-inventory, while capture actions still verify before use.
- Exact-frame selection regression proves cold recovery is asynchronous and becomes visible on the next popup state poll.

## Validation / results
Final PR head `c046593cbd3a713c53c693e36b4edeceab6e5e2c`:
- **Verify SniperPlug #1094 passed**, including the complete repository audit/regression suite, Firefox Android XPI packaging, and artifact upload.
- **Verify affiliate-ready preview #139 passed**.
- **Verify retired public deal routes #143 passed**.
- Cloudflare Pages preview deployment passed.
- No inline PR review threads and no submitted reviews were outstanding.
- The immediately preceding implementation head `88b233a5e5363eef08b6e963817e153f17057c57` independently passed **Verify SniperPlug #1093**, preview/route smoke workflows, and Cloudflare Pages.

Post-merge `main` commit `804ece13741c5d40c14b1afa6b3f7302ace32608`:
- **Verify SniperPlug #1095 passed**, including the full repository audit/regression suite and Firefox Android packaging/upload.
- **Verify production guide privacy #104 passed**.
- **Verify affiliate-ready production #100 passed**.
- **Verify retired public deal routes #144 passed**.
- Post-merge Firefox Android artifact `sniperplug-firefox-android-xpi` ZIP digest: `sha256:c58637b9af19559bcea6b1a3571cc28e750d414a32446ea426a391c7a9cdd1f7`.
- The two Vercel deployments remain rejected by the account's daily/free build quota, not by application build or regression failures.

## Cleanup / conflicts
- Final code change set is limited to the extension popup/background path, patch-version metadata, audit wiring, and directly affected regressions.
- No second crawler, candidate store, authorization path, retry implementation, or compatibility shim was introduced.
- Existing command-time candidate verification remains authoritative.
- Existing traversal limits, retry limits, capture limits, Whop authorization boundaries, content readers, and server handoff policy are unchanged.
- No cookie permission, token forwarding, private-API probing, debug bypass, conflict marker, secret-bearing behavior, or unrelated Control Center/importer redesign was introduced.

## Blockers / risks
- No implementation blocker remains for PR #70.
- A cold popup may briefly show `Finding Better Content…` while the real frame is recovered, but the popup itself no longer waits for that slow work before becoming visible/usable.
- Cached candidate metadata can be briefly optimistic. Correctness is still enforced by authoritative command-time verification before capture/traversal/auto actions.
- Vercel remains externally rate-limited until the account quota resets or plan changes; GitHub regression workflows and Cloudflare deployment are green.

## Backlog
None discovered for this task.

## Next step
No additional implementation work remains for PR #70. Install the new Firefox Android `0.2.2` XPI for runtime confirmation on the user's device; any unrelated request is a separate task.