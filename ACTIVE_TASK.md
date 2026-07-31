# Active Task

## Task
Repair and fully audit the Whop importer workflow in `UglyGameFace/SniperPlug-Site` only. Do not continue work in the separate Discord deal-bot repository during this task.

The required end-to-end path is:

Whop OAuth/session → Experience discovery → app/type routing → exact content scan → source/item decisions → import → D1 draft → course media/video enhancement → owner review → reject/remove → restore or re-import → publish → public guide/video access.

The frontend scope includes the complete Control Center, async feedback, duplicate-submit prevention, rendering, caching, Samsung Internet compatibility, and truthful recovery state.

## Status
Active. No merge or completion claim until the real authenticated workflow passes. Static source-string checks and a green syntax build are not acceptance.

## Confirmed findings
- Whop navigation tiles are Experiences backed by apps. Discovery must remain Experience-first and route by actual app/type capability.
- The current test suite relies heavily on source-string assertions and does not prove browser → API → D1 → Whop state transitions.
- Rejected imports disappear from the normal guide queue, making recovery a separate lifecycle that must be explicit and reliable.
- The newly added recovery endpoint is not yet truly atomic: it approves source/item policy before the rebuild is proven successful.
- Import and course-media enhancement occur as separate write phases, so a guide can be rebuilt while media enhancement fails afterward.
- Published course-video playback depends on a usable owner Whop OAuth session and a fresh Whop lesson read.
- Static rendition probing can add excessive latency before adaptive playback fallback.
- Samsung Internet has shown stale immutable assets, delayed tap feedback, and rendering problems around `content-visibility`.
- Site middleware does not validate the complete Whop OAuth configuration up front.
- The branch contains many accumulated changes; duplicate, superseded, and contradictory paths require full caller inspection before cleanup.

## Audit and repair order
1. Runtime/deployment configuration, OAuth requirements, D1/R2 bindings, routes, and migrations.
2. Whop session lifecycle, Experience discovery, app/type resolution, permissions, pagination, retries, and capability caching.
3. Content scan and exact-item retrieval for Course, Forum, Chat, and unsupported/custom apps.
4. Source/item decision lifecycle and import idempotency.
5. D1 guide lifecycle: draft, published, rejected, restored, re-imported, quarantined, and deduplicated states.
6. Course video/media registration, playback, download behavior, stale records, and failure recovery.
7. Publishing/public guide access, authorization, reconciliation, and search/detail routes.
8. Control Center event delegation, busy state, progress, retry, stale caches, Samsung Internet, and accessibility.
9. Replace static-only checks with executable D1/API state-transition tests and browser workflow coverage.
10. Remove verified duplicate, obsolete, temporary, and conflicting Whop-importer code only after caller/reference validation.

## Required acceptance
- Connect Whop and discover the correct Experiences without contradictory connection status.
- Scan a real Course Experience and show the correct lessons and hosted-video state.
- Approve and import an exact lesson into a private draft.
- Open the draft and successfully load its course video.
- Reject/remove that guide.
- Restore it and separately prove rejected re-import works.
- Confirm failure at any recovery step does not leave source/item approvals or guide/media state partially changed.
- Publish and open the public guide/video successfully.
- Repeat the owner workflow in Chrome and Samsung Internet with immediate visible feedback and no duplicate operation.

## Scope lock
The separate `UglyGameFace/SniperPlug` Discord deal-bot audit is paused. Preserve its existing findings and commits, but make no further changes there until this Whop importer task is accepted.
