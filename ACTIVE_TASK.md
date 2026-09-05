# Active Task

## Active task / outcome
Repair the Whop importer end to end so the Firefox Android Better Content capture can safely become a subscription feature while preserving the concrete live target **Hidden Files → Make Money Here → Better Content**.

The implementation is not customer-ready until the exact production build passes repository validation and one real Firefox Android page reaches SniperPlug as a private draft through the hardened capture path.

## Scope lock
- Stay on Whop importer / Better Content Firefox Android capture / tenant-safe persistence only.
- Issue #20, general UI redesign, and unrelated work remain backlog.
- No guessed Better Content endpoints, iframe/JWT theft, Whop cookie reading, OAuth-token forwarding, extra OAuth scopes, or weakened auth/cookie checks.
- Browser capture remains user-triggered, rendered-DOM only, and private-draft only.

## Status
- Active PR: **#51 – Stabilize Firefox Android Better Content recovery**.
- Branch: `fix/firefox-v016-stable-recovery`.
- v0.1.6 implementation and server roundtrip regression are in place.
- The first v0.1.6 heads exposed two real defects instead of being released prematurely: a truncated recovery implementation during regression work, then a missing core `whop_posts.stale_at` schema guarantee.
- The recovery implementation was restored and the stale-post schema ownership was repaired in the core importer workspace.
- Exact head `106ae764de495782fa9dd88dc0e5ac988cda46ef` passed the full Node 22 build/regression suite and produced a valid Firefox Android XPI artifact before this task-record update. A fresh exact-head CI pass is required after this documentation commit before merge.

## Findings / root cause
### Firefox Android invalidation
v0.1.5 recovery deleted every cached candidate for a Whop tab whenever the popup attempted recovery. Firefox could already have a correct static-content-script candidate for the real `*.apps.whop.com` iframe, but opening the popup erased it. Broad `allFrames` reinjection was not guaranteed to reacquire that cross-origin frame within the old 1.5-second settle window.

Failure path:
`real app-frame candidate exists → popup opens → recovery clears tab candidates → broad reinjection → app frame does not re-register in time → candidate becomes invalid`

### Server persistence failure found by the new end-to-end regression
Browser capture writes `whop_posts.stale_at`, but `ensureImporterWorkspaceSchema()` did not guarantee that column or its current-post index. The column had only been repaired as a side effect of `ensureWhopBackupSchema()`. Normal Whop scans happened to call the backup schema first; the browser-capture path correctly used the importer workspace directly and therefore exposed the hidden schema dependency.

Failure path:
`browser capture verified → source approved → ensureImporterWorkspaceSchema → upsert whop_posts(... stale_at ...) → fresh DB has no stale_at → roundtrip fails`

The structural fix makes `stale_at` and `idx_whop_posts_current` part of the importer workspace schema itself. Backup setup may still idempotently encounter that already-present column for compatibility, but browser capture and other importer consumers no longer depend on the backup subsystem to create core post state.

## Current execution path
`Firefox Whop tab → preserve and probe known-good app candidate → if needed enumerate Firefox webNavigation frames → target exact HTTPS *.apps.whop.com frame IDs → broad all-frame injection only as last resort → current top-level Whop tab supplies exact exp_ identity → Capture message targets verified frameId → rendered app-frame URL/DOM captured → extension queue re-validates app-frame URL → SniperPlug Control Center relay → same-origin /api/browser-capture → server app-frame preflight → authenticated principal + connected Whop session → current membership + exact Better Content app verification → tenant-scoped approved source → tenant-scoped whop_posts row → private guide draft → queue retry remains idempotent`

## Changes in PR #51
### Firefox v0.1.6 recovery
- Preserves a known-good app-frame candidate and actively probes that exact frame instead of deleting it on popup open.
- Removes only the exact candidate whose frame probe fails.
- Adds `webNavigation` permission and `getAllFrames()` inventory.
- Filters discovered frames to HTTPS `*.apps.whop.com` URLs and injects `content-capture.js` directly into their exact frame IDs.
- Keeps broad `allFrames` injection only as fallback.
- Increases the mobile settle window from 1.5 seconds to 4 seconds.
- Clears candidate state on real frame navigation/tab removal rather than every popup open.
- Keeps app-frame-only queue validation and exact `exp_...` association.

