import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const page = read('control-center/index.html');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const guard = read('assets/js/control-center-network-guard.js');

const guardIndex = page.indexOf('/assets/js/control-center-network-guard.js');
const runtimeIndex = page.indexOf('/assets/js/control-center-v2.js');
assert.ok(guardIndex >= 0, 'Control Center API timeout guard is not loaded.');
assert.ok(runtimeIndex > guardIndex, 'API timeout guard must load before the main Control Center runtime.');
assert.ok(lifecycle.includes('control-center-network-guard.js'), 'Stale cached Control Center pages cannot load the timeout guard.');
assert.ok(guard.includes("details.url.pathname.startsWith('/api/')"), 'Timeout guard is not limited to same-origin API requests.');
assert.ok(guard.includes('READ_TIMEOUT_MS') && guard.includes('WRITE_TIMEOUT_MS'), 'Read and write timeouts are not separated.');
assert.ok(guard.includes('Refresh the saved status before retrying'), 'Timed-out writes do not warn against duplicate submissions.');
assert.ok(guard.includes('retryable: readOnly'), 'Timed-out writes are incorrectly marked safe for automatic retry.');
assert.ok(guard.includes("details.signal.addEventListener('abort'"), 'Caller abort signals are not forwarded.');
assert.ok(guard.includes("details.signal.removeEventListener('abort'"), 'Abort listeners are not cleaned up.');
assert.ok(!guard.includes('nativeFetch(input, options).catch') && !guard.includes('for (let attempt'), 'API writes must never be automatically replayed.');

console.log('\nSNIPERPLUG CONTROL CENTER NETWORK AUDIT PASSED\n');
console.log('✓ Every same-origin Control Center API request has a bounded lifetime.');
console.log('✓ Reads and writes use different timeout and retry guidance.');
console.log('✓ Timed-out writes require a saved-state refresh before another submission.');
console.log('✓ Caller abort signals and listener cleanup remain intact.');
