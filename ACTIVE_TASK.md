# Active Task

## Task
Issue #19 — Back up Whop imports before clear-and-resync, including a usable mobile recovery workflow.

## Status
**Active — PR #27 is merged. Live Samsung validation exposed a recovery-history identity usability defect, now being repaired on `fix/issue19-backup-history-identity`.**

Production completion remains unclaimed until this follow-up is merged/deployed and the owner completes the remaining real Samsung backup/download/reset/restore checks.

## Scope
1. Keep the existing signed/checksum-verified R2 archive format and exact-source/all-importer restore behavior authoritative.
2. Preserve the merged one-group backup workflow: one independently verified exact-source archive per saved source in the selected group.
3. Keep destructive clear/resync limited to one exact source or the whole importer; group scope remains backup-only.
4. Keep owner and paid-customer authentication isolated and fail closed while OAuth is incomplete.
5. Make callback status truthful: a stale OAuth error may not remain red after the current Whop connection is verified.
6. Keep every child backup human-identifiable on Samsung/mobile before the owner downloads, restores, or deletes it.
7. Preserve Samsung/mobile bounded rendering, lazy work, cache safety, and the single recovery workflow.
8. Validate targeted auth/recovery/mobile audits, JavaScript syntax, full Node 22 build/regression suite, cleanup, conflict inspection, deployment, and live Samsung behavior.

## Findings
- PR #26 merged the whole-group backup workflow.
- PR #27 merged the Whop OIDC `sub` identity repair, pending-session isolation, failed OAuth cleanup, and one-shot callback-status handling.
- Live Samsung at 10:27 EDT confirmed the group backup itself succeeded, but recovery history rendered every child as the same **Hidden Files** title.
- The group workflow correctly creates one exact-source backup per saved source. The ambiguity is only presentation/metadata: each durable backup inherited the shared company/group `label`, and the browser showed only a short source suffix.
- `listSourceOptions()` already has the canonical more-specific exact-source label: `Hidden Files · <experience name>` when available, otherwise a unique source suffix.
- The backup overview was not reconciling stored backup rows against that canonical saved-source catalog.
- The backup `label` column is not part of the signed archive identity/checksum. Updating only that human-readable label does not change archive bytes, backup IDs, experience IDs, restore semantics, reset authorization, signatures, or media pinning.

## Current changes
- Backup overview joins exact-source backup rows to the canonical saved-source catalog by `experienceId`.
- Existing generic backup labels are persisted back to D1 with the specific saved-source label when current source metadata is available.
- New backups are identity-enriched immediately in the `create` response, before a clear/resync can remove the current source row.
- Recovery cards show the descriptive exact-source label plus separate **Source ID …xxxxxx** and **Backup ID …xxxxxx** identifiers.
- Restore/Delete confirmation dialogs use the same descriptive source label as the card the owner tapped.
- Whole-importer backup cards keep their existing semantics and get only the separate backup identifier.
- No recovery archive schema, signed fields, group orchestration, destructive scope, restore path, or source-decision behavior changed.

## Existing implemented recovery foundation
- Signed, checksum-verified, bounded R2 recovery archives with manifest-only D1 state.
- Exact source, current/stale post, category, guide, course-video, and media-ledger snapshots.
- Read-back verification, owner-bound signatures, current-state checks, one-time reset authorization, and typed confirmation.
- Published-guide preservation by default and conflict-safe offline restore.
- R2 archive/media pinning, stale-post filtering, preserved-guide reattachment, and retry-safe restore behavior.
- Owner-only backup history, JSON download, restore, safe clear/resync, reset-all, and deletion.
- One saved Whop group backup creates independently verified child source archives and reports partial failure without discarding successful copies.
- No automatic source discovery/content scan on unlock; mobile source/post/guide budgets remain bounded at 6/4/8.

## Validation
- [x] PR #26 merged to `main`.
- [x] PR #27 merged to `main`.
- [x] PR #27 full Node 22.23.1 build/regression suite passed before merge.
- [x] Live Samsung confirmed production Whop connection/source loading works after PR #27.
- [x] Recovery-history identity root cause traced through group orchestration → `createWhopImportBackup` → generic stored label → overview → `renderHistory`.
- [x] Identity repair uses the existing exact-source catalog and leaves signed recovery content untouched.
- [ ] Targeted Whop backup audit and JavaScript syntax pass on the follow-up branch.
- [ ] Full Node 22 build/regression suite and zero-vulnerability install pass on the follow-up branch.
- [ ] Branch is 0 commits behind `main`, mergeable, and review-clean.
- [ ] Follow-up merges and Cloudflare production deployment propagates.
- [ ] Samsung recovery history shows a distinguishable exact-source label plus separate source/backup IDs for every child backup.
- [ ] Production JSON download succeeds on real imported content.
- [ ] Production clear-and-resync preserves published guides and removes stale state.
- [ ] Production restore works without relying on current Whop access and reports conflicts truthfully.

## Cleanup / conflict inspection
- Recovery identity repair updates only human-readable backup labels and overview metadata.
- No alternate backup engine, archive version, D1 scope value, restore path, reset path, or compatibility shim was added.
- Existing archive signature/checksum inputs remain unchanged.
- Existing 10 MB per-archive ceiling and independently restorable child-source archives remain unchanged.

## Current branch / PR
- Branch: `fix/issue19-backup-history-identity`
- PR: not opened yet

## Definition of Done
- The Control Center presents one understandable ordered workflow on mobile and desktop.
- Owner can back up one exact source, one entire saved group, or the entire importer without repetitive per-source tapping.
- A group backup verifies every successful child source independently and reports partial failures without discarding good recovery copies.
- Every recovery card identifies the exact source clearly enough that Restore/Delete cannot be confused with another child backup.
- Group selection cannot trigger destructive reset semantics accidentally.
- No destructive reset can start without a newly verified restorable backup.
- Whop callback identity and status cannot contradict the currently verified server state.
- Incomplete customer OAuth cannot enter general Control Center APIs.
- Backup download and restore work after Whop access is removed.
- Published guides remain by default and newer guides are never overwritten silently.
- Targeted tests, full build, cleanup, review, deployment, Samsung Internet validation, and live recovery validation pass.

## Backlog
- Issue #25 — Read authorized Whop Content / Better Content experiences (`Make Money Here`, Content, Better Content, Hidden Files Onboarding, and other app-specific experiences) after Issue #19 reaches Definition of Done.
- Issue #20 — full website duplication audit after Issue #19 reaches Definition of Done.
- Universal owner-authorized proxy/play/download support for non-Course Whop videos.

## Scope lock
No unrelated implementation begins until Issue #19 reaches Definition of Done unless the owner explicitly sends the required FORCE SWITCH instruction.
