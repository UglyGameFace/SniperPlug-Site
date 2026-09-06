# Active Task

## Active task / outcome
Refine the canonical Control Center bulk-job completion wording so a finished job clearly distinguishes a clean success from “completed with issues,” while preserving the existing resumable job state, held-item safety, reset control, and single authoritative renderer.

## Scope lock
- Active scope: `assets/js/control-center-v2.js`, the existing bulk-completion regression, and this task record only unless validation proves another directly-related file is required.
- `control-center-v2.js` remains the canonical bulk title/summary/progress renderer.
- `control-center-bulk-reset.js` remains a bounded finished-job/reset helper. Do not turn it into a second title/summary renderer, poller, or mutation state machine.
- Preserve `/api/bulk-jobs` durable state, resume/cancel semantics, issue counts, held counts, lazy loading, publication safety, and reset behavior.
- Do not change backend job semantics merely to improve copy.

## Root cause / opportunity
The server already exposes authoritative `outcome` and `issueCount` fields for completed jobs, and the reset helper already explains the issue breakdown. The canonical v2 title/summary still collapses every completed job into the same generic “Bulk job completed” state, so a job with held or failed items can look cleaner than it really was until the secondary explanation is read.

## Definition of Done
- [ ] Canonical v2 title distinguishes clean completion from completion with review items.
- [ ] Canonical v2 summary explains that successful publications remain intact while held/failed items need review.
- [ ] Clean completion stays explicitly positive and does not show warning wording.
- [ ] Active and canceled job wording remains unchanged in meaning.
- [ ] No second bulk renderer, poller, handler, or blind retry is introduced.
- [ ] Existing reset/outcome helper remains bounded to finished-job explanation/reset behavior.
- [ ] Regression coverage locks the canonical wording and ownership boundaries.
- [ ] Exact-head Node 22/full regression, Firefox Android packaging, applicable preview checks, clean review state, merge, and post-merge production validation all pass before closing the task.

## Starting point
- `main`: `240f7116191b985dba27ecbe18b093beda62c744`
- Branch: `ux/bulk-completion-wording`

## Administrative backlog
- `main` branch protection is still a separate repository-administration item because the connected GitHub App cannot configure mandatory checks.
