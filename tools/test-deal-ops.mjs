import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminSession } from '../functions/_lib/auth.js';
import { buildDealOpsSnapshot, onRequest as dealOps } from '../functions/api/deal-ops.js';
import { onRequest as middleware } from '../functions/_middleware.js';

const env = { SNIPERPLUG_SESSION_SECRET: 'test-only-private-deal-ops-session-secret' };
const head = 'a'.repeat(40);
const siteHead = 'b'.repeat(40);
const keyDate = '2026-11-14T22:00:00Z';
const tree = [
  'sniperplug/cogs/deal_scanner.py',
  'sniperplug/services/walmart_exact_verification_queue.py',
  'tests/test_local_check_command_helpers.py',
  'tests/test_walmart_page_price_lane_a1.py',
].map((path) => ({ type: 'blob', path }));
const github = async (repo, path) => {
  if (repo.endsWith('-Site')) return { sha: siteHead };
  if (path === 'commits/main') return { sha: head, commit: { committer: { date: keyDate } } };
  if (path.startsWith('git/trees/')) return { tree };
  if (path.startsWith('actions/runs')) return { workflow_runs: [
    { id: 14, name: 'Verify SniperPlug', head_sha: head, status: 'completed', conclusion: 'success', html_url: 'https://github.com/UglyGameFace/SniperPlug/actions/runs/14', updated_at: keyDate },
    { id: 13, name: 'Old success', head_sha: 'c'.repeat(40), status: 'completed', conclusion: 'success' },
  ] };
  if (path.startsWith('pulls?')) return [
    { number: 273, title: 'Incomplete PR', draft: true, updated_at: keyDate, head: { ref: 'fix/screening' }, html_url: 'https://github.com/UglyGameFace/SniperPlug/pull/273' },
  ];
  if (path.startsWith('issues?')) return [
    { number: 295, title: 'Missed Walmart deal', updated_at: keyDate, html_url: 'https://github.com/UglyGameFace/SniperPlug/issues/295' },
    { number: 273, title: 'PR issue', pull_request: { url: 'x' }, html_url: 'https://github.com/UglyGameFace/SniperPlug/pull/273' },
  ];
  if (path.startsWith('commits?')) return [
    { sha: head, commit: { message: 'Merge pull request #318', committer: { date: keyDate } }, html_url: 'https://github.com/UglyGameFace/SniperPlug/commit/' + head },
  ];
  throw new Error('Unexpected path ' + path);
};
const snapshot = await buildDealOpsSnapshot({ github, now: () => keyDate });
assert.equal(snapshot.repository.mainSha, head);
assert.equal(snapshot.repository.siteMainSha, siteHead);
assert.equal(snapshot.sources.discloud, 'not_connected');
assert.equal(snapshot.sources.deployment, 'not_connected');
assert.equal(snapshot.checks.find((c) => c.id === 'manual-check').evidenceLevel, 'code_present');
assert.equal(snapshot.checks.find((c) => c.id === 'manual-check').runtime, 'unknown');
assert.equal(snapshot.checks.find((c) => c.id === 'manual-check').status, 'unknown');
assert.equal(snapshot.checks.find((c) => c.id === 'jewelry').status, 'blocked');
assert.equal(snapshot.checks.find((c) => c.id === 'jewelry').testFilesPresent, 0);
assert.equal(snapshot.ci.length, 1, 'Older SHA success is not proof for current main');
assert.equal(snapshot.ci[0].status, 'verified');
assert.equal(snapshot.checks.find((c) => c.id === 'pr-273').status, 'proposed');
assert.equal(snapshot.checks.find((c) => c.id === 'issue-295').status, 'blocked');
assert.equal(snapshot.audit[0].state, 'merged');
assert(snapshot.notes.some((note) => note.includes('deployment')));
assert(snapshot.statusValues.includes('deployed') && snapshot.statusValues.includes('unknown'));

const failedGithub = async (_repo, path) => {
  if (path === 'commits/main') throw Error('rate limited');
  return github('UglyGameFace/SniperPlug', path);
};
const partial = await buildDealOpsSnapshot({ github: failedGithub });
assert.equal(partial.sources.githubCommit, 'unavailable');
assert.equal(partial.repository.mainSha, null);
assert.equal(partial.checks.find((c) => c.id === 'manual-check').runtime, 'unknown');
assert.equal(partial.ci.length, 0, 'CI must never be attributed without an exact main SHA');

const missing = await dealOps({ request: new Request('https://sniperplug.com/api/deal-ops'), env });
assert.equal(missing.status, 401, 'Anonymous data access must fail closed');

const post = await dealOps({ request: new Request('https://sniperplug.com/api/deal-ops', { method: 'POST' }), env });
assert.equal(post.status, 405, 'Only GET is allowed');
assert.equal(post.headers.get('allow'), 'GET');

const owner = await createAdminSession(env);
const cookie = owner.cookie.split(';', 1)[0];
const request = new Request('https://sniperplug.com/api/deal-ops', { headers: { cookie } });
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => new Response(JSON.stringify(await github(
    String(url).includes('SniperPlug-Site') ? 'UglyGameFace/SniperPlug-Site' : 'UglyGameFace/SniperPlug',
    String(url).split('SniperPlug/')[1] || 'commits/main',
  )), { status: 200 });
  const response = await dealOps({ request, env });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).checks.find((c) => c.id === 'manual-check').runtime, 'unknown');
} finally {
  globalThis.fetch = originalFetch;
}

let called = false;
const blockedPage = await middleware({
  request: new Request('https://sniperplug.com/operations/'),
  env,
  next: async () => { called = true; return new Response('EXPOSED'); },
});
assert.equal(blockedPage.status, 401);
assert.equal(called, false, 'Private page must be gated before static assets');
assert.match(blockedPage.headers.get('cache-control'), /no-store/);
assert.match(blockedPage.headers.get('x-robots-tag'), /noindex/);
const allowedPage = await middleware({
  request: new Request('https://sniperplug.com/operations/index.html', { headers: { cookie } }),
  env,
  next: async () => new Response('<html>Ops</html>', { headers: { 'content-type': 'text/html' } }),
});
assert.equal(allowedPage.status, 200);
assert.match(allowedPage.headers.get('cache-control'), /no-store/);

const ui = await readFile(new URL('../assets/js/deal-ops.js', import.meta.url), 'utf8');
const markup = await readFile(new URL('../operations/index.html', import.meta.url), 'utf8');
assert.match(markup, /data-view="timeouts"/);
assert.match(markup, /data-view="revisit"/);
assert.match(markup, /data-view="filters"/);
assert.match(markup, /id="since"/);
assert.match(ui, /\/api\/deal-ops/);
assert.doesNotMatch(ui, /innerHTML\s*=/, 'Untrusted GitHub strings should not be parsed as markup');
assert.doesNotMatch(ui, /fetch\([^)]*method:\s*['"]POST/i, 'Operational UI must not mutate account state');
console.log('DEAL OPS PRIVATE READ-ONLY TESTS PASSED');
