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
- validate this final task-record PR head exactly;
- merge PR #71;
- post-merge `main` validation;
- final task-record cleanup and validated XPI handoff.

Out of scope:
- changing what Whop content is authorized/capturable;
- unrelated importer, account-switching, or Control Center work.

## Status
VALIDATED IMPLEMENTATION — PR #71 implementation head `aa4d2aa51bbf55a9132e8abb960d50d182fa98cf` passed the full merge gate. This task-record-only head must now pass the same repository checks before merge so the final PR head is exact-head validated.

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
  - executes production phase/progress logic and verifies live phase text with indeterminate and determinate progress.
- Existing traversal/Firefox regressions updated for extension `0.2.3`.
- `package.json` runs the scheduler regression in the normal audit/build chain.
- `browser-extension/manifest.json` and `browser-extension-version.json` advanced to `0.2.3`.

## Validation / results
Implementation head `aa4d2aa51bbf55a9132e8abb960d50d182fa98cf`:
- **Verify SniperPlug #1097 passed**.
- Full repository audit/regression suite passed.
- New **BROWSER CAPTURE-ALL SCHEDULER REGRESSION** passed, proving a 100-mutation burst cannot postpone the first traversal snapshot and in-flight mutations coalesce into one follow-up.
- Updated **BROWSER CAPTURE PROGRESS BAR REGRESSION** passed, including live phase visibility.
- Popup latency regression still passed with cold popup-state returning in 2 ms while recovery/version work was intentionally hung.
- Firefox exact-frame, candidate-retention, recursive traversal, server roundtrip, security/privacy, and all unrelated repository regressions passed.
- Firefox Android `0.2.3` XPI packaged, archive-tested, and uploaded successfully.
- PR artifact `sniperplug-firefox-android-xpi` ID `10000088539`; artifact ZIP digest `sha256:ee430963ccac84c146427dd2a58b34a31a9c6d818d9a0cbd399359d4233b0d8d`.
- **Verify affiliate-ready preview #140 passed**.
- **Verify retired public deal routes #145 passed**.
- Cloudflare Pages preview deployed successfully on the exact implementation head.
- PR is mergeable with no submitted reviews or inline review findings.
- Qodo review is externally unavailable because its subscription is inactive; it produced no review finding.
- Both Vercel statuses are external account-quota failures (`api-deployments-free-per-day` / build-rate limit), not application build failures. Cloudflare and repository-native validation are green.

## Cleanup / conflicts
- Changed files are limited to this active task record, extension scheduler/popup/version files, audit wiring, and directly affected regressions.
- No second crawler, polling crawler, alternate traversal store, or navigation fallback was added.
- Existing `MutationObserver`, traversal state, background traversal lock, safe URL policy, queue limits, and server verification remain authoritative.
- No cookie permission, token forwarding, private Whop API call, credential-bearing traversal, or unrelated feature work was introduced.

## Blockers / risks
- No implementation blocker remains.
- Real-device runtime confirmation requires installing the newly packaged `0.2.3` XPI after merge.
- Vercel remains externally quota-limited; this does not block the Cloudflare production path or repository validation.

## Backlog
None discovered for this task.

## Next step
Wait for repository-native checks on this final task-record head. If they pass without a new review finding, merge PR #71, validate `main`, close the active task record, and hand off the final `0.2.3` XPI.
