# Active Task

## Active task / outcome
Finish the Whop importer and Better Content guide review/publish lifecycle on Firefox Android so Publish, Unpublish & edit, Save, and republish all use one authoritative path and behave correctly on the real tablet. The concrete live source remains **Hidden Files → Make Money Here → Better Content**.

## Scope lock
- Active scope: Firefox Android Better Content capture, imported-guide review/publish lifecycle, tenant-safe persistence, and directly required mobile editor UX.
- The requested whole-site head-to-toe redesign remains backlog until this lifecycle passes real-device acceptance.
- Issue #20 and unrelated cleanup remain backlog.
- Do not weaken auth, membership, tenant, origin, link, media, recovery, or private-guide isolation.

## Status
- PR #51 merged: Firefox v0.1.6 app-frame recovery + browser-capture roundtrip + core schema ownership.
- PR #52 merged: local publish feedback, dirty-save gate, published locking, Published-filter retention.
- PR #53 merged: D1/SQLite capture → save → publish → view → unpublish → republish regression.
- PR #54 merged as `ff2e6d43ec15af71d5ec9f60e12e908c4f03064c`: manual Publish is explicit review for unchanged imported guides and the tablet editor was simplified.
- Real tablet acceptance after PR #54 found **Unpublish & edit broken**. Existing server roundtrip tests did not exercise the competing browser event handlers.
- PR #55 merged to `main` as `c9c26fcfb65755ff5543e4971fabfb1eedc6e98b` after exact-head full validation passed.
- PR #55 post-merge full Node 22 build/regression, production private-guide privacy, and production affiliate/visual-route checks all passed.
- The remaining Definition-of-Done gate is the real Android interaction sequence on the deployed code.

## Findings / root cause
The server implementation was not the failing part. `guide-status` already supports `draft`, reserves the exact guide version, persists `published_at = NULL`, reads back the authoritative guide, and is covered by the publish/unpublish/republish server roundtrip.

The browser had **two competing implementations of the same Unpublish action**:

1. `control-center-v2.js` is the canonical guide mutation/render runtime. Its `returnDraft` path posts `guide-status: draft`, then updates the guide cache and calls `renderGuideEditor(output.guide, 'status')` so the editor unlocks in place.
2. `control-center-integrity-fix.js` contained an older capture-phase `[data-return-draft]` listener. It called `preventDefault()` + `stopImmediatePropagation()`, manually fetched `guide-detail`, manually posted `guide-status: draft`, then forced `window.location.replace(...?guide=<id>&fresh=<timestamp>)`.

Because the legacy listener ran during capture, it prevented the canonical root click handler from receiving the event. The forced reload was internally inconsistent because Control Center startup does not consume that `guide` query parameter to restore the selection. The result could therefore be a server-side unpublish with a browser that still looked broken or lost the selected guide.

The duplicate was also unnecessary because `control-center-network-guard.js` already records the last server-confirmed `updatedAt` and injects `expectedUpdatedAt` into canonical `guide-status` writes.

## Related redundancy found in the affected area
- `control-center-editor-clarity.js` duplicated lifecycle ownership of button labels, state copy, editor sizing, and sticky mobile actions.
- That script removed `.editor-lock-message` after `control-center-lifecycle.js` created it, while lifecycle continued manipulating the detached node. This was conflicting/dead logic rather than harmless extra styling.
- The lifecycle network-guard loader initially looked redundant because `index.html` also loads the guard. Existing network regression coverage proved it is an intentional stale-cached-page fallback. It now skips the fallback request when `window.__sniperplugApiFetchGuardInstalled` proves the explicit guard already ran, while still recovering a genuinely stale page that lacks it.
- Preview-close and media-repair behavior in `control-center-integrity-fix.js` remains separate. It was inspected but not folded into this status lifecycle because no shared root cause or failure evidence justified changing it.

## Authoritative execution path now on `main`
`Better Content iframe → verified capture → tenant private draft → review → unchanged Publish OR Save edited revision → control-center-v2 guide-status mutation → network guard injects expectedUpdatedAt → server reserves exact version → status persisted/read back → canonical renderGuideEditor → lifecycle updates local state/filter/locking`.

For Unpublish specifically:
`Unpublish & edit → control-center-v2 guide-status {status:draft} → expectedUpdatedAt injected by network guard → server return-to-draft reservation → D1 status=draft + published_at=NULL → returned guide rendered in place → lifecycle switches to Needs review, unlocks fields, shows Save/Publish/Remove`.

