# Whop to SniperPlug importer

The private importer is available at `/control-center/`. It uses Whop OAuth and official Whop APIs. It never asks for a Whop password.

## Cloudflare storage

Create a Cloudflare D1 database and bind it to the Pages project as `SNIPERPLUG_DB`. Apply `migrations/0001_whop_guides.sql`.

D1 privately stores OAuth sessions, approved and disapproved source IDs, post decisions, exact post previews, categories, drafts, and published guides. Imported post bodies are never committed to this public repository.

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
openid profile email forum:read member:basic:read member:email:read
```

Enable `forum:read`, `member:basic:read`, and `member:email:read` in the Whop application. Existing connections must disconnect and reconnect once after these scopes are added.

Never commit real secret values. Saving or changing a Cloudflare secret requires a fresh Pages deployment before Functions can read the new value.

## Owner workflow

1. Unlock `/control-center/`.
2. Connect through Whop.
3. SniperPlug automatically loads joined memberships and each readable forum experience.
4. Select one forum, several forums, or every Black Box and Hidden Files forum.
5. Approve or disapprove sources individually or in bulk.
6. Open an approved forum and review posts with Approve, Disapprove, Undo, Approve all ready, or Disapprove all.
7. Select a category and confirm republication rights.
8. Import approved posts as private drafts.
9. Review formatting and attachments, then separately Publish or Reject each draft.

Black Box and Hidden Files are prioritized automatically. Other joined groups remain available. Manual `exp_...` entry remains under the Advanced fallback only.

## Safety behavior

- Membership email data is discarded server-side and never sent to the browser.
- Changed Whop posts return to Needs decision.
- The browser submits only exact source and post IDs; the server re-fetches authoritative Whop content.
- Imports always enter as drafts and are never featured automatically.
- Duplicate source posts update the existing draft instead of creating copies.
- Unicode, emoji, punctuation, paragraphs, Markdown hard breaks, headings, lists, tables, links, blockquotes, and fenced code pass through the integrity gate.
- Ambiguous corruption, unsafe rendered content, dangerous links, and malformed fences are blocked.
- Private or expiring Whop attachments block publishing until resolved.
- Public guide routes query published records only.
- Control Center logins are rate-limited and use signed, secure, HttpOnly cookies.

## Build settings

Use `npm run build` as the Cloudflare Pages build command and `.` as the output directory. The build runs importer, runtime-configuration, and automatic-discovery audits before deployment.
