# Active Task

## Active task / outcome
Add a true, visible Capture-all progress bar to the Better Content Firefox extension so a long recursive sync visibly proves that work is happening and shows how much of the currently known guide tree has been processed.

## Scope
In scope:
- progress UI inside the existing Capture-all card;
- progress derived only from the crawler's authoritative visited/discovered/remaining counters;
- an indeterminate discovery phase when no denominator exists yet;
- a determinate percentage once known work exists, with honest handling of a growing recursive guide tree;
- paused/error/complete states and accessible progress semantics;
- extension patch-version/update metadata and directly affected regression coverage;
- Firefox Android packaging, exact-head CI, final diff/review inspection, merge, post-merge validation, and delivery of the resulting XPI.

Out of scope / backlog:
- changing traversal behavior, Whop authorization, capture limits, retries, handoff policy, or content readers;
- unrelated Control Center/importer changes.

## Status
IN PROGRESS — root cause and authoritative progress inputs are identified; implementation is being applied on `feature/capture-progress-bar`.

## Findings / root cause
- PR #68 already exposes `crawlVisited`, `crawlDiscovered`, `crawlRemaining`, queue outcomes, retries, failures, and the current title to the popup.
- The popup renders those values only as dense status text. There is no visual progress track, percentage, or discovery animation, so a healthy long-running crawl can look frozen.
- Recursive discovery means the total number of pages is not known up front. A fake fixed denominator would be misleading. The correct denominator is the currently known work set, and it may grow as nested directories reveal more pages.

## Execution path
1. Background traversal owns and persists visited/pending/current/discovered state.
2. `sniperplug:popup-state` exposes the derived crawler counters.
3. The popup polls that state while Capture-all is enabled.
4. The new progress renderer maps those existing counters into an accessible progress bar without adding a second crawler or duplicated traversal state.

## Planned implementation
- Show an indeterminate animated bar while the crawler is starting/discovering and has no known total.
- Once pages are known, calculate progress from completed visits versus the maximum of discovered pages and completed+remaining known work.
- Keep running scans below 100% until the crawler reports a complete state.
- Show the exact `X of Y known pages checked` readout beside the percentage so users understand that nested discovery can expand Y.
- Freeze truthful partial progress for stop/interruption/error states and show 100% only for complete/complete-empty.
- Preserve reduced-motion and ARIA behavior.

## Validation required
- Syntax/static regression checks for the popup progress implementation.
- Existing recursive traversal, interruption recovery, security boundary, Firefox frame-selection, server roundtrip, and full repository audit suite.
- Firefox Android XPI package/upload on the exact PR head.
- Final changed-file and review-thread inspection before merge.
- Post-merge main validation before completion is claimed.

## Blockers / risks
- The percentage can legitimately decrease if a later page reveals more nested guides. The UI must call the denominator “known pages” rather than pretending the final total was known at scan start.

## Backlog
None discovered for this task.

## Next step
Implement the progress UI and directly affected version/regression updates, then run the repository-native exact-head validation.
