# Active Task

## Active task / outcome
Repair the Whop importer end to end so the owner can connect Whop, retain legitimate membership access, discover every authorized Whop experience, and actually scan/import every content type for which a documented member-readable interface exists. The current concrete target is **Hidden Files → Make Money Here → Better Content**.

## Scope
1. Trace owner auth -> Whop OAuth -> membership snapshot -> experience discovery -> live access truth -> custom-app capability metadata -> reader selection -> scan/import.
2. Preserve the strict owner-session security model and current-membership filters.
3. Use current documented Whop contracts only; no guessed endpoint aliases, private-session scraping, unrelated OAuth scopes, or third-party credential leakage.
4. Keep native Forum/Course/Chat readers authoritative.
5. Keep custom app experiences visible even when no safe reader exists, and distinguish valid membership access from reader availability.
6. For custom apps, inspect only public/documented app capability metadata that the connected user OAuth session is allowed to read.
7. If a custom app publishes an authorized OpenAPI/Skills/member-reader contract, implement an adapter against that contract. If it does not, report `access confirmed · no published reader contract` rather than pretending discovery equals importability.
8. Add executable regressions, run the complete Node 22 suite, inspect final diff/review state, merge only validated fixes, and confirm behavior against the real owner account.

## Status
- PR #34 merged: removed the false membership denial caused by the phone-gated member-detail recheck.
- PR #35 merged: fixed the Whop OAuth callback/login loop without weakening the Strict owner cookie.
- PR #36 merged: fixed stale source-access truth, duplicate membership loading, excessive discovery fan-out, and indefinite browser loading.
- PR #37 merged at `b4a11cb1c07468d72f6c32ad0d2a7860d487938d`: corrected the current Whop Experiences `account_id` query contract while preserving Forums `company_id`. Post-merge Verify SniperPlug #937 passed.
- The owner’s production screenshot after PR #37 proved **Make Money Here / Better Content was already visible before the recent discovery changes**. Therefore visibility was never the unresolved success criterion. The real defect is that app-specific modules still have no reader selected and cannot be imported.
- PR #38 (`fix/whop-custom-app-reader-metadata`) now targets the real next layer: resolve a custom app’s published reader capability using a user-OAuth-compatible Whop endpoint instead of the developer-management endpoint that normal customer OAuth cannot use.
- PR #38 implementation head `6a2a5f59354427f041e2d832f37676c52982c8d4` passed Verify SniperPlug #938, affiliate preview #63, and retired-route verification #56. This task-record update now requires exact-final-head validation.

## Findings / root cause
- The connected Hidden Files membership is valid.
- `Make Money Here` is discovered correctly and Whop identifies it as **Better Content**. The same source browser already shows other custom apps such as Content and Hidden Files Onboarding.
- The existing item reader supports only native `forum`, `course`, and `chat`; app-specific experiences cannot enter `listExperienceItemsLite()` as readable sources.
- Before PR #38, custom-app capability enrichment called `GET /apps/{id}` from `functions/_lib/whop.js`. That is a developer-management surface and is not a valid metadata authority for an ordinary customer OAuth session connected to a third-party app.
- The old helper swallowed any app-metadata error and returned `null`. Discovery then cached `unsupported` plus empty app metadata for up to 24 hours, leaving every custom card on the same generic `Native API probe completed` explanation even when Whop may publish a reader interface.
- Whop’s user-OAuth-compatible `GET /apps` list exposes public app metadata including stable app ID, origin/hosted route, `experience_path`, `openapi_path`, and `skills_path` when published.
- App-name search alone is not trustworthy. SniperPlug must accept capability metadata only when the returned stable `app_...` ID exactly matches the app ID attached to the experience.
- A published path is only capability metadata. SniperPlug must not send the owner’s Whop OAuth bearer token to a third-party app origin unless that publisher’s documented authorization contract explicitly requires and supports such a token flow.

## Execution path
Connection:
`/api/whop/oauth/start` -> Whop -> `/api/whop/oauth/callback` -> canonical owner Whop session.

Discovery:
`/api/discover` -> one membership snapshot -> current membership companies/products -> Whop Experiences/Forums inventory -> exact experience dedupe -> native Course/Forum/Chat capability probe -> native source or app-specific source.

Custom-app capability path in PR #38:
app-specific experience -> `inspectWhopApp()` from `whop-app-reader.js` -> `GET /apps?query=<app name>&first=25` with the existing Whop user OAuth token -> exact stable app-ID match -> normalize public HTTPS origin + experience/OpenAPI/Skills paths -> capability cache -> explicit reader-contract state.

Legacy cache repair:
fresh 24-hour `unsupported` capability row with old/empty metadata -> one public app-list enrichment -> rewritten capability row with `metadataSource: public-app-list` instead of waiting for TTL expiry.

