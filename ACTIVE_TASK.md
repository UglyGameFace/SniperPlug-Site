# Active Task

## Task
Issue #19 — Back up Whop imports before clear-and-resync, including a usable mobile recovery workflow.

## Status
**Active — backup engine and all four Samsung mobile repairs merged/deployed; final live Samsung and recovery validation pending.** PR #21 merged as `2124770e6679fce9d21cafb2b0efe90edda16d0c`, PR #22 as `f7f0fab1ab5c44ec058a4665a6070cedf489cdcd`, PR #23 as `95078f2eb1e802dae4255cbf8d1e11d06fa3f2ac`, and PR #24 as `63e50964d109e2772a591c5e970ba0b9c338e4d4`. Production Node 22, private-guide privacy, and affiliate-readiness checks passed after the final deployment. The remaining gates require the owner’s authenticated Samsung Internet session and real imported Whop content.

## Confirmed findings
- Reconnecting Whop replaces OAuth access but does not clear saved source/post/guide/video/media state.
- A safe reset needs a durable recovery archive that remains restorable after Whop access is lost.
- The first production recovery panel competed with the normal import flow and loaded backup history automatically.
- Unlocking also started dashboard, bulk history, recent actions, and Whop discovery together.
- Discovery could rerun itself up to eight times only 350 ms apart while rebuilding source-group DOM.
- Opening an approved source immediately started a content scan.
- Source and post views eventually rendered every card, producing a large control wall and freezing Samsung Internet.
- Mobile blur, shadows, animation, and smooth scrolling increased paint work during the same heavy operations.
- The original Control Center HTML kept old asset-version query strings, so Samsung Internet could continue serving the frozen pre-repair runtime after deployment.
- Even after bounded card rendering, the scan API still returned every post with its complete Markdown body and full attachment payload, forcing Samsung Internet to parse and map all hidden content before showing the first page.
- Unlock still mapped all guide summaries and rendered Whop, categories, and guide cards in one synchronous burst.

## Implemented and merged in PR #21
- Signed, checksum-verified, bounded R2 recovery archives with manifest-only D1 state.
- Exact source, current/stale post, category, guide, course-video, and media-ledger snapshots.
- Read-back verification, owner-bound signatures, current-state checks, one-time reset authorization, and typed confirmation.
- Published-guide preservation by default and conflict-safe offline restore.
- R2 archive/media pinning, stale-post filtering, preserved-guide reattachment, and retry-safe restore behavior.
- Owner-only backup history, JSON download, restore, safe clear/resync, reset-all, and deletion.

## Implemented and merged in PR #22
- No automatic source discovery or content scan on unlock.
- Explicit `Load sources` action; later passes are manual `Refresh sources` actions.
- Removed the eight-pass 350 ms discovery loop.
- Source groups remain collapsed and render 12 matching sources at a time with explicit Load more.
- Search/filtering runs before source pagination, so matches beyond the original first page remain visible.
- Rerendering one filtered group replaces only that group’s detached source-card index entries.
- Choosing or approving a source no longer scans it; `Review content` is a separate action.
- Content review renders 10 cards at a time with explicit Load more.
- Guide review renders 24 summaries at a time with existing lazy detail loading.
- Bulk-job and recent-action history load only when the bulk workflow is opened.
- Backup history loads only when the recovery workflow is opened.
- Backup, restore, and clear/resync live together in one collapsed safety center at the end of the ordered workflow.
- One action selector chooses backup-only or safe clear/resync; advanced destructive options stay collapsed.
- The new Continue action shares all busy/valid locks to prevent duplicate mobile taps.
- Mobile removes expensive blur/shadow/smooth-scroll work and disables busy animations.
- Permanent regressions enforce bounded pagination, manual scanning, lazy history, one recovery center, filtered pagination, and mobile action locks.

## Implemented and merged in PR #23
- `control-center-hardening.css`, `control-center-v2.js`, and `control-center-whop-backups.js` share the forced cache key `v=20260803.2`.
- A permanent regression requires all three repaired runtime assets to move together on future changes.
- The production HTML cannot silently point Samsung Internet at the old frozen runtime after a repair deployment.

## Implemented and merged in PR #24
- Scan and saved-post list responses expose lightweight review summaries instead of every complete Markdown body and full attachment payload.
- The exact post body is fetched from the owner-only detail route only when one Preview is opened.
- Mobile source, post, and guide pages are reduced to 6, 4, and 8 items respectively; desktop retains 12, 10, and 24.
- Large post and guide collections are indexed in frame-bounded chunks, and dashboard sections render across separate frames.
- The repaired runtime assets move together to cache key `v=20260803.3`.
- Permanent regressions enforce the summary/detail boundary, lazy exact content, frame yielding, responsive page budgets, and synchronized cache versions.

## Validation
- [x] PR #21 focused backup/reset/restore audit passed.
- [x] PR #21 clean-head full Node 22 suite passed and both Qodo findings were resolved.
- [x] PR #21 squash-merged and production post-merge checks passed.
- [x] PR #22 focused mobile-flow audit passed.
- [x] PR #22 complete existing Node 22 build passed after replacing render-all behavior with bounded pagination.
- [x] PR #22 busy-lock, lazy-history, and filtered-pagination follow-ups passed focused and full builds.
- [x] PR #22 cleanup left only seven permanent runtime/UI/task/regression files.
- [x] PR #22 clean-head CI #869, affiliate checks, retired-route checks, Cloudflare preview, and review passed.
- [x] PR #22 squash-merged and production post-merge Node 22/privacy/affiliate/retired-route checks passed.
- [x] PR #23 focused cache-version audit and clean-head full Node 22 suite #875 passed.
- [x] PR #23 final scope was exactly two files; Cloudflare preview deployed and no review threads remained.
- [x] PR #23 squash-merged and production HTML/Node 22/privacy/affiliate checks passed.
- [x] PR #24 focused streamed-data mobile audit and full Node 22 suite passed.
- [x] PR #24 final scope was exactly seven permanent files; all temporary workflows/triggers were removed.
- [x] PR #24 clean-head CI #884, Cloudflare preview, mergeability, and review-thread cleanup passed.
- [x] PR #24 squash-merged as `63e50964d109e2772a591c5e970ba0b9c338e4d4`; production Node 22/privacy/affiliate checks passed.
- [ ] Samsung Internet opens/unlocks and scans a real source without a visible freeze or unresponsive-page warning.
- [ ] Production backup creation and JSON download succeed on real imported content.
- [ ] Production clear-and-resync preserves published guides and removes stale state.
- [ ] Production restore works without relying on current Whop access and reports conflicts truthfully.

## Definition of Done
- The Control Center presents one understandable ordered workflow on mobile and desktop.
- Unlocking performs only the minimum overview work and never starts a source/content scan.
- Large source, post, and guide collections remain behind explicit bounded pagination and summary-only list payloads.
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
