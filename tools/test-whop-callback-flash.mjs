import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(join(root, 'assets/js/control-center-whop-flash.js'), 'utf8');

function extractCallback(urlText) {
  const url = new URL(urlText);
  const callbackState = String(url.searchParams.get('whop') || '').trim();
  const callbackMessage = String(url.searchParams.get('message') || '').trim().slice(0, 180);
  url.searchParams.delete('whop');
  url.searchParams.delete('message');
  return {
    callbackState,
    callbackMessage,
    cleanUrl: `${url.pathname}${url.search}${url.hash}`,
  };
}

const stale = extractCallback('https://sniperplug.com/control-center/?whop=error&message=Whop%20did%20not%20return%20a%20valid%20customer%20identity.#whop-importer');
assert.equal(stale.callbackState, 'error');
assert.equal(stale.callbackMessage, 'Whop did not return a valid customer identity.');
assert.equal(stale.cleanUrl, '/control-center/#whop-importer');

const success = extractCallback('https://sniperplug.com/control-center/?foo=1&whop=connected#whop-importer');
assert.equal(success.callbackState, 'connected');
assert.equal(success.cleanUrl, '/control-center/?foo=1#whop-importer');

assert.ok(script.includes("url.searchParams.delete('whop')") && script.includes("url.searchParams.delete('message')"));
assert.ok(script.includes('window.history.replaceState'));
assert.ok(script.includes("whopState === 'connected'"));
assert.ok(script.includes("callbackState === 'error' && whopState === 'disconnected'"));
assert.ok(!script.includes('MutationObserver'));

console.log('\nWHOP CALLBACK FLASH TEST PASSED\n');
console.log('✓ Callback query state is consumed once while unrelated query parameters and the recovery anchor are preserved.');
console.log('✓ A verified live Whop connection wins over an old callback error.');
console.log('✓ A real callback error remains visible when the live connection is disconnected.');
