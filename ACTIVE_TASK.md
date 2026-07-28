# Active Task

## Task
Build an authorized Whop-to-SniperPlug forum-post importer with secure OAuth, explicit source and post approval/disapproval, exact formatting preservation, private draft storage, category-aware review, duplicate/update protection, and explicit publishing to the SniperPlug website.

## Status
Active on `agent/whop-guide-importer`. The SniperPlug Cloudflare Pages preview now has the D1 database binding, the migration has been applied, and the owner configured the Control Center password and session-signing secret for runtime testing.

## Scope
- Use Whop OAuth 2.1 with PKCE and `openid profile email forum:read`; never collect or store a Whop password.
- Treat Black Box and Hidden Files as built-in source suggestions while requiring approval for every exact `exp_...` experience ID.
- Allow additional exact Whop groups to be approved later.
- Make source and post decisions obvious and reversible: Approve, Disapprove, Undo, Approve all ready, and Disapprove all.
- Scan only top-level Whop forum posts through the official API with complete cursor pagination.
- Preserve Unicode, emoji, punctuation, paragraphs, Markdown hard breaks, headings, lists, tables, links, blockquotes, and fenced code.
- Repair only deterministic transport defects and block ambiguous corruption, unsafe rendered content, dangerous links, or malformed fences.
- Store OAuth tokens, source policies, post decisions, drafts, categories, and published guides in private Cloudflare D1 storage.
- Re-fetch approved post IDs from Whop immediately before import; never trust post bodies submitted by browser JavaScript.
- Verify Whop attachment durability. Preserve permanent public files and flag private/expiring files for re-upload before publishing.
- Require explicit republication-rights confirmation.
- Import as drafts only. Publishing requires a separate explicit owner action.
- Serve published guide indexes and detail pages from D1 while preserving the existing SniperPlug deal site.
- Add targeted tests, repository audits, Cloudflare Pages validation, cleanup, conflict inspection, setup documentation, and a draft PR.

## Findings
- `UglyGameFace/SniperPlug-Site` is the correct website repository and Cloudflare Pages deployment source.
- Existing categories in `data/deals.json` are deal categories, so guide categories use a separate owner-managed registry.
- The repository is public. Imported drafts remain in private D1 storage and are never committed as plaintext.
- Cloudflare Pages Functions use the `SNIPERPLUG_DB` D1 binding for private drafts and published guide data.
- Public Whop files can have permanent CDN URLs; private files use expiring signed URLs and must not be silently published as durable links.

## Validation
- Complete importer audit and Cloudflare preview build passed.
- `SNIPERPLUG_DB` is configured through `wrangler.toml` with the owner-provided D1 database UUID.
- `migrations/0001_whop_guides.sql` was applied successfully; the database reports seven application tables.
- Control Center password and session-secret configuration reached the preview setup stage.
- This commit intentionally triggers a fresh Cloudflare preview so the newly saved encrypted secrets are loaded by Pages Functions.

## Cleanup
- Work is isolated to the correct `UglyGameFace/SniperPlug-Site` repository.
- Imported Whop content and runtime secrets remain outside GitHub.

## Blockers
- Confirm the fresh preview accepts the configured Control Center password.
- Configure and validate `WHOP_CLIENT_ID`, `WHOP_TOKEN_SECRET`, `WHOP_REDIRECT_URI`, and `WHOP_OAUTH_SCOPES` before testing Whop OAuth.
- Republishing still requires ownership or explicit permission for the source posts.

## Backlog
- Empty. Do not switch tasks until the SniperPlug importer, guide publishing flow, validation, cleanup, preview, and deployment checks are complete.