## Changes merged in PR #55
- Removed the legacy capture-phase Unpublish handler from `control-center-integrity-fix.js`.
- Removed its duplicate `guide-detail` read, duplicate `guide-status` write, and forced `window.location.replace` path.
- Kept media repair and preview compatibility code intact.
- Consolidated editor state/copy, button labels, dirty state, locking, textarea sizing, and sticky mobile actions into `control-center-lifecycle.js`.
- Deleted redundant `control-center-editor-clarity.js`.
- Preserved stale-page network-guard recovery while skipping the request when the explicit guard is already installed.
- Cache-busted lifecycle and integrity-fix assets to `20260905.3`.
- Expanded the guide lifecycle regression so a second return-draft handler, forced reload, duplicate clarity layer, unsafe guard loading, lost exact-version protection, or lost status render path fails CI.

## Validation / results
### Server / persistence coverage
- [x] Capture membership + exact-app + tenant roundtrip.
- [x] Manual Publish review vs bulk manual-review policy separation.
- [x] Save exact edited revision before Publish.
- [x] Server publish → guide route → unpublish → republish lifecycle.
- [x] No duplicate guide row across publish/unpublish/republish.
- [x] Subscriber isolation and attachment/integrity gates fail closed.
- [x] Exact guide-version reservation and rollback audits.

### PR #55 investigation and cleanup
- [x] Traced every `[data-return-draft]` owner before changing code.
- [x] Confirmed canonical v2 already supports return-to-draft and authoritative in-place rendering.
- [x] Confirmed network guard already supplies `expectedUpdatedAt` for canonical `guide-status` writes.
- [x] Removed the competing mutation/reload implementation instead of stacking another handler.
- [x] Removed the directly conflicting/redundant editor-clarity layer.
- [x] Preserved intentional stale-page network protection while removing unnecessary repeat loading on current pages.
- [x] Kept unrelated preview/media repair logic unchanged after inspecting its role.
- [x] Final PR diff contained only `ACTIVE_TASK.md`, lifecycle/integrity/index/test changes, and deletion of the redundant clarity script.
- [x] No inline review threads remained before merge.

### CI / production evidence
- [x] PR #55 run #1023 exposed an incorrect new assertion; corrected the test to the real network-guard implementation.
- [x] PR #55 run #1024 passed the new publish/unpublish regression and then correctly exposed loss of the stale-page guard fallback; restored the intentional fallback without weakening the audit.
- [x] PR #55 exact-head run #1027 passed the full Node 22 build/regression suite.
- [x] PR #55 merged as `c9c26fcfb65755ff5543e4971fabfb1eedc6e98b`.
- [x] Post-merge run #1028 passed the full Node 22 build/regression suite.
- [x] Post-merge production guide-privacy run #80 passed.
- [x] Post-merge production affiliate/visual-route run #76 passed.
- [ ] Real Android acceptance: Published guide → Unpublish & edit stays on selected guide → Draft/Needs review → fields unlock → edit → Publish blocked while dirty → Save changes → republish → no duplicate/stale state.

## Cleanup / conflicts
- `control-center-v2.js` is the sole normal guide-status mutation/render runtime.
- `control-center-network-guard.js` is the sole expected-version injection and API timeout layer; lifecycle only loads that same guard for stale pages if absent.
- `control-center-lifecycle.js` owns editor dirty protection, state copy, locking, action visibility/labels, mobile editor layout, and local action feedback only.
- `control-center-integrity-fix.js` no longer mutates guide status; it retains preview compatibility and media repair only.
- Bulk publishing remains distinct and cannot inherit manual Publish review confirmation.
- No auth, tenant, source-access, media, link, backup, recovery, or publication safety gate was bypassed.

## Blockers / risks
- Automated tests cannot reproduce the owner’s authenticated Firefox Nightly touch session. Real-device acceptance remains required before this active task is called complete.
- Search indexing can briefly return older commit matches after a merge, so final source verification used direct `main` file reads rather than trusting stale code-search results.
- Duplicate Vercel build-rate-limit statuses are unrelated to the active Cloudflare Pages deployment.

## Backlog
- Full SniperPlug head-to-toe information architecture, navigation, mobile layout, action hierarchy, terminology, status/notification, accessibility, loading/empty/error-state, and efficiency overhaul.
- Issue #20 and unrelated UI work.
- Paid subscriber authentication/billing onboarding until a real subscriber identity binds to the tenant-scoped `principalId` model.

## Next step
Run the real-tablet production sequence on the merged PR #55 code: open a Published guide, tap **Unpublish & edit**, verify it stays selected and unlocks as Draft/Needs review, make one small edit, verify Publish is blocked until **Save changes**, save, republish, and confirm there is still only one guide with no stale state. If that passes, this active task can finally close and the queued whole-site UX overhaul can become active.
