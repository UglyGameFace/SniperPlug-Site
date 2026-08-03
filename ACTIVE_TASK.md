# Active Task

## Task
Issue #19 — Back up Whop imports before clear-and-resync, including a usable mobile recovery workflow.

## Status
**Active — backup engine merged/deployed; PR #22 mobile workflow repair under final validation.** PR #21 merged as `2124770e6679fce9d21cafb2b0efe90edda16d0c`. Production build, private-guide privacy, affiliate-readiness, and retired-route checks passed. Live Samsung Internet testing then exposed a frozen, repetitive Control Center, so the same task remains open until PR #22 is deployed and the real backup/download/clear-resync/restore exercise succeeds.

## Confirmed findings
- Reconnecting Whop replaces OAuth access but does not clear saved source/post/guide/video/media state.
- A safe reset needs a durable recovery archive that remains restorable after Whop access is lost.
- The first production recovery panel competed with the normal import flow and loaded backup history automatically.
- Unlocking the page also started dashboard, bulk history, recent actions, and Whop discovery together.
- Discovery could rerun itself up to eight times only 350 ms apart while rebuilding source-group DOM.
- Opening an approved source immediately started a content scan.
- Source and post views eventually rendered every card, producing a large control wall and freezing Samsung Internet.
- Mobile blur, shadows, animation, and smooth scrolling increased paint work during the same heavy operations.

## Implemented and merged in PR #21
- Signed, checksum-verified, bounded R2 recovery archives with manifest-only D1 state.
- Exact source, current/stale post, category, guide, course-video, and media-ledger snapshots.
- Read-back verification, owner-bound signatures, current-state checks, one-time reset authorization, and typed confirmation.
- Published-guide preservation by default and conflict-safe offline restore.
- R2 archive/media pinning, stale-post filtering, preserved-guide reattachment, and retry-safe restore behavior.
- Owner-only backup history, JSON download, restore, safe clear/resync, reset-all, and deletion.

## Implemented on PR #22
- No automatic source discovery or content scan on unlock.
- Explicit `Load sources` action; later passes are manual `Refresh sources` actions.
- Removed the eight-pass 350 ms discovery loop.
- Source groups remain collapsed and render 12 sources at a time with explicit Load more.
- Choosing or approving a source no longer scans it; `Review content` is a separate action.
- Content review renders 10 cards at a time with explicit Load more.
- Guide review renders 24 summaries at a time with existing lazy detail loading.
- Bulk-job and recent-action history load only when the bulk workflow is opened.
- Backup history loads only when the recovery workflow is opened.
- Backup, restore, and clear/resync now live together in one collapsed safety center at the end of the ordered workflow.
- One action selector chooses backup-only or safe clear/resync; advanced destructive options stay collapsed.
- The new Continue action shares all busy/valid locks to prevent duplicate mobile taps.
- Mobile removes expensive blur/shadow/smooth-scroll work and disables busy animations.
- Permanent regressions enforce bounded pagination, manual scanning, lazy history, one recovery center, and mobile action locks.

## Validation
- [x] PR #21 focused backup/reset/restore audit passed.
- [x] PR #21 clean-head full Node 22 suite passed and both Qodo findings were resolved.
- [x] PR #21 squash-merged and production post-merge checks passed.
- [x] PR #22 focused mobile-flow audit passed.
- [x] PR #22 complete existing Node 22 build passed after replacing render-all behavior with bounded pagination.
- [x] PR #22 follow-up busy-lock/lazy-history audit and complete build passed.
- [x] PR #22 cleanup leaves only permanent runtime/UI/regression files; no patch scripts or self-mutating workflows remain.
- [ ] PR #22 clean-head CI and review pass.
- [ ] PR #22 is squash-merged and Cloudflare production contains the merge commit.
- [ ] Samsung Internet opens/unlocks without freezing and performs no automatic source/content scan.
- [ ] Production backup creation and JSON download succeed on real imported content.
- [ ] Production clear-and-resync preserves published guides and removes stale state.
- [ ] Production restore works without relying on current Whop access and reports conflicts truthfully.

## Definition of Done
- The Control Center presents one understandable ordered workflow on mobile and desktop.
- Unlocking performs only the minimum overview work and never starts a source/content scan.
- Large source, post, and guide collections remain behind explicit bounded pagination.
- Backup and recovery are one non-repetitive safety center, not a competing workflow.
- No destructive Whop reset can start without a newly verified restorable backup.
- Backup download and restore work after Whop access is removed.
- Published guides remain by default and newer guides are never overwritten silently.
- Targeted tests, full build, cleanup, review, deployment, Samsung Internet validation, and live recovery validation pass.

## Backlog
- Issue #20 — full website duplication audit after Issue #19 reaches Definition of Done.
- Universal owner-authorized proxy/play/download support for non-Course Whop videos.

## Scope lock
No unrelated implementation begins until Issue #19 reaches Definition of Done unless the owner explicitly switches priorities.
