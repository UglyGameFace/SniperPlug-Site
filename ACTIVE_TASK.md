# Active Task

## Task
Build an authorized Whop-to-SniperPlug forum-post importer with secure OAuth, explicit source and post approval/disapproval, exact formatting preservation, private draft storage, category-aware review, duplicate/update protection, and explicit publishing to the SniperPlug website.

## Status
Active on `agent/whop-guide-importer`. The real SniperPlug site is a static Cloudflare Pages project with no existing guide CMS. The importer will add a private D1-backed guide system without exposing drafts in this public repository.

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
- `UglyGameFace/SniperPlug-Site` is the correct website repository. It is currently a static Cloudflare Pages deal site with one redirect Function and no guide CMS or owner Control Center.
- Existing categories in `data/deals.json` are deal categories, so guide categories need a separate owner-managed registry rather than silently forcing forum posts into a product category.
- The repository is public. Committing imported drafts as plaintext would expose paid/private Whop content even if the pages were hidden. Drafts must remain in private platform storage.
- Cloudflare Pages Functions support D1 bindings and encrypted secrets. D1 can hold both private drafts and published guide content without requiring a rebuild.
- Public Whop files can have permanent CDN URLs; private files use expiring signed URLs and must not be silently published as durable links.

## Validation
- Current SniperPlug repository, deployment model, deal data, navigation, security headers, redirect Function, and static filters inspected.
- Official Cloudflare Pages Functions, D1 bindings/migrations, and Web Crypto documentation verified.
- Implementation and tests pending.

## Cleanup
- The earlier draft PR in `UglyGameFace/Hidden-files` targets The 420 Lobby and must not be merged. It will be closed after the correct SniperPlug implementation is safely established.
- No SniperPlug production files have been changed yet.

## Blockers
- Live acceptance will require a Cloudflare D1 database bound as `SNIPERPLUG_DB`, the included migration applied, Whop app credentials, and private Cloudflare secrets.
- Republishing still requires ownership or explicit permission for the source posts.

## Backlog
- Empty. Do not switch tasks until the SniperPlug importer, guide publishing flow, validation, cleanup, preview, and deployment checks are complete.