### Regression coverage
- Candidate-retention regression proves popup recovery does not erase a valid frame 4 candidate.
- Firefox frame-inventory regression proves recovery targets app frame 4 and never frame 0 when the real frame is enumerable.
- Existing shell-vs-app regression is updated for v0.1.6.
- New SQLite/D1-compatible server roundtrip sends a live-style Better Content capture through membership verification, exact-app verification, source/post/guide persistence, private-draft enforcement, sensitive URL stripping, and idempotent retry.

### Core importer schema repair
- `ensureImporterWorkspaceSchema()` now idempotently adds `whop_posts.stale_at`.
- The core workspace now creates `idx_whop_posts_current` after guaranteeing the column.
- Browser capture no longer relies on backup initialization to make a core post write valid.

## Validation / results
- [x] Firefox candidate-retention regression added.
- [x] Exact app-frame inventory/targeting regression added.
- [x] Live-style server roundtrip regression added.
- [x] The roundtrip exposed the missing `stale_at` schema dependency instead of allowing another false-green release.
- [x] Core workspace schema repaired.
- [x] Exact code head `106ae764de495782fa9dd88dc0e5ac988cda46ef`: **Verify SniperPlug #1004 passed**; full build/regression suite, XPI packaging, and artifact upload all passed.
- [x] Exact code head `106ae764de495782fa9dd88dc0e5ac988cda46ef`: affiliate-ready preview #99 passed.
- [x] Exact code head `106ae764de495782fa9dd88dc0e5ac988cda46ef`: retired public deal routes #97 passed.
- [x] CI artifact `sniperplug-firefox-android-xpi` exists for that code head; outer ZIP SHA-256 `730c38a4b76b3c214be54272fa45d1709703e80829092dd56a87f65e3c0cde15` matches GitHub's artifact digest.
- [x] Outer artifact ZIP passed `unzip -t` and contains exactly one XPI.
- [x] XPI passed `unzip -t`; SHA-256 `53c9c492cccb772409ef400cc6bbe85fd606f72753776a6f2932a7595ae6f0ae`; contains the six expected extension files.
- [x] Packaged manifest reports v0.1.6, app-frame-only static capture, `webNavigation`, and no cookie permission.
- [x] Static artifact scan found no `document.cookie`, cookies API, local/session site storage, bearer token, access-token, or refresh-token handling.
- [x] PR is 0 commits behind `main`, mergeable, and has no inline review threads as of the code-head validation.
- [ ] Fresh exact-head repository workflows after this task-record update.
- [ ] Merge PR #51 only after that fresh exact head is green.
- [ ] Post-merge `main` validation.
- [ ] Install the production v0.1.6 XPI on Firefox Android and verify the card remains valid for the real guide for more than the few seconds that v0.1.5 survived.
- [ ] Capture one page and require `1 page queued`.
- [ ] Send it and verify exactly one private SniperPlug draft exists in the current tenant workspace.
- [ ] Retry the preserved queue and verify no duplicate/overwrite.
- [ ] Validate multi-page auto-capture only after one-page live success.

## Cleanup / conflicts
- PR diff is limited to Firefox capture recovery, its tests, the package test chain, the extension manifest, and the directly required importer schema repair.
- No unrelated site/runtime redesign is included.
- No shell-frame capture fallback was reintroduced as an accepted source.
- No cookie/token/site-storage permissions were added.
- No public publishing behavior changed.
- Tenant isolation remains intact.
- The stale-post column is now guaranteed by the core importer workspace rather than depending on backup initialization.

## Blockers / risks
- CI cannot reproduce the owner's private Better Content DOM, so the final production gate remains one real Firefox Android capture and handoff.
- One Vercel status attached to code head `106ae...` reported a build-rate-limit failure while the primary SniperPlug Vercel deployment status succeeded. Repository release workflows were green; this external duplicate-deployment rate limit must not be confused with application-test failure.
- Paid subscriber onboarding remains disabled until a real subscriber identity is bound to the tenant-scoped `principalId` model.

## Backlog
- Issue #20 and unrelated UI work remain locked out.
- General cleanup outside the affected capture/importer path remains backlog.
- Paid subscriber authentication/billing onboarding remains separate from this active capture-correctness gate.

## Next step
Require the fresh exact PR head to pass all repository workflows again, then merge PR #51. After merge, require `main` to pass, retrieve the production-built v0.1.6 XPI, verify its archive, and only then perform the real Firefox Android one-page capture/handoff test.
