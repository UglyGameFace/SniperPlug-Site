# Active Task

## Active task / outcome
PR #68 — turn the Better Content Firefox extension into a resilient authorized content-sync engine so an owner can open a rendered directory once and capture all accessible guides without manually opening every page.

## Scope
In scope for this task:
- recursive rendered-directory/category/subcategory traversal;
- safe same-origin/same-experience navigation and section scope;
- lazy/collapsed/tabbed content preparation, bounded scrolling, and image settling;
- persisted queue/traversal state with Firefox Android interruption recovery;
- bounded per-page retries and exact failure diagnostics;
- stable page/content fingerprinting, dedupe, and new/changed/unchanged detection;
- live progress, safe stop/resume, and one-click automatic handoff;
- server-safe sequential batch handoff with transient retry;
- extension version/update awareness;
- regression coverage, packaging, final diff/review cleanup, merge, and post-merge validation.

Out of scope / backlog:
- readers for unrelated Whop app families that are not already authorized by the existing reader registry;
- scheduled/background rescans while no authorized rendered Whop session is open;
- unrelated Control Center/importer redesigns.

## Status
READY FOR FINAL MERGE GATE — implementation scope is complete and the expanded implementation head `73e2f8ecd11c53c5b6897cd72a33d178e8766baf` passed its full exact-head validation. This task-record update is bookkeeping only; its resulting exact head must repeat the required checks before merge.

## Root cause / findings
- The original fallback reader was deliberately DOM-only and passive: it captured only a guide the user had already opened.
- The first PR #68 implementation added safe automatic traversal, but final review showed more was required for a complete sync path: passive auto-capture could race traversal, session-only state could not survive browser restart, slow/lazy pages had no robust retry/preparation, and a repeat scan could not distinguish changed content from unchanged content.
- The server remains the authoritative browser-capture validator for current account/Whop access, supported reader/origin verification, the 25-page request limit, per-page and total-byte limits, private-draft import, and protection for reviewed/published/rejected/removed work. The extension deliberately does not duplicate those server policy limits.

## Execution path
1. User opens the authorized Whop Better Content directory in Firefox.
2. The real HTTPS `*.apps.whop.com` frame registers as the only capture candidate; the top-level Whop shell remains ineligible.
3. Capture all disables passive capture, prepares the rendered DOM, discovers safe links, and recursively traverses the selected scope.
4. Background orchestration persists sanitized traversal/queue state, retries bounded failures, fingerprints captures, and queues only new/changed pages.
5. Successful handoff opens the signed-in SniperPlug Control Center; the relay sends the queue in unchanged server-safe batches.
6. Only after every batch succeeds does the extension commit sync fingerprints and clear the queue.

## Changes
- Extension version: 0.2.0.
- Render preparation opens safe details/expanders, scrolls boundedly for lazy rendering, waits for visible images, and captures bounded tab-panel content/links.
- Traversal rejects credential-bearing URLs instead of rewriting and navigating them.
- Recursive links remain confined to the exact app origin, Whop experience, and optional section path.
- Capture-all suspends Capture-as-I-browse to prevent directory-shell races.
- Traversal/queue/pending/history data uses extension local storage with session fallback for compatibility and stores no Whop credentials.
- Interrupted tabs preserve progress for automatic reattachment to the same authorized experience.
- Slow/empty pages get at most three retries; skipped pages/reasons remain visible.
- Stable capture keys + content fingerprints classify new/changed/unchanged/duplicate pages; unchanged pages are not re-sent.
- Sync history is committed only after the entire handoff succeeds.
- Popup exposes scope, live progress, retries/failures, stop/resume, automatic handoff, and installed/latest extension version.
- Relay preserves the server's 25-page authority, sends larger queues sequentially, and retries only transient 429/5xx responses.
- `browser-extension-version.json` provides the current/minimum compatible extension version from SniperPlug's own origin.

## Validation / results
- Earlier first-generation traversal head `476ecd75822278534e031d99c439753bf9383a5c`: Verify SniperPlug #1085 passed its repository suite and Firefox Android packaging, while its two Vercel deployment statuses failed only because Vercel hit its build-rate limit.
- Expanded implementation head `73e2f8ecd11c53c5b6897cd72a33d178e8766baf`: **Verify SniperPlug #1086 passed**, including the full repository build/regression suite, Firefox Android XPI packaging, and artifact upload.
- Exact-head Firefox artifact `sniperplug-firefox-android-xpi` was uploaded successfully with SHA-256 `f2bbceca802f3a63a1823d0d6106fe8ce958ad63613e18b67312b32b3e8d0c6f`.
- **Verify affiliate-ready preview #135 passed** and **Verify retired public deal routes #137 passed** on the expanded exact head.
- Cloudflare Pages deployed the expanded exact head successfully.
- Both Vercel project deployments passed on the expanded exact head, and Vercel Preview Comments reported zero unresolved feedback.
- Final review inspection found no inline review threads and no submitted reviews.
- Final changed-file scope is limited to the extension, its version contract/documentation/regressions, `package.json` audit wiring, and this active-task record. No server capture limit was weakened.

## Cleanup / conflicts
- No cookie permission, `<all_urls>`, Whop token forwarding, Whop browser-storage credential read, or Better Content private-API probing was introduced.
- No second crawler or alternate authorization path was introduced; the existing PR #68 traversal path was completed and consolidated.
- The server remains authoritative for capture-size/request validation, avoiding a second drift-prone policy implementation in the extension.
- No debug code, conflict markers, secret-bearing changes, or unrelated application redesigns were found in the final scoped diff inspection.

## Blockers / risks
- Live Better Content markup can evolve. Traversal therefore relies on semantic rendered links and bounded safe controls rather than undocumented private endpoints.
- DOM-only capture cannot perform a scheduled rescan while the authorized content is not rendered in an open browser session; that remains backlog rather than a credential workaround.
- A server-rejected capture (for example an oversized single page) remains in the extension queue for retry because pending/history cleanup occurs only after complete successful handoff.

## Next step
Require the bookkeeping-only exact head created by this update to repeat the repository-native build/regression suite, Firefox Android package/upload, preview/deployment checks, and final review-thread/diff gate. If green, squash-merge PR #68 using the exact head SHA, then verify the resulting `main` commit before declaring the task complete.
