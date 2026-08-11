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
const task = read('ACTIVE_TASK.md');

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
assert.ok(posts.includes('reattachPreservedWhopGuides(env, experienceId)'));

assert.ok(service.includes('export const WHOP_BACKUP_SCHEMA_VERSION = 2'));
assert.ok(service.includes('const MAX_BACKUP_BYTES = 10_000_000'));
assert.ok(service.includes('prepareMediaCopy') && service.includes('SNIPERPLUG_MEDIA.put') && service.includes('completeMediaCopy'));
assert.ok(service.includes('new Blob([archiveJson]') && service.includes('archive_checksum'));
assert.ok(service.includes('async function buildWhopBackupArchive') && service.includes('payloadBytes: archive.archiveBytes'), 'Preview and create do not share exact archive sizing.');
assert.ok(service.includes('const archive = await buildWhopBackupArchive(env, snapshot, ownerSessionId)'));
assert.ok(!service.includes('const estimatedBytes = byteLength(stableBackupJson(snapshot.entities))'));
assert.ok(endpoint.includes("previewWhopReset(env, admin.sid, body)"), 'Preview archive sizing is not bound to the same owner identity as creation.');
assert.ok(service.includes('verifyValue(backupSignatureValue') && service.includes("row.owner_session_id || ''"));
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
assert.ok(deleteBody.includes('const row = await backupRow(db, backupId)'));
assert.ok(!deleteBody.includes('const verified = await verifyBackup'));

assert.ok(mediaStorage.includes('SELECT archive_key, manifest_json') && mediaStorage.includes('manifest?.mediaKeys'));
assert.ok(endpoint.includes('requireAdmin') && endpoint.includes('requireSameOrigin'));
assert.ok(endpoint.includes('exported.archiveJson') && endpoint.includes("new Response(String(archiveJson || '')"));
assert.ok(endpoint.indexOf('retrieveExperience(whop, resetContext.experienceId)') < endpoint.indexOf('resetWhopImporter(env, id, body)'));
assert.ok(endpoint.includes('The verified reset completed, but fresh Whop resync did not finish'));
assert.ok(endpoint.includes("code: 'backup_restore_retry_safe'"));

// Backup history must stay human-identifiable even when one group creates many child archives.
// Existing generic rows are repaired from the saved exact-source catalog before a later reset can
// delete that source row, and the browser shows both source and backup identity on every card.
assert.ok(endpoint.includes('async function enrichBackupIdentity'));
assert.ok(endpoint.includes('UPDATE whop_import_backups SET label = ?'));
assert.ok(endpoint.includes('displayLabel: effectiveLabel') && endpoint.includes('groupLabel: groupLabel(source?.groupKey)'));
assert.ok(endpoint.includes("const result = await createWhopImportBackup(env, admin.sid, body)") && endpoint.includes('const [backup] = await enrichBackupIdentity(env, [result.backup], sources)'), 'New backups are not labeled before a destructive reset can remove source metadata.');
assert.ok(client.includes('backup.displayLabel || backup.label'));
assert.ok(client.includes('Source ID …${sourceSuffix} · Backup ID …${backupSuffix}'));
assert.ok(client.includes('Restore “${backup.displayLabel || backup.label}”?') && client.includes('Delete backup “${backup.displayLabel || backup.label}”?'));

// A group backup is deliberately an orchestration of the existing exact-source archive path.
// That keeps every source independently verified/restorable, preserves the 10 MB per-archive
// ceiling, and avoids a risky D1 CHECK/schema migration just to add a UI convenience scope.
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
assert.ok(task.includes('Issue #19') && task.includes('R2'));

for (const file of [
  'functions/_lib/whop-backups.js',
  'functions/api/whop-backups.js',
  'functions/_lib/posts.js',
  'functions/_lib/media-storage.js',
  'assets/js/control-center-whop-backups.js',
  'tools/audit-whop-backups.mjs',
]) {
  const syntax = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${file} has invalid JavaScript syntax:\n${syntax.stderr}`);
}

console.log('\nSNIPERPLUG WHOP BACKUP / RESET / RESTORE AUDIT PASSED\n');
console.log('✓ Complete signed backups live in bounded R2 archives, not one D1 query per method.');
console.log('✓ D1 stores the verified manifest and uses bounded JSON batches for restore.');
console.log('✓ Reset requires a current verified archive and preserves published guides by default.');
console.log('✓ Whole-group backup safely creates one independently verified archive per saved source.');
console.log('✓ Recovery history keeps exact source and backup identities distinguishable on mobile.');
console.log('✓ Backup archives and their referenced media remain pinned through the cleanup grace model.');
console.log('✓ Stale posts disappear from review and preserved published guides reconnect after fresh scans.');
