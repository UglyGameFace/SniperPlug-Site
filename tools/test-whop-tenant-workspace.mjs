import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OWNER_PRINCIPAL_ID } from '../functions/_lib/auth.js';
import {
  postStorageKey,
  principalIdFrom,
  sourceStorageId,
} from '../functions/_lib/importer-workspace.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const upstreamExperience = 'exp_shared_subscription_source';
const upstreamPost = 'course-lesson:les_shared_item';
const tenantA = 'acct_subscriber_alpha';
const tenantB = 'acct_subscriber_beta';

assert.equal(principalIdFrom({ principalId: tenantA, browserSid: 'browser_a' }), tenantA);
assert.equal(principalIdFrom({ principalId: tenantA, browserSid: 'browser_b' }), tenantA, 'Multiple browser sessions for one subscriber must resolve to the same account principal.');
assert.equal(await sourceStorageId(OWNER_PRINCIPAL_ID, upstreamExperience), upstreamExperience, 'Existing owner source keys must remain backward compatible.');
assert.equal(await postStorageKey(OWNER_PRINCIPAL_ID, upstreamPost), upstreamPost, 'Existing owner post keys must remain backward compatible.');

const sourceA = await sourceStorageId(tenantA, upstreamExperience);
const sourceARepeat = await sourceStorageId(tenantA, upstreamExperience);
const sourceB = await sourceStorageId(tenantB, upstreamExperience);
assert.equal(sourceA, sourceARepeat, 'Tenant source storage keys must be deterministic.');
assert.notEqual(sourceA, sourceB, 'Two subscribers importing the same Whop experience must not share a D1 source key.');
assert.notEqual(sourceA, upstreamExperience, 'Subscriber physical source keys must not expose or collide with the upstream primary key.');

const postA = await postStorageKey(tenantA, upstreamPost);
const postARepeat = await postStorageKey(tenantA, upstreamPost);
const postB = await postStorageKey(tenantB, upstreamPost);
assert.equal(postA, postARepeat, 'Tenant post storage keys must be deterministic.');
assert.notEqual(postA, postB, 'Two subscribers importing the same Whop item must not share a D1 post/guide foreign key.');
assert.notEqual(postA, upstreamPost, 'Subscriber physical post keys must remain separate from logical upstream identifiers.');

const workspace = read('functions/_lib/importer-workspace.js');
const migration = read('migrations/0007_importer_tenant_workspace.sql');
const sourcePolicy = read('functions/_lib/source-policy.js');
const posts = read('functions/_lib/posts.js');
const discovery = read('functions/_lib/discovery.js');
const discoverApi = read('functions/api/discover.js');
const guides = read('functions/_lib/guides.js');
const guideImport = read('functions/_lib/guides-import.js');
const guideMedia = read('functions/_lib/guides-media.js');
const browserCapture = read('functions/_lib/browser-capture.js');
const browserCaptureApi = read('functions/api/browser-capture.js');
const control = read('functions/api/control.js');
const publish = read('functions/_lib/publish.js');
const publicSearch = read('functions/_lib/guide-search.js');
const bulk = read('functions/_lib/bulk-jobs.js');
const recent = read('functions/_lib/recent-actions.js');
const backups = read('functions/_lib/whop-backups.js');
const backupApi = read('functions/api/whop-backups.js');
const recovery = read('functions/api/guide-repair.js');
const mediaRepair = read('functions/api/guide-media-repair.js');
const safeSave = read('functions/_lib/guides-owner-save.js');
const safeSaveApi = read('functions/api/guide-save-safe.js');
const snapshots = read('functions/_lib/guide-snapshots.js');
const versioning = read('functions/_lib/guide-versioning.js');
const recoveryLeases = read('functions/_lib/recovery-leases.js');

for (const text of [workspace, migration]) {
  for (const column of ['principal_id', 'upstream_experience_id', 'upstream_source_key']) {
    assert.ok(text.includes(column), `Tenant workspace schema is missing ${column}.`);
  }
  assert.ok(text.includes('idx_whop_sources_principal_upstream'), 'Source tenant uniqueness is missing.');
  assert.ok(text.includes('idx_whop_posts_principal_upstream'), 'Post tenant uniqueness is missing.');
  assert.ok(text.includes('idx_guides_principal_upstream'), 'Guide tenant uniqueness is missing.');
}

