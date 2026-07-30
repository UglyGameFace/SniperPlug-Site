# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so course videos are discovered during review, the mobile review panel renders immediately without blank-space repaint glitches, connection state remains truthful, and all prior media, publishing, security, and hard-free safeguards remain intact.

## Status
Active on `agent/whop-guide-importer`, draft PR #2. Root causes identified: lightweight course listings omit `video_asset`, and post cards were deferred with `content-visibility` while the page scrolled before the first render. A validated patch is being applied through the repository workflow. Do not merge until exact-head CI, Cloudflare deployment, conflict inspection, and authenticated mobile acceptance pass.

## Findings
- Whop's course lesson collection response provides the lesson shell but not the full hosted `video_asset` required to identify the 28- and 38-minute videos.
- `listExperienceItemsLite()` marked every course lesson `detailDeferred`, so review showed `Course · 0 files` even when the Whop app visibly contained a video.
- The exact lesson was fetched only after approval during import, making the review card misleading and preventing thumbnail/duration feedback.
- Review cards used `content-visibility:auto` plus deferred idle rendering, then `scrollIntoView()` ran before any card had measurable geometry. Samsung Browser displayed a large blank panel until a touch forced repaint.

## Changes in validation
- Fetch exact details only for likely video/audio or otherwise empty course lessons.
- Bound exact lesson reads to four concurrent requests.
- Carry course thumbnail, hosted-video identity, upload status, and duration into review.
- Add a clear Video detected review block.
- Render the first review cards synchronously, remove the problematic post-card `content-visibility`, wait for layout paint, then scroll.
- Keep remaining large queues chunked during idle time.
- Bump mobile browser asset versions.

## Validation required
- Full Node 22 build and regression suite.
- Course detail reads remain bounded.
- Existing course-player, Mux, R2, OAuth, discovery, bulk, publishing, and responsive tests pass.
- No package lock, temporary patch workflow, duplicate runtime, or conflicting code remains.
- Cloudflare deploys the exact cleaned head.
- Authenticated mobile review shows both Travel Hacking videos and no blank freeze.

## Backlog
None. Stay on this task until Definition of Done passes.
