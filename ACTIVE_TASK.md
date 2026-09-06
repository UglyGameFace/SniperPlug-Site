# Active Task

## Active task / outcome
PR #68 — resilient authorized Better Content sync engine for Firefox, allowing an owner to open a rendered directory once and capture all accessible guides without manually opening every page.

## Scope
Completed in this task:
- recursive rendered-directory/category/subcategory traversal;
- safe same-origin/same-experience navigation and optional section scope;
- lazy/collapsed/tabbed content preparation, bounded scrolling, and image settling;
- persisted traversal/queue state with Firefox Android interruption recovery;
- bounded per-page retries and visible failure diagnostics;
- stable page/content fingerprinting, dedupe, and new/changed/unchanged detection;
- live progress, safe stop/resume, and optional automatic handoff;
- server-safe sequential batch handoff with transient retry;
- extension version/update awareness;
- regression coverage, Firefox Android packaging, final diff/review cleanup, merge, and post-merge validation.

Out of scope / backlog:
- readers for unrelated Whop app families not already authorized by the reader registry;
- scheduled/background rescans while no authorized rendered Whop session is open;
- unrelated Control Center/importer redesigns.

## Status
COMPLETE AND MERGED — PR #68 was squash-merged into `main` as `5576d3bb4f289f9c516e2aa305df3fba4223bf2b` after the final PR head `b71307f0c2730c15e9a462d9c55a2d0857f313bf` passed the full merge gate.

## Root cause / findings
- The original fallback reader was deliberately DOM-only and passive, so it captured only a guide the user had already opened.
- A complete sync path also required interruption recovery, slow/lazy render preparation, recursive traversal, bounded retries, repeat-scan change detection, diagnostics, and a safe large-queue handoff.
- The server remains the authoritative browser-capture validator for account/Whop access, supported reader/origin verification, request/per-page/total-byte limits, private-draft import, and reviewed/published/rejected/removed protections. Those policies were not duplicated or weakened in the extension.

## Execution path
1. User opens an authorized Whop Better Content directory in Firefox.
2. The real HTTPS `*.apps.whop.com` frame registers as the capture candidate; the Whop shell remains ineligible.
3. Capture all suspends passive capture, prepares the rendered DOM, discovers safe links, and recursively traverses the selected scope.
4. Background orchestration persists sanitized progress, retries bounded failures, fingerprints captures, and queues only new/changed pages.
5. The signed-in SniperPlug Control Center relay sends the queue in server-safe batches.
6. Fingerprint history is committed and the queue cleared only after the entire handoff succeeds.

## Changes
- Extension version: 0.2.0.
- Safe render preparation for details/expanders, bounded lazy scrolling, visible-image settling, and bounded tab panels.
- Exact app-origin/same-experience traversal confinement plus optional section subtree restriction.
- Credential-bearing and auth/account/admin/billing/checkout/support routes rejected before navigation.
- Persistent sanitized traversal/queue/pending/history state with Firefox Android tab replacement recovery.
- At most three retries for slow/empty pages, with skipped-page reasons retained.
- Stable page keys and content fingerprints classify new/changed/unchanged/duplicate captures; unchanged pages are not re-sent.
- Live progress, diagnostics, stop/resume, section scope, optional auto-send, and installed/latest extension version UI.
- Sequential large-queue relay with retries only for transient 429/5xx failures.
- `browser-extension-version.json` version contract hosted on SniperPlug's own origin.

## Validation / results
- Final PR head `b71307f0c2730c15e9a462d9c55a2d0857f313bf`: **Verify SniperPlug #1087 passed**, including the full repository build/regression suite, Firefox Android XPI packaging, and artifact upload.
- Final PR-head Firefox artifact `sniperplug-firefox-android-xpi` SHA-256: `2b552286412b75cc59ccb56436698997e5458be8f444246f812827c87a34dd33`.
- Final PR head also passed **Verify affiliate-ready preview #136**, **Verify retired public deal routes #138**, Cloudflare Pages deployment, both Vercel project deployments, and Vercel Preview Comments with zero unresolved feedback.
- Final PR review inspection found no inline review threads and no submitted reviews.
- PR #68 squash merge commit: `5576d3bb4f289f9c516e2aa305df3fba4223bf2b`.
- Post-merge `main`: **Verify SniperPlug #1088 passed**, **Verify production guide privacy #100 passed**, **Verify affiliate-ready production #96 passed**, and **Verify retired public deal routes #139 passed**.
- Cloudflare Pages deployed merge commit `5576d3b` successfully.
- The two post-merge Vercel deployment statuses were rejected by Vercel's account build-rate limit (`upgradeToPro=build-rate-limit`), not by an application build/test failure. The identical final PR content had already passed both Vercel deployments before merge.

## Cleanup / conflicts
- No cookie permission, `<all_urls>`, Whop token forwarding, Whop browser-storage credential read, or Better Content private-API probing was introduced.
- No second crawler or alternate authorization path was introduced; the existing traversal path was completed and consolidated.
- No server capture limit was weakened.
- No debug code, conflict markers, secret-bearing changes, or unrelated redesigns were found in the final scoped diff.

## Blockers / risks
- No implementation blocker remains for PR #68.
- Live Better Content markup can evolve, so traversal intentionally relies on semantic rendered links and bounded safe controls instead of undocumented private endpoints.
- DOM-only capture cannot schedule rescans without an authorized rendered browser session; that remains backlog rather than a credential workaround.
- A server-rejected capture remains queued for retry because pending/history cleanup happens only after complete successful handoff.

## Next step
No additional implementation work remains for PR #68. Select the next task separately so unrelated work does not leak into this completed scope.
