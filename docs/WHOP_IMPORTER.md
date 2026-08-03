# Whop to SniperPlug importer

The private importer is available at `/control-center/`. It uses Whop OAuth and official Whop APIs. It never asks for a Whop password.

## Supported Whop content

SniperPlug automatically discovers active membership products and their experiences. It supports:

- Forums and top-level forum posts
- Courses, chapters, lessons, text, external video embeds, quizzes, PDFs, thumbnails, lesson attachments, and downloadable hosted media
- Chat channels, messages, polls, pictures, video, audio, and message attachments

Discovery checks both the company-wide experience list and every active membership product, then deduplicates exact `exp_...` sources. This catches modules that Whop exposes at the company level instead of attaching to one product. Groups with no current readable content are hidden instead of lingering as empty cards.

For every unknown module, SniperPlug now probes Whop's official Course, Forum, and Chat collection endpoints before classifying it as app-specific. This catches renamed or oddly labeled native modules instead of trusting the sidebar label alone.

Genuinely custom apps such as Telegram, Discord, Wheels, or third-party embedded apps do not share one universal content API. SniperPlug keeps those modules visible, records the app metadata, and reports whether the app advertises an OpenAPI view. It does not guess private endpoints or scrape an authenticated iframe. Importing those items requires a documented read API and authorization contract from that app's publisher.

Whop-hosted course videos use the exact lesson's current Mux playback credentials. SniperPlug first checks for a downloadable static rendition with a ranged GET request. Regardless of static-download availability, ready videos receive a stable SniperPlug player route that re-fetches fresh signed playback credentials and embeds Mux's adaptive player at the highest rendition available to the source. A download link appears only when Mux exposes a downloadable MP4/M4A rendition.

## Cloudflare storage

Create a Cloudflare D1 database and bind it to the Pages project as `SNIPERPLUG_DB`. Apply `migrations/0001_whop_guides.sql`, `migrations/0002_control_hardening.sql`, `migrations/0003_media_hard_free.sql`, and `migrations/0004_whop_import_backups.sql` in order.

D1 privately stores OAuth sessions, approved and disapproved source IDs, content decisions, exact previews, categories, drafts, and published guides. Imported source bodies are never committed to this public repository.

For complete picture, video, audio, PDF, and file carryover, create a Cloudflare R2 bucket and bind it to the Pages project as:

```text
SNIPERPLUG_MEDIA
```

A suggested bucket name is `sniperplug-media`. The binding name must be exactly `SNIPERPLUG_MEDIA` in both Preview and Production. The bucket name itself may differ. Keep the bucket on **Standard** storage; SniperPlug also writes every copied object explicitly as Standard so the R2 free allowance applies.

R2 is optional for text-only and already-public media imports. It is required to permanently copy private, signed, or expiring Whop media into SniperPlug-owned storage. The Control Center shows the real storage readiness instead of pretending private media can be preserved when the binding is missing.

### Hard-free media mode

SniperPlug does not rely on a warning email to control its own bucket usage. The application refuses new origin work before these conservative ceilings:

- 50,000,000 bytes per copied file.
- 8,000,000,000 total stored or reserved bytes.
- 25,000 stored objects.
- 2,000 copy attempts in one UTC day.
- 50,000 copy attempts in one UTC month.
- 10,000 uncached R2 `HEAD`/`GET` operations in one UTC day.

The daily copy ceiling keeps the D1 Free-plan write counter used for strict quota enforcement well below its own daily allowance. The media ledger is stored in D1. A daily inventory includes objects that were uploaded manually or existed before the ledger, so they cannot bypass the storage ceiling, but unchanged objects are not rewritten every day. Cleanup mutates no more than 5,000 ledger rows per run. Full media responses use canonical edge caching; cache-busting query strings redirect before R2, and cached full objects can satisfy byte-range playback without another R2 read. Detached media and media belonging only to rejected/quarantined guides are marked unused and deleted after a 7-day safety window.

