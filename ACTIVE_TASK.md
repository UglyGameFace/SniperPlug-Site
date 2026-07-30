# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so interactions register immediately, large imports stay responsive, guide-quality filtering remains strict, private media stays inside SniperPlug’s hard-free budget, Whop course videos render at source-available quality, and mislabeled or app-specific Whop modules are investigated instead of being dismissed by their sidebar label.

## Status
Active on `agent/whop-guide-importer`. The interaction/performance and R2 hard-free work is already deployed on draft PR #2. The course-video and deeper capability-probe implementation now passes the complete local Node 22 build, targeted video tests, migration execution, syntax validation, regression suite, cleanup inspection, and diff validation. Final GitHub Actions, exact-head Cloudflare deployment, PR conflict inspection, and authenticated live acceptance remain before merge or completion.

## Scope
- Preserve Whop OAuth, official Forum/Course/Chat reads, source approval, republication-rights confirmation, private D1 storage, guide-quality checks, safe publishing, and 48-hour undo.
- Keep **Select group**, source decisions, guide switching, filtering, publishing, and navigation immediately responsive.
- Keep private/expiring ordinary attachments durable through the private `SNIPERPLUG_MEDIA` R2 binding without crossing application-enforced free limits.
- Render Whop-hosted course video through fresh authorized adaptive playback rather than reducing the lesson to a placeholder.
- Offer a static MP4/M4A path only when Whop/Mux actually exposes one, and mirror it to R2 only when it fits the existing 50 MB hard-free object ceiling.
- Never persist Whop/Mux playback IDs or signed playback tokens.
- Probe official Course, Forum, and Chat endpoints for unknown or renamed experiences before classifying them as app-specific.
- Inspect app metadata and advertised OpenAPI capability for genuinely custom modules without scraping browser sessions or guessing private endpoints.
- Validate phone, tablet, desktop, syntax, media playback, discovery, publishing, recovery, responsive flow, public isolation, and hard-free behavior.

## Findings
- The importer deliberately converted `video_asset` into a `url: null` review placeholder, so real 28- and 38-minute lessons became “0 files” plus generic text.
- The later Mux rendition probe used `HEAD`; Mux static rendition availability must be checked with a real ranged `GET`, so valid downloadable files could be falsely reported unavailable.
- The importer had no adaptive Mux player fallback even though Whop returns signed playback, thumbnail, and storyboard credentials for exact course lessons.
- Existing course drafts could remain broken after rescanning because unchanged imports skipped media enhancement.
- A second exact lesson request was unnecessary and could degrade an existing video on a transient failure; exact media context now stays server-side in memory through enhancement and is removed before API results leave the server.
- Long source-quality videos will commonly exceed the 50 MB hard-free R2 object ceiling. Permanently copying every long video would conflict with the user’s no-billing requirement; authorized adaptive playback preserves the available quality without consuming R2 storage.
- Whop’s stable API exposes Course, Forum, Chat, Files, Experiences, and app metadata, but not one generic endpoint that can read arbitrary custom-app content.
- Some experiences can be native content with a renamed app label, so classification by app name alone was incorrect.
- Genuine custom apps run their own backend and may advertise an OpenAPI document. Their Whop iframe can receive a same-origin user token, but SniperPlug must use a publisher-documented server interface and authorization contract rather than copy browser credentials or invent endpoints.

## Changes
- Added stable same-origin `/course-video/<key>` routes backed by D1 descriptors containing only guide/lesson/source identifiers and display metadata.
- Each player request re-fetches the exact lesson through the current encrypted owner OAuth session and creates fresh signed Mux playback URLs at request time.
- Added responsive Mux Player iframe rendering with adaptive source renditions, thumbnails, storyboards, seeking, fullscreen, and no artificial resolution cap.
- Added ranged `GET bytes=0-0` static-rendition discovery in order: highest, 2160p, 1440p, 1080p, high, medium; audio lessons check M4A.
- Added a direct source download route when a real static MP4/M4A exists.
- Kept static R2 mirroring optional: files under 50 MB can be archived permanently when the hard-free reservation succeeds; larger videos continue through adaptive source playback and do not block publishing.
- Added `course_video_sources` migration with no token or playback-ID columns.
- Added transient exact course media context between authoritative re-fetch and media enhancement; it is stripped before the response is returned.
- Rescanning an unchanged course lesson now repairs legacy placeholder drafts instead of leaving them unchanged forever.
- Owner edits prune detached course-player mappings and stale attachment references.
- Added route-specific CSP/frame policy so only the registered same-origin player route may embed Mux Player; arbitrary external iframe markdown remains blocked.
- Added official endpoint probing for unknown app labels. An experience that actually returns native Course, Forum, or Chat data is reclassified and imported normally.
- Truly app-specific experiences remain visible with the completed probe result, app metadata, OpenAPI-advertisement status, and an honest reason that a publisher-documented read API is required.
- Preserved the existing 50 MB/object, 8 GB storage, 25,000-object, 2,000-copy/day, 50,000-copy/month, and 10,000-origin-read/day hard stops.

## Validation
- Passed: complete `npm test` and `npm run build` audit suite under Node 22.
- Passed: JavaScript syntax validation across Functions, browser scripts, and all audit/test scripts.
- Passed: migrations `0001` through `0004` execute together in SQLite and expose the required media and course-video schemas.
- Passed: Mux static probes use `GET` with `Range: bytes=0-0`, not `HEAD`.
- Passed: 2160p/1440p/1080p fallback ordering and total-size extraction from `Content-Range`.
- Passed: adaptive signed player URL includes fresh playback/thumbnail/storyboard tokens and has no resolution cap.
- Passed: only a registered same-origin course-player route becomes an iframe.
- Passed: playback credentials are absent from D1 migration/schema.
- Passed: exact media context is carried only in memory, unchanged course imports are repairable, and internal context is stripped from outward API results.
- Passed: renamed “Notes” test experience is recovered as Forum content when the official Forum endpoint returns items.
- Passed: existing importer quality, categories, OAuth, bulk recovery, undo, public isolation, responsive layout, ordinary media, and R2 hard-free regressions.
- Passed: `git diff --check`.
- Pending: permanent GitHub Actions validation on the final branch head.
- Pending: Cloudflare Pages deployment of that exact head.
- Pending: PR mergeability/conflict recheck.
- Pending: authenticated live check with the Travel Hacking lessons and the Black Box app-specific modules.

## Cleanup
- One active Control Center interaction runtime remains.
- No Whop/Mux signed token, playback ID, private attachment, imported content, browser cookie, or fake production row is committed or stored in D1.
- Course-player descriptors are stable and pruned when removed from a guide.
- The R2 bucket remains private; only optional static copies use `/media/<key>`.
- Adaptive course playback uses fresh source authorization and does not consume R2 capacity.
- No temporary workflow, artifact trigger, package lock, or test fixture is included.
- Quarantined ordinary media retains the seven-day reversible cleanup window.

## Blockers
- Repository tests cannot use the user’s authenticated production Whop account. Live acceptance must confirm both Travel Hacking lessons display and seek correctly, whether either lesson exposes a static download, and which Black Box modules resolve through native probing versus requiring a documented custom-app API.
- Whop does not expose the uploader’s raw master file through the course-lesson response. SniperPlug can preserve the highest adaptive rendition Whop/Mux makes available and any exposed static rendition, but must not claim to possess an unavailable original master.

## Backlog
- None. Do not switch tasks until final CI, deployment, conflict inspection, authenticated acceptance, and cleanup verification pass.
