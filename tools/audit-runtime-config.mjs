import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const middleware = read('functions/_middleware.js');
const example = read('.dev.vars.example');
const docs = read('docs/WHOP_IMPORTER.md');
const wrangler = read('wrangler.toml');

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

assert.ok(wrangler.includes('WHOP_CLIENT_ID = "app_JCFpN1nv4khSkx"'), 'Public Whop client ID is not pinned in Wrangler configuration.');
assert.ok(wrangler.includes('WHOP_OAUTH_SCOPES = "openid profile email forum:read"'), 'Whop OAuth scopes are not pinned in Wrangler configuration.');
assert.ok(existsSync(join(root, 'functions/api/whop/oauth/callback.js')), 'Origin-aware Whop OAuth callback route is missing.');
assert.ok(docs.includes('agent-whop-guide-importer.sniperplug.pages.dev/api/whop/oauth/callback'), 'Preview callback URL is not documented.');
assert.ok(docs.includes('sniperplug.com/api/whop/oauth/callback'), 'Production callback URL is not documented.');
assert.ok(middleware.includes('missing.join'), 'Runtime setup failures are not consolidated into one message.');
assert.ok(middleware.includes('both Preview and Production'), 'Runtime error does not explain both Cloudflare environments.');
assert.ok(middleware.includes('missing,'), 'Runtime response does not include the machine-readable missing-variable list.');

console.log('\nSNIPERPLUG RUNTIME CONFIG AUDIT PASSED\n');
console.log('✓ D1 and every required private secret are checked together.');
console.log('✓ Public Whop settings ship through Wrangler instead of manual dashboard entry.');
console.log('✓ Preview and Production OAuth callbacks are explicit and documented.');
console.log('✓ Missing settings are reported in one redacted response.');
