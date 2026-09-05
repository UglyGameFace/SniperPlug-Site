# Active Task

## Active task / outcome
Finish the Whop importer and Better Content guide-review/publish lifecycle on Firefox Android so the flow is correct, obvious, and safe for real users. The concrete live source remains **Hidden Files → Make Money Here → Better Content**.

## Scope lock
- Active scope: Firefox Android Better Content capture, imported-guide review/publish lifecycle, tenant-safe persistence, and the directly required mobile editor UX.
- Do not begin the requested whole-site head-to-toe redesign until this production publish flow passes the real-device acceptance gate.
- Issue #20 and unrelated cleanup remain backlog.
- Do not weaken auth, membership, tenant, origin, link, media, or private-guide isolation.

## Status
- PR #51 merged: Firefox v0.1.6 app-frame recovery + browser-capture roundtrip + core `whop_posts.stale_at` schema ownership.
- Real Firefox Android Better Content capture reached SniperPlug and created an editable private draft.
- PR #52 merged: local publish feedback, dirty-save gate, published locking, Published-filter retention.
- PR #53 merged: complete D1/SQLite publish lifecycle regression from Better Content capture through save/publish/view/unpublish/republish.
- Real tablet acceptance then exposed a remaining product defect: the editor showed stacked warnings, an oversized raw-Markdown field, and a red manual-review error when Publish was pressed on an unchanged browser-captured guide.
- PR #54 is active on `fix/control-review-ux` to repair that exact acceptance failure.

## Findings / root cause
### Capture/persistence defects already resolved
- Firefox v0.1.5 could erase its own valid Better Content iframe candidate when the popup opened. v0.1.6 preserves/probes the exact `*.apps.whop.com` frame and targets the exact frame ID.
- Browser capture used to depend on backup initialization to create `whop_posts.stale_at`. Core importer schema setup now owns that column/index.

### Publish acceptance defect found on the real tablet
Browser-captured guides intentionally enter D1 with a manual-review-only policy:
`autoPublishEligible=false` + `manualReviewCompleted=false`.

Before PR #54, only **Save draft** changed `manualReviewCompleted` to true. Therefore an unchanged imported guide could be fully reviewed by the owner, but pressing **Publish** still failed with the policy text “Browser-captured app content always requires explicit account review…” until the owner performed a meaningless Save first.

That is backwards. The authoritative manual Publish request is itself the explicit review action. The safe distinction is:
- unchanged guide + manual version-reserved Publish → counts as explicit review;
- edited guide + Publish → still blocked client-side until Save stores the exact visible revision;
- bulk/automatic publish → does **not** gain manual-review confirmation and stays blocked for manual-review-only imports.

The screenshots also showed two persistent warning boxes competing for attention, a raw Markdown textarea consuming most of the tablet viewport, and primary actions pushed to the bottom.

## Execution path after PR #54
`Better Content iframe → verified capture → tenant private draft → owner opens guide → unchanged: Publish guide directly OR edited: Save changes first → version-reserved guide-status request → manual Publish records explicit review → attachment/integrity/time-sensitive/link gates still run → D1 status + published_at → canonical guide read-back → Published queue + locked editor → View published guide → Unpublish & edit → Draft`.

## PR #54 changes
### Correct review semantics
- `assertGuidePublishable()` now records explicit manual review only on its existing version-reserved manual Publish path.
- `publishReadyGuides()` continues to use the normal audit path and cannot bypass manual-review-only policy.
- Attachment, blocked-integrity, quarantine, expiration, and link checks remain authoritative after manual review confirmation.
- Dirty edits remain blocked by the existing lifecycle before a publish mutation can leave the browser.

### Tablet/mobile editor clarity
- One concise persistent state surface instead of stacked warning boxes.
- Labels reduced to **Save changes**, **Publish guide**, **Remove draft**, and **Unpublish & edit**.
- Clean draft copy says it is ready to review; dirty copy says save before publishing.
- Raw guide textarea is viewport-bounded on tablet/mobile.
- Primary actions stay reachable in a sticky action bar on coarse-pointer/mobile layouts.
- Raw Markdown preview is hidden from the normal review path.
- Featured is moved under **More options**.
- No new fetch layer, retry mutation, MutationObserver, or alternate publish implementation was added.

## Validation / results
- [x] Existing capture, membership, exact-app, tenant, auth, media, backup, recovery, network, concurrency, versioning, and privacy audits pass on PR #54.
- [x] PR #54 Node 22 full build/regression run #1019 passed.
- [x] `GUIDE PUBLISH SERVER ROUNDTRIP PASSED` proves:
  - imported Better Content draft stays private;
  - bulk publish cannot bypass manual review;
  - manual Publish is explicit review for an unchanged imported guide;
  - edited guide still saves exact content before publishing;
  - publish/view/unpublish/republish works;
  - no duplicate guide row;
  - subscriber publishing and unresolved attachment publishing fail closed.
- [x] `GUIDE PUBLISH FEEDBACK REGRESSION PASSED` proves:
  - one concise editor state surface;
  - bounded tablet/mobile guide field and reachable primary actions;
  - dirty drafts cannot publish stale edits;
  - manual Publish and bulk-policy behavior remain separated;
  - versioned server publication remains authoritative.
- [x] Control Center mobile-flow and hardening audits passed.
- [x] PR #54 currently has no inline review threads and is mergeable before this task-record update.
- [ ] Fresh exact-head workflows after this task-record commit.
- [ ] Merge PR #54 only after the new exact head is green.
- [ ] Post-merge `main` production checks.
- [ ] Real Android acceptance on deployed code: open an unchanged imported guide and Publish directly with no manual-review error; verify Published/locked/view state; Unpublish & edit; then modify one field and verify Publish is blocked until Save changes.

## Cleanup / conflicts
- `control-center-v2.js` remains the sole guide mutation/render runtime.
- `control-center-network-guard.js` remains authoritative for `expectedUpdatedAt`, timeouts, and stale-write protection.
- `control-center-lifecycle.js` remains authoritative for dirty-draft protection and confirmed action feedback.
- `control-center-editor-clarity.js` is presentation/state-copy only. It issues no network requests and creates no alternate persistence path.
- Bulk publishing remains distinct from manual publishing and does not inherit manual-review confirmation.
- PR #54 changes only the directly affected editor/publish files and regressions plus this task record.

## Blockers / risks
- CI cannot reproduce the owner’s authenticated Firefox Nightly touch session. Real-device interaction remains the final acceptance gate after deployment.
- Manual review confirmation is persisted when the owner explicitly presses Publish even if a later attachment/link/etc. gate blocks publication. Those independent gates still block the guide; a later bulk run still re-audits them. This is intentional because review completion and publishability are separate facts.
- Duplicate Vercel build-rate-limit statuses are not the active deployment runtime; Cloudflare Pages remains authoritative.

## Backlog
- Full SniperPlug head-to-toe information architecture, navigation, mobile layout, action hierarchy, terminology, status/notification, accessibility, loading/empty/error-state, and efficiency overhaul.
- Issue #20 and unrelated UI work.
- Paid subscriber authentication/billing onboarding until a real subscriber identity binds to the tenant-scoped `principalId` model.

## Next step
Require the fresh PR #54 exact head to pass all repository workflows, inspect the final diff/review state, merge to `main`, require post-merge production validation, then perform the short real-tablet acceptance sequence. Only after that passes can this task be closed and the whole-site overhaul become active.
