import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  backupJsonBatches,
  deleteBackupConfirmationPhrase,
  resetConfirmationPhrase,
  restoreConfirmationPhrase,
  stableBackupJson,
} from '../functions/_lib/whop-backups.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const migration = read('migrations/0004_whop_import_backups.sql');
const tenantMigration = read('migrations/0007_importer_tenant_workspace.sql');
const service = read('functions/_lib/whop-backups.js');
const endpoint = read('functions/api/whop-backups.js');
const sourcePolicy = read('functions/_lib/source-policy.js');
const posts = read('functions/_lib/posts.js');
const mediaStorage = read('functions/_lib/media-storage.js');
const html = read('control-center/index.html');
const client = read('assets/js/control-center-whop-backups.js');
const css = read('assets/css/whop-backups.css');
const docs = read('docs/WHOP_IMPORTER.md');
const packageJson = JSON.parse(read('package.json'));

assert.equal(stableBackupJson({ z: 1, a: { d: 2, b: 1 } }), '{"a":{"b":1,"d":2},"z":1}');
assert.equal(resetConfirmationPhrase({ scope: 'source', experienceId: 'exp_ABC123xyz' }), 'CLEAR SOURCE 123XYZ');
assert.equal(resetConfirmationPhrase({ scope: 'all' }, true), 'RESET WHOP IMPORTER INCLUDING PUBLISHED');
assert.equal(restoreConfirmationPhrase('wib_abcdefgh123456'), 'RESTORE 123456');
assert.equal(deleteBackupConfirmationPhrase('wib_abcdefgh123456'), 'DELETE BACKUP 123456');
const batches = backupJsonBatches([{ body: 'a'.repeat(800_000) }, { body: 'b'.repeat(800_000) }]);
assert.equal(batches.length, 2, 'JSON restore batches can exceed the D1 2 MB value limit.');

for (const column of ['archive_key', 'archive_checksum', 'archive_bytes']) assert.ok(migration.includes(column), `Migration is missing ${column}.`);
assert.ok(!migration.includes('whop_import_backup_rows') && !migration.includes('whop_import_backup_media'), 'Backups still create one D1 row per imported method or media item.');
assert.ok(!migration.includes('ALTER TABLE whop_posts ADD COLUMN stale_at TEXT'), 'Migration can fail after runtime already added stale_at.');
assert.ok(service.includes("addColumn(db, 'whop_posts', 'stale_at', 'TEXT')"), 'Runtime does not add stale_at idempotently.');
assert.ok(service.includes('CREATE INDEX IF NOT EXISTS idx_whop_posts_current'), 'Runtime does not create the stale-post index after ensuring the column.');
assert.ok(posts.includes('stale_at = NULL') && posts.includes('SET stale_at = ?') && posts.includes('AND stale_at IS NULL'));
assert.ok(posts.includes('reattachPreservedWhopGuides(env, logicalExperienceId, principalId)'), 'Fresh account scans do not reattach preserved guides inside the same tenant workspace.');

assert.ok(tenantMigration.includes('principal_id') && tenantMigration.includes('upstream_experience_id') && tenantMigration.includes('upstream_source_key'), 'Tenant workspace migration is missing backup-critical account/upstream identity columns.');
assert.ok(service.includes('async function currentScopeRows(db, principalId, scope)'), 'Backup snapshots are not account-scoped.');
assert.ok(service.includes('WHERE principal_id = ?') && service.includes('upstream_experience_id'), 'Backup source/post snapshots can still sweep another account.');
assert.ok(service.includes('WHERE principal_id = ? AND source_experience_id IS NOT NULL'), 'Backup guide snapshots can still sweep another account.');

