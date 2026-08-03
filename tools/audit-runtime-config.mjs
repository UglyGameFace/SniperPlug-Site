import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWhopRedirectUri } from '../functions/_lib/whop.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const middleware = read('functions/_middleware.js');
const example = read('.dev.vars.example');
const docs = read('docs/WHOP_IMPORTER.md');
const wrangler = read('wrangler.toml');
const vercel = JSON.parse(read('vercel.json'));

const requiredPrivate = [
  'SNIPERPLUG_DB',
  'SNIPERPLUG_ADMIN_PASSWORD',
  'SNIPERPLUG_SESSION_SECRET',
  'WHOP_TOKEN_SECRET',
];

for (const name of requiredPrivate) {
  assert.ok(middleware.includes(`'${name}'`), `Runtime preflight does not check ${name}.`);
  if (name !== 'SNIPERPLUG_DB') assert.ok(example.includes(`${name}=`), `.dev.vars.example is missing ${name}.`);
  assert.ok(docs.includes(`\`${name}\``), `Setup documentation is missing ${name}.`);
}

assert.ok(wrangler.includes('pages_build_output_dir = "."'), 'Cloudflare Pages output directory is not explicit.');
assert.ok(wrangler.includes('WHOP_CLIENT_ID = "app_JCFpN1nv4khSkx"'), 'Public Whop client ID is not pinned in Wrangler configuration.');
for (const scope of ['forum:read', 'courses:read', 'chat:read', 'member:basic:read', 'member:email:read']) {
  assert.ok(wrangler.includes(scope), `Whop OAuth scope is missing: ${scope}`);
  assert.ok(docs.includes(`\`${scope}\``), `Whop setup documentation is missing scope: ${scope}`);
}
assert.ok(existsSync(join(root, 'functions/api/whop/oauth/callback.js')), 'Origin-aware Whop OAuth callback route is missing.');
assert.equal(
  resolveWhopRedirectUri(new Request('https://sniperplug.com/api/control?action=oauth-start'), { WHOP_REDIRECT_URI: 'http://localhost:8788/api/whop/oauth/callback' }),
  'https://sniperplug.com/api/whop/oauth/callback',
  'Production OAuth must ignore stale environment redirect overrides.',
);
assert.equal(
  resolveWhopRedirectUri(new Request('https://www.sniperplug.com/api/control?action=oauth-start'), {}),
  'https://sniperplug.com/api/whop/oauth/callback',
  'The www host must use the canonical production callback.',
);
assert.equal(
  resolveWhopRedirectUri(new Request('https://agent-whop-guide-importer.sniperplug.pages.dev/api/control?action=oauth-start'), {}),
  'https://agent-whop-guide-importer.sniperplug.pages.dev/api/whop/oauth/callback',
  'The stable preview host must use its exact registered callback.',
);
assert.equal(
  resolveWhopRedirectUri(new Request('http://localhost:8788/api/control?action=oauth-start'), {}),
  'http://localhost:8788/api/whop/oauth/callback',
  'Local development must derive its callback from the local origin.',
);
assert.equal(
  resolveWhopRedirectUri(new Request('http://localhost:8788/api/control?action=oauth-start'), { WHOP_REDIRECT_URI: 'http://127.0.0.1:8788/api/whop/oauth/callback' }),
  'http://127.0.0.1:8788/api/whop/oauth/callback',
  'A valid local-only callback override must remain available for development.',
);
assert.throws(
  () => resolveWhopRedirectUri(new Request('https://sniperplug.pages.dev/api/control?action=oauth-start'), {}),
  /not available on this host/i,
  'Unregistered Pages hosts must fail locally instead of reaching Whop with an invalid redirect.',
);
assert.throws(
  () => resolveWhopRedirectUri(new Request('http://localhost:8788/api/control?action=oauth-start'), { WHOP_REDIRECT_URI: 'https://evil.example/api/whop/oauth/callback' }),
  /must end exactly|localhost callback/i,
  'Local overrides must not permit an external callback host.',
);
assert.ok(docs.includes('agent-whop-guide-importer.sniperplug.pages.dev/api/whop/oauth/callback'), 'Preview callback URL is not documented.');
assert.ok(docs.includes('sniperplug.com/api/whop/oauth/callback'), 'Production callback URL is not documented.');
assert.ok(middleware.includes('missing.join'), 'Runtime setup failures are not consolidated into one message.');
assert.ok(middleware.includes('both Preview and Production'), 'Runtime error does not explain both Cloudflare environments.');
assert.ok(middleware.includes('missing,'), 'Runtime response does not include the machine-readable missing-variable list.');
assert.equal(vercel.ignoreCommand, 'node -e "process.exit(0)"', 'Duplicate Vercel projects can still build the Cloudflare-only site and report false deployment failures.');
assert.ok(!('outputDirectory' in vercel), 'Vercel must not publish the repository root or expose source files as a fake static deployment.');

console.log('\nSNIPERPLUG RUNTIME CONFIG AUDIT PASSED\n');
console.log('✓ D1 and every required private secret are checked together.');
console.log('✓ Forum, Course, Chat, and membership discovery scopes ship through Wrangler.');
console.log('✓ Preview and Production OAuth callbacks are explicit and documented.');
console.log('✓ Production OAuth ignores stale redirect overrides and unknown hosts fail before contacting Whop.');
console.log('✓ Missing settings are reported in one redacted response.');
console.log('✓ Cloudflare Pages remains the only deployment runtime; duplicate Vercel builds are ignored safely.');
