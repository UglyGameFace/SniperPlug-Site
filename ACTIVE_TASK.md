# Active Task

## Active task / outcome
Fix the Firefox Android Capture-all startup stall still reproduced after `0.2.4`: the Better Content frame is detected and readable, Capture all enters `Settling…`, but the first rendered-page snapshot never reaches the background so discovery/queue/retry counters remain at zero.

## Status
IN PROGRESS — runtime regression continuation of PR #72. Branch: `fix/capture-all-initial-watchdog`.

## New runtime evidence
- The current device again shows a valid Better Content frame with `2,428 rendered characters detected`.
- Capture all is active for the entire experience.
- The popup receives `Settling…` / `Waiting for the page to settle…` but never advances to `Reading…`.
- Queue remains `0 pages queued`; no discovery/retry counters appear because the first `sniperplug:traversal-page` snapshot still never arrives.

## Architectural defect found
PRs #71 and #72 removed two timer-starvation reset loops, but startup still has a single point of failure:
1. `startTraversal()` persists `status: starting`, attaches the verified app frame, and then waits for the content script to produce the first snapshot.
2. The content script still schedules that first snapshot only through a 900 ms `setTimeout`.
3. The background navigation timeout/watchdog only exists after `currentTarget` is set. During the initial seed page, `currentTarget` is null.
4. `scheduleStaleTraversalRepair()` also only repairs stale `currentTarget` navigation.
5. Therefore if Firefox Android delays, loses, unloads, or otherwise never executes that first content-script timer, the crawler has no authoritative startup deadline or recovery path and can remain in `starting / Settling…` forever.

## Corrective direction
- Remove the 900 ms timer as a dependency for the first seed-page snapshot: a genuine false → true traversal attach must begin one snapshot immediately.
- Keep the existing coalesced 900 ms scheduler only for follow-up DOM mutations.
- Add an explicit `traversal-snapshot-now` content-script command so background recovery can force the currently verified frame to make progress without toggling traversal state.
- Add a bounded background startup watchdog for `status: starting` with no first snapshot, including popup-driven stale repair so Firefox background suspension cannot leave the crawl permanently stuck.
- Fail visibly after bounded recovery attempts rather than showing infinite `Settling…`.
- Add regression coverage for immediate first snapshot and startup watchdog behavior.
- Bump the installable Firefox Android package to `0.2.5` only after the exact-head regression suite and XPI packaging pass.

## Safety preserved
- Same rendered-DOM-only capture path.
- Same verified app frame, same-origin/same-experience traversal, sensitive-route rejection, queue/retry limits, and server authorization.
- No cookie permission, token forwarding, private Whop API access, second crawler, or unrelated product work.

## Next step
Implement the immediate seed snapshot plus bounded startup watchdog, run the full merge gate, package `0.2.5`, merge only on a green exact head, then validate `main` and hand off the exact production artifact.
