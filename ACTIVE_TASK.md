# Active Task

## Active task / outcome
Fix Capture all guides so it cannot sit at `0 of 0 known pages checked` / `Scanning…` for minutes with no real progress, and make the popup report meaningful current preparation progress while the first rendered directory page is being processed.

## Scope
Completed implementation:
- traced Capture all from popup start through background traversal state into the Whop app-frame content script;
- fixed the initial traversal snapshot scheduler so continuous Whop DOM mutations cannot starve it forever;
- preserved bounded rendered-page preparation, safe same-origin/same-experience traversal, retries, queue limits, and capture verification;
- added live preparation phases before the first page/targets are known;
- added a mutation-storm scheduler regression and expanded the real progress-bar regression;
- bumped the Firefox Android extension/version contract to `0.2.3`.

Still required before completion:
- exact-head repository CI and Firefox Android packaging;
- changed-file/review inspection;
- merge and post-merge `main` validation;
- final task-record cleanup and validated XPI handoff.

Out of scope:
- changing what Whop content is authorized/capturable;
- unrelated importer, account-switching, or Control Center work.

## Status
IMPLEMENTED — branch `fix/capture-all-progress-stall` contains the scheduler, live-phase, regression, and `0.2.3` package changes. Repository-native exact-head validation is the remaining merge gate.

## Findings / root cause
- `startTraversal()` saves `status: 'starting'`, attaches traversal to the verified app frame, then waits for the content script to emit the first `sniperplug:traversal-page` snapshot.
- The content script used a 900 ms debounce for that snapshot.
- Its page-wide `MutationObserver` calls `scheduleTraversalSnapshot()` for every DOM mutation.
- The old scheduler cleared/restarted the 900 ms timer on every mutation. A Whop/React page mutating more frequently than every 900 ms could therefore postpone the first snapshot indefinitely.
- That exactly matches the runtime symptom: background state stays `starting`, discovered/visited remain zero, and the popup sits at generic `Scanning…` for minutes.
- Normal preparation is bounded and measured in seconds: safe expanders, lazy scrolling, image wait, tab panels, and extraction all have caps. The unbounded piece was scheduler starvation before preparation even began.

## Execution path after fix
1. Popup sends `sniperplug:start-traversal`.
2. Background resolves/verifies the Better Content iframe, persists traversal state, and attaches traversal to that exact frame.
3. Content script schedules one 900 ms settling snapshot.
4. Repeated DOM mutations no longer reset an already-pending timer.
5. If mutations happen while extraction is busy, they set one dirty flag; completion schedules exactly one follow-up pass.
6. Content script emits lightweight `sniperplug:traversal-progress` phases: `settling`, `reading`, `expanding`, `scrolling`, `images`, `tabs`, `extracting`, `sending`, or `retrying`.
7. The open popup renders those phases immediately and polls authoritative crawler state every 450 ms while active.
8. Only `sniperplug:traversal-page` can discover/navigate/queue pages. Progress messages are display-only and do not weaken traversal authority.

## Changes
- `browser-extension/content-capture.js`
  - non-starvable coalescing traversal scheduler;
  - dirty follow-up guarantee while a snapshot is busy;
  - explicit schedule reset on stop/navigation changes;
  - bounded live preparation-phase messages;
  - existing DOM-only/no-private-API boundary preserved.
- `browser-extension/popup.js`
  - live phase labels and compact phase readout;
  - phase shown both before and after a real denominator exists;
  - active polling tightened to 450 ms;
  - phase state clears when traversal stops/completes.
- `tools/test-browser-traversal-scheduler.mjs`
  - executes the production scheduler and proves 100 rapid mutation triggers create one settle timer;
  - proves mutations during extraction coalesce into one guaranteed follow-up snapshot.
- `tools/test-browser-progress-bar.mjs`
  - now executes production phase/progress logic and verifies live phase text with indeterminate and determinate progress.
- Existing traversal/Firefox regressions updated for extension `0.2.3`.
- `package.json` runs the scheduler regression in the normal audit/build chain.
- `browser-extension/manifest.json` and `browser-extension-version.json` advanced to `0.2.3`.

## Validation required
- Full `Verify SniperPlug` audit/regression suite on exact PR head.
- Firefox Android XPI package/upload on exact PR head.
- Preview/privacy/route checks and Cloudflare deployment as applicable.
- No unresolved PR review threads/findings.
- Post-merge `main` validation and final bookkeeping-head validation.

## Cleanup / conflicts
- No second crawler, polling crawler, alternate traversal store, or navigation fallback was added.
- Existing `MutationObserver`, traversal state, background traversal lock, safe URL policy, queue limits, and server verification remain authoritative.
- No cookie permission, token forwarding, private Whop API call, credential-bearing traversal, or unrelated feature work was introduced.

## Blockers / risks
- No known implementation blocker. Real-device runtime still requires installing the newly packaged `0.2.3` XPI after merge.
- Live phase messages are extension-only messages and do not mutate the Whop page DOM, avoiding a progress-feedback mutation loop.

## Backlog
None discovered for this task.

## Next step
Open the PR on the implemented branch, run the exact-head merge gate, fix any genuine regression, then merge and validate `main` before declaring completion.