assert.ok(sourcePolicy.includes('WHERE principal_id = ? AND upstream_experience_id = ?'), 'Source decisions are not scoped to account + upstream experience.');
assert.ok(posts.includes('WHERE principal_id = ? AND upstream_source_key IN'), 'Post decisions are not scoped to the account workspace.');
assert.ok(posts.includes('postStorageKey(principalId, post.sourceKey)'), 'Scanned posts do not receive tenant-specific physical keys.');
assert.ok(discovery.includes('sourceDecision(env, principalValue, experience, experience.id)'), 'Discovery can still read another principal’s saved source decision.');
assert.ok(discoverApi.includes('discoverWhopSources(session, context.env, admin, memberships)'), 'Discovery API does not carry the authenticated principal into discovery.');

assert.ok(guides.includes('WHERE guides.principal_id = ?'), 'Private guide listing/detail is not principal-scoped.');
assert.ok(guides.includes('principalId !== OWNER_PRINCIPAL_ID'), 'Subscriber guide status changes can still publish to the public site.');
assert.ok(guideImport.includes('WHERE principal_id = ? AND upstream_source_key = ?'), 'Native guide import can still collide with another tenant’s logical source.');
assert.ok(guideImport.includes('principal_id, upstream_source_key'), 'Native guide inserts do not persist tenant identity and logical source identity.');
assert.ok(guideMedia.includes('WHERE principal_id = ? AND upstream_source_key = ?'), 'Media enhancement can address another tenant’s imported guide.');

assert.ok(browserCapture.includes('postStorageKey(principalId, sourceKey)'), 'Better Content capture does not tenantize its D1 source/guide foreign key.');
assert.ok(browserCapture.includes('WHERE principal_id = ? AND upstream_source_key = ?'), 'Better Content capture can still read another tenant’s guide.');
assert.ok(browserCaptureApi.includes('importBrowserCaptures(context.env, admin, whop, body)'), 'Browser-capture API drops the authenticated principal.');
assert.ok(control.includes('listAdminGuideSummaries(env, admin)'), 'Control Center dashboard can still list a global guide workspace.');
assert.ok(control.includes('scanApprovedSource(env, admin, whop, experience)'), 'Control Center scanning drops the account principal.');
assert.ok(control.includes('importApprovedPosts(env, admin, whop, body)'), 'Control Center importing drops the account principal.');

assert.ok(publish.includes('principalId !== OWNER_PRINCIPAL_ID'), 'Public publisher is not owner-only.');
assert.ok(publicSearch.includes("guides.principal_id = ?"), 'Public guide search does not restrict results to the owner publishing workspace.');
assert.ok(bulk.includes('const JOB_VERSION = 5'), 'Unsafe pre-tenant bulk jobs are not version-invalidated.');
assert.ok(bulk.includes('principalId === OWNER_PRINCIPAL_ID'), 'Subscriber bulk jobs can still reach the public publisher.');
assert.ok(recent.includes('WHERE principal_id = ?'), 'Recent actions or undo can address another tenant’s guide workspace.');

assert.ok(backups.includes('WHERE backup_id = ? AND owner_session_id = ?'), 'Backup lookup is not account-scoped.');
assert.ok(backups.includes('This backup belongs to a different SniperPlug account'), 'Cross-account backup restore does not fail closed.');
assert.ok(backups.includes('WHERE principal_id = ? AND source_experience_id IS NOT NULL'), 'Backup snapshot/reset can still sweep guides globally.');
assert.ok(backupApi.includes('listWhopImportBackups(env, admin)'), 'Backup API does not list only the authenticated principal’s backups.');
assert.ok(backupApi.includes('restoreWhopImportBackup(env, admin, id, body)'), 'Backup restore API drops the principal.');

for (const text of [recovery, mediaRepair, safeSave, snapshots, versioning, recoveryLeases]) {
  assert.ok(text.includes('principal_id'), 'A guide recovery/save/version path still lacks explicit tenant ownership checks.');
}
assert.ok(safeSaveApi.includes('const admin = await requireAdmin') && safeSaveApi.includes('saveGuideDraft(context.env, admin, id, body)'), 'Safe guide save does not pass the authenticated principal.');

console.log('\nWHOP TENANT WORKSPACE REGRESSION PASSED\n');
console.log('✓ Same subscriber + same upstream data maps deterministically; different subscribers get different physical keys.');
console.log('✓ Source, post, guide, browser-capture, bulk, history, backup, rollback, and recovery paths carry an explicit principal boundary.');
console.log('✓ Subscriber workspaces remain private while public guide publishing/search stays owner-only.');
