# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, retain legitimate membership access, discover authorized experiences, and actually import useful content. The concrete target remains **Hidden Files → Make Money Here → Better Content**, through the Firefox Android rendered-DOM capture bridge because Better Content publishes no server-readable OpenAPI or Skills contract through Whop.

## Scope
1. Keep owner auth → Whop OAuth → membership/discovery/access truth authoritative.
2. Keep native Forum/Course/Chat readers authoritative.
3. For Better Content only, read rendered DOM the owner is already authorized to view.
4. Never read/forward Whop cookies, iframe JWTs, OAuth tokens, local/session storage credentials, or guessed Better Content API responses.
5. Send captures through the signed-in SniperPlug Control Center into private drafts only.
6. Require republishing-rights confirmation and manual owner review before publication.
7. Protect published, reviewed, removed, and unrelated user work from capture overwrites.
8. Stay on this task until one real Make Money Here page reaches SniperPlug as a private draft.

## Status
- PR #34 merged: membership access false-denial fix.
- PR #35 merged: Whop OAuth callback/login-loop fix.
- PR #36 merged: source-access truth/loading/fan-out fix.
- PR #37 merged: current Experiences `account_id` contract fix.
- PR #38 merged: user-OAuth-compatible custom-app metadata / reader-contract truth.
- PR #39 merged: Better Content rendered-DOM capture bridge → private draft.
- PR #41 merged: Firefox Android package support.
- PR #44 merged: v0.1.3 attempted Firefox app-frame URL compatibility.
- Live v0.1.2 evidence: exact Better Content `exp_...`, app-frame host, title, and 3,428 rendered characters were detected; capture then failed only on page-URL sanitation.
- Live v0.1.3 evidence: the same Firefox Whop tab visibly renders an individual Make Money Here guide, but the popup reports `1 Whop tab found` and zero Better Content candidates.
- PR #45 (`fix/firefox-live-injection-capture`) repairs that regression. Implementation head `6e8edb34bd4d5097afa81e6f78379d8f0e5959e1` passed the full Node 22 build/regression suite and packaged the Firefox Android extension successfully.

## Findings / root cause
- The owner is using the correct Firefox tab and an individual Better Content guide is visibly rendered. This is not user error.
- The current failure is before server import: popup → candidate resolution → content-script context.
- v0.1.3 introduced a global `URL` constructor monkeypatch before `content-capture.js`; after that release the previously working candidate disappeared.
- Manifest content scripts are load-time registrations. Reinstalling/updating the extension while the Whop SPA tab stays open can leave that already-open document without the new capture script.
- Therefore the extension must not depend solely on declarative page-load injection or on replacing a browser global.

## Execution path
`Firefox Whop tab → Better Content rendered frame → content-capture.js → candidate message → background candidate cache → popup Capture page → extension queue → SniperPlug Control Center relay → POST /api/browser-capture → requireAdmin + requireWhopSession + exact exp_ verification + exact Better Content app ID → private D1 draft → manual review/publish`.

PR #45 adds a recovery path before candidate failure:
`popup/capture/auto request → query already-open Whop tabs → chrome.scripting.executeScript(allFrames, content-capture.js) → idempotent reprobe → candidate resolution`.

## Changes in PR #45
- Remove `frame-url-compat.js` and stop replacing `globalThis.URL`.
- Move the current-frame HTTPS Whop URL fallback inside `content-capture.js`.
- Make dynamic reinjection idempotent; existing frame contexts reprobe instead of creating duplicate observers/listeners.
- Add MV3 `scripting` permission only; existing restricted Whop host permissions still bound injection.
- Actively inject the audited DOM-only capture script across already-open Whop frames when no candidate exists.
- Retry recovery from popup state, Capture page, and auto-capture setup.
- Allow Whop-origin about:blank/origin-fallback frames under the same restricted match patterns.
- Bump extension to v0.1.4.
- Update `tools/test-browser-capture-extension.mjs` to fail if the URL monkeypatch returns, live injection disappears, reinjection loses idempotency, or credential/network boundaries weaken.

## Validation
- [x] User screenshot proves Whop and the individual Better Content guide are open in Firefox.
- [x] v0.1.2 live capture detection proved Better Content DOM is readable from Firefox.
- [x] PR #45 full Node 22 regression suite passed on implementation head `6e8edb34bd4d5097afa81e6f78379d8f0e5959e1`.
- [x] PR #45 Firefox Android package step passed on the same implementation head.
- [x] No cookie permission, `<all_urls>`, token reading, storage reading, or Better Content private-API probing added.
- [ ] Exact final-head CI after this task-record update.
- [ ] PR #45 diff/review/branch state clean and current with main.
- [ ] PR #45 merged and post-merge main workflows green.
- [ ] v0.1.4 installed on owner Firefox Android and one visible Make Money Here guide queues successfully.
- [ ] That capture reaches SniperPlug as a private draft.
- [ ] Multi-page auto-capture validated only after the one-page path succeeds.

## Cleanup / conflicts
- No extra Whop OAuth scopes.
- No weakening of owner-cookie security.
- No guessed Better Content endpoints.
- No Whop iframe credential theft/forwarding.
- No automatic publishing.
- No unrelated site/database work.
- Issue #20 remains locked out while this active task is incomplete.

## Blockers / risks
- CI cannot render the owner's private live Better Content iframe, so the final proof remains one real Firefox Android capture.
- Firefox dynamic all-frame injection requires the MV3 `scripting` permission plus host permission; both are now explicit and remain restricted to Whop/SniperPlug hosts.

## Backlog
- Issue #25 remains the broader custom-app reader work; Better Content is the first live adapter.
- Other third-party Whop apps remain out of scope until Better Content works end to end.

## Next step
Require green CI on the exact PR #45 final head, inspect branch/review state, merge if clean, verify post-merge main, download the generated v0.1.4 Firefox Android XPI, then retest the same visible Make Money Here guide. Success for this stage is **1 page queued**, followed by the private SniperPlug draft.
