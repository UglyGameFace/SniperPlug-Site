# Whop to SniperPlug importer

The private importer is available at `/control-center/`. It uses Whop OAuth and official Whop APIs. It never asks for a Whop password.

## Supported Whop content

SniperPlug automatically discovers active membership products and their experiences. It supports:

- Forums and top-level forum posts
- Courses, chapters, lessons, text, external video embeds, quizzes, PDFs, and lesson attachments
- Chat channels, messages, polls, and message attachments

Whop custom apps such as Telegram, Discord, Wheels, or third-party embedded apps do not have one universal content API. SniperPlug lists those modules as unsupported instead of pretending they were imported. A dedicated adapter can be added later only when that app exposes an authorized API.

## Cloudflare storage

Create a Cloudflare D1 database and bind it to the Pages project as `SNIPERPLUG_DB`. Apply `migrations/0001_whop_guides.sql`.

D1 privately stores OAuth sessions, approved and disapproved source IDs, content decisions, exact previews, categories, drafts, and published guides. Imported source bodies are never committed to this public repository.

## Complete Cloudflare configuration

The repository ships the public Whop client ID and OAuth scopes through `wrangler.toml`. The callback URL is derived from the current site origin through the dedicated `/api/whop/oauth/callback` route.

Only these private runtime items must exist in Cloudflare Preview while testing and in Production before launch:

- `SNIPERPLUG_DB` — D1 binding
- `SNIPERPLUG_ADMIN_PASSWORD` — encrypted secret
- `SNIPERPLUG_SESSION_SECRET` — encrypted secret
- `WHOP_TOKEN_SECRET` — encrypted secret used only to seal OAuth tokens in D1

The runtime preflight reports every missing private item together instead of failing one setting at a time.

Register both exact callback URLs in the Whop application:

```text
Preview:    https://agent-whop-guide-importer.sniperplug.pages.dev/api/whop/oauth/callback
Production: https://sniperplug.com/api/whop/oauth/callback
```

The repository-configured OAuth scopes are:

```text
openid profile email forum:read courses:read chat:read member:basic:read member:email:read
```

Enable `forum:read`, `courses:read`, `chat:read`, `member:basic:read`, and `member:email:read` in the Whop application. Existing connections must disconnect and reconnect once after any new scope is added.

Never commit real secret values. Saving or changing a Cloudflare secret requires a fresh Pages deployment before Functions can read the new value.

## Owner workflow

1. Unlock `/control-center/`.
2. Connect through Whop.
3. SniperPlug loads current access-granting memberships and every readable Forum, Course, and Chat experience.
4. Select one source, several sources, or every Black Box and Hidden Files source.
5. Approve or disapprove sources individually or in bulk.
6. Open an approved source and review each post, lesson, or message with Approve, Disapprove, Undo, Approve all ready, or Disapprove all.
7. Accept the suggested category, choose another fitting category, or create a custom category directly in the import panel.
8. Confirm republication rights and import approved items as private drafts.
9. Review formatting, links, and files, then separately Publish or Reject each draft.

Black Box, Black Box Clips, and Hidden Files are prioritized automatically. Other active joined groups remain available. Canceled, expired, unresolved, and drafted historical memberships stay hidden. Manual `exp_...` entry remains under the Advanced fallback only.

## Categories and links

The live category catalog includes announcements, tutorials, money makers, money savers, freebies, deals, food and delivery, retail, reselling, sports betting, casino, crypto and trading, auto checkout, bots and automation, troubleshooting, and community resources. The server suggests a category from the source and content, but the owner remains in control.

Both Markdown links and plain `http://`, `https://`, or `www.` URLs become clickable on published guides. Only safe HTTP or HTTPS protocols are accepted. External links open in a new tab with safe `noopener`, `noreferrer`, and `nofollow` attributes. URLs inside code remain code.

## Files and attachments

Files are re-checked through Whop during import:

- A Whop file confirmed as public, ready, and permanent is linked or embedded in the draft.
- Private, signed, expiring, unready, or unverified files are clearly flagged and block publishing.
- Whop-hosted course video playback uses signed credentials and must be replaced with a SniperPlug-owned public file or an authorized external embed before publishing.

The importer does not falsely label a temporary Whop URL as permanent. Permanent copying to SniperPlug storage requires a separate authorized storage binding and upload workflow.

## Safety behavior

- Membership email data is discarded server-side and never sent to the browser.
- Changed Whop content returns to Needs decision.
- Fresh scans show the current source response rather than stale previously saved items.
- The browser submits only exact source and content IDs; the server re-fetches authoritative Whop content from the correct API before import.
- Imports always enter as drafts and are never featured automatically.
- Duplicate source items update the existing draft instead of creating copies.
- Unicode, emoji, punctuation, paragraphs, Markdown hard breaks, headings, lists, tables, links, blockquotes, and fenced code pass through the integrity gate.
- Ambiguous corruption, unsafe rendered content, dangerous links, and malformed fences are blocked.
- Private or expiring Whop files block publishing until resolved.
- Public guide routes query published records only.
- Control Center logins are rate-limited and use signed, secure, HttpOnly cookies.

Only import or republish content you own or have explicit permission or a license to republish. Membership access alone does not grant republication rights.

## Build settings

Use `npm run build` as the Cloudflare Pages build command and `.` as the output directory. The build runs importer, runtime-configuration, and automatic-discovery audits before deployment.
