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
- Real tablet acceptance then exposed a remaining product defect: stacked warnings, an oversized raw-Markdown field, and a red manual-review error when Publish was pressed on an unchanged browser-captured guide.
- PR #54 fixed that exact acceptance failure and merged to `main` as `ff2e6d43ec15af71d5ec9f60e12e908c4f03064c`.
- Post-merge Node 22 validation, production guide-privacy smoke, and production affiliate-readiness smoke passed on that merge commit. Duplicate Vercel build-rate-limit statuses remain unrelated to the active Cloudflare Pages deployment.

## Findings / root cause
Browser-captured guides intentionally enter D1 with `autoPublishEligible=false` and `manualReviewCompleted=false`. Before PR #54, only **Save draft** marked manual review complete. Therefore an unchanged guide could be visibly reviewed by the owner yet pressing **Publish** failed with the browser-capture manual-review policy until a meaningless Save occurred.

The correct authority boundary is now:
- unchanged guide + manual version-reserved Publish → the Publish action itself records explicit review;
- edited guide + Publish → blocked in the browser until Save stores the exact visible revision;
- bulk/automatic publish → never receives manual-review confirmation and remains blocked for manual-review-only imports.

The same real-tablet screenshots exposed avoidable UX clutter: two persistent warning boxes, a raw Markdown textarea consuming most of the viewport, and primary actions pushed below the fold.

## Current execution path
`Better Content iframe → verified capture → tenant private draft → owner opens guide → unchanged: Publish guide directly OR edited: Save changes first → version-reserved guide-status request → explicit manual-review record → attachment/integrity/quarantine/expiration/link gates → D1 status + published_at → canonical guide read-back → Published queue + locked editor → View published guide → Unpublish & edit → Draft`.

## Implemented PR #54 behavior
- Manual Publish records explicit review only on the existing version-reserved manual publish path.
- Bulk publishing still cannot bypass manual-review-only policy.
- Attachment, integrity, quarantine, expiration, and link checks still fail closed.
- Dirty edits still require Save before Publish.
- Guide editor uses one concise state surface instead of stacked persistent warnings.
- Buttons are **Save changes**, **Publish guide**, **Remove draft**, and **Unpublish & edit**.
- Clean drafts say they are ready to review; dirty drafts say save before publishing.
- Guide-content textarea is bounded on tablet/mobile.
- Primary actions remain reachable in a sticky action bar on coarse-pointer/mobile layouts.
- Raw Markdown preview is hidden from the normal review flow.
- Featured is under **More options**.
- No new network path, retry mutation, DOM observer, auth bypass, or duplicate publishing implementation was added.

## Validation / results
- [x] PR #54 exact-head Node 22 full build/regression run #1020 passed after the final task-record commit.
- [x] PR #54 had no inline review threads and was mergeable before merge.
- [x] `GUIDE PUBLISH SERVER ROUNDTRIP PASSED`: private draft, manual Publish review, edited-save path, publish/view/unpublish/republish, duplicate prevention, subscriber isolation, attachment blocking.
- [x] `GUIDE PUBLISH FEEDBACK REGRESSION PASSED`: single state surface, bounded mobile editor, reachable actions, dirty-save gate, manual-vs-bulk review separation, authoritative versioned publish.
- [x] Control Center mobile-flow and hardening audits passed.
- [x] PR #54 merged to `main` as `ff2e6d43ec15af71d5ec9f60e12e908c4f03064c`.
- [x] Post-merge Node 22 full build/regression suite passed.
- [x] Post-merge production private-guide privacy smoke passed.
- [x] Post-merge production affiliate-readiness smoke passed.
- [ ] Real Android acceptance on deployed code: open an unchanged imported guide and Publish directly with no manual-review error; verify Published/locked/view state; Unpublish & edit; then modify one field and verify Publish is blocked until Save changes.

## Cleanup / conflicts
- `control-center-v2.js` remains the sole guide mutation/render runtime.
- `control-center-network-guard.js` remains authoritative for `expectedUpdatedAt`, timeouts, and stale-write protection.
- `control-center-lifecycle.js` remains authoritative for dirty-draft protection and confirmed action feedback.
- `control-center-editor-clarity.js` is presentation/state-copy only and issues no network requests.
- Bulk publishing remains distinct from manual publishing and does not inherit manual-review confirmation.
- PR #54 changed only the directly affected editor/publish files, regressions, and task record.

## Blockers / risks
- CI cannot reproduce the owner’s authenticated Firefox Nightly touch session. Real-device interaction remains the final acceptance gate.
- Manual review completion and publishability are separate facts: pressing manual Publish records that review occurred, while attachment/link/integrity/expiration checks can still independently block publication.

## Backlog
- Full SniperPlug head-to-toe information architecture, navigation, mobile layout, action hierarchy, terminology, status/notification, accessibility, loading/empty/error-state, and efficiency overhaul.
- Issue #20 and unrelated UI work.
- Paid subscriber authentication/billing onboarding until a real subscriber identity binds to the tenant-scoped `principalId` model.

## Next step
Run the short production tablet acceptance sequence on the deployed PR #54 behavior. If it passes without duplicate/stale state, close this active task and begin the queued whole-site UX overhaul.
