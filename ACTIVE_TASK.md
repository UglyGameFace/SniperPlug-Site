# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so connection state is truthful and stable, interactions register immediately, large imports stay responsive, guide-quality filtering remains strict, private media stays inside SniperPlug’s hard-free budget, Whop course videos render at source-available quality, and mislabeled or app-specific Whop modules are investigated without destabilizing startup.

## Status
Active on `agent/whop-guide-importer`. The connection/discovery state-machine implementation landed at `dd1c6852d810649681891a7b0d63a279ddc74ed9`; the permanent read-only verification workflow was restored at `ed6b35f7b60bded0cf856e6fdee49b71dd2eb95d`. The complete Node 22 regression suite passed in the permanent workflow, Cloudflare Pages deployed the cleaned head successfully, and the temporary write workflow is gone. PR #2 remains a draft. Authenticated live startup, refresh, source-list, and Travel Hacking video acceptance remain before merge or completion.

## Scope
- Preserve Whop OAuth, official Forum/Course/Chat reads, source approval, republication-rights confirmation, private D1 storage, guide-quality checks, safe publishing, and 48-hour undo.
- Make the verified Whop OAuth session the only authority for the connection badge.
- Keep source discovery a separate bounded service state so a failed source refresh cannot claim the account disconnected or overwrite connection truth.
- Keep the last successful source list usable when a refresh temporarily fails.
- Retry safe transient source-discovery and live-verification failures without forcing a reconnect.
- Keep unknown or renamed app probing bounded and cached so one Control Center load cannot fan out into an unbounded request burst.
- Keep **Select group**, source decisions, refresh, guide switching, filtering, publishing, and navigation immediately responsive.
- Preserve Whop-hosted course video through fresh authorized adaptive playback and only offer static downloads that Whop/Mux actually exposes.
- Preserve the application-owned R2 hard-free limits and private media delivery.

## Findings
- The screenshot contained two different truths from two requests: `/api/control?action=dashboard` verified the saved Whop OAuth session, while `/api/discover` failed afterward.
- The browser incorrectly sent the discovery failure to the global red banner, making a source-list failure look like a connection failure.
- The server converted an unexpected discovery exception into the vague message “Unexpected SniperPlug importer error,” which hid the failing subsystem and whether retrying was safe.
- The new app-capability pass could probe native Course, Forum, Chat, and app metadata for many unknown modules in one request. That could hit a temporary Whop/Cloudflare request or subrequest limit even while OAuth remained valid.
- One failed app probe could reject the entire discovery response rather than preserving successful groups and modules.
- Repeated page loads had no durable capability cache, so already-classified app modules could be probed again.
- `setWorking()` remembered button text but not the original disabled state. A temporarily disabled action such as **Refresh sources** could stay disabled after completion.
- Whop token verification can fail with a generic network exception as well as an `HttpError`; a saved D1 session must remain “checking,” not be falsely treated as disconnected.

## Changes
- Added three explicit Whop states: **Connected & verified**, **Checking connection**, and **Not connected**.
- Dashboard verification now returns structured `connected`, `verified`, `status`, `message`, and session fields.
- Only an authoritative 401/403 removes the saved Whop session. Other verification failures preserve the encrypted D1 session as **Checking connection** while safe retries run.
- Source discovery no longer writes to the global connection banner or clears a verified connection.
- Transient discovery failures retry automatically with bounded backoff; after retry exhaustion, the source panel reports **Whop connected · source refresh paused** and preserves the last successful list.
- Added structured `DISCOVERY_TRANSIENT` responses so the browser can distinguish safe transient failures from permanent owner-action errors.
- Added a D1 `whop_experience_capabilities` cache and a maximum of six unknown-app capability probes per request.
- Capability checks continue in bounded background passes, use a transient cooldown, isolate per-company/per-module failures, and expose checked/pending/failed progress.
- Known Forum, Course, and Chat modules bypass unknown-app probing.
- App-specific cards clearly distinguish completed, queued, and retrying capability checks.
- Fixed working-button restoration so controls return to their exact previous disabled/enabled state.
- Bumped Control Center asset versions so Samsung Browser cannot keep the contradictory runtime after deployment.
- Preserved adaptive course video, static rendition detection, R2 hard-free guards, publishing safeguards, and all prior performance work.

## Validation
- Passed: complete `npm test` and `npm run build` audit suite under Node 22 locally and in the permanent read-only GitHub Actions workflow.
- Passed: JavaScript syntax validation for all changed Functions, browser scripts, audits, and tests.
- Passed: migrations `0001` through `0005` execute together in SQLite.
- Passed: capability probe budget stops at exactly six checks per discovery request.
- Passed: network/408/425/429/5xx discovery failures are classified as transient and retryable.
- Passed: durable capability cache TTL and transient retry-cooldown behavior.
- Passed: source-discovery failure cannot call the global `showStatus(error, 'error')` path.
- Passed: connection UI contains explicit connected/checking/disconnected states and a dedicated connection-detail line.
- Passed: temporary button working state restores its original disabled value.
- Passed: existing importer quality, category, OAuth, course-video, media, R2 hard-free, bulk recovery, undo, public isolation, responsive layout, and performance regressions.
- Passed: `git diff --check`, changed-file conflict inspection, permanent workflow cleanup, and Cloudflare deployment of cleaned head `ed6b35f7b60bded0cf856e6fdee49b71dd2eb95d`.
- Pending: authenticated live startup, refresh, source-list, and Travel Hacking video acceptance.

## Cleanup
- One active Control Center interaction runtime remains.
- Connection and discovery messages have separate DOM/state paths; no duplicate banner owner remains.
- Capability cache stores only source type, non-secret app metadata, status, retry timing, and timestamps.
- No Whop/Mux signed token, playback ID, private attachment, imported content, browser cookie, or fake production row is committed.
- Temporary patch delivery and write workflows are removed; the permanent workflow has read-only repository permissions.
- No incidental `package-lock.json` or deployment-only fixture remains.
- The R2 bucket remains private and the existing cleanup safety window remains intact.

## Blockers
- Repository tests cannot use the user’s authenticated production Whop account or reproduce the exact live Whop module set. Live acceptance must confirm the page settles on one truthful connection state, the red generic banner does not return, source refresh preserves data during temporary failures, and Travel Hacking videos still play and seek.

## Backlog
- None. Do not switch tasks until authenticated acceptance and final post-acceptance cleanup verification pass.
