# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and publishing workflow so SniperPlug imports real top-level guide content instead of user replies, chat chatter, raw links, product-card noise, duplicate posts, stale picks, and incorrectly categorized material. Restore visible publishing progress and replace the unbounded review wall with a usable queue.

## Status
Active on `agent/whop-guide-importer`. Implementation and regression coverage are updated. GitHub Actions, Cloudflare deployment, and live authenticated D1 acceptance are still required before this task can be called complete or merged.

## Scope
- Keep Whop OAuth, exact source approval, republication-rights confirmation, and private D1 storage intact.
- Read official Whop Forums, Courses, and Chat APIs without trusting browser-submitted source bodies.
- Import top-level durable guide content only; replies remain attached to their original Whop discussion.
- Keep Chat available for explicit manual review but never automatically publish it as standalone guides.
- Block raw URLs, identifiers, punctuation-only items, empty posts, expired picks, promotional chatter, placeholders, and weak unstructured forum content.
- Re-fetch every approved item immediately before import and re-run the quality policy on the exact content.
- Preserve authorized pictures, video, audio, PDFs, files, links, formatting, Unicode, and emoji through the existing media and integrity paths.
- Auto-fit categories without allowing ordinary words such as “online” or “line of credit” to become Sports Betting.
- Reconcile old imported drafts and published records across the full active queue, not only recent bulk-job output.
- Quarantine invalid and duplicate imports, remove them from normal review, and unpublish unsafe existing records.
- Keep owner-corrected drafts publishable after an explicit manual save.
- Show visible working, success, warning, and error states for “Audit & publish ready drafts.”
- Keep the normal review queue bounded, scrollable, one-column, and responsive on phone, tablet, and desktop.
- Maintain permanent regression tests and Cloudflare Pages validation.

## Findings
- Current Whop scans already filtered newly fetched forum replies and Chat replies, but old imported records remained in D1 and continued appearing in the dashboard and public guide index.
- The previous cleanup only inspected guide IDs from bulk jobs created within the last 72 hours, leaving older bad drafts and published junk untouched.
- The previous forum policy automatically accepted any post over 420 characters, even when it was a product listing, community comment, promotion, or other non-guide content.
- Legacy records could lack an explicit source type, so cleanup now derives Forum, Course, or Chat from the saved source key when necessary.
- The Sports Betting category expression contained `line\b`, which matched the end of “online” and forced unrelated product posts into Sports Betting.
- The resumable bulk workflow had a detailed progress bar, but the separate “Publish all ready drafts” path only changed a line of text and had no persistent visual evidence.
- Responsive CSS removed the draft-list height limit and changed it to two columns below 900px, creating the giant wall shown in the screenshots.
- `functions/_lib/guides.js` still contained a redundant older importer implementation even though the real runtime uses `guides-import.js` and `guides-media.js`.

## Changes
- Hardened content classification for forum replies, Chat, raw references, low-signal content, stale sports picks, chatter, placeholders, and unstructured product-style posts.
- Replaced recent-only cleanup with unified reconciliation of active imported drafts and published guides, including exact duplicate handling and D1 decision synchronization.
- Unified public detail-page cleanup with the same reconciliation used by the dashboard and public search.
- Rebuilt category matching with explicit bounded phrases and added retail-shopping coverage.
- Removed the obsolete duplicate importer from `guides.js`; active imports remain in `guides-import.js` and media preservation remains in `guides-media.js`.
- Added a visible publish-ready progress track and direct public-guides verification link.
- Defaulted Review & Publish to “Needs review,” removed the unusable rejected filter from the normal queue, and clarified what automatic quarantine removes.
- Added a bounded, scrollable one-column draft queue at every viewport.
- Expanded full importer and recovery audits to cover the reported regressions and the active runtime files.

## Validation
- Pending: `npm run build` on the branch under Node 22.
- Pending: JavaScript syntax validation for all Functions, browser scripts, and audits.
- Pending: targeted quality, category, cleanup, publishing-progress, responsive-layout, media, auth, discovery, bulk-job, and public-guide regression audits.
- Pending: Cloudflare Pages deployment of the final validated commit.
- Pending: authenticated preview acceptance against the connected Whop account and live D1 data.

## Cleanup
- Removed the redundant importer implementation from `functions/_lib/guides.js` instead of layering another policy patch over both import paths.
- Kept the compatibility reconciliation export so existing callers use the stronger cleanup without duplicate code.
- Kept quarantined records private and reversible rather than deleting source material.
- No temporary browser script, mock publishing state, or public plaintext content was added.

## Blockers
- The authenticated Control Center and private D1 contents cannot be acceptance-tested through GitHub alone. After Actions and Cloudflare succeed, the final pass must confirm the connected account’s queue shrinks correctly and a known valid guide appears on `/guides/` after publishing.

## Backlog
- None. Do not switch tasks until validation, deployment, authenticated acceptance, cleanup inspection, and conflict inspection are complete.
