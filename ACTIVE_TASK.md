# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, retain legitimate membership access, discover authorized experiences, and actually import useful content. The current concrete target is **Hidden Files → Make Money Here → Better Content** using a browser-side rendered-DOM capture bridge because Better Content publishes no server-readable OpenAPI or Skills contract through Whop.

## Scope
1. Keep the existing owner auth → Whop OAuth → membership/discovery/access path authoritative.
2. Preserve the strict owner-session cookie and current-membership filters.
3. Keep native Forum/Course/Chat readers authoritative.
4. For Better Content only, add a browser extension/content-script path that reads rendered DOM the owner can already view.
5. Never read or forward Whop cookies, iframe JWTs, OAuth tokens, localStorage/sessionStorage credentials, or guessed private Better Content API responses.
6. Feed browser captures back into SniperPlug through the signed-in Control Center and the existing private guide review model.
7. Require explicit republishing-rights confirmation and manual owner review before publication.
8. Protect existing published, reviewed, removed, and unrelated user work from capture overwrites.
9. Add executable regressions, run the complete Node 22 suite, inspect the final diff/review state, merge only validated fixes, and then validate one real Better Content capture.

## Status
- PR #34 merged: removed false membership denial caused by the phone-gated member-detail recheck.
- PR #35 merged: fixed the Whop OAuth callback/login loop without weakening the Strict owner cookie.
- PR #36 merged: fixed stale source-access truth, duplicate membership loading, excessive discovery fan-out, and indefinite browser loading.
- PR #37 merged: corrected the current Whop Experiences `account_id` contract while preserving Forums `company_id`.
- PR #38 merged at `6a566393ecdf24ec3e429774481c9f7375efc75e`: replaced developer-only custom-app metadata lookup with user-OAuth-compatible public app metadata and exposed concrete reader-contract truth.
- Production after PR #38 proves `Make Money Here · Better Content` is discovered and membership access is confirmed, but Better Content advertises neither OpenAPI nor Skills through Whop.
- PR #39 (`feature/better-content-browser-capture`) implements the alternate authorized path requested by the owner: rendered Better Content DOM → extension queue → signed-in SniperPlug relay → private draft.
- PR #39 implementation head `bd04025a5772fb815eab8b6086a97948999fd38e` passed Verify SniperPlug #941, affiliate preview #65, and retired-route verification #59. Exact final-head validation remains after this task-record update.

## Findings / root cause
- This is no longer an OAuth, membership, discovery, or app-identification problem.
- The owner can open `Make Money Here` because Better Content is rendered inside the authenticated Whop browser experience.
- Better Content exposes no published server-readable OpenAPI/Skills contract through Whop, so the SniperPlug server cannot legitimately enumerate its private pages directly.
- The useful content nevertheless exists in the rendered DOM after Better Content authorizes the browser session.
- A content script can read that rendered DOM without stealing Whop credentials or probing undocumented Better Content endpoints.
- The safest bridge is therefore client-side capture plus a same-origin SniperPlug handoff, with the SniperPlug server independently re-verifying the owner, Whop session, exact experience, exact Better Content app ID, and current membership relationship before saving anything.

## Execution path
Native importer remains:
`Control Center` → Whop OAuth session → `/api/discover` → native Forum/Course/Chat source → `scanApprovedSource()` → normal review/import/publish.

Better Content browser capture in PR #39:
`Whop UI → Better Content rendered app frame → DOM-only MV3 content script → chrome.storage.session capture queue → SniperPlug Control Center relay → same-origin POST /api/browser-capture → requireAdmin + requireWhopSession → retrieve exact exp_... through Whop → require exact Better Content app ID app_zv9yxan92U9fNy → current membership check when Whop exposes company/product relation → sanitize + integrity/category checks → D1 private draft → normal SniperPlug owner review/publish`.

No Whop credential crosses from the Better Content frame to SniperPlug. The extension never calls the Whop API itself and never calls a guessed Better Content backend.

