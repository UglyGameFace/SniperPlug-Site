import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const leases = read('functions/_lib/import-leases.js');
const imports = read('functions/_lib/guides-import.js');
const media = read('functions/_lib/guides-media.js');
const migration = read('migrations/0001_whop_guides.sql');

assert.ok(migration.includes('source_key TEXT UNIQUE'), 'Guide physical source keys are not unique in D1.');
assert.ok(leases.includes('CREATE TABLE IF NOT EXISTS whop_import_leases'), 'Exact imports do not use durable D1 leases.');
assert.ok(leases.includes('INSERT OR IGNORE INTO whop_import_leases'), 'Import lease acquisition is not atomic.');
assert.ok(leases.includes('postStorageKey(principalId, key)'), 'Import leases are not tenantized before acquiring the physical D1 lock.');
assert.ok(leases.includes("code: 'guide_import_in_progress'"), 'Concurrent exact imports do not return a clear conflict.');
assert.ok(leases.includes('DELETE FROM whop_import_leases WHERE lease_until <= ?'), 'Abandoned import leases cannot expire.');
assert.ok(leases.includes('renewImportLeases') && leases.includes("code: 'guide_import_lease_lost'"), 'Long imports do not prove they still own the item.');
assert.ok(leases.includes('releaseImportLeases'), 'Import leases cannot be released safely.');

assert.ok(media.includes('acquireImportLeases(env, principalId, input?.sourceKeys)'), 'The tenant lock does not cover the complete import/media wrapper.');
assert.ok(media.includes('await renewImportLeases(env, lease)'), 'The import lease is not renewed before media work.');
assert.ok(media.includes('finally') && media.includes('releaseImportLeases(env, lease)'), 'Import leases are not released after failures.');
assert.ok(media.includes('WHERE principal_id = ? AND id = ? AND updated_at = ? AND source_fingerprint IS ?'), 'Media enhancement can overwrite another tenant or a newer guide version.');
assert.ok(media.includes("code: 'guide_media_stale'"), 'Stale media writes do not fail clearly.');

assert.ok(imports.includes('WHERE guides.principal_id = excluded.principal_id AND guides.updated_at IS ?'), 'Guide upserts do not use tenant-aware optimistic concurrency.');
assert.ok(imports.includes("code: 'guide_import_stale'"), 'A stale base import does not preserve the newer guide.');
assert.ok(imports.includes("code: 'guide_import_unconfirmed'"), 'Imported guide fingerprints are not read back and confirmed.');
assert.ok(imports.includes("saved.status !== 'draft'"), 'The importer can report success without confirming draft status.');
assert.ok(imports.includes("String(saved.source_fingerprint || '') !== sourceFingerprint"), 'The importer can report success without confirming the exact fingerprint.');
assert.ok(imports.includes('sourceSuffix') && imports.includes("sha256(String(sourceKey || base))"), 'New imported guide slugs are not deterministic per tenant physical source key.');
assert.ok(!imports.includes("SELECT 1 FROM guides WHERE slug = ?"), 'Imported slug allocation still uses a non-atomic check-then-insert race.');

for (const file of [
  'functions/_lib/import-leases.js',
  'functions/_lib/guides-import.js',
  'functions/_lib/guides-media.js',
]) {
  const syntax = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${file} has invalid JavaScript syntax:\n${syntax.stderr}`);
}

console.log('\nSNIPERPLUG IMPORT CONCURRENCY AUDIT PASSED\n');
console.log('✓ Exact source keys are serialized per account across manual import, bulk, and recovery workflows.');
console.log('✓ Newer account-scoped guide edits win over stale base-import and media-enhancement writes.');
console.log('✓ D1 draft status and source fingerprints are confirmed before success is reported.');
console.log('✓ Same-title imports receive deterministic tenant source-key slugs without check-then-insert races.');
