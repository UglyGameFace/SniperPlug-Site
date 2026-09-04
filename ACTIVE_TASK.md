# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, retain legitimate membership access, discover every authorized experience, and actually import guide content. The current concrete target is **Hidden Files → Make Money Here → Better Content**, which production proves is viewable by the owner but exposes no published OpenAPI/Skills reader contract through Whop.

## Scope
1. Preserve the working owner auth, Whop OAuth, membership truth, discovery, native Forum/Course/Chat readers, and private publishing controls.
2. Do not request unrelated Whop scopes, weaken the Strict owner cookie, guess private Better Content endpoints, copy Whop cookies/iframe JWTs, inspect hidden network traffic, or forward Whop credentials to third-party origins.
3. Where no publisher API exists, allow an explicit owner-authorized browser helper to capture only the guide DOM already rendered on the owner’s device.
4. Captured app-specific content must enter SniperPlug as a private draft with clear provenance, never masquerade as a native `whop_posts` source, never auto-publish, and hold private/expiring media for review.
5. Add executable regressions, run the complete Node 22 suite, inspect diff/review state, merge only validated changes, and then verify one real Better Content capture against the production owner account.

## Status
- PR #34 merged: removed false membership denial caused by the phone-gated member-detail recheck.
- PR #35 merged: fixed the Whop OAuth callback/login loop without weakening the Strict owner cookie.
- PR #36 merged: fixed stale source-access truth, duplicate membership loading, excessive discovery fan-out, and indefinite source loading.
- PR #37 merged: corrected Whop Experiences `account_id` while preserving Forums `company_id`.
- PR #38 merged at `6a566393ecdf24ec3e429774481c9f7375efc75e`: custom apps now use Whop’s user-OAuth-compatible public app metadata and report the actual reader-contract state.
- Production screenshot after PR #38 proves `Make Money Here · Better Content` resolves to **Access confirmed · no published reader contract**. Discovery and membership access are therefore no longer the blocker.
- PR #40 (`feat/authorized-page-import`) implements the fallback that changes actual importability: explicit rendered-page capture from a Whop app page the owner can already open.
- Initial PR #40 head `1ade14f99b43bd0c5ff692486d3d7da11d32192f` passed the complete Node 22 build/regression suite in Verify SniperPlug #943; affiliate preview #67 and retired-route verification #61 also passed. This task-record update now requires exact-final-head validation.

## Root cause
- Better Content is a third-party Whop app. Whop confirms the owner’s membership and experience access, but the app does not advertise an OpenAPI or Skills/member-reader contract through Whop.
- The owner can still view the content because Better Content runs in the authorized browser/app context and renders the private guide there.
- SniperPlug’s server OAuth bearer is not the Better Content iframe credential and must not be transformed into one or forwarded to the app.
- Therefore the remaining safe path is to capture content **after it has already been rendered for the authorized owner**, not to bypass Better Content’s authentication or scrape hidden requests.

## Execution path after PR #40
Normal importer remains:
`Control Center owner auth → Whop OAuth → current memberships → discovery → native Forum/Course/Chat reader → scan → review → private draft → publish`.

App-specific fallback:
`Control Center owner auth + live Whop session + explicit rights confirmation → POST /api/capture-session → 30-minute hashed capture bearer → Tampermonkey helper running only on Whop app hosting → deliberate “Import to SniperPlug” click → rendered DOM clone → Markdown + visible image URLs → POST /api/capture-page with SniperPlug capture bearer → integrity normalization → private guide draft with browser-capture provenance → manual review → optional publish`.

## Changes in PR #40
- Added `functions/_lib/authorized-page-capture.js`.
  - 30-minute token TTL, 100-use ceiling, D1 stores only SHA-256 token hashes.
  - Allowed capture origins are derived from resolved Whop app capability metadata, with Whop-owned app hosting recognized explicitly.
  - Capture bearer use is checked and incremented atomically.
  - Input is limited to an HTTPS current-page URL, rendered title/Markdown, optional visible experience/app IDs, and bounded HTTPS image URLs.
  - Captured guides use `source_key = NULL`; browser capture is never forged into the `whop_posts` foreign-key path.
  - Existing page captures update their draft; exact unchanged content is idempotent; duplicate matching guide content is held rather than copied again.
  - `autoPublishEligible: false` and `manualReviewCompleted: false` force review.
  - Captured image URLs increment attachment `reviewCount` and are blocked by the existing publish guard until resolved.
- Added owner-only `POST /api/capture-session`.
  - Requires same-origin Control Center request, owner session, live Whop session, and explicit content-rights confirmation.
