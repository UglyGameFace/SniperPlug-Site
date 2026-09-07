# Active Task

## Active task / outcome
PR #72 — fix the remaining Firefox Android Capture-all `Settling…` stall reproduced on extension `0.2.3`, where a valid Better Content frame was visible but the resumed crawler stayed at 0 discovered / 0 queued / 0 retries.

## Status
COMPLETE AND MERGED — PR #72 was squash-merged into `main` as `cb09da9cc427b554e7528c1679de6349d4fb629b` after exact final PR head `32fbd4a20e825ba1fba6f6e9927280b46f1d037c` passed the merge gate. Post-merge production validation passed. No implementation task is currently active.

## Runtime evidence that reopened the task
- Installed Firefox Android extension reported `0.2.3 · current 0.2.3`.
- Better Content frame was correctly found and readable (`2,428 rendered characters detected`).
- Capture-all resumed its saved session and entered `Settling…`.
- It remained at 0 queued, 0 remaining, 0 discovered, 0 new/changed/unchanged/duplicate, and 0 retries.
- This proved PR #71's direct MutationObserver debounce fix was incomplete rather than a frame-discovery, popup, or server-side failure.

## Final root cause
1. The app-frame `MutationObserver` called `registerCandidate()` on page mutations.
2. `registerCandidate()` sent `sniperplug:candidate` to the background.
3. `saveCandidate()` saw the already-active traversal and correctly re-sent `sniperplug:set-traversal { enabled: true }` to the frame so genuinely reloaded/reinjected Firefox frames can resume.
4. The content-script `set-traversal` handler incorrectly treated every repeated `enabled: true` as a new attach: it cleared traversal identity, reset the traversal snapshot schedule, and started another 900 ms settle timer.
5. On a busy Whop/React page, candidate churn therefore created a candidate → background → reattach loop that could keep replacing the pending timer before it fired.
6. `Settling…` was emitted each time the timer was scheduled, explaining why the device showed a live phase but never reached `Reading…`, retries, discovery, or queued pages.

## Final fix
- `sniperplug:set-traversal` is now idempotent when the requested enabled state already matches the content script's current state.
- Repeated `enabled: true` calls `resumeTraversal()` without clearing the pending timer, dirty flag, or traversal identity.
- Genuine state transitions still use the existing authoritative reset/start/stop behavior.
- Background reattachment remains intact so a genuinely new Firefox app-frame document can recover an active traversal.
- Scheduler regression coverage asserts the repeated-enable guard occurs before any schedule reset and that same-state enable resumes instead of resetting.
- Firefox Android extension/version contract advanced from `0.2.3` to `0.2.4`.

## Safety / cleanup
- No second crawler, polling crawler, alternate traversal store, retry path, or navigation fallback was added.
- Same-origin/same-experience traversal, sensitive-route rejection, bounded retries/queues, rendered-DOM-only capture, app-frame verification, and server authorization remain unchanged.
- No cookie permission, token forwarding, private Whop API probing, Control Center/importer/account-switching changes, or unrelated extraction behavior was introduced.
- The temporary branch-only patch workflow self-deleted before the PR and is absent from the merged tree.

## Validation / results
Final PR head `32fbd4a20e825ba1fba6f6e9927280b46f1d037c`:
- **Verify SniperPlug #1101 passed** with the full repository audit/regression suite.
- Repeated-reattach traversal regression passed.
- Firefox Android `0.2.4` XPI packaged and archive-tested successfully.
- PR artifact `sniperplug-firefox-android-xpi` ID `10001284923`, digest `sha256:4cec0c8ba0204182372401040650db6d995ac4bdba09b932e709547a4826627d`.
- Cloudflare Pages preview deployed successfully.
- No inline review comments or submitted review findings were outstanding.
- Qodo was externally unavailable because its subscription is inactive and produced no finding.
- Vercel remained externally quota-limited; it is not the production deployment path and did not represent an application regression.

Merged `main` commit `cb09da9cc427b554e7528c1679de6349d4fb629b`:
- **Verify SniperPlug #1102 passed**, including full regression validation and Firefox Android packaging/upload.
- **Verify production guide privacy #108 passed**.
- **Verify affiliate-ready production #104 passed**.
- Cloudflare Pages deployment passed on the exact merge commit.
- Production artifact `sniperplug-firefox-android-xpi` ID `10001321116`, digest `sha256:c3421e0e594d9cb212760559464461f6b2909801d73961267626b3142bb3b6fa`.

## Remaining runtime confirmation
The code task is complete. The only remaining action is device-side confirmation using the newly packaged `0.2.4` XPI. The old `0.2.3` install must be replaced before judging this fix because its content script still contains the repeated-reattach reset bug.

## Next step
Install the exact validated `0.2.4` Firefox Android XPI and start a fresh Capture-all run. Any failure after that is a runtime regression continuation of this same Capture-all task; otherwise the next unrelated coding request should become a separate active task.
