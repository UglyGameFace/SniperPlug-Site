import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { BETTER_CONTENT_APP_ID, importBrowserCaptures } from '../functions/_lib/browser-capture.js';
import { reconcileBrowserCaptures } from '../functions/_lib/browser-capture-reconcile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(join(root, 'migrations/0001_whop_guides.sql'), 'utf8');
const relay = readFileSync(join(root, 'browser-extension/sniperplug-relay.js'), 'utf8');
const endpoint = readFileSync(join(root, 'functions/api/browser-capture.js'), 'utf8');

assert.ok(relay.includes("'reconcile'") && relay.includes('reconcileCaptures') && relay.includes('needsImport'), 'The signed-in relay does not reconcile server history before import.');
assert.ok(relay.includes('toImport') && relay.includes("'import'"), 'The relay does not filter server-known pages before import.');
assert.ok(endpoint.includes('reconcileBrowserCaptures') && endpoint.includes("mode === 'reconcile'"), 'The browser-capture API does not expose the authenticated reconciliation mode.');

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
const principal = { principalId: 'server-reconcile-owner' };
const whopSession = { accessToken: 'server-reconcile-token' };
const experienceId = 'exp_reconcile_hidden_files';
const companyId = 'biz_reconcile_hidden_files';
const productId = 'prod_reconcile_hidden_files';
const appOrigin = 'https://reconcile-reader.apps.whop.com';
const pageUrl = `${appOrigin}/experiences/${experienceId}/pages/profit`;

const experience = {
  id: experienceId,
  name: 'Make Money Here',
  app: { id: BETTER_CONTENT_APP_ID, name: 'Better Content' },
  company: { id: companyId, title: 'Hidden Files' },
  product: { id: productId, title: 'Hidden Files Membership' },
};

const membership = {
  id: 'mem_reconcile_hidden_files',
  status: 'active',
  joined_at: '2026-01-01T00:00:00.000Z',
  user: { id: 'user_owner' },
  company: { id: companyId, title: 'Hidden Files' },
  product: { id: productId, title: 'Hidden Files Membership' },
};

const baseCapture = {
  experienceId,
  title: '$500+ PROFIT GUIDE',
  pageUrl,
  frameUrl: pageUrl,
  pageIdentity: `${pageUrl}|$500+ PROFIT GUIDE`,
  documentTitle: '$500+ PROFIT GUIDE',
  appHint: 'Better Content',
  bodyMarkdown: '# $500+ PROFIT GUIDE\n\nThis rendered guide has enough instructional content to verify authoritative server reconciliation before any browser import happens.\n\n## Steps\n\n1. Review the offer.\n2. Follow the instructions.\n3. Verify the result before publishing.',
  images: [],
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.whop.com');
  assert.equal(init?.headers?.authorization, `Bearer ${whopSession.accessToken}`);
  if (url.pathname === '/api/v1/memberships') {
    return new Response(JSON.stringify({ data: [membership], page_info: { has_next_page: false, end_cursor: null } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.pathname === `/api/v1/experiences/${experienceId}`) {
    return new Response(JSON.stringify(experience), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`Unexpected Whop reconciliation request: ${url}`);
};

try {
  const input = { rightsConfirmed: true, captures: [baseCapture] };

  const before = await reconcileBrowserCaptures(env, principal, whopSession, input);
  assert.equal(before.received, 1);
  assert.equal(before.new, 1, 'A never-imported page was not classified as new.');
  assert.equal(before.needsImport, 1);
  assert.equal(before.alreadyImported, 0);
  assert.equal(before.results[0]?.needsImport, true);
  assert.equal(before.results[0]?.serverState, 'new');

  const imported = await importBrowserCaptures(env, principal, whopSession, input);
  assert.equal(imported.created, 1, 'Test setup failed to create the server-owned browser capture draft.');

  const after = await reconcileBrowserCaptures(env, principal, whopSession, input);
  assert.equal(after.alreadyImported, 1, 'A fresh-device server check did not recognize the already imported guide.');
  assert.equal(after.needsImport, 0, 'An unchanged server-owned guide would still be re-imported.');
  assert.equal(after.results[0]?.action, 'unchanged');
  assert.equal(after.results[0]?.serverState, 'already-imported');

  const changedInput = {
    rightsConfirmed: true,
    captures: [{ ...baseCapture, bodyMarkdown: `${baseCapture.bodyMarkdown}\n\n## Update\n\nThe source now contains one additional verified instruction.` }],
  };
  const changed = await reconcileBrowserCaptures(env, principal, whopSession, changedInput);
  assert.equal(changed.changed, 1, 'A changed unreviewed draft was not identified before import.');
  assert.equal(changed.needsImport, 1);
  assert.equal(changed.results[0]?.serverState, 'changed');

  const legacyEquivalent = {
    ...baseCapture,
    pageUrl: `${appOrigin}/experiences/${experienceId}/pages/legacy-profit`,
    frameUrl: `${appOrigin}/experiences/${experienceId}/pages/legacy-profit`,
    pageIdentity: `${appOrigin}/experiences/${experienceId}/pages/legacy-profit|$500+ PROFIT GUIDE`,
  };
  const duplicate = await reconcileBrowserCaptures(env, principal, whopSession, { rightsConfirmed: true, captures: [legacyEquivalent] });
  assert.equal(duplicate.duplicates, 1, 'A content-identical guide with no matching browser source identity was not caught as an existing server duplicate.');
  assert.equal(duplicate.needsImport, 0);
  assert.equal(duplicate.results[0]?.serverState, 'duplicate');

  console.log('\nBROWSER CAPTURE SERVER RECONCILIATION PASSED\n');
  console.log('✓ Server preflight recognizes already imported pages even when local extension history is empty.');
  console.log('✓ Changed drafts are selected for import while unchanged pages are filtered out first.');
  console.log('✓ Content-identical legacy/alternate-source guides are detected as server-side duplicates.');
  console.log('✓ The relay reconciles first and only sends pages the server says need work.');
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
