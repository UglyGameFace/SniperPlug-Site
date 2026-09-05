import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const helper = read('assets/js/control-center-bulk-reset.js');
const bulk = read('functions/_lib/bulk-jobs.js');
const runtime = read('assets/js/control-center-v2.js');

assert.ok(
  bulk.includes("outcome: row.status === 'completed' ? (issues ? 'completed-with-issues' : 'completed-successfully') : row.status")
    && bulk.includes('issueCount: issues'),
  'Bulk API must remain the authoritative source for clean versus completed-with-issues outcomes.',
);

assert.ok(
  helper.includes("outcome.dataset.bulkJobOutcome = ''")
    && helper.includes("outcome.setAttribute('role', 'status')")
    && helper.includes("outcome.setAttribute('aria-live', 'polite')"),
  'Finished bulk outcome explanation must be local, persistent, and accessible.',
);

assert.ok(
  helper.includes("job.outcome === 'completed-with-issues' || issueCount > 0")
    && helper.includes('Completed with ${issueCount')
    && helper.includes('Successful publications remain published.')
    && helper.includes('nothing was silently treated as a clean success.'),
  'Completed-with-issues jobs must clearly explain that successful publications remain intact while held/failed items need review.',
);

assert.ok(
  helper.includes("outcomeTitle.textContent = 'Completed successfully.'")
    && helper.includes('Every processed source finished without held or failed items.'),
  'Clean completion must be explicitly distinguishable from completion with issues.',
);

for (const marker of [
  "['source failures', Number(job?.failures?.length || 0)]",
  "['item failures', Number(summary.itemFailures || 0)]",
  "['files held', Number(summary.heldFiles || 0)]",
  "['integrity/policy holds', Number(summary.heldIntegrity || 0)]",
  "['link holds', Number(summary.heldLinks || 0)]",
  "['permission holds', Number(summary.heldPermissions || 0)]",
]) {
  assert.ok(helper.includes(marker), `Bulk completion issue breakdown is missing: ${marker}`);
}

assert.ok(
  !helper.includes("querySelector('[data-bulk-job-title]')")
    && !helper.includes("querySelector('[data-bulk-job-summary]')"),
  'Bulk aftermath helper must not become a second owner of the authoritative v2 title/summary renderer.',
);

assert.ok(
  runtime.includes("elements.bulkJobTitle.textContent = job.status === 'active'")
    && runtime.includes('elements.bulkJobSummary.textContent = `${progress.completed}/${progress.total} sources'),
  'Existing Control Center runtime must remain the authoritative bulk progress/title renderer.',
);

assert.ok(!helper.includes('MutationObserver'), 'Bulk completion feedback must not add broad DOM observation.');
assert.ok(
  helper.includes("body ? '/api/bulk-job-reset' : '/api/bulk-jobs'")
    && !helper.includes("fetch('/api/bulk-jobs', { method: 'POST'"),
  'Bulk outcome feedback must remain read-only; only the existing reset endpoint may mutate finished-job state.',
);

console.log('Bulk completion outcome regression passed.');
console.log('- Clean completion is explicit.');
console.log('- Completed-with-issues preserves successful publications and exposes the server issue breakdown.');
console.log('- v2 remains the authoritative bulk renderer and no duplicate state machine was added.');
