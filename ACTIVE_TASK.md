# Active Task

## Active task / outcome
Finish the Whop importer end to end so the Firefox Android Better Content flow is clear, deterministic, and safe enough for real users. The concrete live target remains **Hidden Files → Make Money Here → Better Content**.

The Firefox capture and server handoff are now proven on the owner's real Android device. The remaining active-task gate is the guide publication lifecycle: after Save / Publish / Edit-unpublish, the UI must unmistakably show which state was actually confirmed by the server and must never publish stale unsaved edits.

## Scope lock
- Stay on Whop importer / Better Content Firefox Android capture / imported-guide review and publish lifecycle / tenant-safe persistence only.
- The requested head-to-toe whole-site UX redesign is backlogged until this active importer task reaches its Definition of Done.
- Issue #20 and unrelated work remain backlog.
- No guessed Better Content endpoints, iframe/JWT theft, Whop cookie reading, OAuth-token forwarding, extra OAuth scopes, or weakened auth/cookie checks.

## Status
- PR #51 merged to `main` as `b0b85bf44ad8e62a49ba00e407ae6d5e9a29833c` with Firefox Android v0.1.6 recovery, browser-capture server roundtrip coverage, and the core `whop_posts.stale_at` schema repair.
- Post-merge repository workflows passed on that merge.
- Real Firefox Android capture reached the Control Center and created an editable imported guide, proving the previously blocked capture → handoff → private draft path on the real target device.
- New live failure: after pressing **Publish**, the user saw no nearby confirmation and the editor still looked editable. The URL and editor remained visually similar enough that the user could not tell whether publishing had succeeded.
- Active branch: `fix/control-publish-feedback`.

## Findings / root cause
### Firefox Android capture failure, resolved in PR #51
v0.1.5 erased valid app-frame candidates during popup recovery. v0.1.6 preserves and probes known-good `*.apps.whop.com` frames, enumerates exact Firefox frame IDs when necessary, and uses broad reinjection only as fallback.

### Browser-capture persistence failure, resolved in PR #51
Browser capture wrote `whop_posts.stale_at` while the core importer workspace did not guarantee that column. The core workspace now owns that schema state instead of relying on backup initialization as an accidental side effect.

### Publish-state UX failure, active
The server publication path is already versioned and authoritative:
`Publish button → POST guide-status → reserve guide version → assert publishable → persist published status + published_at → return authoritative guide`.

The confusing behavior is client-side lifecycle/state presentation:
- Success feedback was written only to the global Control Center status near the top of the page, far off-screen from the mobile guide editor.
- The default guide filter is `draft`. Publishing changes the selected guide to `published`, so re-rendering the list removes it from the visible draft list while leaving the selected editor open. That makes the page look as if nothing happened.
- Published fields were programmatically disabled by lifecycle safety, but their appearance remained close to editable fields.
- Publish shared the generic unsaved-change discard confirmation. A user could therefore approve the discard warning and publish the last saved version while current visible edits remained unsaved. That is unsafe and confusing.

## Current execution path
`Firefox Better Content app frame → v0.1.6 verified frame → Capture → queue → SniperPlug relay → browser-capture server verification → tenant source/post/private draft → editor → Save exact reviewed draft → Publish versioned server state → explicit local Published confirmation → published-only queue view → locked fields → View published guide → Edit / unpublish returns to draft and unlocks editing`.

## Changes on `fix/control-publish-feedback`
### Publish lifecycle state
- Added a persistent editor-local state panel immediately below the guide heading.
- Draft state explicitly says **Draft · not published**.
- Published state explicitly says **Published and confirmed** and explains that editing is locked.
- Rejected state explicitly says the guide is private and rejected.
- Added editor-local `aria-live` action feedback beside the buttons, so mobile users do not need to scroll to the page-level status banner.
- Published fields now have a visibly muted/locked appearance instead of looking like ordinary editable fields.

