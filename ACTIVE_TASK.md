# Active Task

## Active task / outcome
Finish the Whop importer end to end so the Firefox Android Better Content flow is clear, deterministic, and safe enough for real users. The concrete live target remains **Hidden Files → Make Money Here → Better Content**.

The capture, handoff, server persistence, and publish-state implementation are now deployed. The only remaining Definition-of-Done gate is a real Android acceptance pass of the exact production Save → Publish → View → Edit/unpublish interaction.

## Scope lock
- Stay on Whop importer / Better Content Firefox Android capture / imported-guide review and publish lifecycle / tenant-safe persistence only until the real-device acceptance gate passes.
- The requested head-to-toe whole-site UX redesign is backlogged and must not begin before this task is actually complete.
- Issue #20 and unrelated work remain backlog.
- Do not weaken auth, membership, tenant, origin, media, or private-guide checks.

## Status
- PR #51 merged to `main` as `b0b85bf44ad8e62a49ba00e407ae6d5e9a29833c` with Firefox Android v0.1.6 recovery, browser-capture server roundtrip coverage, and the core `whop_posts.stale_at` schema repair.
- Real Firefox Android capture reached the Control Center and created an editable imported guide.
- PR #52 merged to `main` as `d6e059b29de081ac4db54f0af72bc89e311417d4` with mobile-visible publish state, save-first protection, bounded failure feedback, published locking, and focused regression coverage.
- Post-merge production validation for the exact merge commit passed the full Node 22 build/regression suite, Cloudflare production visual-route smoke, private-guide production privacy checks, affiliate production readiness, and retired-route safety checks.
- The duplicate Vercel project still reports its known build-rate-limit failure while the active deployment/status path remains green; this is not an application regression.

## Findings / root cause
### Capture and persistence, resolved
- v0.1.5 erased valid Firefox app-frame candidates during popup recovery. v0.1.6 preserves/probes the real `*.apps.whop.com` frame and targets exact Firefox frame IDs.
- Browser capture depended accidentally on backup initialization to create `whop_posts.stale_at`. The core importer workspace now owns that schema state.

### Publish-state UX, resolved in code and production deployment
The server path was already versioned and authoritative:
`Publish → POST guide-status → reserve guide version → assert publishable → persist status + published_at → read back authoritative guide`.

The confusing behavior was client presentation:
- Publish success used only the global Control Center status near the top of the page, off-screen from the mobile editor.
- The default filter was Draft. A successful publish removed the guide from that list while the selected editor remained open, which looked like nothing changed.
- Published inputs were disabled but visually similar to editable inputs.
- Publish shared generic unsaved-change discard handling, allowing a user to confirm the warning and publish the last saved version rather than the visible unsaved edits.

## Current production execution path
`Firefox Better Content frame → verified v0.1.6 capture → SniperPlug relay → server verification → tenant private draft → Save exact reviewed content → versioned Publish → local server-confirmed Published state → Published queue view → locked fields → View published guide → Edit / unpublish → Draft + editable fields`.

## Implemented publish lifecycle
### State and action clarity
- Persistent editor-local state panel: **Draft · not published**, **Published and confirmed**, or **Rejected and private**.
- Editor-local assertive status next to the action buttons instead of relying on an off-screen page banner.
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
- `tools/test-guide-publish-feedback.mjs` is part of the full audit chain.
- It requires save-first publishing, local success/failure feedback, visible published locking, Published-filter transition, no MutationObserver, bounded write-status polling, and preservation of the existing versioned server publication path.

## Validation / results
### Capture path
- [x] Firefox candidate-retention and exact-frame regressions.
- [x] Browser-capture membership + exact-app + D1-compatible source/post/guide roundtrip.
- [x] Core `stale_at` schema ownership repaired.
- [x] PR #51 exact-head and post-merge release workflows passed.
- [x] Production v0.1.6 XPI packaged and inspected.
- [x] Real Android capture reached SniperPlug as an imported editable guide.

### Publish-state path
- [x] Dedicated publish-feedback regression added to full audit.
- [x] Performance regression caught and removed before merge; no broad MutationObserver remains.
- [x] PR #52 final head green and mergeable with no unresolved review threads.
- [x] PR #52 merged to `main` as `d6e059b29de081ac4db54f0af72bc89e311417d4`.
- [x] Post-merge full Node 22 build/regression suite passed.
- [x] Cloudflare production visual-route smoke passed.
- [x] Production private-guide privacy smoke passed.
- [x] Production affiliate readiness smoke passed.
- [x] Production retired-route safety smoke passed.
- [ ] Real Android acceptance: dirty Publish blocked; Save says still private; Publish becomes Published and confirmed; fields visibly lock; Published filter retains guide; View published guide works; Edit / unpublish returns to Draft and unlocks editing.
- [ ] Confirm no duplicate or stale overwrite appears during that real-device sequence.

## Cleanup / conflicts
- `control-center-v2.js` remains the authoritative mutation/render runtime.
- `control-center-network-guard.js` remains authoritative for versioned `expectedUpdatedAt` write safety and timeouts.
- Lifecycle owns editor safety and local state feedback only.
- No duplicate publish implementation, retry mutation, new auth bypass, or server fallback was added.
- Final production change stayed focused on the importer/publish lifecycle plus its regression and cache-bust.
- A temporary empty file was accidentally added to `main` in `66d1f7eade65f54711e38bf37e3d384c3ba970c9` and immediately removed in `aa991d9522b17abbc0c5893f444a10ba096cd8c8`. Net repository content was restored before PR #52 began; no user work was overwritten.

## Blockers / risks
- Automated validation cannot reproduce the owner's authenticated Android touch/scroll session. The only remaining blocker is the real-device production acceptance pass.
- The whole-site redesign remains intentionally separate until this gate passes; starting it now would violate the active-task lock and make any remaining publish defect harder to isolate.

## Backlog
- Full SniperPlug head-to-toe information architecture, navigation, mobile layout, action hierarchy, terminology, status/notification system, accessibility, loading/empty/error states, and efficiency pass requested by the user.
- Issue #20 and unrelated UI work.
- Paid subscriber authentication/billing onboarding until a real subscriber identity binds to the tenant-scoped `principalId` model.

## Next step
On the real Android production Control Center, run one exact acceptance sequence: make a small edit and verify dirty Publish is blocked; Save and confirm **Draft · not published**; Publish and confirm **Published and confirmed** plus locked fields and Published filter retention; open **View published guide**; use **Edit / unpublish** and confirm the guide returns to Draft with editable fields. If all of that passes without duplicate/stale state, close this active task and begin the queued head-to-toe website UX overhaul as the next active task.