- Added bearer-authenticated `POST /api/capture-page` for the cross-origin userscript payload. It does not depend on the Strict owner cookie.
- Added `sniperplug-capture.user.js`.
  - Tampermonkey helper limited to `*.apps.whop.com` and `*.whop.site`.
  - Requires explicit `Import to SniperPlug` click.
  - Reads the rendered DOM only and converts headings, paragraphs, lists, links, images, code, blockquotes, and basic tables to Markdown.
  - Does not read `document.cookie`, local/session storage, Whop iframe tokens, or intercept fetch/XHR/network responses.
  - Sends only to `https://sniperplug.com/api/capture-page` using the dedicated SniperPlug capture bearer.
- Added Control Center pairing UI (`control-center-capture.js` / CSS) with rights confirmation, token generation/copy, Android Tampermonkey install link, and expiration status.
- Added `migrations/0007_browser_capture_sessions.sql`; runtime self-creation keeps mixed deployments fail-safe.
- Made the installable userscript explicitly `no-store` so browser helper and backend cannot drift behind stale caching.
- Added `tools/test-authorized-page-capture.mjs` to the normal build.

## Validation / results
- [x] Production confirms Better Content access exists but no published reader contract is exposed.
- [x] Branch diff is limited to the authorized capture path; `control-center/index.html` differs from `main` by only the two intended asset includes.
- [x] Existing publish code blocks any capture with unresolved `attachment_json.reviewCount`.
- [x] Bulk publish continues to select only native imported drafts with non-null `source_key`, so browser captures cannot enter Whop bulk auto-publish.
- [x] Executable regression parses both browser scripts and rejects cookie/storage/iframe-token/network interception behavior.
- [x] Regression verifies owner + live Whop + rights confirmation before token minting.
- [x] Regression verifies 30-minute TTL, token hashing, use bound, provenance, no native source-key forgery, manual-review hold, media-review hold, migration/UI/cache wiring, and that the raw token is not persisted.
- [x] First CI attempt exposed an old private-guide static audit conflict caused only by middleware source shape. Middleware was restructured so the existing private no-store condition remains intact while the userscript gets its own no-store branch.
- [x] Verify SniperPlug #943 passed the complete Node 22 suite on implementation head `1ade14f99b43bd0c5ff692486d3d7da11d32192f`.
- [x] Affiliate preview #67 and retired-route verification #61 passed on the same head.
- [ ] Exact final-head CI passes after this task-record update.
- [ ] PR #40 remains 0 behind `main`, with no review conflicts and only task-relevant changes.
- [ ] PR #40 merges and post-merge `main` workflows pass.
- [ ] Production owner installs the helper in Firefox for Android + Tampermonkey, opens **Make Money Here**, captures one actual Better Content guide, and sees the resulting private SniperPlug draft.
- [ ] Captured Markdown and media review behavior are inspected against the real Better Content DOM before expanding capture to additional pages/sections.

## Cleanup / conflicts
- No extra Whop OAuth scopes or phone permission.
- No weakening of the owner-cookie security model.
- No Better Content endpoint guessing, iframe-token extraction, Whop cookie copying, hidden network interception, or third-party credential forwarding.
- No permissive CORS was added; Tampermonkey uses its explicit `GM_xmlhttpRequest` permission to the single SniperPlug endpoint.
- The old unused developer-only `inspectWhopApp()` export remains in the large shared `whop.js` module. Active caller search shows discovery uses `whop-app-reader.js`; rewriting the entire shared OAuth/runtime file solely to remove this unreachable fossil would add unnecessary risk. Existing regression prevents the active path from returning to it.

## Blockers / risks
- CI cannot reproduce the owner’s private Better Content DOM, so the final DOM-shape validation must happen once against the real Make Money Here page after deployment.
- Better Content may render long pages inside a nested scroll container or virtualized editor. The helper performs a bounded lazy-content scroll and chooses the most content-dense rendered root, but the first real capture determines whether app-specific DOM tuning is needed.
- Authenticated image URLs may be private/expiring. They are intentionally held for review instead of being treated as permanent publishable media.

## Backlog
- Issue #20 remains unrelated and locked out.
- Issue #25 remains the umbrella for app-specific Whop readers/capture adapters; Better Content is the active concrete target.

## Next step
Require green CI on the exact PR #40 final head, inspect branch/review state, merge only if clean, confirm post-merge `main` workflows, then perform one real **Make Money Here → Import to SniperPlug** capture on Android Firefox/Tampermonkey and inspect the resulting private draft before broadening the helper.
