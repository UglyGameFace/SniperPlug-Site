# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so rejected or manually removed imported guides can be restored or re-imported, Undo accurately reflects every reversible state, Samsung Browser receives the current runtime, and all prior course-video, loading-feedback, publishing, security, and hard-free safeguards remain intact.

## Status
Implementation and permanent Node 22 regression validation pass on `agent/whop-guide-importer`, draft PR #2. Temporary write workflows are removed. Awaiting Cloudflare propagation and authenticated Samsung/Chrome acceptance before merge.

## Findings
- Rejected imported rows remain in D1 so restoration is possible.
- The importer previously treated a rejected row with an unchanged fingerprint as unchanged; it now bypasses that shortcut when status is rejected.
- Recent actions previously included only currently published bulk output; rejected imported guides could not be selected or restored.
- The UI labeled every reversible row Published even after rejected-guide restoration was added.
- Samsung Browser had older immutable Control Center assets while a first Chrome load received the current runtime.
- Whop tiles are Experiences powered by apps; discovery remains experience-first and app-aware rather than treating those modules as files.

## Changes
- Rejected guides with unchanged source fingerprints are recreated as drafts on re-import.
- Rejected imported guides from the last 48 hours appear in recent actions and can return to draft.
- Source decisions reset to pending when an imported action is restored.
- Undo copy and row labels now distinguish Published · can undo from Rejected · can restore.
- Every Control Center asset now uses version `20260730.7`.
- Immediate pointer feedback, persistent operation progress, and duplicate-submit locks remain active.
- Permanent regression checks cover rejected re-import, rejected restoration, and truthful owner-facing copy.

## Validation
- Permanent `Verify SniperPlug` workflow passed on cleaned head `e9b91eb18dd6fb336b89e1681b885f79ff6ab977`.
- Full Node 22 build and regression suite passed.
- Temporary apply workflows and package-lock artifacts are absent.
- PR remains draft and mergeable.

## Acceptance remaining
- Confirm Cloudflare serves `20260730.7` assets.
- In Samsung Browser and Chrome, restore one rejected imported guide and re-import one rejected Travel Hacking lesson.
- Confirm each tap immediately shows pressed/busy/progress feedback and duplicate taps do not start duplicate work.
- Confirm the corrected course draft no longer contains the obsolete R2 hosted-video warning and opens the adaptive player.

## Backlog
None. Stay on this task until authenticated acceptance passes.
