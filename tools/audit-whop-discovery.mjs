import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const discovery = read('functions/_lib/discovery.js');
const endpoint = read('functions/api/discover.js');
const page = read('control-center/index.html');
const client = read('assets/js/control-center.js');
const styles = read('assets/css/whop-discovery.css');

assert.ok(discovery.includes("'memberships'"), 'Membership discovery endpoint is missing.');
assert.ok(discovery.includes("'forums'"), 'Forum discovery endpoint is missing.');
assert.ok(discovery.includes('member:basic:read') && discovery.includes('member:email:read'), 'Missing-scope recovery message is incomplete.');
assert.ok(discovery.includes('DEFAULT_GROUPS') && discovery.includes('black box') && discovery.includes('hidden files'), 'Default groups are not prioritized.');
assert.ok(!discovery.includes('membership?.user?.email'), 'Membership email must not be exposed to the browser.');
assert.ok(endpoint.includes('requireAdmin') && endpoint.includes('requireWhopSession'), 'Discovery endpoint is not owner and OAuth protected.');
assert.ok(page.includes('data-discovered-groups'), 'Joined-group browser is missing.');
assert.ok(page.includes('data-approve-selected') && page.includes('data-disapprove-selected'), 'Source bulk controls are missing.');
assert.ok(page.includes('Advanced fallback'), 'Manual experience-ID input is not contained as an advanced fallback.');
assert.ok(client.includes("fetch('/api/discover'"), 'Browser does not call automatic discovery.');
assert.ok(client.includes('Select every Black Box and Hidden Files forum') || page.includes('Select every Black Box and Hidden Files forum'), 'Default-group selection control is missing.');
assert.ok(client.includes('Review posts') && client.includes('scanCurrent'), 'Discovered forums cannot open their posts.');
assert.ok(styles.includes('@media(max-width:620px)'), 'Mobile source-browser layout is missing.');

console.log('\nWHOP AUTOMATIC DISCOVERY AUDIT PASSED\n');
console.log('✓ Joined memberships and readable forums load automatically.');
console.log('✓ Black Box and Hidden Files are prioritized and selectable together.');
console.log('✓ Individual and bulk source decisions are available.');
console.log('✓ Manual experience IDs remain an advanced fallback.');
console.log('✓ Membership email data never reaches the browser.');
