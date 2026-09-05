# Active Task

## Active task / outcome
Finish the Whop importer end to end so the Firefox Android Better Content flow is clear, deterministic, and safe enough for real users. The concrete live target remains **Hidden Files → Make Money Here → Better Content**.

The Firefox capture and server handoff are proven on the owner's real Android device. The remaining gate is the imported-guide publication lifecycle: Save / Publish / View / Edit-unpublish must show an unmistakable server-confirmed state and must never publish stale unsaved edits.

## Scope lock
- Stay on Whop importer / Better Content Firefox Android capture / imported-guide review and publish lifecycle / tenant-safe persistence only.
- The requested head-to-toe whole-site UX redesign is backlogged until this active importer task reaches its Definition of Done.
- Issue #20 and unrelated work remain backlog.
- Do not weaken auth, membership, tenant, origin, media, or private-guide checks.

## Status
- PR #51 merged to `main` as `b0b85bf44ad8e62a49ba00e407ae6d5e9a29833c` with Firefox Android v0.1.6 recovery, browser-capture server roundtrip coverage, and the core `whop_posts.stale_at` schema repair.
- Real Firefox Android capture reached the Control Center and created an editable imported guide.
- Live publication UX failure: after pressing **Publish**, no nearby confirmation appeared and the editor still looked editable, so the user could not tell whether anything happened.
- Active PR: **#52 – Make guide publish state unmistakable on mobile**.
- Active branch: `fix/control-publish-feedback`.

## Findings / root cause
### Capture and persistence, resolved
- v0.1.5 erased valid Firefox app-frame candidates during popup recovery. v0.1.6 preserves/probes the real `*.apps.whop.com` frame and targets exact Firefox frame IDs.
- Browser capture depended accidentally on backup initialization to create `whop_posts.stale_at`. The core importer workspace now owns that schema state.

### Publish-state UX, active
The server path is already versioned and authoritative:
`Publish → POST guide-status → reserve guide version → assert publishable → persist status + published_at → read back authoritative guide`.

The client presentation was misleading:
- Publish success used only the global Control Center status near the top of the page, off-screen from the mobile editor.
- The default filter is Draft. A successful publish removes the guide from that list while the selected editor remains open, which looks like nothing changed.
- Published inputs were disabled but visually similar to editable inputs.
- Publish shared generic unsaved-change discard handling, allowing a user to confirm the warning and publish the last saved version rather than the visible unsaved edits.

## Current execution path
`Firefox Better Content frame → verified v0.1.6 capture → SniperPlug relay → server verification → tenant private draft → Save exact reviewed content → versioned Publish → local server-confirmed Published state → Published queue view → locked fields → View published guide → Edit / unpublish → Draft + editable fields`.

## Changes in PR #52
### State and action clarity
- Persistent editor-local state panel: **Draft · not published**, **Published and confirmed**, or **Rejected and private**.
- Editor-local assertive status next to the action buttons, rather than relying on an off-screen page banner.
- Draft state shows Save / Publish / Reject.
- Published state hides Save / Publish / Reject and shows **View published guide** plus **Edit / unpublish**.
- Published form fields are visibly muted and locked.
- Successful publish switches the queue to the Published filter so the selected guide stays visibly present.
- Save explicitly confirms that the guide is saved but still private and not published.
- Publish explicitly confirms that SniperPlug received the server-confirmed published guide.

### Unsaved-edit safety
- Publish has its own save-first gate and is no longer part of the generic discard-confirmation path.
- Dirty Publish is stopped before any server mutation and tells the user to Save first.
- This guarantees the reviewed/saved version is the version submitted for publication.

### Failure feedback without performance regression
- Save/Publish begin a bounded action-only status watcher.
- It checks only while one of those writes is pending and mirrors an authoritative global error beside the editor.
- It stops on success/failure and has a 125-second fail-closed confirmation limit.
- An attempted `MutationObserver` implementation was rejected by the existing performance audit because broad DOM observation can recreate mobile input lag; it was removed rather than weakening that performance invariant.

### Regression coverage
- Added `tools/test-guide-publish-feedback.mjs` to the full audit chain.
- It requires save-first publishing, local success/failure feedback, visible published locking, Published-filter transition, no MutationObserver, bounded write-status polling, and preservation of the existing versioned server publication path.

## Validation / results
### Previously completed capture path
- [x] Firefox candidate-retention and exact-frame regressions.
- [x] Browser-capture membership + exact-app + D1-compatible source/post/guide roundtrip.
- [x] Core `stale_at` schema ownership repaired.
- [x] PR #51 exact-head and post-merge release workflows passed.
- [x] Production v0.1.6 XPI packaged and inspected.
- [x] Real Android capture reached SniperPlug as an imported editable guide.

### PR #52
- [x] HTML reconstruction checked against `main`; the Control Center HTML diff is only the intended lifecycle cache-bust.
- [x] Dedicated publish-feedback regression added to full audit.
- [x] Initial publish-feedback head `3120497298ed39ac6f446faa1f39f08f3ba83386` passed full Node 22 CI, affiliate preview, and retired-route validation.
- [x] A later failure-feedback head exposed the existing `MutationObserver` performance invariant; the observer was removed instead of bypassing the audit.
- [x] Exact code/test head `8ce44889af872ce46ded8de7fb4e3163417eb881` passed **Verify SniperPlug #1013**, affiliate preview #105, and retired public deal routes #104.
- [x] Final functional diff remains limited to `assets/js/control-center-lifecycle.js`, one lifecycle cache-bust in `control-center/index.html`, the new regression, its package audit entry, and this task record.
- [ ] Fresh exact PR head validation after this task-record-only commit.
- [ ] Final review-thread/mergeability check.
- [ ] Merge PR #52 only if the fresh exact head is green.
- [ ] Post-merge `main` validation.
- [ ] Real Android acceptance: dirty Publish blocked; Save says still private; Publish becomes Published and confirmed; fields visibly lock; Published filter retains guide; View published guide works; Edit / unpublish returns to Draft and unlocks editing.

## Cleanup / conflicts
- `control-center-v2.js` remains the authoritative mutation/render runtime.
- `control-center-network-guard.js` remains authoritative for versioned `expectedUpdatedAt` write safety and timeouts.
- Lifecycle owns editor safety and local state feedback only.
- No duplicate publish implementation, retry mutation, new auth bypass, or server fallback was added.
- A temporary empty file was accidentally added to `main` in `66d1f7eade65f54711e38bf37e3d384c3ba970c9` and immediately removed in `aa991d9522b17abbc0c5893f444a10ba096cd8c8`. Net repository content was restored before PR #52 began; no user work was overwritten.

## Blockers / risks
- CI cannot reproduce the owner's exact Android scroll/touch experience, so the final publication UX gate remains a real-device test after production deployment.
- The whole-site redesign remains intentionally separate so this bug can be validated without burying it under unrelated UI changes.

## Backlog
- Full SniperPlug head-to-toe information architecture, navigation, mobile layout, action hierarchy, terminology, status/notification system, accessibility, loading/empty/error states, and efficiency pass requested by the user.
- Issue #20 and unrelated UI work.
- Paid subscriber authentication/billing onboarding until a real subscriber identity binds to the tenant-scoped `principalId` model.

## Next step
Require the fresh exact PR #52 head to pass all repository workflows, confirm mergeability and no unresolved review threads, merge, validate `main`, then run the real Android Save → Publish → View → Edit/unpublish acceptance path.