## Changes in PR #39
- Added `browser-extension/` Manifest V3 extension.
- Extension host permissions are limited to Whop app hosts and `sniperplug.com`; no `<all_urls>`.
- Extension permissions are `storage` and `tabs`; no `cookies` permission.
- Whop content script reads rendered DOM only; it contains no `fetch`, `document.cookie`, `chrome.cookies`, `localStorage`, or `sessionStorage` credential access.
- DOM renderer preserves headings, paragraphs, emphasis, code, links, images, blockquotes, lists, and tables as Markdown.
- Sensitive token/auth/session/signature/state/code/key query parameters are stripped from captured page/image URLs before persistence.
- Added single-page capture and bounded auto-capture queue for clicking through a Better Content section such as `Make Money Here`; max 25 queued pages.
- Queue lives in extension session storage so service-worker suspension does not discard it.
- Added SniperPlug Control Center relay that uses the existing signed-in same-origin browser session to POST the captures; the extension does not get a SniperPlug secret token.
- Added owner-only `/api/browser-capture` endpoint requiring same-origin request, admin session, and live Whop session.
- Added server capture importer pinned to exact Better Content app ID `app_zv9yxan92U9fNy`.
- Capture requires explicit rights confirmation.
- Captures create/update **private drafts only** with `autoPublishEligible: false` and `manualReviewCompleted: false`.
- Changed published, manually reviewed, or removed guides are held instead of overwritten; identical captures remain unchanged and duplicates are held.
- Captured image URLs are marked for review before publication rather than assumed durable.
- Added `tools/test-browser-capture-extension.mjs` and wired it into the normal build/audit chain.
- Added extension setup/security documentation in `browser-extension/README.md`.

## Validation / results
- [x] Production evidence confirms Better Content access but no published OpenAPI/Skills reader contract.
- [x] Extension requests no cookie or blanket-host permission.
- [x] Whop content script is DOM-only and contains no credential-reading or private-API fetch path.
- [x] Same-origin SniperPlug relay is the only network handoff for captured content.
- [x] Server re-verifies owner session, live Whop session, exact experience, and exact Better Content app ID before writes.
- [x] Current membership relationship is checked when Whop exposes company/product linkage without reintroducing a false denial when those optional fields are absent.
- [x] Existing rights-confirmation gate is preserved.
- [x] Captures cannot auto-publish and previously published/reviewed/removed work is protected from silent overwrite.
- [x] Sensitive URL query credentials are removed before persistence.
- [x] Executable browser-capture regression is part of `npm run audit` / `npm run build`.
- [x] Verify SniperPlug #941 passed the complete Node 22 build/regression suite on implementation head `bd04025a5772fb815eab8b6086a97948999fd38e`.
- [x] Affiliate preview #65 and retired public route verification #59 passed on the same implementation head.
- [ ] Exact final-head CI passes after this task-record update.
- [ ] PR #39 review/diff/branch state remains clean and current with `main`.
- [ ] PR #39 merges and post-merge `main` workflows pass.
- [ ] One real Better Content `Make Money Here` page is captured from an authorized browser frame and appears as a private SniperPlug draft.
- [ ] After one-page validation, auto-capture is tested across multiple `Make Money Here` pages without duplicates or accidental page-shell capture.

## Cleanup / conflicts
- No extra Whop OAuth scopes or phone permission.
- No weakening of owner-cookie security.
- No guessed Better Content private endpoints.
- No Whop iframe token/cookie theft or forwarding.
- No direct extension call to Whop API.
- No automatic publishing of browser-captured material.
- No unrelated site/database work is included.
- Existing native Whop readers, source decisions, review flow, D1 guide records, publishing checks, recovery, and backups remain intact.

## Blockers / risks
- CI cannot render the owner’s private Better Content iframe, so actual DOM shape and the first live `Make Money Here` capture still require a real browser validation.
- Better Content is a dynamic application, so its rendered DOM can evolve. The extractor intentionally favors semantic containers and generic Markdown rendering instead of brittle Better Content CSS selectors.
- Samsung Internet does not provide a normal arbitrary-unpacked-extension path for third-party MV3 development. Immediate live testing is easiest in desktop Chromium or another extension-capable browser; Samsung distribution would require Samsung’s extension approval/distribution path. This packaging limitation does not change SniperPlug’s server capture contract.
- The browser-capture path only covers content the owner actually opens/renders; it does not secretly enumerate unopened private Better Content pages through undocumented APIs.

## Backlog
- Issue #20 remains unrelated and locked out.
- Issue #25 remains the custom-app reader portion of this same importer outcome; Better Content browser capture is its first implemented non-API adapter.
- Other third-party Whop apps remain out of scope until Better Content capture is proven live and each app’s access/capture model is investigated separately.

## Next step
Require green CI on the exact PR #39 final head after this task-record update, inspect diff/review/branch state, merge only if clean, verify post-merge `main` workflows, then install/test the extension against **Hidden Files → Make Money Here** by capturing one individual page into the private SniperPlug draft queue before enabling multi-page auto-capture.
