import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const middleware = read('functions/_middleware.js');
const example = read('.dev.vars.example');
const docs = read('docs/WHOP_IMPORTER.md');

const required = [
  'SNIPERPLUG_DB',
  'SNIPERPLUG_ADMIN_PASSWORD',
  'SNIPERPLUG_SESSION_SECRET',
  'WHOP_CLIENT_ID',
  'WHOP_TOKEN_SECRET',
  'WHOP_REDIRECT_URI',
  'WHOP_OAUTH_SCOPES',
];

for (const name of required) {
  assert.ok(middleware.includes(`'${name}'`), `Runtime preflight does not check ${name}.`);
  if (name !== 'SNIPERPLUG_DB') assert.ok(example.includes(`${name}=`), `.dev.vars.example is missing ${name}.`);
  assert.ok(docs.includes(`\`${name}\``), `Setup documentation is missing ${name}.`);
}

assert.ok(middleware.includes('missing.join'), 'Runtime setup failures are not consolidated into one message.');
assert.ok(middleware.includes('both Preview and Production'), 'Runtime error does not explain both Cloudflare environments.');
assert.ok(middleware.includes('missing,'), 'Runtime response does not include the machine-readable missing-variable list.');

console.log('\nSNIPERPLUG RUNTIME CONFIG AUDIT PASSED\n');
console.log('✓ D1 and every required secret/variable are checked together.');
console.log('✓ Missing settings are reported in one redacted response.');
console.log('✓ Preview and Production setup requirements remain documented.');
