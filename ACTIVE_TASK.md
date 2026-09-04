# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, retain legitimate membership access, discover authorized experiences, and actually import useful content. The concrete target remains **Hidden Files → Make Money Here → Better Content**, now through the Firefox Android rendered-DOM capture bridge because Better Content publishes no server-readable OpenAPI or Skills contract through Whop.

## Scope
1. Keep owner auth → Whop OAuth → membership/discovery/access truth authoritative.
2. Preserve the strict owner-session cookie and current-membership filters.
3. Keep native Forum/Course/Chat readers authoritative.
4. For Better Content only, use a browser extension/content-script path that reads rendered DOM the owner can already view.
5. Never read or forward Whop cookies, iframe JWTs, OAuth tokens, localStorage/sessionStorage credentials, or guessed private Better Content API responses.
6. Feed captures back into SniperPlug through the signed-in Control Center and existing private guide review model.
7. Require explicit republishing-rights confirmation and manual owner review before publication.
8. Protect published, reviewed, removed, and unrelated user work from capture overwrites.
9. Validate every live mobile failure at the exact execution point before changing code.

## Status
- PR #34 merged: removed false membership denial caused by the phone-gated member-detail recheck.
- PR #35 merged: fixed the Whop OAuth callback/login loop without weakening the Strict owner cookie.
- PR #36 merged: fixed stale source-access truth, duplicate membership loading, excessive discovery fan-out, and indefinite browser loading.
- PR #37 merged: corrected Whop Experiences `account_id` while preserving Forums `company_id`.
- PR #38 merged: replaced developer-only custom-app metadata lookup with user-OAuth-compatible public app metadata and exposed real reader-contract state.
- Production proved `Make Money Here · Better Content` is discovered and membership access is valid, but Better Content publishes no OpenAPI/Skills reader through Whop.
- PR #39 merged at `7dc9688fa72b8b77ebd89c4a363cfcbb0d4cfad7`: added the DOM-only Better Content browser capture bridge and owner-only `/api/browser-capture` private-draft path.
- PR #41 merged at `40a38ec27634d088e8b87f19b2f5fe577777636e`: made the extension usable on Firefox Android / mobile-only testing.
- Live owner validation on Firefox Nightly now proves the extension can detect the real Better Content iframe, exact `exp_...`, page title, app-frame host, and 3,428 rendered characters.
- The first live **Capture page** attempt then failed only at the client-side current-frame URL sanitizer with `The rendered Better Content page does not have a safe HTTPS URL.`
- PR #44 (`fix/firefox-app-frame-url-capture-2`) fixes that exact live mobile failure without changing discovery, OAuth, server permissions, or DOM extraction.
- PR #44 implementation head `942f5555c1b2734bf96393b4622642192e598ad7` passed Verify SniperPlug #959 including an executable simulated Firefox app-frame URL regression.

## Findings / root cause
- OAuth, membership access, custom-app discovery, Better Content identification, Firefox extension installation, iframe discovery, experience-ID linking, and rendered DOM extraction are all now proven working on the owner’s real Android device.
- The failing page produced a valid Better Content iframe host and rendered body, so the failure was not a missing frame or missing content.
- `content-capture.js` calls `safeHttpUrl(location.href)` before returning a capture. On the owner’s Firefox app frame that call returned an empty value even though `location.hostname` was a valid `*.apps.whop.com` host.
- The code then aborted the otherwise valid rendered capture before it could enter the extension queue.
- The source URL is metadata, not the authority for content access. The authority remains the exact `exp_...`, server-side Whop retrieve-experience call, exact Better Content app ID, and current membership relationship.
- For the current Whop frame only, dropping unstable query/hash data and retaining `https://host/path` is safer than rejecting the entire capture.

## Execution path
Current mobile path:
`Firefox Nightly → Whop → Better Content iframe → frame-url-compat.js → content-capture.js → extension queue → SniperPlug Control Center relay → POST /api/browser-capture → requireSameOrigin + requireAdmin + requireWhopSession → retrieve exact exp_... → require exact Better Content app ID app_zv9yxan92U9fNy → current membership check → sanitize/integrity/category → D1 private draft → owner review/publish`.