assert.ok(service.includes('export const WHOP_BACKUP_SCHEMA_VERSION = 2'));
assert.ok(service.includes('const MAX_BACKUP_BYTES = 10_000_000'));
assert.ok(service.includes('prepareMediaCopy') && service.includes('SNIPERPLUG_MEDIA.put') && service.includes('completeMediaCopy'));
assert.ok(service.includes('new Blob([archive.archiveJson]') && service.includes('archive_checksum'));
assert.ok(service.includes('async function buildWhopBackupArchive') && service.includes('payloadBytes: archive.archiveBytes'), 'Preview and create do not share exact archive sizing.');
assert.ok(service.includes('const archive = await buildWhopBackupArchive(env, snapshot, principalId)'), 'Backup archive identity is not bound to the stable account principal.');
assert.ok(!service.includes('const estimatedBytes = byteLength(stableBackupJson(snapshot.entities))'));
assert.ok(endpoint.includes("previewWhopReset(env, account, body)"), 'Preview archive sizing is not bound to the same account principal as creation.');
assert.ok(service.includes('verifyValue(backupSignatureValue') && service.includes("row.owner_session_id || ''"));
assert.ok(service.includes('principalId: principalId') || service.includes('principalId,'), 'Signed backup manifest does not carry account principal identity.');
assert.ok(service.includes('This backup belongs to a different SniperPlug account'), 'Cross-account backup archives do not fail closed.');
assert.ok(service.includes('stableScope.contentChecksum !== snapshot.contentChecksum'));
assert.ok(service.includes("code: 'backup_scope_changed_during_create'"));
assert.ok(service.includes('FROM json_each(?)'), 'Restore does not use D1 JSON batching.');
assert.ok(service.includes('backupJsonBatches') && service.includes('JSON_BATCH_BYTES = 1_400_000'));
assert.ok(!service.includes('whop_import_backup_rows') && !service.includes('whop_import_backup_media'));
assert.ok(service.includes("AND status != 'published'") && service.includes('deletePublished'));
assert.ok(service.includes('current.contentChecksum !== verified.manifest.contentChecksum'));
assert.ok(service.includes('guideEquivalent(before, snapshot)') && service.includes('current-guide-differs'));
assert.ok(service.includes('SET deleted_at = ?') && service.includes("row.archive_key ? 'grace-period' : 'none'"));
const deleteStart = service.indexOf('export async function deleteWhopImportBackup');
assert.ok(deleteStart >= 0, 'Backup deletion service is missing.');
const deleteBody = service.slice(deleteStart);
assert.ok(deleteBody.includes('backupRow(db, principalId, backupId)'), 'Backup deletion can address a backup outside the account principal.');
assert.ok(!deleteBody.includes('const verified = await verifyBackup'));

assert.ok(mediaStorage.includes('SELECT archive_key, manifest_json') && mediaStorage.includes('manifest?.mediaKeys'));
assert.ok(endpoint.includes('requireControlAccount') && endpoint.includes('requireSameOrigin'));
assert.ok(endpoint.includes('exportWhopImportBackup(context.env, account, id)') && endpoint.includes('exported.archiveJson') && endpoint.includes("new Response(String(archiveJson || '')"), 'Backup download is not account-scoped.');
assert.ok(endpoint.indexOf('retrieveExperience(whop, resetContext.experienceId)') < endpoint.indexOf('resetWhopImporter(env, account, id, body)'));
assert.ok(endpoint.includes('The verified reset completed, but fresh Whop resync did not finish'));
assert.ok(endpoint.includes("code: 'backup_restore_retry_safe'"));
assert.ok(endpoint.includes('restoreWhopImportBackup(env, account, id, body)') && endpoint.includes('deleteWhopImportBackup(env, account,'), 'Restore or delete drops the authenticated account principal.');
assert.ok(endpoint.includes('saveSourceDecision(env, account, experience') && endpoint.includes('scanApprovedSource(env, account, whop, experience)'), 'Post-reset resync can write into a different account workspace.');

assert.ok(endpoint.includes('async function enrichBackupIdentity(env, principalValue, backups, sources)'));
assert.ok(endpoint.includes('owner_session_id = ?') && endpoint.includes('UPDATE whop_import_backups SET label = ?'), 'Backup label repair can mutate another account’s archive metadata.');
assert.ok(endpoint.includes('displayLabel: effectiveLabel') && endpoint.includes('groupLabel: groupLabel(source?.groupKey)'));
assert.ok(endpoint.includes("const result = await createWhopImportBackup(env, account, body)") && endpoint.includes('const [backup] = await enrichBackupIdentity(env, account, [result.backup], sources)'), 'New backups are not account-scoped and labeled before destructive reset can remove source metadata.');
assert.ok(client.includes('backup.displayLabel || backup.label'));
assert.ok(client.includes('Source ID …${sourceSuffix} · Backup ID …${backupSuffix}'));
assert.ok(client.includes('Restore “${backup.displayLabel || backup.label}”?') && client.includes('Delete backup “${backup.displayLabel || backup.label}”?'));

