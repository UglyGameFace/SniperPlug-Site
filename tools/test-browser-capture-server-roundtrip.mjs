import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { importBrowserCaptures, BETTER_CONTENT_APP_ID } from '../functions/_lib/browser-capture.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(join(root, 'migrations/0001_whop_guides.sql'), 'utf8');

class D1StatementMock {
  constructor(db, sql, bindings = []) {
    this.db = db;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new D1StatementMock(this.db, this.sql, bindings);
  }

  async first() {
    const row = this.db.prepare(this.sql).get(...this.bindings);
    return row ?? null;
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.bindings) };
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.bindings);
    return { success: true, meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class D1DatabaseMock {
  constructor(db) {
    this.db = db;
  }

  prepare(sql) {
    return new D1StatementMock(this.db, sql);
  }

  async batch(statements) {
    const output = [];
    for (const statement of statements) output.push(await statement.run());
    return output;
  }
}

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(migration);
const env = { SNIPERPLUG_DB: new D1DatabaseMock(sqlite) };
const whopSession = { accessToken: 'browser-capture-roundtrip-token' };
const experienceId = 'exp_rpaFYR2AD7Mb9d';
const companyId = 'biz_hidden_files';
const productId = 'prod_hidden_files';
const appUrl = `https://mfk8y74zmein6tne8o5e.apps.whop.com/experiences/${experienceId}/pages/profit`;

const experience = {
  id: experienceId,
  name: 'Make Money Here',
  app: { id: BETTER_CONTENT_APP_ID, name: 'Better Content' },
  company: { id: companyId, title: 'Hidden Files' },
  product: { id: productId, title: 'Hidden Files Membership' },
};

const membership = {
  id: 'mem_hidden_files',
  status: 'active',
  joined_at: '2026-01-01T00:00:00.000Z',
  user: { id: 'user_owner' },
  company: { id: companyId, title: 'Hidden Files' },
  product: { id: productId, title: 'Hidden Files Membership' },
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.whop.com', 'Browser capture server roundtrip contacted an unexpected origin.');
  assert.equal(init?.headers?.authorization, `Bearer ${whopSession.accessToken}`, 'Browser capture did not use the connected Whop session for server-side re-verification.');

  if (url.pathname === '/api/v1/memberships') {
    return new Response(JSON.stringify({
      data: [membership],
      page_info: { has_next_page: false, end_cursor: null },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  if (url.pathname === `/api/v1/experiences/${experienceId}`) {
    return new Response(JSON.stringify(experience), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  throw new Error(`Unexpected Whop request during browser-capture roundtrip: ${url}`);
};

try {
  const input = {
    rightsConfirmed: true,
    captures: [{
      experienceId,
      title: '$2000+ PROFIT WITH NO RISK',
      pageUrl: `${appUrl}?view=member&token=must-not-persist#offer`,
      frameUrl: appUrl,
      pageIdentity: `${appUrl}|$2000+ PROFIT WITH NO RISK`,
      documentTitle: '$2000+ PROFIT WITH NO RISK',
      appHint: 'Better Content',
      bodyMarkdown: '# $2000+ PROFIT WITH NO RISK\n\nThis rendered guide explains a complete profit method with enough content to pass SniperPlug integrity checks.\n\n## Steps\n\n1. Review the offer.\n2. Follow the instructions.\n3. Verify the result before publishing.',
      images: [{ url: 'https://cdn.example.com/proof.png?signature=must-not-persist', alt: 'Proof' }],
    }],
  };

  const first = await importBrowserCaptures(env, { principalId: 'sniperplug-owner' }, whopSession, input);
  assert.equal(first.received, 1);
  assert.equal(first.created, 1, 'A valid live-style Better Content capture did not create a private draft.');
  assert.equal(first.updated, 0);
  assert.equal(first.held, 0);
  assert.equal(first.results[0]?.status, 'draft');

  const source = sqlite.prepare(`
    SELECT experience_id, principal_id, upstream_experience_id, decision
    FROM whop_sources WHERE principal_id = ? AND upstream_experience_id = ?
  `).get('sniperplug-owner', experienceId);
  assert.ok(source, 'Browser capture did not persist the approved Whop source.');
  assert.equal(source.decision, 'approved');

  const post = sqlite.prepare(`
    SELECT source_key, principal_id, upstream_source_key, experience_id, upstream_experience_id, body_markdown
    FROM whop_posts WHERE principal_id = ? AND upstream_experience_id = ?
  `).get('sniperplug-owner', experienceId);
  assert.ok(post, 'Browser capture did not persist the source row required by the guide foreign key.');
  assert.equal(post.experience_id, source.experience_id, 'Browser capture source/post foreign-key identities diverged.');

  const guide = sqlite.prepare(`
    SELECT id, principal_id, upstream_source_key, source_key, source_experience_id, title, status, body_markdown, integrity_json
    FROM guides WHERE principal_id = ? AND source_experience_id = ?
  `).get('sniperplug-owner', experienceId);
  assert.ok(guide, 'Browser capture reported success without a saved guide row.');
  assert.equal(guide.status, 'draft', 'Browser capture bypassed the private-draft review gate.');
  assert.equal(guide.title, '$2000+ PROFIT WITH NO RISK');
  assert.equal(guide.source_key, post.source_key, 'Saved guide does not point at the verified browser-capture source row.');
  assert.ok(guide.body_markdown.includes('Review the offer'), 'Rendered Better Content body was lost before the D1 draft write.');
  assert.ok(!guide.integrity_json.includes('must-not-persist'), 'Sensitive signed URL data leaked into persisted guide metadata.');

  const second = await importBrowserCaptures(env, { principalId: 'sniperplug-owner' }, whopSession, input);
  assert.equal(second.received, 1);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 1, 'Retrying the same queued page was not idempotent.');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM guides WHERE principal_id = ?').get('sniperplug-owner').count, 1, 'Retry created a duplicate private guide.');

  console.log('\nBROWSER CAPTURE SERVER ROUNDTRIP PASSED\n');
  console.log('✓ A live-style Better Content capture crosses membership + exact-app verification into SQLite/D1-compatible source, post, and private guide rows.');
  console.log('✓ The guide foreign key points at the verified browser-capture source row.');
  console.log('✓ Sensitive query/signature values are stripped before persistence.');
  console.log('✓ Retrying the same preserved extension queue is idempotent and does not create a duplicate draft.');
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
