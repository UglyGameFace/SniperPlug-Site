# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so course videos are discovered during review, the mobile review panel renders immediately without blank-space repaint glitches, connection state remains truthful, and all prior media, publishing, security, and hard-free safeguards remain intact.

## Status
Active on `agent/whop-guide-importer`, draft PR #2. The implementation passed the complete Node 22 build and regression suite before commit. The temporary write-enabled application workflow has been removed and the permanent read-only verification workflow restored. Exact cleaned-head CI, Cloudflare deployment, conflict inspection, and authenticated mobile acceptance remain before merge or completion.

## Findings
- Whop's course lesson collection response provides the lesson shell but not the full hosted `video_asset` required to identify the 28- and 38-minute videos.
- `listExperienceItemsLite()` marked every course lesson `detailDeferred`, so review showed `Course · 0 files` even when the Whop app visibly contained a video.
- The exact lesson was fetched only after approval during import, making the review card misleading and preventing thumbnail/duration feedback.
- Review cards used `content-visibility:auto` plus deferred idle rendering, then `scrollIntoView()` ran before any card had measurable geometry. Samsung Browser displayed a large blank panel until a touch forced repaint.

## Changes
- Exact details are fetched only for likely video/audio or otherwise empty course lessons.
- Exact lesson reads are bounded to four concurrent requests.
- Course thumbnail, hosted-video identity, upload status, and duration now reach review.
- Review cards include a clear **Video detected** block.
- The first review cards render synchronously; post-card `content-visibility` was removed; scrolling waits for two layout frames.
- Remaining large queues continue rendering in bounded idle chunks.
- Control Center asset versions were bumped for mobile cache invalidation.

## Validation
- Passed complete `npm run build` under Node 22.
- Passed course-video, Mux playback, OAuth, discovery, importer-quality, media, R2 hard-free, bulk recovery, undo, publishing, public-isolation, responsive-layout, and performance regressions.
- Passed bounded course-detail concurrency checks.
- Passed mobile-safe synchronous-first render and post-card content-visibility checks.
- Passed `git diff --check` before implementation commit.
- Temporary patch workflow and incidental package lock are absent from the cleaned head.
- Pending permanent exact-head CI, Cloudflare deployment, mergeability recheck, and authenticated mobile acceptance.

## Blocker
Repository tests cannot use the owner's private Whop account. Live acceptance must confirm both Travel Hacking lessons show video detection, Review content no longer opens a blank frozen panel, and imported playback works on the phone.

## Backlog
None. Stay on this task until authenticated acceptance and final cleanup verification pass.
