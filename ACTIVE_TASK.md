# Active Task

## Task
Issue #19 — Back up Whop imports before clear-and-resync, including a usable mobile recovery workflow.

## Status
**Active — existing backup/recovery engine and Samsung mobile repairs are deployed; live validation exposed one missing recovery scope, now being repaired on `fix/whop-group-backup-scope`.** Production completion remains unclaimed until the group-scope repair passes targeted/full validation, merges/deploys, and the owner completes the remaining real backup/download/reset/restore checks.

## Scope
1. Keep the existing signed/checksum-verified R2 archive format and exact-source/all-importer restore behavior authoritative.
2. Add a first-class **one saved Whop group** backup choice to the existing safety center.
3. A group backup must include every saved source assigned to that group without forcing the owner to tap each source manually.
4. Preserve independent verification, download, restore, deletion, media pinning, and size limits for every child source archive.
5. Do not invent a destructive group reset. Group scope is backup-only; destructive clear/resync remains exact-source or whole-importer only.
6. Preserve Samsung/mobile bounded rendering, lazy work, cache-busting, and the single safety-center workflow.
7. Validate targeted backup/mobile audits, JavaScript syntax, full Node 22 build/regression suite, cleanup, conflict inspection, deployment, and live Samsung behavior.

## Findings
- Live Samsung testing confirms the repaired safety center loads and existing verified backup history is usable.
- The current scope picker exposes only `One saved Whop source` and `Entire Whop importer`; it has no group-level choice.
- Saved source records already carry `default_group`, and `listSourceOptions()` already exposes `groupKey` for the built-in Black Box and Hidden Files groupings.
- The backup API overview already returns each saved source and its `groupKey`; the missing behavior is primarily orchestration/UI rather than missing source ownership data.
- Durable backup rows intentionally allow only `scope IN ('all', 'source')`, and each signed R2 archive has a 10 MB safety ceiling.
- Adding a new durable `group` archive scope would require a D1 constraint/schema migration and could turn a large group into one oversized recovery blob.
- The safer execution path is to treat a group selection as one owner action that sequentially creates the existing, independently verified **source** backup for every saved source in that group. This reuses the proven archive/restore implementation and keeps partial success recoverable if one source fails.

## Changes on `fix/whop-group-backup-scope`
- Backup API overview now returns saved group choices with canonical labels and exact saved-source counts.
- Control Center scope picker now includes `One saved Whop group` plus a dedicated group selector.
- Group selection creates a verified source backup for every saved source in that group, one request at a time, with visible per-source progress.
- Successful child backups remain independently downloadable/restorable even if another source in the group fails; partial failure is reported truthfully.
- Group scope explicitly disables the destructive clear/resync action and advanced destructive options.
- Existing source and entire-importer backup/reset paths are unchanged.
- Durable backup schema remains `all/source`; no migration, alternate archive format, compatibility shim, or duplicate backup engine was introduced.
- Samsung cache key for the three coupled Control Center runtime assets moves together to `v=20260811.1`.
- Permanent backup/mobile audits are being extended to enforce the group selector, per-source verified orchestration, no group-reset bypass, unchanged durable schema, and synchronized cache version.

## Existing implemented recovery foundation
- Signed, checksum-verified, bounded R2 recovery archives with manifest-only D1 state.
- Exact source, current/stale post, category, guide, course-video, and media-ledger snapshots.
- Read-back verification, owner-bound signatures, current-state checks, one-time reset authorization, and typed confirmation.
- Published-guide preservation by default and conflict-safe offline restore.
- R2 archive/media pinning, stale-post filtering, preserved-guide reattachment, and retry-safe restore behavior.
- Owner-only backup history, JSON download, restore, safe clear/resync, reset-all, and deletion.
- No automatic source discovery/content scan on unlock; bounded mobile pagination and summary-only list payloads.
- Mobile source/post/guide budgets remain 6/4/8, with frame-bounded indexing and lazy exact post detail.

## Validation
- [x] Previous PR #21 backup/reset/restore implementation validation passed.
- [x] Previous PRs #22–#24 mobile-flow, cache, streamed-data, Node 22, Cloudflare preview, and production privacy/affiliate checks passed.
- [x] Live Samsung safety center opens and shows verified backup history without the former unresponsive-page loop.
- [ ] Group-scope targeted backup audit passes.
- [ ] Group-scope mobile/cache regression passes.
- [ ] JavaScript syntax/static validation passes.
- [ ] Full Node 22 build and complete existing regression suite pass on clean PR head.
- [ ] Final branch-vs-main, changed-file, duplicate/conflict, and review-thread inspection pass.
- [ ] Group-scope repair merges and production Cloudflare deployment propagates.
- [ ] Samsung Internet can select Black Box/Hidden Files as a whole group and create every child source backup with truthful success/failure counts.
- [ ] Production JSON download succeeds on real imported content.
- [ ] Production clear-and-resync preserves published guides and removes stale state.
- [ ] Production restore works without relying on current Whop access and reports conflicts truthfully.

## Cleanup / safety boundary
- No new backup table, D1 scope value, migration, archive schema version, or second restore path.
- No group-wide destructive reset is added.
- Existing exact-source restore/download semantics remain the recovery unit of record.
- Existing 10 MB per-archive ceiling remains intact rather than becoming a group-sized blob.
- No unrelated Whop reader, publishing, discovery, or website redesign work is part of this branch.

## Current branch
- `fix/whop-group-backup-scope`
- PR pending after implementation record and focused inspection.

## Definition of Done
- The Control Center presents one understandable ordered workflow on mobile and desktop.
- Owner can back up one exact source, one entire saved group, or the entire importer without repetitive per-source tapping.
- A group backup verifies every successful child source independently and reports partial failures without discarding good recovery copies.
- Group selection cannot trigger destructive reset semantics accidentally.
- No destructive reset can start without a newly verified restorable backup.
- Backup download and restore work after Whop access is removed.
- Published guides remain by default and newer guides are never overwritten silently.
- Targeted tests, full build, cleanup, review, deployment, Samsung Internet validation, and live recovery validation pass.

## Backlog
- Issue #25 — Read authorized Whop Content / Better Content experiences (`Make Money Here`, Content, Better Content, Hidden Files Onboarding, and other app-specific experiences) after Issue #19 reaches Definition of Done.
- Issue #20 — full website duplication audit after Issue #19 reaches Definition of Done.
- Universal owner-authorized proxy/play/download support for non-Course Whop videos.

## Scope lock
No unrelated implementation begins until Issue #19 reaches Definition of Done unless the owner explicitly sends the required FORCE SWITCH instruction.