Native scan/import remains:
`scanApprovedSource()` -> `listExperienceItemsLite()` -> Forum/Course/Chat reader -> normalize/integrity -> D1 -> review/import/publish.

Future Better Content reader, only if a documented contract exists:
Better Content experience -> published reader contract inspection -> explicit compatible auth -> app adapter -> normalized SniperPlug item model -> existing scan/integrity/review pipeline.

## Changes in PR #38
- Added `functions/_lib/whop-app-reader.js` as the single custom-app capability metadata owner.
- Custom metadata uses Whop `GET /apps` with user OAuth, not developer-only `GET /apps/{id}`.
- Results are searched by app name but accepted only on exact stable app ID.
- Public metadata is normalized to safe HTTPS experience/OpenAPI/Skills URLs.
- Added a short in-process metadata cache to avoid duplicate app-list requests for repeated cards.
- Legacy capability-cache rows without the new public metadata marker self-heal immediately during discovery.
- Custom source reasons now distinguish:
  - `Access confirmed · published OpenAPI contract found`
  - `Access confirmed · published Skills interface found`
  - `Access confirmed · no published reader contract`
  - `Access confirmed · reader metadata unavailable`
- No Whop OAuth token is forwarded to the custom app origin.
- Added `tools/test-whop-app-reader.mjs` and wired it into the normal build/audit chain.

## Validation / results
- [x] Owner production screenshot confirms `Make Money Here · Better Content` was already present; discovery visibility is no longer treated as the unresolved outcome.
- [x] Current Whop app metadata contracts inspected before implementation.
- [x] PR #38 custom-app helper uses only `GET /apps`, never developer-only `GET /apps/{id}`.
- [x] Exact app-ID matching is enforced after name search.
- [x] Safe HTTPS normalization is enforced for published experience/OpenAPI/Skills paths.
- [x] Missing or denied public metadata remains reader-unavailable and does not become false membership denial.
- [x] Existing 24-hour unsupported rows have a bounded self-heal path to the new metadata authority.
- [x] Executable custom-app reader regression is part of `npm run audit` / `npm run build`.
- [x] Verify SniperPlug #938 passed the complete Node 22 build/regression suite on implementation head `6a2a5f59354427f041e2d832f37676c52982c8d4`.
- [x] Affiliate preview #63 and retired public route verification #56 passed on the same implementation head.
- [ ] Exact final-head CI passes after this task-record update.
- [ ] PR #38 review/diff/branch state remains clean and current with `main`.
- [ ] PR #38 merges and post-merge `main` workflows pass.
- [ ] Production Refresh sources changes **Make Money Here** from the old generic explanation to one concrete reader-contract state.
- [ ] If Better Content advertises OpenAPI or Skills, inspect that exact published contract and implement the real adapter if its authorization model is compatible.
- [ ] If Better Content publishes no usable reader contract, preserve explicit `access confirmed · no published reader contract` and record the publisher/API dependency rather than inventing a private endpoint.
- [ ] One native source scan/import succeeds against the real owner account.

## Cleanup / conflicts
- No extra OAuth scopes or phone permission.
- No weakening of owner-cookie security.
- No guessed Whop aliases or duplicate discovery implementation.
- No Better Content private endpoint guesses, iframe scraping, or third-party token forwarding.
- No unrelated UI/site/database work is included.
- The old exported `inspectWhopApp()` implementation remains physically present in `whop.js`, but PR #38 discovery no longer imports it. Default-branch caller search found only the old discovery caller plus the definition. Removing that dead export requires a safe full-file edit of the large shared OAuth/runtime module; it is not being riskily rewritten through a whole-file connector update solely for cosmetic cleanup. The executable regression prevents the active custom-app path from returning to that developer-only endpoint.

## Blockers / risks
- CI cannot see the owner’s private Better Content experience metadata, so it cannot tell us whether Better Content itself currently publishes an OpenAPI or Skills interface. The production connected account must provide that final capability result after deployment.
- Access to a Whop product does not automatically grant a server-side API for a third-party app’s private content store.
- A public OpenAPI/Skills path still needs an explicit supported authorization contract before SniperPlug can read private member content from that app.

## Backlog
- Issue #20 remains unrelated and locked out.
- Issue #25 is the custom-app reader portion of this same importer outcome, with Better Content as the first concrete target.

## Next step
Require green CI on the exact PR #38 final head, inspect diff/review/branch state, merge only if clean, verify post-merge `main` workflows, then refresh Hidden Files in production and use the concrete **Make Money Here** reader-contract result to either implement the documented Better Content adapter or prove the publisher/API dependency explicitly.
