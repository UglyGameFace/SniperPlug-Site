import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminSession } from '../functions/_lib/auth.js';
import { onRequest as pagesMiddleware } from '../functions/_middleware.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const routes = JSON.parse(readFileSync(join(root, '_routes.json'), 'utf8'));
const middlewareSource = readFileSync(join(root, 'functions/_middleware.js'), 'utf8');

assert.equal(routes.version, 1);
assert.ok(routes.include.includes('/*'), 'Pages Functions are not guaranteed to run for private routes.');
assert.ok(routes.exclude.includes('/assets/*'), 'Static assets should bypass unnecessary Function execution.');
assert.ok(!routes.exclude.some((pattern) => String(pattern).includes('/guides')), 'Private guides are excluded from Pages Functions routing.');
assert.ok(!routes.exclude.some((pattern) => String(pattern).includes('/media')), 'Private copied media is excluded from Pages Functions routing.');
assert.ok(!routes.exclude.some((pattern) => String(pattern).includes('/course-video')), 'Private course videos are excluded from Pages Functions routing.');

const gatePosition = middlewareSource.indexOf('privateGuidePageGate(context.request, context.env)');
const nextPosition = middlewareSource.indexOf('const original = await context.next()');
assert.ok(gatePosition >= 0 && gatePosition < nextPosition, 'Private guide authentication runs after Pages resolves the route or static asset.');

const env = { SNIPERPLUG_SESSION_SECRET: 'private-routing-test-secret-2026' };
const noNext = () => {
  throw new Error('Anonymous guide requests reached Pages asset/function routing.');
};

const anonymous = await pagesMiddleware({
  request: new Request('https://sniperplug.com/guides/?routing-test=anonymous'),
  env,
  next: noNext,
});
assert.equal(anonymous.status, 401);
assert.match(anonymous.headers.get('cache-control') || '', /private, no-store/i);
assert.match(anonymous.headers.get('x-robots-tag') || '', /noindex/i);
assert.match(anonymous.headers.get('content-security-policy') || '', /default-src 'self'/i);
const anonymousHtml = await anonymous.text();
assert.match(anonymousHtml, /Unlock the private guides/i);
assert.doesNotMatch(anonymousHtml, /seller errors|sports betting|casino|auto checkout/i);

const owner = await createAdminSession(env);
let ownerNextCalls = 0;
const ownerResponse = await pagesMiddleware({
  request: new Request('https://sniperplug.com/guides/private-item', {
    headers: { cookie: String(owner.cookie).split(';', 1)[0] },
  }),
  env,
  next: async () => {
    ownerNextCalls += 1;
    return new Response('<!doctype html><title>Owner guide</title><main>private source content</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
});
assert.equal(ownerNextCalls, 1, 'An owner session did not continue to the private guide route.');
assert.equal(ownerResponse.status, 200);
assert.match(await ownerResponse.text(), /private source content/);
assert.match(ownerResponse.headers.get('cache-control') || '', /private, no-store/i);
assert.match(ownerResponse.headers.get('x-robots-tag') || '', /noindex/i);

let publicNextCalls = 0;
const publicResponse = await pagesMiddleware({
  request: new Request('https://sniperplug.com/'),
  env,
  next: async () => {
    publicNextCalls += 1;
    return new Response('<!doctype html><title>SniperPlug</title>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
});
assert.equal(publicNextCalls, 1, 'Public pages were blocked by the private guide gate.');
assert.equal(publicResponse.status, 200);

console.log('\nPRIVATE GUIDE ROUTING TEST PASSED\n');
console.log('✓ Pages routes every private guide URL through Functions before static asset resolution.');
console.log('✓ Anonymous sessions fail closed without calling the guide route or asset server.');
console.log('✓ Owner sessions continue normally and private responses remain no-store and noindex.');
console.log('✓ Public pages continue through the normal Pages pipeline.');
