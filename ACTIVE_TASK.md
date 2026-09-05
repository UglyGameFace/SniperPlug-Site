# Active Task

## Active task / outcome
Repair the Whop importer end to end so it can become a safe subscription product, while preserving the concrete live target **Hidden Files → Make Money Here → Better Content** through the Firefox Android rendered-DOM capture bridge.

The task is not complete until both conditions hold:
1. one real Make Money Here page reaches SniperPlug as a private draft through the existing v0.1.4 queue/retry path; and
2. importer connection/workspace data is isolated by the authenticated SniperPlug account principal so future subscribers cannot read, overwrite, disconnect, reset, restore, publish, or purge one another.

## Scope lock
- Stay on Whop importer/subscription isolation only.
- Issue #20, UI redesign, and unrelated work remain backlog.
- No guessed Better Content endpoints, Whop credential forwarding, extra OAuth scopes, or weakened OAuth/cookie checks.

## Status
- PR #34 merged: membership access false-denial fix.
- PR #35 merged: OAuth callback/login-loop fix.
- PR #36 merged: source-access truth/loading/fan-out fix.
- PR #37 merged: Experiences `account_id` contract fix.
- PR #38 merged: user-OAuth-compatible custom-app reader metadata.
- PR #39 merged: Better Content rendered-DOM capture bridge.
- PR #41 merged: Firefox Android package support.
- PR #45 merged: v0.1.4 all-frame recovery for already-open Whop tabs.
- PR #46 merged: browser capture materializes/verifies its `whop_posts` FK row before the guide draft write.
- PR #47 merged at `2da4e0d3667f45cbafd69975967e76fdad66b199`: browser-session identity is separate from stable account principal and Whop connection lifecycle is principal-scoped. Post-merge verification passed.
- Current branch: `fix/whop-tenant-workspace`.
- Current stage: complete tenant-workspace implementation is in code; mandatory regression/legacy-audit/CI pass is next. Branch is intentionally not merged yet.

## Confirmed subscription root causes
1. Existing owner data uses upstream Whop `experience_id` and content `source_key` directly as global D1 primary/unique keys.
2. Two subscribers can legitimately import the same Whop experience/item, so upstream IDs cannot remain the physical tenant storage key.
3. `guides.slug` is globally unique, so identical subscriber imports also need tenant-specific slug entropy.
4. Numerous old source/post/guide/recovery/backup queries selected by upstream ID or numeric guide ID without an explicit principal predicate.
5. Backup rows stored an owner field, but old snapshot/reset/restore SQL operated on the importer globally.
6. Public guide publishing/search must remain an owner workspace, not become implicitly available to subscription tenants.

## Tenant storage model
`browser login → stable SniperPlug principal → principal-scoped Whop OAuth connection → principal-scoped importer workspace`

Logical upstream identity and physical D1 identity are now separate:
- `whop_sources.principal_id` + `upstream_experience_id`
- `whop_posts.principal_id` + `upstream_source_key` + `upstream_experience_id`
- `guides.principal_id` + `upstream_source_key`

Existing owner rows retain their original physical keys for backward compatibility. Non-owner principals receive deterministic hashed physical source/post keys. Therefore Subscriber A and Subscriber B can import the same upstream Whop source/item without sharing a row, FK, lease, draft, or slug.

## Implemented changes on `fix/whop-tenant-workspace`
### Schema / identity
- Added runtime idempotent tenant schema repair in `functions/_lib/importer-workspace.js`.
- Added `migrations/0007_importer_tenant_workspace.sql`.
- Losslessly backfills existing rows to `sniperplug-owner` and preserves owner physical keys.
- Adds unique principal/upstream indexes for sources, posts, and guides.

### Discovery / sources / scans
- Source decisions are read/written by principal + logical Whop experience ID.
- Whop discovery now receives the authenticated principal directly; redundant post-discovery hydration was removed.
- Scan leases use tenant-specific physical source IDs.
- Scanned posts, stale marking, post decisions, and saved-post reads are principal-scoped.

### Native imports / Better Content
- Native import reads approved posts by principal + upstream logical key.
- Imported guide lookup/duplicate detection/update is restricted to the current principal.
- Physical post key is used for FK integrity and slug entropy; logical upstream key remains visible to the importer/client.
- Better Content capture applies the same principal/logical/physical split and protects reviewed/published/removed work only inside that tenant.

### Private guides / media / rollback
- Admin guide lists/details/saves/status updates require principal ownership.
- Safe-save snapshots, optimistic version reservations, recovery leases, recovery rollback, and media repair verify principal ownership.
- Media mirroring uses the tenant physical source key so two tenants cannot accidentally share mutable importer media identity.

### Bulk / history / publishing
- Bulk job version raised to v5; unsafe active pre-tenant jobs are canceled rather than resumed under new semantics.
- Bulk jobs are account-principal scoped.
- Subscriber bulk jobs stop at private drafts; only owner principal can call the public publisher.
- Recent history/undo is principal-scoped.
- Public guide publishing and public guide search explicitly require/filter `sniperplug-owner`.
- Global guide category mutation remains owner-only.

### Backup / reset / restore
- Backup snapshot/list/download/authorization/reset/restore/delete all require the matching principal.
- Signed backup manifest includes principal identity.
- Cross-principal archive restore fails closed.
- Legacy owner-only archives can still restore to the owner, but cannot be transplanted into a subscriber workspace.
- Source-scoped reset uses logical upstream experience ID while deleting only that principal’s physical rows.

## Validation
- [x] PR #47 connection isolation regression and post-merge build passed.
- [x] Same-principal multi-device Whop connection model preserved.
- [x] `test-whop-tenant-workspace.mjs` added to mandatory audit chain.
- [x] Runtime key regression checks owner compatibility, deterministic same-tenant keys, and distinct keys for two tenants importing identical upstream data.
- [x] Static tenant regression covers source/post/guide/discovery/capture/bulk/history/publish/backup/recovery/safe-save boundaries.
- [ ] Open tenant workspace PR and run complete Node 22 audit/build.
- [ ] Repair legacy audits only where they encode superseded single-owner assumptions; do not weaken behavioral coverage.
- [ ] Exact final-head CI green.
- [ ] Branch compare clean/current with main and review threads clean.
- [ ] Merge tenant workspace PR and verify post-merge main workflows.
- [ ] Use preserved Firefox v0.1.4 queue and press **Retry capture**; one Make Money Here page must become a private draft.
- [ ] Validate multi-page auto-capture only after one-page live success.

## Cleanup / conflicts
- No destructive table rebuild.
- No global account cleanup added.
- No subscriber public publishing.
- No cross-tenant backup restore.
- Redundant discovery hydration compatibility layer removed after principal was threaded into discovery itself.
- Existing owner data and physical keys remain intact.

## Remaining blockers / risks
- CI cannot execute against the owner’s private production Better Content page, so the final browser-capture proof remains the preserved live queue retry after deployment.
- This branch establishes the tenant data boundary. Actual paid subscriber authentication/billing identity must bind a real subscriber account to `principalId` before subscription accounts are enabled; the current owner-password login is not itself a customer identity system.
- Subscription accounts must remain disabled until this branch is merged green and real subscriber auth is attached to the principal contract.

## Next step
Open the tenant workspace PR, run the full Node 22 suite, fix every concrete failure at its source, inspect exact final diff/review/branch state, merge only when green, then verify post-merge main. After deployment, retry the preserved Make Money Here capture for the live end-to-end gate.
