# Active Task

## Current state
COMPLETE AND MERGED — PR #69 added a true visible Capture-all progress bar to the Better Content Firefox extension. No implementation task is currently active.

## User-visible failure addressed
A healthy long-running Capture-all sync could look frozen because the popup showed only dense crawler counters. There was no progress track, percentage, or visible discovery activity.

## Root cause
- The crawler already exposed authoritative `crawlVisited`, `crawlDiscovered`, and `crawlRemaining` state through `sniperplug:popup-state`.
- The popup never translated those counters into a visual progress control.
- Recursive Better Content traversal can reveal more nested pages while scanning, so the final page count is not knowable at startup. A fixed denominator would have produced misleading progress.

## Execution path preserved
1. Background traversal remains the sole owner of visited/pending/current/discovered state.
2. `sniperplug:popup-state` exposes those existing counters.
3. The popup polls that state while Capture-all is active.
4. The progress renderer derives presentation-only state from those counters; no second crawler, retry path, authorization path, or duplicated traversal state was introduced.

## Changes merged
- Added a visible progress track and percentage inside the existing Capture-all card.
- Discovery is indeterminate only while no real known-work denominator exists.
- Determinate progress uses completed visits versus the maximum of discovered pages and completed+remaining known work.
- The UI says `X of Y known pages checked` so Y can honestly grow when nested directories reveal more guides.
- A running crawl is capped visually at 99% and reaches 100% only after `complete` or `complete-empty`.
- Stop/interruption/error states retain truthful partial progress instead of resetting.
- Added ARIA progress semantics and reduced-motion behavior.
- Extension version advanced from `0.2.0` to `0.2.1`; minimum compatible version remains `0.2.0`.
- Added `tools/test-browser-progress-bar.mjs` and wired it into the repository audit chain; related traversal/frame-selection version regressions were updated.
- PR #69 was squash-merged to `main` as `5795fe9e9ea8f31908ec6e9c7c0766e633030613`.

## Validation / results
- Final PR head `03ed0ff403b1d2e5fa6c37ddb618ef02209c61bd`: **Verify SniperPlug #1090 passed**, including the full repository build/regression suite, Firefox Android XPI packaging, and artifact upload.
- The same exact PR head passed **Verify affiliate-ready preview #137**, **Verify retired public deal routes #140**, and Cloudflare Pages deployment.
- New progress regression verifies indeterminate discovery, determinate known-work percentage, recursive denominator expansion, the 99% running cap, paused partial progress, and 100% only for completed scans.
- No inline review threads or submitted PR reviews were outstanding at merge.
- Post-merge `main` commit `5795fe9e9ea8f31908ec6e9c7c0766e633030613`: **Verify SniperPlug #1091 passed**, including the full regression suite and Firefox Android package/upload.
- The same merge commit also passed production affiliate readiness, production guide privacy, retired public deal routes, and Cloudflare Pages deployment.
- Vercel preview/deployment statuses were rejected because the account exceeded its free daily deployment/build limit (`api-deployments-free-per-day` / `build-rate-limit`), not because of an application build or regression failure.

## Cleanup / conflicts
- Final implementation scope remained limited to the progress UI, extension patch-version metadata, directly affected regressions, audit wiring, and this task record.
- No traversal, Whop authorization, capture limit, retry, content-reader, server handoff, or Control Center behavior was changed.
- No cookie permission, token forwarding, private-API probing, debug code, conflict markers, secret-bearing changes, or unrelated redesign was introduced.

## Remaining risks / limitations
- The displayed percentage can decrease if a later directory reveals additional nested pages. This is intentional and truthful; the denominator is explicitly labeled as the currently **known** page count rather than a fabricated final total.
- Vercel remains externally rate-limited until its account quota resets or plan changes; GitHub regression workflows and Cloudflare deployment are green.

## Next step
No implementation work remains for PR #69. Use the validated Firefox Android `0.2.1` XPI for live testing; select any further implementation task separately.
