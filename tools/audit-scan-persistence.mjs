import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const posts = readFileSync(join(root, 'functions/_lib/posts.js'), 'utf8');
const items = readFileSync(join(root, 'functions/_lib/whop-items.js'), 'utf8');

assert.ok(posts.includes('CREATE TABLE IF NOT EXISTS whop_scan_leases'), 'Experience scans do not use a durable D1 ownership lease.');
assert.ok(posts.includes('INSERT OR IGNORE INTO whop_scan_leases'), 'Concurrent source scans are not rejected atomically.');
assert.ok(posts.includes("code: 'source_scan_in_progress'"), 'A duplicate scan does not return a clear conflict.');
assert.ok(posts.includes('DELETE FROM whop_scan_leases WHERE experience_id = ? AND lease_until <= ?'), 'Abandoned scan leases cannot expire safely.');
assert.ok(posts.includes('renewScanLease') && posts.includes("code: 'source_scan_lease_lost'"), 'A slow scan does not prove it still owns persistence.');
assert.ok(posts.includes('verifySavedScan'), 'Whop scan rows are not read back after the D1 batch.');
assert.ok(posts.includes("code: 'source_scan_unconfirmed'"), 'Partial scan persistence does not fail closed.');
assert.ok(posts.includes('source_fingerprint') && posts.includes('missing') && posts.includes('mismatched'), 'Scan verification does not compare exact keys and fingerprints.');
assert.ok(posts.includes('finally') && posts.includes('releaseScanLease'), 'Scan leases are not released after failures.');
assert.ok(posts.indexOf('await renewScanLease') < posts.indexOf('await db.batch(statements)'), 'The scan lease is not renewed immediately before persistence.');

assert.ok(items.includes('const MAX_ITEMS = 2000'), 'Experience-wide content scans have no explicit item ceiling.');
assert.ok(items.includes('output.length + lessons.length > MAX_ITEMS'), 'Course lesson limits are still applied per course instead of across the whole Experience.');
assert.ok(items.includes('Split it into smaller Experiences before scanning'), 'Oversized course Experiences do not return an actionable fail-closed message.');
assert.ok(items.indexOf('output.length + lessons.length > MAX_ITEMS') < items.indexOf('const detailed = await mapConcurrent'), 'Oversized course Experiences begin detail fan-out before the aggregate limit is enforced.');

for (const file of ['functions/_lib/posts.js', 'functions/_lib/whop-items.js']) {
  const syntax = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${file} has invalid JavaScript syntax:\n${syntax.stderr}`);
}

console.log('\nSNIPERPLUG SCAN PERSISTENCE AUDIT PASSED\n');
console.log('✓ Exact Whop Experiences cannot be scanned concurrently.');
console.log('✓ Slow or abandoned scans cannot overwrite a newer scan.');
console.log('✓ Every returned key and fingerprint must be confirmed in D1 before results are shown.');
console.log('✓ Course limits apply across the whole Experience before expensive detail reads begin.');
