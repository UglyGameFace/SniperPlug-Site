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
IN PROGRESS — expanded sync-engine implementation is being validated on PR #68. Do not merge until the exact final head is green and the final diff/review pass is clean.

## Root cause / findings
- The original fallback reader was deliberately DOM-only and passive: it captured only a guide the user had already opened.
- The first PR #68 implementation added safe automatic traversal, but final review showed more was required for a complete sync path: passive auto-capture could race traversal, session-only state could not survive browser restart, slow/lazy pages had no robust retry/preparation, and a repeat scan could not distinguish changed content from unchanged content.
- The server already has the correct trust boundary: current account/Whop authorization, supported reader/origin verification, 25-page/2.5MB batch limits, private-draft import, and protection for reviewed/published/removed work. Those server limits and authority must remain intact.

## Execution path
1. User opens the authorized Whop Better Content directory in Firefox.
2. The real HTTPS `*.apps.whop.com` frame registers as the only capture candidate; the top-level Whop shell remains ineligible.
3. Capture all disables passive capture, prepares the rendered DOM, discovers safe links, and recursively traverses the selected scope.
4. Background orchestration persists sanitized traversal/queue state, retries bounded failures, fingerprints captures, and queues only new/changed pages.
5. Successful handoff opens the signed-in SniperPlug Control Center; the relay sends the queue in unchanged server-safe 25-page chunks.
6. Only after every batch succeeds does the extension commit sync fingerprints and clear the queue.

## Changes
- Extension version: 0.2.0.
- Render preparation now opens safe details/expanders, scrolls boundedly for lazy rendering, waits for visible images, and captures bounded tab-panel content/links.
- Traversal rejects credential-bearing URLs instead of rewriting and navigating them.
- Recursive links remain confined to the exact app origin, Whop experience, and optional section path.
- Capture-all suspends Capture-as-I-browse to prevent directory-shell races.
- Traversal/queue/pending/history data uses extension local storage (with session fallback for test/runtime compatibility) and stores no Whop credentials.
- Interrupted tabs preserve progress for automatic reattachment to the same authorized experience.
- Slow/empty pages get at most three retries; skipped pages/reasons remain visible.
- Stable capture keys + content fingerprints classify new/changed/unchanged/duplicate pages; unchanged pages are not re-sent.
- Sync history is committed only after the entire handoff succeeds.
- Popup exposes scope, live progress, retries/failures, stop/resume, automatic handoff, and installed/latest extension version.
- Relay preserves the server's 25-page limit, sends larger queues sequentially, and retries only transient 429/5xx responses.
- `browser-extension-version.json` provides the current/minimum compatible extension version from SniperPlug's own origin.

## Validation / results
- Earlier PR #68 head `476ecd75822278534e031d99c439753bf9383a5c`: Verify SniperPlug #1085 passed the full repository suite and Firefox Android XPI packaging/upload; Cloudflare preview checks also passed.
- That green run covers the first-generation traversal implementation, not the expanded final sync-engine changes described above.
- New exact-head validation is required after these changes: full repository-native build/regression suite, Firefox Android package/upload, preview checks, traversal/change-detection/interruption regressions, and final diff/review inspection.

## Cleanup / conflicts
- No cookie permission, `<all_urls>`, Whop token forwarding, Whop browser-storage read, or Better Content private-API probing is allowed.
- No server batch-limit weakening is allowed; chunking remains client-side.
- No duplicate crawler implementation is being added; the existing PR #68 traversal path is being completed and consolidated.

## Blockers / risks
- Live Better Content markup can evolve. Traversal therefore relies on semantic rendered links and bounded safe controls rather than undocumented private endpoints.
- DOM-only capture cannot perform a scheduled rescan while the authorized content is not rendered in an open browser session; that remains a separate backlog item rather than a hidden credential workaround.

## Next step
Commit the expanded sync-engine changes atomically to PR #68, run exact-head CI/package/preview validation, inspect review threads and the final scoped diff, fix any failures on the same task, then merge only when the true Definition of Done is satisfied.
