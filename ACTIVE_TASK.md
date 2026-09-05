# Active Task

## Active task / outcome
Repair the Whop importer end to end so it can become a safe subscription product while preserving the concrete live target **Hidden Files → Make Money Here → Better Content** through Firefox Android rendered-DOM capture.

The task is not complete until one real Make Money Here page reaches SniperPlug as a private draft through the hardened mobile capture path. Subscription onboarding also remains disabled until a real subscriber account identity is bound to the already tenant-scoped `principalId` model.

## Scope lock
- Stay on Whop importer / Better Content mobile capture / tenant isolation only.
- Issue #20, general UI redesign, and unrelated work remain backlog.
- No guessed Better Content endpoints, iframe/JWT theft, Whop cookie reading, OAuth-token forwarding, extra OAuth scopes, or weakened auth/cookie checks.
- Browser capture remains user-triggered, rendered-DOM only, and private-draft only.

## Current live evidence
The latest Firefox Android v0.1.4 screenshot showed a false capture candidate even though the real Better Content guide was open:
- title: `SniperPlug Better Content Capture`
- experience: `exp_rpaFYR2AD7Mb9d`
- host: `whop.com`
- rendered characters: `112`
- queue: `0 pages`

This proves the extension was selecting the top-level Whop shell/extension-facing text rather than the real Better Content `*.apps.whop.com` frame. The user was operating the flow correctly.

Earlier live evidence already proved the real app frame is readable on Firefox Android: the extension previously found the exact experience, an `mfk8y74zmein6tne8o5e.apps.whop.com` host, the actual guide title, and 3,428 rendered characters.

## Root cause
v0.1.4 still allowed `content-capture.js` to run against the top-level Whop shell. Candidate ranking heavily rewarded a frame carrying an `exp_...` ID, and recovery returned as soon as any candidate appeared. A fast shell candidate could therefore win before the real cross-origin app iframe registered. The old 15-second cross-frame experience-link window also made correctness dependent on timing.

The resulting failure was structural, not user error:
`popup → popup-state → recoverCandidateAcrossWhopTabs → all-frame injection → shell candidate arrives first → bestCandidate(frame 0) → popup renders false guide state`

## Current execution path after v0.1.5 hardening
`Firefox Whop tab → fresh all-frame probe → content-capture rejects every non-HTTPS/non-*.apps.whop.com document → background rejects non-app candidates again → current top-level Whop tab URL supplies current exp_ identity → real app frame candidate → Capture page message targets that exact frameId → app-frame URL/DOM captured → extension queue re-validates app-frame URL → SniperPlug Control Center relay → same-origin /api/browser-capture → server rejects non-app-frame URL again → owner + Whop + exact Better Content experience verification → tenant-scoped whop_posts row → private guide draft`

## Implemented changes in PR #50
### Firefox frame selection
- Extension version raised to **0.1.5**.
- Static rendered-DOM injection is restricted to `https://*.apps.whop.com/*`.
- `content-capture.js` itself exits before its idempotent shortcut unless the running document is HTTPS and actually has an `*.apps.whop.com` hostname. Dynamic all-frame injection therefore cannot resurrect shell capture.
- Firefox's current-frame URL fallback remains local to the extractor and only reduces the real current app-frame URL to safe HTTPS host/path form when URL parsing is unstable.
- No global `URL` monkeypatch.

### Background recovery
- Candidate storage rejects anything not explicitly marked as an app frame with an `*.apps.whop.com` host.
- The current top-level Whop tab URL is authoritative for the current `exp_...` identity, so the real app frame does not depend on exposing the experience ID itself.
- Fresh popup/capture recovery clears stale candidates before reinjection.
- Recovery waits up to 1.5 seconds for a fresh eligible app-frame candidate instead of returning immediately on the first shell-like result.
- Capture and auto-capture require a real app candidate.
- Candidate ranking gives app-frame identity priority.

### Queue / handoff defenses
- New captures are refused unless they contain an exact `exp_...`, rendered body, and HTTPS `*.apps.whop.com` page/frame URL.
- Queue reads and pending handoffs filter legacy/invalid shell captures instead of forwarding them.
- The existing retry path still preserves valid queued pages until a successful SniperPlug handoff.

