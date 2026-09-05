# Active Task

## Active task / outcome
Make finished bulk importer workflows unmistakable in the Control Center, especially the difference between a clean completion and a completion that safely held or failed some items.

## Scope lock
- Active scope: bulk-job completion outcome copy/presentation, the existing bulk reset/aftermath helper, targeted regression coverage, and only the package audit hook required to run that regression.
- Keep `assets/js/control-center-v2.js` as the authoritative bulk progress/title renderer and keep `functions/_lib/bulk-jobs.js` as the authoritative server outcome source.
- Do not add another mutation path, another job state machine, or another broad observer.
- Do not alter Whop authorization, import/publish semantics, guide status, tenant ownership, recovery, media policy, billing, or private-guide safety.
- Remaining requested work will continue sequentially after this focused task: branch-check governance where connector permissions allow it, issue #25 custom Whop app readers, paid-subscriber onboarding, and the larger product/UX redesign.

## Starting state
- `main` starts this task at `2c1c6336fc0de14a116801a45a25619b20b3812c` after the completed public-logo optimization.
- Working branch: `improve/bulk-completion-outcome`.
- `functions/_lib/bulk-jobs.js` already returns `outcome: completed-with-issues|completed-successfully` and `issueCount` from server-confirmed failures/held categories.
- `assets/js/control-center-v2.js` currently renders every completed workflow with the generic heading `Bulk job completed`, followed by counts. That makes a workflow with held/failed items look deceptively similar to a clean run.
- `assets/js/control-center-bulk-reset.js` already owns finished-job aftermath/reset UI and already refreshes `/api/bulk-jobs`, so it is the narrowest place to add a subordinate completion explanation without duplicating the authoritative progress renderer.

## Definition of Done
- [ ] Clean completion explicitly says all processed items finished without held/failed issues.
- [ ] Completion with issues explicitly says how many issues need review and that successful publications remain intact.
- [ ] Show the server-provided issue breakdown for source failures, item failures, held files, held integrity/policy, held links, and held permissions when nonzero.
- [ ] Do not label a completed-with-issues workflow as failure or imply successful publications were rolled back.
- [ ] Keep reset/stop behavior unchanged.
- [ ] Add an accessible live outcome note under the existing bulk job card rather than replacing the v2 title/summary renderer.
- [ ] Add targeted regression coverage proving both clean and issue outcomes and preventing a second mutation/state implementation.
- [ ] Run exact-head full Node 22 regression plus Cloudflare preview checks, inspect diff/review state, merge, then require post-merge production checks.

## Backlog after this task
- Required branch-check governance if repository administration endpoints are writable through the active GitHub connection.
- Issue #25 custom Whop app readers.
- Paid-subscriber authentication/billing onboarding.
- Larger product/brand/UX redesign across the public site and Control Center.

## Next step
Implement the completion explanation in the existing bulk reset/aftermath helper, add a regression, and validate the exact branch head before merge.
