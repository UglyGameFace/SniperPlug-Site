import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { importBrowserCaptures, BETTER_CONTENT_APP_ID } from '../functions/_lib/browser-capture.js';
import { adminGuide, publicGuide, saveGuideDraft, setGuideStatus } from '../functions/_lib/guides.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(join(root, 'migrations/0001_whop_guides.sql'), 'utf8');

class D1StatementMock {
  constructor(db, sql, bindings = []) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }
  bind(...bindings) { return new D1StatementMock(this.db, this.sql, bindings); }
  async first() { return this.db.prepare(this.sql).get(...this.bindings) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.bindings) }; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.bindings);
    return { success: true, meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class D1DatabaseMock {
  constructor(db) { this.db = db; }
  prepare(sql) { return new D1StatementMock(this.db, sql); }
  async batch(statements) {
    const output = [];
    for (const statement of statements) output.push(await statement.run());
    return output;
  }
}

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(migration);
const env = { SNIPERPLUG_DB: new D1DatabaseMock(sqlite) };
const owner = { principalId: 'sniperplug-owner' };
const subscriber = { principalId: 'subscriber-test' };
const whopSession = { accessToken: 'guide-publish-roundtrip-token' };
const experienceId = 'exp_publish_roundtrip';
const companyId = 'biz_hidden_files';
const productId = 'prod_hidden_files';
const appUrl = `https://mfk8y74zmein6tne8o5e.apps.whop.com/experiences/${experienceId}/pages/profit`;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.whop.com');
  assert.equal(init?.headers?.authorization, `Bearer ${whopSession.accessToken}`);
  if (url.pathname === '/api/v1/memberships') {
    return new Response(JSON.stringify({
      data: [{
        id: 'mem_hidden_files', status: 'active', joined_at: '2026-01-01T00:00:00.000Z',
        user: { id: 'user_owner' },
        company: { id: companyId, title: 'Hidden Files' },
        product: { id: productId, title: 'Hidden Files Membership' },
      }],
      page_info: { has_next_page: false, end_cursor: null },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.pathname === `/api/v1/experiences/${experienceId}`) {
    return new Response(JSON.stringify({
      id: experienceId,
      name: 'Make Money Here',
      app: { id: BETTER_CONTENT_APP_ID, name: 'Better Content' },
      company: { id: companyId, title: 'Hidden Files' },
      product: { id: productId, title: 'Hidden Files Membership' },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected Whop request during guide publish roundtrip: ${url}`);
};

try {
  const capture = await importBrowserCaptures(env, owner, whopSession, {
    rightsConfirmed: true,
    captures: [{
      experienceId,
      title: 'PUBLISH ROUNDTRIP GUIDE',
      pageUrl: `${appUrl}?view=member`,
      frameUrl: appUrl,
      pageIdentity: `${appUrl}|PUBLISH ROUNDTRIP GUIDE`,
      documentTitle: 'PUBLISH ROUNDTRIP GUIDE',
      appHint: 'Better Content',
      bodyMarkdown: '# PUBLISH ROUNDTRIP GUIDE\n\nThis is a complete imported guide used to verify the real draft, save, publish, view, and unpublish lifecycle.\n\n## Steps\n\n1. Save the reviewed draft.\n2. Publish the exact saved version.\n3. Confirm it is visible only while published.',
      images: [],
    }],
  });
  assert.equal(capture.created, 1);

  const row = sqlite.prepare('SELECT id, slug FROM guides WHERE principal_id = ?').get(owner.principalId);
  assert.ok(row?.id && row?.slug, 'Browser capture did not create the guide used by the publish lifecycle test.');

  const initial = await adminGuide(env, owner, row.id);
  assert.equal(initial.status, 'draft');
  assert.equal(initial.publishedAt, null);
  assert.equal(await publicGuide(env, row.slug), null, 'A draft leaked into the published guide route.');

  const saved = await saveGuideDraft(env, owner, row.id, {
    title: initial.title,
    description: `${initial.description} Reviewed and saved before publication.`,
    category: initial.category,
    body: `${initial.body}\n\n## Reviewed\n\nThis exact saved revision is the only revision allowed to publish.`,
    featured: false,
    attachmentsResolved: false,
  });
  assert.equal(saved.status, 'draft');
  assert.equal(saved.publishedAt, null);
  assert.ok(saved.body.includes('This exact saved revision'));

  const published = await setGuideStatus(env, owner, row.id, 'published');
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt, 'Publishing did not persist a publication timestamp.');
  assert.equal(published.body, saved.body, 'Publish changed the reviewed saved body instead of promoting the exact draft.');

  const visible = await publicGuide(env, row.slug);
  assert.ok(visible, 'The server confirmed published status but the published guide route cannot read it.');
  assert.equal(visible.status, 'published');
  assert.equal(visible.body, saved.body);

  const returned = await setGuideStatus(env, owner, row.id, 'draft');
  assert.equal(returned.status, 'draft');
  assert.equal(returned.publishedAt, null, 'Edit/unpublish left a stale publication timestamp behind.');
  assert.equal(await publicGuide(env, row.slug), null, 'Edit/unpublish left the guide publicly readable.');

  const republished = await setGuideStatus(env, owner, row.id, 'published');
  assert.equal(republished.status, 'published');
  assert.ok(await publicGuide(env, row.slug), 'Republishing after edit/unpublish did not restore the guide route.');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM guides WHERE principal_id = ?').get(owner.principalId).count, 1, 'Publish/unpublish created a duplicate guide row.');

  await assert.rejects(
    () => setGuideStatus(env, subscriber, row.id, 'published'),
    (error) => error?.status === 403,
    'A subscriber workspace could publish onto the owner guide site.',
  );

  sqlite.prepare('UPDATE guides SET attachment_json = ? WHERE principal_id = ? AND id = ?')
    .run(JSON.stringify({ reviewCount: 1 }), owner.principalId, row.id);
  await setGuideStatus(env, owner, row.id, 'draft');
  await assert.rejects(
    () => setGuideStatus(env, owner, row.id, 'published'),
    (error) => error?.status === 422,
    'Publishing ignored unresolved private/expiring attachment review.',
  );

  console.log('\nGUIDE PUBLISH SERVER ROUNDTRIP PASSED\n');
  console.log('✓ Imported Better Content draft stays private before publication.');
  console.log('✓ Save preserves draft/private state and Publish promotes the exact saved body.');
  console.log('✓ Published route appears only after confirmed publication and disappears after Edit / unpublish.');
  console.log('✓ Publish → unpublish → republish remains one guide row with no duplicate.');
  console.log('✓ Subscriber publishing and unresolved attachment publishing fail closed.');
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
