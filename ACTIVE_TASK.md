# Active Task

## Active task / outcome
Fix the remaining Firefox Android Capture-all `Settling…` stall reproduced on installed extension `0.2.3`, where a resumed session shows a valid Better Content frame but remains at 0 discovered / 0 queued / 0 retries.

## Status
IN PROGRESS — same regression family as PR #71. Runtime confirmation on `0.2.3` proved the direct mutation-debounce fix was incomplete. Implementation branch: `fix/capture-all-reattach-stall`.

## Reproduction evidence
- Installed extension reports `0.2.3 · current 0.2.3`.
- The Better Content frame is found and readable (`2,428 rendered characters detected`).
- Capture-all resumes its saved session and enters `Settling…`.
- It remains at 0 queued, 0 remaining, 0 discovered, 0 new/changed/unchanged/duplicate, and 0 retries.
- Therefore frame discovery, candidate retention, popup state, and live phase rendering are working; the first pending traversal snapshot is still being canceled before it executes.

## Root cause
1. The app-frame `MutationObserver` calls `registerCandidate()` on each DOM mutation.
2. `registerCandidate()` sends `sniperplug:candidate` to the extension background.
3. `saveCandidate()` sees the already-active traversal and sends `sniperplug:set-traversal` with `enabled: true` back to that same frame so a newly loaded/reinjected Firefox frame can resume.
4. In `content-capture.js`, the `set-traversal` handler treated every repeated `enabled: true` message as a fresh attach: it cleared `lastTraversalIdentity`, called `resetTraversalSnapshotSchedule()`, then started a new 900 ms timer.
5. PR #71 removed the direct MutationObserver timer reset, but this candidate → background → reattach feedback loop could still reset that same timer on every mutation.
6. That exactly matches the device state: `Settling…` is emitted when the timer is scheduled, but no later `Reading…` phase, retry, discovery, or queue event occurs because the timer keeps getting replaced before firing.

## Fix
- `sniperplug:set-traversal` is now idempotent when the requested enabled state already matches the local content-script state.
- A repeated `enabled: true` reattach calls `resumeTraversal()` only. It does not clear the existing timer, dirty flag, or traversal identity.
- A real state transition (`false → true` or `true → false`) still performs the authoritative reset/start/stop behavior.
- Background reattachment remains intact so a genuinely new Firefox app-frame document can still recover an active saved traversal.
- `tools/test-browser-traversal-scheduler.mjs` now asserts the repeated-enable guard occurs before `resetTraversalSnapshotSchedule()` and that same-state enable resumes instead of resetting.
- Firefox Android extension/version contract advanced to `0.2.4`.

## Safety preserved
- No second crawler, polling crawler, alternate traversal store, retry path, or navigation fallback.
- Existing same-origin/same-experience traversal and sensitive-route rejection are unchanged.
- Rendered-DOM-only capture, no cookie permission, no private Whop API probing, queue/retry limits, app-frame verification, and server-side authorization remain unchanged.

## Changed files
- `browser-extension/content-capture.js`
- `browser-extension/manifest.json`
- `browser-extension-version.json`
- `tools/test-browser-traversal-scheduler.mjs`
- version-aware Firefox traversal regressions
- `ACTIVE_TASK.md`

## Validation required
- Traversal scheduler / repeated-reattach regression.
- Existing recursive traversal, progress, popup latency, exact-frame, candidate-retention, server roundtrip, and security regressions.
- Full repository audit/regression suite.
- Firefox Android `0.2.4` XPI package and archive test.
- Exact-head PR review/diff check, merge, post-merge `main` validation, and final `0.2.4` handoff.

## Cleanup / conflicts
- Temporary patch workflow used only to apply the exact large-file edit was self-deleted in the same implementation commit and is not part of the final branch tree.
- No unrelated extraction scoring, Control Center, importer, account-switching, or publishing behavior is included.

## Blockers / risks
- No known implementation blocker.
- Device confirmation still requires replacing `0.2.3` with the exact validated `0.2.4` XPI after merge.

## Next step
Open the regression PR, run the exact-head merge gate, repair any genuine failure, merge only after the final head is green, validate `main`, close this active task record, and hand off the validated `0.2.4` XPI.
