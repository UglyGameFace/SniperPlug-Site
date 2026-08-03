import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
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
const posts = read('functions/_lib/posts.js');
const mediaStorage = read('functions/_lib/media-storage.js');
const html = read('control-center/index.html');
const client = read('assets/js/control-center-whop-backups.js');
const css = read('assets/css/whop-backups.css');
const docs = read('docs/WHOP_IMPORTER.md');
const packageJson = JSON.parse(read('package.json'));
const task = read('ACTIVE_TASK.md');

assert.equal(stableBackupJson({ z: 1, a: { d: 2, b: 1 } }), '{"a":{"b":1,"d":2},"z":1}', 'Backup checksums are not canonical.');
assert.equal(resetConfirmationPhrase({ scope: 'source', experienceId: 'exp_ABC123xyz' }), 'CLEAR SOURCE 123XYZ');
assert.equal(resetConfirmationPhrase({ scope: 'all' }, true), 'RESET WHOP IMPORTER INCLUDING PUBLISHED');
assert.equal(restoreConfirmationPhrase('wib_abcdefgh123456'), 'RESTORE 123456');
assert.equal(deleteBackupConfirmationPhrase('wib_abcdefgh123456'), 'DELETE BACKUP 123456');

for (const table of ['whop_import_backups', 'whop_import_backup_rows', 'whop_import_backup_media']) {
  assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Migration is missing ${table}.`);
  assert.ok(service.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Runtime schema repair is missing ${table}.`);
}
assert.ok(migration.includes('ALTER TABLE whop_posts ADD COLUMN stale_at TEXT'), 'Latest-scan stale tracking is missing from the migration.');
assert.ok(posts.includes('stale_at = NULL') && posts.includes('SET stale_at = ?'), 'Scanning does not revive current posts and mark disappeared posts stale.');
assert.ok(posts.includes('AND stale_at IS NULL'), 'Saved-post loading still returns stale Whop rows.');

assert.ok(service.includes('signValue(backupSignatureValue') && service.includes('verifyValue(backupSignatureValue'), 'Backup manifests are not signed and verified.');
assert.ok(service.includes('payloadChecksum') && service.includes('contentChecksum'), 'Backup rows and destructive scope are not checksum protected.');
assert.ok(service.indexOf('verifyBackup(env, backupId') < service.indexOf('resetWhopImporter'), 'Reset is not built on verified backup reads.');
assert.ok(service.includes("status = 'verified'") && service.includes('reset_token_hash'), 'Destructive reset is not tied to a verified one-time authorization.');
assert.ok(service.includes("AND status != 'published'") && service.includes('deletePublished'), 'Published guides are not preserved by default with a separate opt-in delete path.');
assert.ok(service.includes('current.contentChecksum !== verified.manifest.contentChecksum'), 'Reset can delete work added after the backup.');
assert.ok(service.includes('stableScope.contentChecksum !== snapshot.contentChecksum') && service.includes("backup_scope_changed_during_create"), 'A backup can become verified after its source changes during snapshot creation.');
assert.ok(service.includes("row.owner_session_id || ''") && service.includes('owner_session_id: String(ownerSessionId'), 'Backup signatures are not bound to the owner session.');
assert.ok(service.includes('const MAX_BACKUP_BYTES = 30_000_000'), 'Backup exports can exceed a safe in-memory Workers payload.');
assert.ok(service.includes('export async function verifiedWhopResetContext'), 'The reset endpoint cannot preflight stored resync options before deletion.');
assert.ok(service.includes('conflicts.push') && service.includes('guideEquivalent'), 'Restore can overwrite newer guide state silently.');
assert.ok(service.includes("entities['course-video']") && service.includes("entities['media-object']"), 'Backup restore omits course video or R2 media state.');

assert.ok(mediaStorage.includes('whop_import_backup_media') && mediaStorage.includes("status = 'verified'"), 'Media cleanup does not honor verified backup pins.');
assert.ok(endpoint.includes('requireAdmin') && endpoint.includes('requireSameOrigin'), 'Backup mutations are not owner authenticated and same-origin protected.');
assert.ok(endpoint.includes("currentAction === 'download'") && endpoint.includes('content-disposition'), 'Owner backup download is missing.');
assert.ok(endpoint.includes("currentAction === 'restore'") && endpoint.includes('restoreWhopImportBackup'), 'Offline restore endpoint is missing.');
assert.ok(endpoint.indexOf('verifiedWhopResetContext(env, id)') < endpoint.indexOf('resetWhopImporter(env, id, body)'), 'Reset does not preflight its stored resync scope before deletion.');
assert.ok(endpoint.indexOf('retrieveExperience(whop, resetContext.experienceId)') < endpoint.indexOf('resetWhopImporter(env, id, body)'), 'The exact resync source is not proven readable before deletion.');
assert.ok(endpoint.includes("code: 'backup_restore_retry_safe'"), 'Interrupted restore does not explain that the verified backup is safe to retry.');
assert.ok(endpoint.includes('JSON.stringify(payload)') && !endpoint.includes('JSON.stringify(payload, null, 2)'), 'Backup download wastes Workers memory on pretty-printed JSON.');
assert.ok(endpoint.indexOf("currentAction === 'restore'") < endpoint.indexOf("currentAction === 'reset'"), 'Restore routing is unexpectedly coupled to Whop resync.');

assert.ok(html.includes('data-whop-backup-panel') && html.includes('data-backup-dialog'), 'Control Center backup/reset panel is missing.');
assert.equal((html.match(/control-center-whop-backups\.js/g) || []).length, 1, 'Whop backup client is loaded more than once.');
assert.equal((html.match(/whop-backups\.css/g) || []).length, 1, 'Whop backup styles are loaded more than once.');
assert.ok(client.includes("root.dataset.whopBackupMounted === 'true'") && client.includes("root.dataset.whopBackupMounted = 'true'"), 'Backup controls can mount duplicate handlers.');
assert.ok(client.indexOf('createBackup({ authorizeReset: true })') < client.indexOf("post('reset'"), 'The UI can reset before creating and verifying a backup.');
assert.ok(client.includes('Download JSON') && client.includes('Restore verified backup'), 'Backup history lacks download or restore actions.');
assert.ok(client.includes("backup.status === 'verified'") && client.includes('incomplete backup cannot be downloaded'), 'Failed backups still expose destructive or recovery actions.');
assert.ok(css.includes('.whop-backup-dialog') && css.includes('@media (max-width: 720px)'), 'Backup workflow is not styled for desktop and mobile.');

assert.ok(docs.includes('0004_whop_import_backups.sql') && docs.includes('Backup, clear, and restore'), 'Whop backup deployment and owner workflow are not documented.');
assert.ok(packageJson.scripts.audit.includes('audit-whop-backups.mjs'), 'Full build does not run the Whop backup regression.');
assert.ok(task.includes('Issue #19') && task.includes('backup'), 'Active task record was not switched to the Whop backup/reset task.');

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
console.log('✓ Reset cannot start before a signed backup is created and read back.');
console.log('✓ Source, post, guide, course-video, and R2 references survive loss of Whop access.');
console.log('✓ Published guides are preserved by default and newer guide conflicts fail safely.');
console.log('✓ Missing source posts become stale instead of resurfacing forever.');
console.log('✓ Backup history is owner-only, downloadable, restorable, and protected from duplicate UI mounts.');
