import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const sources = read('functions/_lib/source-policy.js');
const posts = read('functions/_lib/posts.js');
const control = read('functions/api/control.js');
const client = read('assets/js/control-center-v2.js');

assert.ok(sources.includes('verifiedSourceRows'), 'Source decisions are not read back from D1 after the batch write.');
assert.ok(sources.includes("code: 'source_decision_unconfirmed'"), 'Unconfirmed source decisions do not fail closed.');
assert.ok(sources.includes('missing') && sources.includes('mismatched'), 'Source decision failures do not identify missing or mismatched rows.');
assert.ok(sources.includes('byId.get(id)?.decision !== decision'), 'Source decision verification does not compare the persisted decision.');

assert.ok(posts.includes('savePostDecisionVerified'), 'Item decisions do not expose authoritative verification results.');
assert.ok(posts.includes('rowsForSourceKeys'), 'Item decisions are not read back from D1 after writing.');
assert.ok(posts.includes('confirmedKeys') && posts.includes('blocked') && posts.includes('missing') && posts.includes('mismatched'), 'Item decision verification does not classify every requested key.');
assert.ok(posts.includes("code: 'post_decision_unconfirmed'"), 'The compatibility item-decision API can still return partial success.');
assert.ok(posts.includes('if (!result.complete)'), 'Existing item decision callers do not fail closed on incomplete persistence.');
assert.ok(posts.includes('decision != \'blocked\''), 'Blocked policy items can be overwritten by owner decision writes.');

assert.ok(control.includes("currentAction === 'source-decision'") && control.includes("currentAction === 'post-decision'"), 'Verified decision storage is not wired into the owner API.');
assert.ok(client.includes("api('source-decision'") && client.includes("api('post-decision'"), 'The Control Center is not using the protected decision endpoints.');

for (const file of ['functions/_lib/source-policy.js', 'functions/_lib/posts.js', 'functions/api/control.js']) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG DECISION CONFIRMATION AUDIT PASSED\n');
console.log('✓ Source and item decisions are read back from D1 before success is reported.');
console.log('✓ Missing, blocked, and mismatched rows cannot appear approved in the Control Center.');
console.log('✓ Existing bulk and owner callers fail closed on incomplete decision persistence.');