### Server defense in depth
- Added `functions/_lib/browser-capture-origin.js`.
- `/api/browser-capture` now rejects non-HTTPS/non-`*.apps.whop.com` capture URLs before import writes.
- Existing server checks remain: same-origin request, authenticated SniperPlug principal, connected Whop session, exact Better Content app ID, current membership, source approval, tenant-scoped source row, formatting/integrity checks, and private draft only.

## Regression coverage
A new executable Firefox regression reproduces the exact live failure:
- frame 0: `whop.com`, title `SniperPlug Better Content Capture`, 112 chars, carries the exp ID;
- frame 4: real `mfk8y74zmein6tne8o5e.apps.whop.com` guide, 3,428 chars, deliberately exposes no exp ID.

The regression requires:
- frame 0 never enters the usable candidate set;
- frame 4 inherits the current top-level `exp_rpaFYR2AD7Mb9d` identity;
- popup state reports frame 4;
- Capture page sends to frameId 4;
- an attempted shell-frame payload is rejected by extension queue validation;
- server preflight independently rejects a shell URL.

The existing browser-capture audit was strengthened to enforce app-frame-only extraction, stale-candidate clearing, settle waiting, queue validation, server origin validation, no cookies/storage/token access, no private API probing, exact Better Content app verification, source-row-before-guide FK integrity, manual review, and overwrite protections.

## Prior importer / tenant work preserved
- PR #34: membership false-denial fix.
- PR #35: OAuth callback/login-loop fix.
- PR #36: source-loading/access/fan-out fix.
- PR #37: Experiences `account_id` contract fix.
- PR #38: user-OAuth-compatible custom-app metadata.
- PR #39: Better Content rendered-DOM bridge.
- PR #41: Firefox Android package support.
- PR #45: active all-frame recovery for already-open Whop tabs.
- PR #46: browser capture source-row FK materialization/verification.
- PR #47: stable account principal separated from browser session identity.
- PR #48: complete importer workspace tenant isolation, owner-only public publishing, principal-scoped backup/reset/restore/recovery/bulk/history.

## Validation
- [x] Exact live v0.1.4 shell false-positive reproduced as an executable test case.
- [x] Full Node 22 build/regression suite passed on the initial PR #50 hardening head.
- [x] Firefox frame-selection regression passed.
- [x] Existing Better Content browser-capture regression passed.
- [x] Full importer/discovery/OAuth/tenant/backups/recovery/media/control-center regressions remained green.
- [x] Firefox XPI packaging and ZIP integrity passed.
- [x] Affiliate preview and retired-route workflows remained green.
- [ ] Re-run full CI on the final PR #50 documentation/task-record head.
- [ ] Merge PR #50 only if final head is current with main, mergeable, review-thread clean, and CI green.
- [ ] Install the fresh v0.1.5 XPI on Firefox Nightly and verify the card shows the actual guide title plus `*.apps.whop.com`, never `whop.com`.
- [ ] Capture one page and verify `1 page queued`.
- [ ] Send it and verify one private SniperPlug draft exists in the current tenant workspace.
- [ ] Validate multi-page auto-capture only after one-page live success.

## Cleanup / conflicts
- No unrelated site/runtime changes in PR #50.
- No global URL monkeypatch restored.
- No shell-frame capture compatibility fallback retained.
- No cookie/token/site-storage permissions added.
- No public publishing behavior changed.
- Tenant isolation from PR #48 is untouched.
- Older v0.1.4 queued shell payloads are filtered rather than imported.

## Remaining blocker / risk
CI cannot execute against the owner's private live Better Content DOM. The remaining production gate is therefore one real Firefox Android v0.1.5 capture and handoff. A successful build proves the known execution contracts and exact reproduced regression; it cannot honestly prove a private third-party DOM that CI cannot access.

## Backlog
- Issue #20 and unrelated UI work remain locked out.
- Paid subscriber authentication/billing onboarding remains separate from this active capture correctness gate and must not be enabled until a real subscriber identity binds to `principalId`.

## Next step
After PR #50 is final-head green and merged, install a fresh v0.1.5 XPI, keep one **Hidden Files → Make Money Here** guide visibly rendered in Firefox Nightly, and open SniperPlug Capture. The acceptable card must show the actual guide and an `*.apps.whop.com` host. Anything else is a failure and continues this same task at the exact failing step.
