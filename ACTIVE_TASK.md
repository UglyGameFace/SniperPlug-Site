# Active Task

## Task
Build an authorized Whop-to-SniperPlug content importer with secure OAuth, complete active-source discovery, explicit source and content approval, exact formatting preservation, safe links, file verification, private draft storage, category-aware review, duplicate/update protection, and explicit publishing to the SniperPlug website.

## Status
Active on `agent/whop-guide-importer`. The correct `UglyGameFace/SniperPlug-Site` Cloudflare Pages preview has the D1 binding, initialized schema, runtime secrets, multi-content importer, fitting categories, safe links, and a permanent green GitHub verification workflow.

## Scope
- Use Whop OAuth 2.1 with PKCE and `openid profile email forum:read courses:read chat:read member:basic:read member:email:read`; never collect or store a Whop password.
- Discover only current access-granting memberships: active, trialing, canceling, past_due, and completed.
- Hide canceled, expired, unresolved, and drafted historical membership records.
- Query each membership product independently so member-accessible experiences are not lost to company-wide enumeration restrictions.
- Treat Black Box, Black Box Clips, and Hidden Files as priority suggestions while requiring approval for every exact `exp_...` experience ID.
- Support official Whop read APIs for Forums, Courses, and Chat.
- Show custom/third-party app modules honestly as unsupported when Whop exposes no generic content API.
- Make source and content decisions obvious and reversible: Approve, Disapprove, Undo, Approve all ready, and Disapprove all.
- Preserve Unicode, emoji, punctuation, paragraphs, Markdown hard breaks, headings, lists, tables, links, blockquotes, and fenced code.
- Render safe Markdown and plain HTTP/HTTPS URLs as clickable links without linkifying code or allowing dangerous protocols.
- Repair only deterministic transport defects and block ambiguous corruption, unsafe rendered content, dangerous links, or malformed fences.
- Store OAuth tokens, source policies, content decisions, drafts, categories, and published guides in private Cloudflare D1 storage.
- Re-fetch approved content IDs from the correct live Whop API immediately before import; never trust source bodies submitted by browser JavaScript.
- Verify Whop file durability. Preserve permanent public files and flag private, signed, expiring, hosted-video, unready, or unverified files for replacement before publishing.
- Seed fitting SniperPlug guide categories, suggest a category from content, and allow custom category creation directly during import or draft editing.
- Require explicit republication-rights confirmation.
- Import as drafts only. Publishing requires a separate explicit owner action.
- Serve published guide indexes and detail pages from D1 while preserving the existing SniperPlug deal site.
- Maintain permanent regression tests and Cloudflare Pages validation.

## Findings
- `UglyGameFace/SniperPlug-Site` is the correct website repository and Cloudflare Pages deployment source.
- Whop membership access and importer OAuth permissions are separate. A connected user can see content in Whop while the importer still needs the matching API read scope.
- Existing categories in `data/deals.json` are deal categories, so guide categories use a separate owner-managed registry.
- The repository is public. Imported drafts remain in private D1 storage and are never committed as plaintext.
- Public Whop files can have permanent CDN URLs; private files and hosted course video playback use expiring or signed access and must not be silently published as durable links.
- Telegram, Discord, Wheels, and arbitrary third-party Whop apps require app-specific authorized APIs; there is no safe universal scraper fallback.

## Validation
- `npm run build` passes on GitHub Actions under Node 22.
- Full content audit covers Forums, Courses, Chat, files, safe links, formatting, categories, authoritative re-fetching, hidden drafts, and publishing isolation.
- Runtime audit covers D1, all required private secrets, all supported OAuth scopes, and both callback URLs.
- Discovery audit covers product-scoped enumeration, active membership filtering, unsupported-module diagnostics, priority groups, bulk controls, and mobile layout.
- Cloudflare Pages deployed the branch preview successfully from the latest validated branch.
- `SNIPERPLUG_DB` is configured through `wrangler.toml` with the owner-provided D1 database UUID.
- `migrations/0001_whop_guides.sql` was applied successfully; the database reports seven application tables.

## Cleanup
- Work is isolated to the correct `UglyGameFace/SniperPlug-Site` repository.
- Imported Whop content and runtime secrets remain outside GitHub.
- One permanent verification workflow owns branch, PR, and main validation.
- Obsolete forum-only discovery-loader code was removed.

## Remaining acceptance step
- Enable `courses:read` and `chat:read` in the Whop application, deploy the validated branch, disconnect and reconnect Whop once, then confirm active Forums, Courses, Chat, links, files, categories, draft import, and separate publishing in the Cloudflare preview.
- Republishing still requires ownership or explicit permission for every selected source item.

## Backlog
- Optional future enhancement: add authorized SniperPlug-owned object storage so private Whop files can be copied permanently after rights confirmation instead of requiring manual replacement.
- Do not switch tasks until the acceptance step is complete.