When a ceiling is reached, SniperPlug keeps the new attachment in private draft review rather than copying it. At either daily operation ceiling, new copying pauses until the UTC reset; at the origin-read ceiling, already-cached media can continue to work while uncached media returns a retry response. These controls cover this application’s `SNIPERPLUG_MEDIA` binding; they cannot limit unrelated R2 buckets or other Cloudflare services in the same account.

## Complete Cloudflare configuration

The repository ships the public Whop client ID and OAuth scopes through `wrangler.toml`. Production always uses the exact canonical callback `https://sniperplug.com/api/whop/oauth/callback`; the stable preview host uses its separately registered callback. A stale `WHOP_REDIRECT_URI` Cloudflare variable is intentionally ignored outside localhost so it cannot break production OAuth. Unknown Pages or custom hosts fail inside SniperPlug before contacting Whop.

These private runtime items must exist in Cloudflare Preview while testing and in Production before launch:

- `SNIPERPLUG_DB` — D1 binding
- `SNIPERPLUG_ADMIN_PASSWORD` — encrypted secret
- `SNIPERPLUG_SESSION_SECRET` — encrypted secret
- `WHOP_TOKEN_SECRET` — encrypted secret used only to seal OAuth tokens in D1

For full private-media preservation, also bind:

- `SNIPERPLUG_MEDIA` — R2 bucket binding

The runtime preflight reports every missing required private item together instead of failing one setting at a time. The media-readiness card reports the optional R2 binding separately because the rest of the importer can still operate safely without it.

Register both exact callback URLs in the Whop application:

```text
Preview:    https://agent-whop-guide-importer.sniperplug.pages.dev/api/whop/oauth/callback
Production: https://sniperplug.com/api/whop/oauth/callback
```

Do not add `www`, a trailing slash, a branch-preview URL, or the bare `sniperplug.pages.dev` host. Whop requires an exact redirect URI match. `WHOP_REDIRECT_URI` is only a local-development override and should not be configured as a Cloudflare Production or Preview variable.

The repository-configured OAuth scopes are:

```text
openid profile email forum:read courses:read chat:read member:basic:read member:email:read
```

Enable `forum:read`, `courses:read`, `chat:read`, `member:basic:read`, and `member:email:read` in the Whop application. Existing connections must disconnect and reconnect once after any new scope is added.

Never commit real secret values. Saving or changing a Cloudflare secret or binding requires a fresh Pages deployment before Functions can read the new value.

## Backup, clear, and restore

The Control Center has one owner-only recovery panel for Whop imports. A destructive clear never runs directly. SniperPlug first snapshots the selected source or entire importer, signs the manifest, writes one bounded R2 recovery archive, reads that archive back, verifies its signature and checksums, and only then issues a short-lived reset authorization. D1 stores only the verified manifest, archive identity, history, and one-time reset state so the workflow remains inside Cloudflare Free-plan query limits.

The R2 recovery archive includes saved source decisions, current and stale post snapshots, complete guide Markdown and publication state, referenced categories, course-video mappings, and media ledger references. Verified backups pin their R2 objects so normal detached-media cleanup cannot delete the only surviving copy. Published guides are preserved by default; deleting them requires a separate checkbox and a stronger typed confirmation phrase.

Backup history supports owner-only JSON download, restore, and deletion. Restore does not call Whop, so it still works after membership or group access is lost. Existing newer guides are reported as conflicts and are never overwritten silently. Clearing one source can immediately reapprove and rescan it, while an entire-importer reset can optionally disconnect OAuth before rebuilding from zero.

Fresh source scans now mark posts missing from Whop as stale and hide them from ordinary review instead of letting old rows resurface forever. If a stale item returns in a later official scan, its row is revived automatically.

## Owner workflow

