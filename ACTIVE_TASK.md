# Active Task

## Task
Issue #19 — Back up Whop imports before clear-and-resync, including a usable mobile recovery workflow.

## Status
**Active — PR #27 (`fix/issue19-whop-oauth-status`) is open, mergeable, and green after live Samsung validation exposed a contradictory Whop OAuth/session state.**

Production completion remains unclaimed until PR #27 is merged/deployed and the owner completes the remaining real Samsung backup/download/reset/restore checks.

## Scope
1. Keep the existing signed/checksum-verified R2 archive format and exact-source/all-importer restore behavior authoritative.
2. Preserve the merged one-group backup workflow: one independently verified exact-source archive per saved source in the selected group.
3. Keep destructive clear/resync limited to one exact source or the whole importer; group scope remains backup-only.
4. Keep owner and paid-customer authentication isolated and fail closed while OAuth is incomplete.
5. Make callback status truthful: a stale OAuth error may not remain red after the current Whop connection is verified.
6. Preserve Samsung/mobile bounded rendering, lazy work, cache safety, and the single recovery workflow.
7. Validate targeted auth/recovery/mobile audits, JavaScript syntax, full Node 22 build/regression suite, cleanup, conflict inspection, deployment, and live Samsung behavior.

## Findings
- PR #26 merged to `main` and the live Control Center immediately showed the new production runtime.
- Live Samsung screenshot at 09:36 EDT showed **Connected & verified**, a freshly verified connection time, and 15 currently accessible approved sources while the global banner still said **“Whop did not return a valid customer identity.”**
- Whop OAuth `/oauth/userinfo` returns the authenticated user ID in OIDC `sub` (for example `user_xxxxx`). The customer callback incorrectly required `profile.id`.
- The callback therefore could exchange/store valid OAuth tokens and then fail only during customer-session promotion. This explains how the same page could have a working verified Whop session and an identity error simultaneously.
- `customer-pending` sessions were accepted by the shared `requireAdmin()` path. If customer promotion failed, the pending browser cookie could still reach general Control Center APIs before paid entitlement promotion completed.
- Failed customer promotion also left the pending cookie/session in place instead of clearing it.
- The browser replayed `?whop=error&message=...` on every refresh. The old callback query was never consumed, so even a later healthy dashboard could keep rendering the stale red message.

## Current changes in PR #27
- Customer OAuth identity now accepts the OIDC `sub` user identifier, with the former `id` shape retained only as a compatibility fallback.
- Customer login starts OAuth directly from its isolated pending session instead of routing that pending session through the general Control Center authorization gate.
- Customer OAuth-start failures still redirect back to the Control Center with bounded error context instead of dropping the browser on an API failure page.
- `requireAdmin()` now rejects `customer-pending` sessions from all normal Control Center APIs.
- Failed customer OAuth now best-effort revokes/deletes the pending Whop session and clears the pending browser cookie.
- A small canonical Control Center callback-status runtime is injected before the main runtime. It consumes `whop`/`message` query parameters once, removes them with `history.replaceState`, and reconciles the message against the current dashboard connection state.
- A stale callback error is suppressed when the dashboard is currently **Connected & verified**; a real current error remains visible when Whop is still disconnected.
- Paid-importer regression coverage enforces OIDC `sub`, pending-session isolation, failed-login cleanup, one-shot callback query handling, live-state reconciliation, and JavaScript syntax.
- An executable callback-query regression verifies that unrelated query parameters and the `#whop-importer` anchor survive cleanup.

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
- [x] PR #26 Node 22 build/regression suite passed before merge.
- [x] Live Samsung confirmed production reports the Whop connection as connected/verified and can load current readable sources.
- [x] Root cause traced through importer login → pending session → OAuth callback → customer promotion → Control Center session gate → dashboard startup.
- [x] Official Whop OAuth userinfo contract checked: user identity is `sub`.
- [x] PR #27 branch is 0 commits behind current `main` and PR is mergeable.
- [x] PR #27 full Node 22.23.1 `npm run build` / complete audit suite passed in GitHub Actions run #891.
- [x] Targeted paid-importer/OAuth audit passed on PR #27 head.
- [x] Executable Whop callback-flash regression passed on PR #27 head.
- [x] Existing Whop backup/reset/restore, source-access truth, Control Center hardening/mobile/network, private-guide auth, recovery, media, discovery, and publishing regressions all passed on PR #27 head.
- [x] `npm install --ignore-scripts` reported zero vulnerabilities on PR #27 head.
- [x] PR #27 has no inline review threads; comments contain only expected skipped Vercel telemetry and Qodo's billing-paused notice, with no code finding.
- [x] Diff/conflict inspection shows only the active-task record, OAuth/session/status runtime changes, focused documentation, and permanent regressions; no recovery-schema or source-reader changes.
- [ ] PR #27 merges and Cloudflare production deployment propagates.
- [ ] Samsung reload no longer replays the stale red identity error when the connection is verified.
- [ ] Customer Whop login promotes to a final paid customer session or fails closed without leaving a usable pending session.
- [ ] Samsung can select Black Box/Hidden Files as a whole group and create every child source backup with truthful success/failure counts.
- [ ] Production JSON download succeeds on real imported content.
- [ ] Production clear-and-resync preserves published guides and removes stale state.
- [ ] Production restore works without relying on current Whop access and reports conflicts truthfully.

## Cleanup / conflict inspection
- No alternate OAuth implementation or second paid-access engine was added.
- Pending OAuth no longer needs a general-admin exception.
- Failed pending sessions are actively removed rather than preserved as compatibility state.
- The callback-status runtime has one responsibility: consume server callback flash state before the main Control Center runtime and reconcile it to live connection truth.
- Existing recovery archive schema, group backup orchestration, restore path, source decisions, paid-entitlement checks, and destructive reset boundaries are unchanged.
- PR #27 is 0 commits behind `main`; its current diff spans 10 intentional files and contains no unrelated feature work.

## Current branch / PR
- Branch: `fix/issue19-whop-oauth-status`
- PR #27 — `Fix stale Whop identity errors and pending OAuth access`

## Definition of Done
- The Control Center presents one understandable ordered workflow on mobile and desktop.
- Owner can back up one exact source, one entire saved group, or the entire importer without repetitive per-source tapping.
- A group backup verifies every successful child source independently and reports partial failures without discarding good recovery copies.
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
