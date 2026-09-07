# Active Task

## Active task / outcome
PR #71 — fix Capture all guides so it cannot sit at `0 of 0 known pages checked` / `Scanning…` for minutes with no real progress, and make the Firefox popup report meaningful current preparation progress while rendered Better Content pages are being processed.

## Scope
Completed:
- traced Capture all from popup start through background traversal state into the Whop app-frame content script;
- fixed the traversal scheduler so continuous Whop DOM mutations cannot starve the first or follow-up snapshot;
- preserved bounded rendered-page preparation, safe same-origin/same-experience traversal, retries, queue limits, and capture verification;
- added live preparation phases before and after a real page-count denominator exists;
- added mutation-storm scheduler regression coverage and expanded the production progress-bar regression;
- bumped the Firefox Android extension/version contract to `0.2.3`;
- completed exact-head PR validation, squash merge, post-merge `main` validation, and final artifact packaging.

Out of scope:
- changing what Whop content is authorized/capturable;
- unrelated importer, account-switching, or Control Center work.

## Status
COMPLETE AND MERGED — PR #71 was squash-merged into `main` as `ffe23dabfd85006ef78ea52f317ae47f4f6032b7` after final PR head `463623866ffc4bff25e43947f8c83352e0e490df` passed the merge gate. Post-merge `main` validation also passed. No implementation task is currently active.

## Findings / root cause
- `startTraversal()` saves `status: 'starting'`, attaches traversal to the verified app frame, then waits for the content script to emit the first `sniperplug:traversal-page` snapshot.
- The content script used a 900 ms debounce for that snapshot while its page-wide `MutationObserver` called the scheduler for every DOM mutation.
- The old scheduler cleared/restarted that timer on each mutation. A busy Whop/React page mutating more frequently than 900 ms could therefore postpone the first snapshot indefinitely.
- That produced the observed runtime state: background traversal remained `starting`, discovered/visited stayed zero, and the popup could show generic `Scanning…` for minutes even though no snapshot was actually getting a chance to run.
- Rendered-page preparation itself is bounded: safe expanders, lazy scrolling, image wait, tab panels, extraction, retries, and queue sizes all retain explicit limits. The unbounded piece was scheduler starvation before preparation began.

## Execution path after fix
1. Popup sends `sniperplug:start-traversal`.
2. Background resolves/verifies the Better Content iframe, persists traversal state, and attaches traversal to that exact frame.
3. Content script schedules one 900 ms settling snapshot.
4. Repeated DOM mutations no longer reset an already-pending timer.
5. Mutations arriving while extraction is busy set one dirty flag; completion schedules exactly one follow-up pass.
6. Content script emits lightweight `sniperplug:traversal-progress` phases: `settling`, `reading`, `expanding`, `scrolling`, `images`, `tabs`, `extracting`, `sending`, or `retrying`.
7. The open popup renders those phases immediately and polls authoritative crawler state every 450 ms while active.
8. Only `sniperplug:traversal-page` can discover, navigate, classify, or queue pages. Progress messages are display-only and do not weaken traversal authority.

## Changes
- `browser-extension/content-capture.js`
  - non-starvable coalescing traversal scheduler;
  - dirty follow-up guarantee while a snapshot is busy;
  - explicit schedule reset on stop/navigation changes;
  - bounded live preparation-phase messages;
  - existing DOM-only/no-private-API boundary preserved.
- `browser-extension/popup.js`
  - live phase labels and compact phase readout;
  - phase shown during indeterminate discovery and determinate progress;
  - active crawler-state polling tightened to 450 ms;
  - phase state clears when traversal stops/completes.
- `tools/test-browser-traversal-scheduler.mjs`
  - executes the production scheduler and proves 100 rapid mutation triggers create one settle timer;
  - proves mutations during extraction coalesce into exactly one guaranteed follow-up snapshot.
- `tools/test-browser-progress-bar.mjs`
  - executes production phase/progress logic and verifies live phase text with both indeterminate and determinate progress.
- Existing recursive traversal, popup-latency, exact-frame, and candidate-retention regressions were updated for extension `0.2.3`.
- `package.json` runs the scheduler regression in the normal audit/build chain.
- `browser-extension/manifest.json` and `browser-extension-version.json` are `0.2.3`.

## Validation / results
Final PR head `463623866ffc4bff25e43947f8c83352e0e490df`:
- **Verify SniperPlug #1098 passed**, including the complete repository audit/regression suite.
- Firefox Android `0.2.3` XPI packaging and artifact upload passed.
- **Verify affiliate-ready preview #141 passed**.
- **Verify retired public deal routes #146 passed**.
- Cloudflare Pages preview deployed successfully.
- No submitted PR reviews or inline review findings were outstanding.
- Vercel was externally rejected by the account build quota, not by an application build/regression failure.

Post-merge `main` commit `ffe23dabfd85006ef78ea52f317ae47f4f6032b7`:
- **Verify SniperPlug #1099 passed**, including the full repository audit/regression suite and Firefox Android packaging/upload.
- **Verify production guide privacy #106 passed**.
- **Verify affiliate-ready production #102 passed**.
- **Verify retired public deal routes #147 passed**.
- Firefox Android artifact `sniperplug-firefox-android-xpi` ID `10000141581` was produced from this exact merge commit; artifact ZIP digest: `sha256:3a33923ec3b49ba5a682c6b28d4efd9d18b5dc68701944dc12ce6948c3394c81`.

## Cleanup / conflicts
- Final code change set is limited to the extension scheduler/popup/version path, audit wiring, directly affected regressions, and this task record.
- No second crawler, polling crawler, alternate traversal store, authorization path, retry implementation, or navigation fallback was introduced.
- Existing `MutationObserver`, traversal state, background traversal lock, safe URL policy, queue limits, app-frame verification, and server authorization remain authoritative.
- No cookie permission, token forwarding, private Whop API call, credential-bearing traversal, debug bypass, or unrelated feature work was introduced.

## Blockers / risks
- No implementation blocker remains for PR #71.
- Real-device confirmation requires replacing the older Firefox extension with the newly packaged `0.2.3` XPI.
- Vercel remains externally quota-limited until its account limit resets or changes; this does not affect the Cloudflare production path or repository-native validation.

## Backlog
None discovered for this task.

## Next step
No additional implementation work remains for PR #71. Any unrelated coding request should become a separate active task.