The PR #44 compatibility step only changes URL construction for the exact current HTTPS Whop frame:
`current location.href on Whop frame → https://location.host/location.pathname`.
Every unrelated URL still delegates to the browser’s native `URL` implementation.

## Changes in PR #44
- Added `browser-extension/frame-url-compat.js`.
- The compatibility shim runs before `content-capture.js`.
- It activates only when:
  - the input exactly equals the current frame `location.href`;
  - the frame protocol is HTTPS;
  - the frame hostname is Whop-owned / Whop-hosted.
- The fallback strips query/hash state and returns only `https://host/path`.
- Unrelated links/images continue through native URL behavior.
- No cookie, browser-storage, token, or network access was added.
- Bumped extension package version to `0.1.3`.
- Extended `tools/test-browser-capture-extension.mjs` with runtime simulation of the owner-style `*.apps.whop.com` current-frame URL and negative checks for unrelated/non-Whop URLs.

## Validation / results
- [x] Owner installed the mobile extension in Firefox Nightly.
- [x] Owner’s live screenshot shows exact Better Content experience ID detected.
- [x] Owner’s live screenshot shows the Better Content iframe host detected.
- [x] Owner’s live screenshot shows page title detected.
- [x] Owner’s live screenshot shows 3,428 rendered characters detected.
- [x] The live failure is isolated to current-frame safe HTTPS URL construction.
- [x] Compatibility shim requests no new extension permissions.
- [x] Compatibility shim contains no `fetch`, cookie access, localStorage, or sessionStorage access.
- [x] Runtime regression proves the simulated current Better Content frame becomes safe `https://host/path`.
- [x] Runtime regression proves an unrelated HTTPS URL is unchanged.
- [x] Runtime regression proves a non-Whop current page is unchanged.
- [x] Verify SniperPlug #959 passed on PR #44 implementation head `942f5555c1b2734bf96393b4622642192e598ad7`.
- [ ] Exact final-head CI passes after this task-record update.
- [ ] PR #44 remains mergeable, current with `main`, and has no unresolved review threads.
- [ ] PR #44 merges and post-merge `main` workflows pass.
- [ ] Owner updates/reloads extension version 0.1.3 and **Capture page** queues one real Better Content page.
- [ ] One queued page successfully reaches SniperPlug and appears as a private draft.
- [ ] After one-page validation, auto-capture is tested across multiple `Make Money Here` pages without duplicates or shell capture.

## Cleanup / conflicts
- No extra Whop OAuth scopes or phone permission.
- No weakening of owner-cookie security.
- No guessed Better Content private endpoint.
- No Whop iframe token/cookie theft or forwarding.
- No direct extension call to Whop API.
- No automatic publishing.
- No changes to native Forum/Course/Chat readers.
- No unrelated site/database work included.

## Blockers / risks
- CI cannot render the owner’s private Better Content iframe, so final proof still requires the owner’s real Firefox Android session.
- Better Content can change its DOM over time; the extractor intentionally uses generic semantic containers rather than app-specific CSS selectors.
- The compatibility shim deliberately discards current-frame query/hash metadata on fallback. Page identity still includes the captured title, while access authority is server-side exact experience verification.
- The bridge only captures pages the owner actually opens/renders; it does not enumerate unopened Better Content pages through undocumented APIs.

## Backlog
- Issue #20 remains unrelated and locked out.
- Issue #25 remains the custom-app reader workstream; Better Content is the first browser-capture adapter.
- Other third-party Whop apps remain out of scope until Better Content one-page and multi-page capture are proven live.

## Next step
Require green CI on the exact PR #44 final head after this task-record update, inspect branch/review state, merge only if clean, verify post-merge `main` workflows, then update/reload the Firefox Android extension to v0.1.3 and retry **Capture page** on the same Better Content guide. The required success state is `1 page queued`, followed by a successful handoff into a private SniperPlug draft.