1. Unlock `/control-center/`.
2. Connect through Whop.
3. SniperPlug loads current access-granting memberships, checks company-wide modules plus every membership product, and deduplicates every readable Forum, Course, and Chat experience.
4. Select one source, several sources, or every Black Box and Hidden Files source.
5. Use the normal review flow for individual control, or confirm republication rights and press **Approve, import & publish selected**.
6. The complete bulk workflow approves each selected source, scans current content, approves every non-blocked item, applies the best-fit category for that source, preserves available media, imports in bounded batches, and publishes every safe guide.
7. Anything with unresolved private/expiring media, blocked integrity, or a failed source request remains private and is reported instead of being silently published.
8. **Publish all ready drafts** publishes every safe imported draft left from earlier manual or bulk runs.

The ordinary controls remain available: Approve, Disapprove, Undo, Approve all ready, Disapprove all, custom category creation, private draft review, and individual Publish or Reject.

Black Box, Black Box Clips, and Hidden Files are prioritized automatically. Other active joined groups remain available. Canceled, expired, unresolved, drafted, empty, and unreadable historical groups stay hidden. Manual `exp_...` entry remains under the Advanced fallback only.

## Categories and links

The live category catalog includes announcements, tutorials, money makers, money savers, freebies, deals, food and delivery, retail, reselling, sports betting, casino, crypto and trading, auto checkout, bots and automation, troubleshooting, and community resources. The server suggests a category from each source and its current content, but the owner remains in control during manual review.

Both Markdown links and plain `http://`, `https://`, or `www.` URLs become clickable on published guides. Only safe HTTP or HTTPS protocols are accepted. External links open in a new tab with safe `noopener`, `noreferrer`, and `nofollow` attributes. URLs inside code remain code.

## Pictures, video, audio, PDFs, and files

Media is re-checked through Whop during import:

- Public permanent pictures are embedded inline.
- Public permanent video and audio render with responsive native playback controls.
- Public PDFs and ordinary files remain clickable and downloadable.
- Private, signed, or expiring Whop media is copied into the `SNIPERPLUG_MEDIA` R2 bucket only while every hard-free storage and operation guard allows it.
- Copied media is served from SniperPlug with canonical immutable edge caching, safe content types, and byte-range responses so video seeking works in Chrome and Samsung Browser without repeated full-object R2 reads.
- Course thumbnails are preserved.
- Whop-hosted course video checks for an authorized downloadable MP4 or M4A rendition. When one exists, SniperPlug copies it into R2. When Whop exposes streaming only, the draft is held for a permanent replacement instead of publishing a temporary or broken player.
- Unready, missing, oversized, unsafe, or unverifiable media is clearly flagged and blocks publishing.

The importer never falsely labels a temporary Whop URL as permanent and never silently drops a picture or video. A draft shows exactly which media was copied and which item still needs review.

## Safety behavior

- Membership email data is discarded server-side and never sent to the browser.
- Changed Whop content returns to Needs decision.
- Fresh scans show the current source response rather than stale previously saved items.
- The browser submits only exact source and content IDs; the server re-fetches authoritative Whop content from the correct API before import.
- Complete bulk runs are owner-initiated, same-origin protected, bounded, and require explicit republication-rights confirmation.
- Source failures are isolated so one bad source does not erase successful work on the others.
- Imports enter as unfeatured drafts before the safe bulk publisher evaluates them.
- Duplicate source items update the existing draft instead of creating copies.
- Unicode, emoji, punctuation, paragraphs, Markdown hard breaks, headings, lists, tables, links, blockquotes, and fenced code pass through the integrity gate.
- Ambiguous corruption, unsafe rendered content, dangerous links, malformed fences, and unsafe remote-media destinations are blocked.
- Private or expiring Whop media blocks publishing until it is copied or explicitly resolved.
- Public guide routes query published records only.
- Control Center logins are rate-limited and use signed, secure, HttpOnly cookies.

Only import or republish content you own or have explicit permission or a license to republish. Membership access alone does not grant republication rights.

## Build settings

Use `npm run build` as the Cloudflare Pages build command and `.` as the output directory. The build runs importer, runtime-configuration, automatic-discovery, complete bulk-publishing, performance, clarity, and media audits before deployment.