assert.ok(sourcePolicy.includes('export const DEFAULT_WHOP_GROUPS'));
assert.ok(endpoint.includes('DEFAULT_WHOP_GROUPS') && endpoint.includes('sourceCount'));
assert.ok(endpoint.includes('groupKey: source.groupKey || null'));
assert.ok(html.includes('<option value="group">One saved Whop group</option>'));
assert.ok(html.includes('data-backup-group-field') && html.includes('data-backup-group'));
assert.ok(client.includes("return { scope: 'group', groupKey:"));
assert.ok(client.includes('async function createGroupBackup(groupKey)'));
assert.ok(client.includes("scope: 'source'") && client.includes('experienceId: source.experienceId'));
assert.ok(client.includes("result.backup.status !== 'verified'"), 'Group orchestration can accept an unverified child backup.');
assert.ok(client.includes('resetOption.disabled = groupSelected'));
assert.ok(client.includes('Whole-group recovery is backup-only for safety'));
assert.ok(service.includes("!['all', 'source'].includes(scope)"), 'Group UI must not bypass the proven source/all archive schema.');
assert.ok(migration.includes("CHECK (scope IN ('all', 'source'))"), 'Group UI unexpectedly changed the durable backup scope schema.');

assert.ok(html.includes('data-whop-backup-panel') && html.includes('data-backup-dialog'));
assert.equal((html.match(/control-center-whop-backups\.js/g) || []).length, 1);
assert.equal((html.match(/whop-backups\.css/g) || []).length, 1);
assert.ok(client.includes("root.dataset.whopBackupMounted === 'true'"));
assert.ok(client.indexOf('createBackup({ authorizeReset: true })') < client.indexOf("post('reset'"));
assert.ok(client.includes("backup.status === 'verified'") && client.includes('quiet: true, force: true'));
assert.ok(client.includes('Delete incomplete backup') && client.includes('whop-backup-incomplete'));
assert.ok(client.includes("warning ? 'warning' : 'ok'"));
assert.ok(css.includes('.whop-backup-dialog') && css.includes('@media (max-width: 720px)'));

assert.ok(docs.includes('0004_whop_import_backups.sql') && docs.includes('Backup, clear, and restore'));
assert.ok(docs.includes('R2 recovery archive'));
assert.ok(packageJson.scripts.audit.includes('audit-whop-backups.mjs'));

for (const file of [
  'functions/_lib/whop-backups.js',
  'functions/api/whop-backups.js',
  'functions/_lib/posts.js',
  'functions/_lib/media-storage.js',
  'assets/js/control-center-whop-backups.js',
  'tools/audit-whop-backups.mjs',
]) {
  const syntax = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${file} has invalid JavaScript syntax:\n${result.stderr}`);
}

console.log('\nSNIPERPLUG WHOP BACKUP / RESET / RESTORE AUDIT PASSED\n');
console.log('✓ Complete signed backups live in bounded R2 archives, not one D1 query per method.');
console.log('✓ Snapshots, backup metadata, download, reset, restore, delete, and resync stay inside one currently entitled account principal.');
console.log('✓ D1 stores the verified manifest and uses bounded JSON batches for restore.');
console.log('✓ Reset requires a current verified archive and preserves published guides by default.');
console.log('✓ Whole-group backup safely creates one independently verified archive per saved source.');
console.log('✓ Recovery history keeps exact source and backup identities distinguishable on mobile.');
console.log('✓ Backup archives and their referenced media remain pinned through the cleanup grace model.');
console.log('✓ Stale posts disappear from review and preserved guides reconnect only inside their account workspace.');
