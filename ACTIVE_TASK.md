# Active Task

## Task
Make **Repair media from Whop** repair the selected guide transparently and stop leaving the owner staring at the same saved warning with no visible result.

## Status
**Active — actual R2 uploader fix merged and deployed; exact owner retest pending.** PR #16 fixed repair-result visibility and editor synchronization. The owner’s production screenshots then proved the underlying uploader still stripped response-body length metadata before R2. PR #17 fixes that actual media-write path and is squash-merged at `ee4dc0fc2f882a733bc0b8e16392f4bab6beba5c`. Focused media tests, the full Node 22 suite, review, cleanup, merge, and post-merge production checks are complete. The task remains locked until the exact Whop guide repairs successfully or returns a new concrete blocker from the live uploader.

## Confirmed findings
- The Cloudflare dashboard screenshot confirms an R2 binding named `SNIPERPLUG_MEDIA` points to `sniperplug-media`; the dashboard binding itself should not be deleted or recreated.
- The warning inside Guide Markdown is saved guide content from the original failed import, not a live binding-status widget.
- Repair errors were rendered only in `[data-global-status]` near the top of the Control Center while the repair button and guide editor are far below it. On mobile, a failed request therefore looked like the button did nothing.
- The browser discarded structured API error details, including the exact unresolved media reason.
- The repair action was restricted to old storage-related warning text and could disappear after the server replaced that warning with another media-copy failure.
- The server did not identify the exact Cloudflare Pages branch/commit that handled the repair request, so a deployment/environment mismatch could not be distinguished from an R2 copy failure.
- PR #15's `applyGuide()` dispatched an artificial `input` event after mutating fields directly, which made draft safety report unsaved changes even though the server had already saved the guide.
- The same direct mutation skipped `renderGuideEditor()`, leaving publish eligibility, attachment-resolution visibility, editor status, heading, preview, list cache, and action buttons on the pre-repair state.
- The first PR #16 implementation allowed the fallback reload warning to be overwritten by an unconditional success message.
- The first PR #16 event listener marked incomplete guide payloads handled even when `renderGuideEditor()` returned without applying them.
- The production screenshots for `IMG_7082.jpeg` and `image.png` still showed `Provided readable stream must have a known length`, proving the media bytes never reached R2.
- `mirrorWhopMedia()` passed `response.body.pipeThrough(new TransformStream(...))` into `R2Bucket.put()`. The wrapper removed the response body's fixed-length identity even when Whop supplied `Content-Length`.
- Media enhancement copies files sequentially, so buffering only unknown-length files under the existing 50 MB ceiling does not create unbounded per-request concurrency.
- The owner’s production reconnect reached Whop’s raw `redirect_uri is invalid` response.
- `config()` preferred `WHOP_REDIRECT_URI` over the request host even though the production documentation says the callback is origin/canonical-host aware. A stale localhost or old Pages value could therefore break every production reconnect.
- Whop requires each OAuth redirect URI to match an app whitelist entry exactly.

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
- Make `renderGuideEditor()` return explicit applied/not-applied truth and acknowledge the event only after a successful render and list refresh.
- Preserve the reload-safety error instead of overwriting it with success, including incomplete-repair responses that return a newer guide.
- Send known-length Whop fetch bodies to R2 untouched so Workers preserves their runtime fixed-length metadata.
- Convert only unknown-length/chunked responses into a byte-capped fixed-size `Blob` before `R2Bucket.put()`.
- Use the R2 write result as the authoritative stored size, reject null or oversized writes, and preserve reservation rollback/deletion behavior.
- Record the upload mode in R2 custom metadata for live diagnosis.
- Add regression coverage for known-length identity preservation, chunked Blob fallback, and both declared and streamed oversize rejection.
- Resolve production and stable-preview OAuth callbacks from an explicit canonical-host allowlist and ignore stale environment overrides outside localhost.
- Reject unregistered hosts before redirecting to Whop and return start-up errors to the Control Center instead of a raw API response.
- Add runtime regressions for production, www canonicalization, preview, localhost, stale overrides, external local overrides, and unknown Pages hosts.

## Validation
- [x] Real editor placement and event path inspected.
- [x] Existing repair endpoint, import path, media mirror path, binding guard, callers, and tests inspected.
- [x] Inline status and structured diagnostics implemented.
- [x] Regression assertions added and synchronized with the reviewed execution path.
- [x] Full Node 22 build and regression suite pass on PR #15 (workflow run #815).
- [x] Canonical repair-state regression passes on the follow-up branch.
- [x] `node --check` passes for both modified Control Center clients.
- [x] Script load order proves the canonical renderer and draft lifecycle listeners load before the repair client.
- [x] Qodo findings for warning preservation and incomplete-guide acknowledgement are repaired and resolved.
- [x] Focused Whop recovery-media regression passes after the review repairs.
- [x] Final clean-head `Verify SniperPlug` full build and regression suite pass for PR #16 (workflow run #831).
- [x] PR #16 was squash-merged at `28b1047cb96f5abe579f79ddcaecca9c16379866`.
- [x] Focused R2 hard-free/media upload regression passes on the uploader-fix branch.
- [x] Known-length response identity, unknown-length Blob fallback, and both oversize paths are covered.
- [x] Recovery-media regression and full Node 22 build pass on PR #17 (workflow run #834).
- [x] Temporary patch workflows and triggers are removed from the final branch.
- [x] Final PR #17 changed-file scope is limited to three task files with no competing PR or duplicate uploader path.
- [x] Qodo recommends the split known-length/Blob strategy and raised no review thread.
- [x] PR #17 was mergeable, zero commits behind `main`, and squash-merged.
- [x] Actual uploader merge commit: `ee4dc0fc2f882a733bc0b8e16392f4bab6beba5c`.
- [x] Post-merge production privacy workflow passed after Cloudflare propagation.
- [ ] Live repair result reports the active Pages branch/commit containing `ee4dc0fc`.
- [ ] Owner retest replaces the saved media warning with a durable `/media/...` Markdown URL.
- [ ] Any remaining source, permission, size, timeout, or storage blocker is identified from the exact live result and addressed.

## Definition of Done
- Pressing Repair media always produces a visible result beside the button on mobile and desktop.
- The result identifies whether the active Function sees R2 and which Pages commit/branch handled the request.
- A successful repair replaces the warning with the server-confirmed media Markdown immediately.
- An incomplete repair shows the exact reason and newest saved guide state; it never reports success or appears inert.
- Repaired server state refreshes the guide list, editor status, preview, publish controls, attachment resolution, and draft clean snapshot through the canonical renderer.
- Known-length and chunked Whop media both reach R2 through payload types Cloudflare accepts.
- Targeted tests, full build, deployment validation, cleanup, and conflict inspection pass.

## Backlog
- Large-video archival storage remains deferred unless the exact repair result proves this file exceeds the current 50 MB automatic-copy ceiling.
- Newegg affiliate application work remains paused until this active media repair task reaches Definition of Done.

## Scope lock
No unrelated implementation begins until this media repair task is production-validated, unless the user explicitly sends the required FORCE SWITCH instruction.

## OAuth reconnect validation
- [ ] Canonical OAuth redirect regression and full Node 22 build pass.
- [ ] OAuth repair PR review, cleanup, merge, and Cloudflare deployment pass.
- [ ] Production Connect Whop opens consent/callback without `redirect_uri is invalid`.
