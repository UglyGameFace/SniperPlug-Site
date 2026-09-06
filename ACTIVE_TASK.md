# Active Task

## Active task / outcome
Fix Capture all guides so it cannot sit at `0 of 0 known pages checked` / `Scanning…` for minutes with no real progress, and make the popup report meaningful current preparation progress while the first rendered directory page is being processed.

## Scope
In scope:
- trace Capture all guides from popup start through background traversal state into the Whop app-frame content script;
- fix the initial traversal snapshot scheduler so continuous Whop DOM mutations cannot starve it forever;
- preserve bounded rendered-page preparation, safe same-origin/same-experience traversal, retries, queue limits, and capture verification;
- expose real preparation-phase progress before the first page/targets are known;
- add regression coverage that simulates frequent mutations and proves the first traversal snapshot still runs;
- run the full repository validation, Firefox Android packaging, exact-head review/cleanup, merge, and post-merge validation.

Out of scope / backlog:
- redesigning the crawler or changing what Whop content is authorized/capturable;
- unrelated importer, account switching, or Control Center work.

## Status
IN PROGRESS — reproduced the structural stall in the current execution path on `main`; implementation branch is `fix/capture-all-progress-stall`.

## Findings / root cause
- `startTraversal()` persists state as `status: 'starting'`, attaches traversal to the verified app frame, then waits for the content script to emit the first `sniperplug:traversal-page` snapshot.
- The content script schedules that first snapshot with a 900 ms debounce.
- Its page-wide `MutationObserver` calls `scheduleTraversalSnapshot()` for every DOM mutation.
- `scheduleTraversalSnapshot()` currently calls `clearTimeout(traversalTimer)` before starting a new 900 ms timer. A Whop/React page that keeps mutating more frequently than every 900 ms can therefore postpone the first snapshot indefinitely.
- There is no independent initial-discovery watchdog or progress phase update. Until the first snapshot arrives, background state remains `starting`, discovered/visited remain zero, and the popup can only show an indeterminate `Scanning…` state.
- Normal rendered-page preparation itself is bounded: expanders, lazy scrolling, images, and tab panels are each capped. That work can take several seconds on a large mobile page, but it should not take minutes. The unbounded part is the debounce starvation before preparation begins.

## Execution path
1. Popup sends `sniperplug:start-traversal`.
2. Background resolves/verifies the Better Content iframe, saves traversal state as `starting`, and sends `sniperplug:set-traversal` to that exact frame.
3. Content script sets `traversalEnabled = true` and schedules a traversal snapshot after 900 ms.
4. Current bug: each observed DOM mutation clears/restarts that 900 ms timer, so continuously changing pages may never reach the callback.
5. Intended fix: coalesce repeated triggers without resetting an already-pending traversal snapshot, and remember mutations that happen while a snapshot is busy so one follow-up run is guaranteed.
6. Content script will emit lightweight bounded preparation-phase updates (`settling`, `expanding`, `scrolling`, `images`, `tabs`, `extracting`) to background state, so the popup reports actual current work before target counts exist.
7. The authoritative `sniperplug:traversal-page` snapshot remains the only event that discovers/navigates/queues pages.

## Planned changes
- Replace traversal debounce starvation with a non-starvable coalescing scheduler.
- Ensure a mutation arriving while `traversalBusy` schedules one follow-up snapshot instead of being lost.
- Reset pending timer bookkeeping correctly when traversal stops or navigation changes.
- Add `sniperplug:traversal-progress` updates that only change persisted diagnostic/phase timestamps and never navigate or capture by themselves.
- Render the phase in the popup so `0 of 0` during initial preparation explains what is actually happening.
- Add a regression harness that fires mutations faster than the settle interval and fails if no first traversal snapshot is emitted.
- Bump the extension patch version and version contract.

## Validation required
- New non-starvation traversal scheduler regression.
- Existing recursive traversal, progress-bar, popup latency, Firefox exact-frame/candidate-retention, browser capture/server roundtrip, security-boundary, and full repository audit suite.
- Firefox Android XPI package/upload on exact head.
- Final changed-file/diff inspection, PR review-thread check, merge, and post-merge main validation.

## Cleanup / conflicts
- Do not add a second crawler, polling loop, or navigation fallback.
- Existing `MutationObserver`, traversal state, and traversal lock remain authoritative; the fix changes scheduling semantics rather than stacking another traversal implementation.

## Blockers / risks
- Preparation-phase messages must be lightweight enough not to create a mutation/re-render feedback loop. They travel through extension messaging/storage only and must not mutate the Whop page DOM.
- Duplicate snapshots remain suppressed by `lastTraversalIdentity`; follow-up scheduling must not create repeated navigation on an unchanged page.

## Backlog
None discovered for this task.

## Next step
Implement the non-starvable traversal scheduler and phase reporting, then run targeted and full repository validation.