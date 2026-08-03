# Active Task

## Task
Make **Repair media from Whop** repair the selected guide transparently and stop leaving the owner staring at the same saved warning with no visible result.

## Status
**Active — merge and production retest pending.** PR #15 is merged, but its review exposed one remaining correctness defect: applying the server-confirmed guide bypassed the canonical saved-guide renderer, marked the editor dirty, and left publish/attachment controls stale. PR #16 now routes repaired guides through the existing saved-guide path. Focused regression, JavaScript syntax, full Node 22 build, normal PR CI, review, conflict inspection, and temporary-workflow cleanup are complete.

## Confirmed findings
- The Cloudflare dashboard screenshot confirms an R2 binding named `SNIPERPLUG_MEDIA` points to `sniperplug-media`; the dashboard binding itself should not be deleted or recreated.
- The warning inside Guide Markdown is saved guide content from the original failed import, not a live binding-status widget.
- Repair errors were rendered only in `[data-global-status]` near the top of the Control Center while the repair button and guide editor are far below it. On mobile, a failed request therefore looked like the button did nothing.
- The browser discarded structured API error details, including the exact unresolved media reason.
- The repair action was restricted to old storage-related warning text and could disappear after the server replaced that warning with another media-copy failure.
- The server did not identify the exact Cloudflare Pages branch/commit that handled the repair request, so a deployment/environment mismatch could not be distinguished from an R2 copy failure.
- PR #15's `applyGuide()` dispatched an artificial `input` event after mutating fields directly, which made draft safety report unsaved changes even though the server had already saved the guide.
- The same direct mutation skipped `renderGuideEditor()`, leaving publish eligibility, attachment-resolution visibility, editor status, heading, preview, list cache, and action buttons on the pre-repair state.

## Implemented changes
- Added safe Pages deployment diagnostics (`CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH`, and `CF_PAGES_URL`) to repair success and failure responses.
- Missing-binding errors now say the active Function cannot see the binding, rather than incorrectly claiming the dashboard has no binding.
- Incomplete repairs return the newest server-confirmed guide state and the exact unresolved reasons.
- Added an inline live status directly above the guide action buttons.
- Preserved API error details in the browser and displayed the exact deployment identity beside the guide.
- Updated the editor immediately from the newest server guide on both success and incomplete repair, preventing obsolete warning text from remaining on screen.
- Kept Repair media available for any generated Media or Attachment review warning.
- Added targeted regression and syntax checks for the server and browser repair paths.
- Route every server-confirmed repair result through `updateGuideListItem()` and `renderGuideEditor(guide, 'saved')`, reusing the canonical list, derived-control, `sniperplug:guide-loaded`, and clean-snapshot path.
- Remove the direct field mutation and synthetic `input` event that falsely dirtied the editor.
- Fail visibly instead of silently applying a partial client state if the canonical renderer is unavailable.

## Validation
- [x] Real editor placement and event path inspected.
- [x] Existing repair endpoint, import path, media mirror path, binding guard, callers, and tests inspected.
- [x] Inline status and structured diagnostics implemented.
- [x] Regression assertions added.
- [x] Full Node 22 build and regression suite pass on PR #15 (workflow run #815).
- [x] Canonical repair-state regression passes on the follow-up branch.
- [x] `node --check` passes for both modified Control Center clients.
- [x] Full Node 22 build passes on the follow-up branch before its implementation commit is pushed.
- [x] Temporary patch workflow and trigger are removed from the final branch.
- [x] Follow-up branch is based on current `main` with no open competing pull request.
- [x] Normal PR #16 `Verify SniperPlug` build and full regression suite pass (workflow run #820).
- [x] Script load order proves the canonical renderer and draft lifecycle listeners load before the repair client.
- [x] Final changed-file scope is limited to four task files; no duplicate listener or conflicting implementation path remains.
- [x] PR #16 is mergeable, zero commits behind `main`, and Qodo recommends the event-bridge approach with no action-required finding.
- [ ] PR #16 is squash-merged.
- [ ] Cloudflare production deployment contains the merged repair commit.
- [ ] Owner retest returns the exact runtime result beside the selected guide.
- [ ] The exact media item is copied successfully or its remaining source/size/runtime blocker is identified and addressed.

## Definition of Done
- Pressing Repair media always produces a visible result beside the button on mobile and desktop.
- The result identifies whether the active Function sees R2 and which Pages commit/branch handled the request.
- A successful repair replaces the warning with the server-confirmed media Markdown immediately.
- An incomplete repair shows the exact reason and newest saved guide state; it never reports success or appears inert.
- Repaired server state refreshes the guide list, editor status, preview, publish controls, attachment resolution, and draft clean snapshot through the canonical renderer.
- Targeted tests, full build, deployment validation, cleanup, and conflict inspection pass.

## Backlog
- Large-video archival storage remains deferred unless the exact repair result proves this file exceeds the current 50 MB automatic-copy ceiling.
- Newegg affiliate application work remains paused until this active media repair task reaches Definition of Done.

## Scope lock
No unrelated implementation begins until this media repair task is production-validated, unless the user explicitly sends the required FORCE SWITCH instruction.