### Action clarity
- Draft: show Save, Publish, Reject.
- Published: hide Save/Publish/Reject; show **Edit / unpublish** and **View published guide**.
- Rejected: keep it visibly private and offer return-to-draft behavior only where appropriate.
- Successful publish switches the queue filter to **Published**, so the guide stays visibly present instead of disappearing from the draft list while its editor remains open.
- Successful Save explicitly says the guide is saved but still private and **not published**.
- Successful Publish explicitly says SniperPlug confirmed it is available in Private Guides.

### Unsaved-edit protection
- Publish is no longer part of the generic discard-confirmation path.
- If the editor is dirty, Publish is stopped before any server mutation and the user is told to Save first.
- This guarantees the exact reviewed/saved version is the version submitted for publication.

### Regression coverage
- Added `tools/test-guide-publish-feedback.mjs`.
- The regression requires local draft/published/action-state UI, save-first publish gating, automatic Published filter selection, visible locked published fields, and preservation of the existing authoritative versioned server publish path.
- Added the regression to the full `npm run audit` chain.

## Validation / results
### Previously completed capture path
- [x] Firefox candidate-retention and exact-frame recovery regressions.
- [x] Browser-capture membership + exact Better Content app + D1-compatible source/post/guide roundtrip.
- [x] Core `stale_at` schema ownership repaired.
- [x] PR #51 merged after exact-head CI passed.
- [x] Post-merge `main` release workflows passed.
- [x] Production v0.1.6 XPI packaged and inspected.
- [x] Real Firefox Android capture reached SniperPlug as an imported editable guide.

### Current publish-feedback branch
- [x] Compared branch against current `main`: before adding tests/task record, intended UI diff was limited to `assets/js/control-center-lifecycle.js` plus a one-line lifecycle cache-bust in `control-center/index.html`.
- [x] Dedicated publish-feedback regression added.
- [x] Regression added to full audit chain.
- [ ] Exact branch head full CI.
- [ ] Diff/review-thread/cleanup inspection after CI.
- [ ] Merge only if exact head is green and focused.
- [ ] Post-merge `main` validation.
- [ ] Real Android confirmation: dirty Publish is blocked; Save says still private; Publish changes screen to Published and confirmed; fields are visibly locked; Published filter retains the guide; View published guide works; Edit / unpublish returns it to draft and unlocks editing.
- [ ] Retry/correctness confirmation that no duplicate or stale overwrite was introduced.

## Cleanup / conflicts
- No server publication semantics were replaced. `control-center-v2.js` remains the mutation/render authority and the existing network version guard remains authoritative for `expectedUpdatedAt`.
- Lifecycle owns only editor safety and state feedback.
- No auth, tenant, Whop, capture, media, or public-guide permission checks were weakened.
- A temporary empty file was accidentally added to `main` in commit `66d1f7eade65f54711e38bf37e3d384c3ba970c9` and immediately deleted in `aa991d9522b17abbc0c5893f444a10ba096cd8c8`. Net repository content was restored before this branch was created; no user file or task logic was overwritten.

## Blockers / risks
- CI can verify the client/server contracts but cannot reproduce the owner's exact mobile interaction and scroll position. Final publish-state acceptance therefore requires the real Android retest after production deployment.
- The broad whole-site UX redesign is deliberately not mixed into this fix. Combining it now would make regressions harder to isolate and would violate the active-task lock.

## Backlog
- Full SniperPlug head-to-toe information architecture, navigation, mobile layout, action hierarchy, terminology, status/notification system, accessibility, loading/empty/error states, and overall efficiency pass requested by the user. Begin only after this importer/publish task is complete.
- Issue #20 and unrelated UI work.
- Paid subscriber authentication/billing onboarding remains separate until a real subscriber identity binds to the tenant-scoped `principalId` model.

## Next step
Create the focused publish-feedback PR, require the exact head to pass the entire repository suite, inspect the final diff and review threads, merge only when green, validate `main`, then run the real Android Save → Publish → View → Edit/unpublish acceptance path.
