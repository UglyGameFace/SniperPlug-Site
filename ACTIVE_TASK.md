# Active Task

## Task
Repair the live Cloudflare Pages Whop importer and Control Center so Whop-hosted course videos never fall into the generic R2 attachment-copy path, long-running actions provide immediate visible progress and duplicate-submit protection, and all prior playback, publishing, security, and hard-free safeguards remain intact.

## Status
Active on `agent/whop-guide-importer`, draft PR #2. The latest authenticated screenshots prove the imported guide still contains an obsolete generic `hosted-video` R2 warning even though course videos have a dedicated authorized adaptive playback route. The Control Center also lacks persistent progress feedback during slow requests. Do not merge until implementation, exact-head CI, Cloudflare deployment, cleanup, conflict inspection, and authenticated mobile acceptance pass.

## Findings
- The 50 MB R2 ceiling is not the cause of the shown failure.
- Generic attachment verification processes the synthetic `hosted-video` placeholder before course-media enhancement, generating a false `SNIPERPLUG_MEDIA` warning.
- Course videos already have a same-origin authorized adaptive playback route that does not require copying the full file into R2.
- A transient media refresh can preserve the obsolete raw `hosted-video` warning from an older draft.
- Buttons change text and disable during many requests, but there is no persistent global progress bar and some actions are not wrapped by the common operation lock.

## Changes in validation
- Exclude synthetic hosted-course video placeholders from generic R2 attachment verification.
- Preserve only registered player/download/archive entries on a transient course refresh, never obsolete raw hosted-video warnings.
- Add an immediate global indeterminate operation bar for slow actions.
- Add visible spinners to busy buttons and prevent duplicate execution while `aria-busy` is active.
- Wrap logout in the same operation feedback path.
- Bump browser asset versions.

## Validation required
- Full Node 22 build and regression suite.
- Hosted course videos bypass generic R2 copying while regular private attachments retain all hard-free safeguards.
- Existing player, Mux, R2, OAuth, discovery, bulk, publishing, and responsive tests pass.
- No temporary workflow, package lock, duplicated runtime, or conflicting code remains.
- Cloudflare deploys the exact cleaned head.
- Authenticated mobile import displays the course player instead of an R2 warning and every slow action visibly acknowledges the tap.

## Backlog
None. Stay on this task until Definition of Done passes.
