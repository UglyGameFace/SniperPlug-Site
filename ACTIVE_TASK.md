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
- PR #54 exact-head and post-merge Node 22, private-guide privacy, and affiliate-production checks passed.
- Real tablet acceptance after PR #54 found **Unpublish & edit broken**. This is a genuine client execution-path conflict that existing server roundtrip tests did not exercise through the browser event stack.
- Current fix branch: `fix/unpublish-lifecycle`.

## Findings / root cause
The server implementation was not the failing part. `guide-status` already supports `draft`, reserves the exact guide version, persists `published_at = NULL`, reads back the authoritative guide, and is covered by the publish/unpublish/republish server roundtrip.

The browser had **two competing implementations of the same Unpublish action**:

1. `control-center-v2.js` is the canonical guide mutation/render runtime. Its `returnDraft` path posts `guide-status: draft`, then updates the guide cache and calls `renderGuideEditor(output.guide, 'status')` so the editor unlocks in place.
2. `control-center-integrity-fix.js` contained an older capture-phase `[data-return-draft]` click listener. It called `preventDefault()` + `stopImmediatePropagation()`, manually fetched `guide-detail`, manually posted `guide-status: draft`, then forced `window.location.replace(...?guide=<id>&fresh=<timestamp>)`.

Because the legacy listener ran during capture, it prevented the canonical root click handler from receiving the event. The forced reload was also internally inconsistent: Control Center initialization does not consume the `guide` query parameter, so the workaround could unpublish server-side and still leave the UI looking broken or lose the selected guide.

This duplicate existed even though `control-center-network-guard.js` already tracks the last server-confirmed `updatedAt` and injects `expectedUpdatedAt` into canonical `guide-status` writes. The legacy detail-fetch/write/reload sequence therefore duplicated stale-write protection rather than providing missing safety.

## Related redundancy found in the affected area
- `control-center-editor-clarity.js` duplicated lifecycle ownership of button labels, state copy, editor sizing, and sticky mobile actions.
- That script removed `.editor-lock-message` after `control-center-lifecycle.js` created it, while lifecycle continued manipulating the now-detached node. This was conflicting/dead UI logic, not merely extra styling.
- `control-center-lifecycle.js` dynamically re-requested `control-center-network-guard.js` even though `control-center/index.html` already loads the guard before `control-center-v2.js`. The guard is idempotent, but the second request was redundant.
- Preview-close and media-repair code in `control-center-integrity-fix.js` remain separate concerns and were intentionally not folded into this status-lifecycle fix.

## Authoritative execution path after this branch
`Better Content iframe → verified capture → tenant private draft → review → unchanged Publish OR Save edited revision → control-center-v2 guide-status mutation → network guard injects expectedUpdatedAt → server reserves exact version → status persisted/read back → canonical renderGuideEditor → lifecycle updates local state/filter/locking`.

For Unpublish specifically:
`Unpublish & edit → control-center-v2 guide-status {status:draft} → expectedUpdatedAt injected by network guard → server return-to-draft reservation → D1 status=draft + published_at=NULL → returned guide rendered in place → lifecycle switches to Needs review, unlocks fields, shows Save/Publish/Remove`.

## Changes on `fix/unpublish-lifecycle`
- Removed the legacy capture-phase Unpublish handler from `control-center-integrity-fix.js`.
- Removed its duplicate `guide-detail` read, duplicate `guide-status` write, and forced `window.location.replace` recovery path.
- Kept media repair and preview compatibility code intact.
- Consolidated the PR #54 editor clarity/state behavior into `control-center-lifecycle.js` so one lifecycle owns status copy, button labels, dirty state, locking, textarea sizing, and sticky mobile actions.
- Deleted redundant `control-center-editor-clarity.js`.
- Removed the duplicate dynamic network-guard injection; the explicit guard loaded before v2 remains authoritative.
- Cache-busted lifecycle and integrity-fix assets to `20260905.3`.
- Expanded `test-guide-publish-feedback.mjs` into a publish/unpublish lifecycle regression that fails if a second return-draft handler or forced reload reappears.

## Validation / results
### Previously established server/persistence coverage
- [x] Capture membership + exact-app + tenant roundtrip.
- [x] Manual Publish review vs bulk manual-review policy separation.
- [x] Save exact edited revision before Publish.
- [x] Server publish → public/private guide route → unpublish → republish lifecycle.
- [x] No duplicate guide row across publish/unpublish/republish.
- [x] Subscriber isolation and attachment/integrity gates fail closed.
- [x] Exact guide-version reservation and rollback audits.

### Current branch validation
- [x] Traced every `[data-return-draft]` owner in the default-branch browser code before changing anything.
- [x] Confirmed canonical v2 handler already supports return-to-draft and authoritative in-place rendering.
- [x] Confirmed network guard already supplies `expectedUpdatedAt` for canonical `guide-status` writes.
- [x] Removed the conflicting status mutation/reload implementation rather than stacking another handler on top.
- [x] Removed the directly conflicting/redundant editor-clarity layer and duplicate guard injection.
- [x] Updated focused lifecycle regression coverage.
- [ ] Exact-head full Node 22 build/regression suite.
- [ ] Final branch diff/review-thread inspection.
- [ ] Merge only after exact-head validation is green.
- [ ] Post-merge main/production checks.
- [ ] Real Android acceptance: Publish → Unpublish & edit stays on the selected guide, changes to Draft/Needs review, unlocks fields, allows edit/save/republish, and creates no duplicate/stale state.

## Cleanup / conflicts
- `control-center-v2.js` remains the sole normal guide status mutation/render runtime.
- `control-center-network-guard.js` remains the sole browser layer for expected-version injection and API request timeout behavior.
- `control-center-lifecycle.js` owns editor dirty protection, state copy, locking, action visibility/labels, and local action feedback only.
- `control-center-integrity-fix.js` no longer mutates guide status; it retains preview compatibility and media-repair behavior only.
- Bulk publishing remains distinct and cannot inherit manual Publish review confirmation.
- No auth, tenant, source-access, media, link, backup, or recovery bypass was introduced.

## Blockers / risks
- CI can validate the browser source contracts and server paths but cannot reproduce the owner’s authenticated Firefox Nightly touch session. Real-device acceptance remains required before this active task is called complete.
- A separate preview compatibility layer remains intentionally duplicated relative to v2 because it covers pointer/capture behavior outside the status lifecycle; it is not being changed without evidence that it is broken.
- Duplicate Vercel build-rate-limit statuses are unrelated to the active Cloudflare Pages deployment.

## Backlog
- Full SniperPlug head-to-toe information architecture, navigation, mobile layout, action hierarchy, terminology, status/notification, accessibility, loading/empty/error-state, and efficiency overhaul.
- Issue #20 and unrelated UI work.
- Paid subscriber authentication/billing onboarding until a real subscriber identity binds to the tenant-scoped `principalId` model.

## Next step
Open a focused PR for `fix/unpublish-lifecycle`, require the exact head to pass the full repository validation suite, inspect the final diff and review state, merge, require post-merge production checks, then run the real-tablet Publish → Unpublish & edit → edit → Save → republish acceptance sequence.
