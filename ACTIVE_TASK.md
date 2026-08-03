# Active Task

## Task
Issue #19 — Back up Whop imports before clear-and-resync.

## Status
**Active — implementation branch under validation.** The previous OAuth/media repair is no longer blocking progress. Branch `feat/whop-backup-reset-restore` adds persistent signed backups, verified reset authorization, offline restore, current-scan stale filtering, R2 backup pins, and one canonical Control Center recovery panel.

## Confirmed findings
- Reconnecting Whop replaces OAuth access but does not clear `whop_sources`, `whop_posts`, imported guides, course-video mappings, or R2 records.
- Existing scans upsert current items but did not hide rows that disappeared from Whop.
- Imported guides live separately from post snapshots, so clearing posts alone would leave old drafts visible.
- The existing guide snapshot helper protects one in-flight save only; it is not persistent recovery and cannot survive lost Whop access.
- Media cleanup previously considered only active draft/published guides, so a reset could eventually delete R2 objects unless backups pin them explicitly.

## Implemented on branch
- D1 migration/runtime schema for signed backup manifests, normalized backup rows, media pins, reset tokens, and stale post timestamps.
- Exact snapshots of sources, posts, categories, guides, course-video mappings, and media ledger records.
- Read-back checksum and HMAC signature verification before a backup becomes verified.
- Short-lived one-time reset authorization bound to the verified scope and destructive options.
- Current-state checksum comparison immediately before deletion so newer work forces a fresh backup.
- Re-check the scope after snapshot persistence so concurrent changes prevent the backup from becoming verified.
- Resolve and authorize the exact Whop source before any clear-and-resync deletion begins.
- Bind backup signatures to the owner session, keep incomplete backups actionless, cap in-memory exports at 30 MB, and make interrupted restore explicitly retry-safe.
- Published guides preserved by default; published deletion requires explicit opt-in and stronger typed confirmation.
- Offline JSON download and restore without a Whop session; newer guides remain conflicts instead of being overwritten.
- Current scans revive returned rows, mark missing rows stale, and hide stale rows from normal review.
- Verified backups pin R2 objects during media cleanup.
- One guarded Control Center panel for backup history, download, restore, clear/resync, and backup deletion.

## Validation
- [ ] New backup/reset/restore regression passes.
- [ ] Existing Whop scan/import/media/recovery regressions pass.
- [ ] Full Node 22 build passes.
- [ ] Changed-file, duplicate-handler, conflict, and cleanup inspection pass.
- [ ] PR review and Cloudflare production validation pass.
- [ ] Production backup download, source clear/resync, and restore are exercised with real imported content.

## Definition of Done
- No destructive Whop reset can start without a newly verified restorable backup.
- Backup download and restore work after Whop access is removed.
- Published guides remain by default and newer guides are never overwritten silently.
- R2 objects referenced only by a verified backup remain protected.
- Fresh scans stop showing disappeared old posts.
- Targeted tests, full build, cleanup, review, deployment, and live validation pass.

## Backlog
- Issue #20 — full website duplication audit after this task reaches Definition of Done.
- Universal owner-authorized proxy/play/download support for non-Course Whop videos.

## Scope lock
No unrelated implementation begins until Issue #19 reaches Definition of Done unless the owner explicitly switches priorities.
