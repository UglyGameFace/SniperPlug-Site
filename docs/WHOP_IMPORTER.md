# Whop to SniperPlug importer

The private importer is available at `/control-center/`. It uses Whop OAuth and the official Forum Posts API. It never asks for a Whop password.

## Cloudflare storage

Create a Cloudflare D1 database and bind it to the Pages project as `SNIPERPLUG_DB`. Apply `migrations/0001_whop_guides.sql`.

D1 privately stores OAuth sessions, approved and disapproved source IDs, post decisions, exact post previews, categories, drafts, and published guides. Imported post bodies are never committed to this public repository.

## Complete Cloudflare configuration

Configure every item below in both Cloudflare **Preview** and **Production** before testing the Control Center. The runtime preflight reports every missing item together instead of failing one setting at a time.

- `SNIPERPLUG_DB` — D1 binding
- `SNIPERPLUG_ADMIN_PASSWORD` — encrypted secret
- `SNIPERPLUG_SESSION_SECRET` — encrypted secret
- `WHOP_CLIENT_ID` — Whop application/client ID
- `WHOP_TOKEN_SECRET` — encrypted secret used only to seal OAuth tokens in D1
- `WHOP_REDIRECT_URI` — environment-specific callback URL
- `WHOP_OAUTH_SCOPES` — OAuth scopes

Use these callback values:

```text
Preview:    https://agent-whop-guide-importer.sniperplug.pages.dev/api/control?action=oauth-callback
Production: https://sniperplug.com/api/control?action=oauth-callback
```

Register both callback URLs in the Whop application. Use this scope value in both environments:

```text
openid profile email forum:read
```

Never commit real secret values.

## Owner workflow

1. Unlock `/control-center/`.
2. Connect through Whop.
3. Paste an exact `exp_...` experience ID or a Whop URL containing it.
4. Approve or disapprove the exact group.
5. Review posts with Approve, Disapprove, Undo, Approve all ready, or Disapprove all.
6. Select a category and confirm republication rights.
7. Import approved posts as private drafts.
8. Review formatting and attachments, then separately Publish or Reject each draft.

Black Box and Hidden Files are built-in source suggestions. Their exact experience IDs still require approval. Additional groups use the same exact-ID approval screen.

## Safety behavior

- Changed Whop posts return to Needs decision.
- The browser submits only approved IDs; the server re-fetches authoritative posts before import.
- Imports always enter as drafts and are never featured automatically.
- Duplicate source posts update the existing draft instead of creating copies.
- Unicode, emoji, punctuation, paragraphs, Markdown hard breaks, headings, lists, tables, links, blockquotes, and fenced code pass through the integrity gate.
- Ambiguous corruption, unsafe rendered content, dangerous links, and malformed fences are blocked.
- Private or expiring Whop attachments block publishing until resolved.
- Public guide routes query published records only.
- Control Center logins are rate-limited and use signed, secure, HttpOnly cookies.

## Build settings

Use `npm run build` as the Cloudflare Pages build command and `.` as the output directory. The build runs the importer and runtime-configuration audits before deployment.
