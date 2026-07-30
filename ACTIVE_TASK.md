# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so rejected or manually removed imported guides can be restored or re-imported, Undo accurately reflects every reversible state, Samsung Browser receives the current runtime, and all prior course-video, loading-feedback, publishing, security, and hard-free safeguards remain intact.

## Status
Active on `agent/whop-guide-importer`, draft PR #2. Backend rejected-guide re-import and restore logic is present, but the Control Center still labels every reversible action as Published and describes Undo as bulk-publication-only. A validated patch is being run to align the UI, permanent tests, and browser asset version. Do not merge until exact-head CI, temporary workflow cleanup, Cloudflare deployment, conflict inspection, and authenticated Samsung/Chrome acceptance pass.

## Findings
- Rejected imported rows remain in D1 so restoration is possible.
- The importer previously treated a rejected row with an unchanged fingerprint as unchanged; it now bypasses that shortcut when status is rejected.
- The recent-actions backend now includes rejected imported guides from the last 48 hours and can return published or rejected guides to draft.
- The browser still says Published for rejected reversible items and only describes bulk publications.
- Samsung Browser had older immutable Control Center assets while a first Chrome load received the current runtime.
- Whop tiles are Experiences powered by apps; discovery remains experience-first and app-aware rather than treating those modules as files.

## Changes in validation
- Truthful Restore recent imported changes copy and status labels.
- Permanent regression checks for rejected-guide re-import and rejected-guide restoration.
- Fresh version for every Control Center asset.
- Preserve immediate pointer feedback, persistent operation progress, and duplicate-submit locks.

## Validation required
- Full Node 22 build and regression suite.
- Rejected imported guide can be restored to draft through recent actions.
- Rejected guide with unchanged source fingerprint can be imported again.
- UI distinguishes Published · can undo from Rejected · can restore.
- No temporary workflow, package lock, duplicated runtime, or conflicting code remains.
- Cloudflare deploys the exact cleaned head.
- Authenticated Samsung and Chrome tests confirm taps register, progress remains visible, undo works, and re-import recreates corrected course drafts.

## Backlog
None. Stay on this task until Definition of Done passes.
