# Active Task

## Task
Issue #19 — Back up Whop imports before clear-and-resync.

## Status
**Active — PR #21 validated; merge, production deployment, and live recovery exercise pending.** Branch `feat/whop-backup-reset-restore` adds bounded signed R2 recovery archives, manifest-only D1 state, verified reset authorization, JSON-batched offline restore, current-scan stale filtering, R2 backup pins, and one canonical Control Center recovery panel.

## Confirmed findings
- Reconnecting Whop replaces OAuth access but does not clear `whop_sources`, `whop_posts`, imported guides, course-video mappings, or R2 records.
- Existing scans upserted current items but did not hide rows that disappeared from Whop.
- Imported guides live separately from post snapshots, so clearing posts alone leaves old drafts visible.
- The existing guide snapshot helper protects one in-flight save only; it is not persistent recovery and cannot survive lost Whop access.
- Media cleanup previously considered only active draft/published guides, so a reset could eventually delete R2 objects unless verified backups pin them explicitly.
- One D1 row or query per imported method would exceed Cloudflare Free-plan request limits for ordinary large sources.
- An unconditional migration `ALTER TABLE` would fail when runtime repair had already added the stale-post column.

## Implemented on PR #21
- D1 manifest/history/reset schema plus idempotent runtime repair for `whop_posts.stale_at` and its index.
- Exact snapshots of sources, current and stale posts, categories, guides, course-video mappings, and media ledger records.
- One checksum-verified, HMAC-signed R2 recovery archive per backup; D1 stores only manifest, archive identity, history, and one-time reset state.
- A 10 MB archive ceiling and bounded `json_each` restore batches below D1 string and parameter limits.
- Archive read-back, signature, checksum, identity, count, and schema verification before a backup becomes verified.
- A second live-scope checksum after archive persistence so concurrent changes prevent verification.
- Short-lived one-time reset authorization bound to the verified scope and destructive options.
- A final live-scope checksum immediately before deletion so newer work forces a fresh backup.
- Exact Whop source authorization/readability preflight before clear-and-resync deletion begins.
- Published guides preserved by default; published deletion requires explicit opt-in and a stronger typed phrase.
- Owner-only JSON download and restore without a Whop session; newer guides remain conflicts instead of being overwritten.
- Retry-safe partial restore messaging and idempotent inserts for sources, posts, categories, guides, media ledger rows, and course videos.
- Current scans revive returned rows, mark missing rows stale, and hide stale rows from normal review.
- Preserved published guides reattach to fresh source keys after successful scans so later imports update rather than duplicate.
- Verified backups pin both their archive and referenced R2 media during normal cleanup.
- Reset success is reported independently from optional resync/disconnect failures, with the recovery backup kept actionable.
- Failed or corrupt backup attempts expose Delete only and do not require archive verification to leave history.
- One guarded Control Center panel for backup history, download, restore, clear/resync, reset-all, and backup deletion.
- Migration `0004` remains safe whether it runs before or after runtime additive repair.

## Validation
- [x] Focused backup/reset/restore regression passes.
- [x] Existing Whop scan/import/media/recovery regressions pass.
- [x] Clean-head full Node 22 build passes on PR #21 (workflow run #846).
- [x] Changed-file scope is limited to 12 Issue #19 files; no temporary workflow or trigger remains.
- [x] Duplicate asset loading and duplicate client mounting are covered by regression checks.
- [x] Branch is zero commits behind `main` and GitHub reports it mergeable.
- [x] Qodo recommends the bounded R2 archive/manifest-only D1 design and raised no inline review thread.
- [x] Cloudflare branch preview deployed successfully during PR validation.
- [ ] PR #21 is squash-merged.
- [ ] Cloudflare production deployment contains the merge commit.
- [ ] Production backup creation and JSON download succeed on real imported content.
- [ ] Production clear-and-resync removes stale state while preserving published guides.
- [ ] Production restore succeeds without relying on current Whop access and reports any newer-guide conflicts truthfully.

## Definition of Done
- No destructive Whop reset can start without a newly verified restorable backup.
- Backup download and restore work after Whop access is removed.
- Published guides remain by default and newer guides are never overwritten silently.
- R2 archives and media referenced only by a verified backup remain protected.
- Fresh scans stop showing disappeared old posts and reconnect preserved published guides.
- Targeted tests, full build, cleanup, review, deployment, and live validation pass.

## Backlog
- Issue #20 — full website duplication audit after this task reaches Definition of Done.
- Universal owner-authorized proxy/play/download support for non-Course Whop videos.

## Scope lock
No unrelated implementation begins until Issue #19 reaches Definition of Done unless the owner explicitly switches priorities.
