import assert from 'node:assert/strict';
import {
  MAX_CAPABILITY_PROBES_PER_REQUEST,
  capabilityCacheFresh,
  createCapabilityProbeBudget,
  isTransientDiscoveryError,
} from '../functions/_lib/discovery.js';

const budget = createCapabilityProbeBudget();
assert.equal(budget.limit, MAX_CAPABILITY_PROBES_PER_REQUEST);
for (let index = 0; index < MAX_CAPABILITY_PROBES_PER_REQUEST; index += 1) {
  assert.equal(budget.take(), true, `Probe ${index + 1} should fit inside the bounded discovery pass.`);
}
assert.equal(budget.take(), false, 'A discovery request must stop before another unknown module can exceed its probe budget.');
assert.equal(budget.remaining, 0);
assert.equal(budget.used, MAX_CAPABILITY_PROBES_PER_REQUEST);

for (const status of [0, 408, 425, 429, 500, 502, 503, 504]) {
  assert.equal(isTransientDiscoveryError({ status }), true, `${status} should be retryable without disconnecting Whop.`);
}
for (const status of [400, 401, 403, 404, 422]) {
  assert.equal(isTransientDiscoveryError({ status }), false, `${status} should not be blindly retried as an infrastructure failure.`);
}

const now = Date.now();
assert.equal(capabilityCacheFresh({
  probe_status: 'complete',
  checked_at: new Date(now - 60_000).toISOString(),
}, now), true, 'A recent complete capability result should avoid another Whop probe.');
assert.equal(capabilityCacheFresh({
  probe_status: 'complete',
  checked_at: new Date(now - 25 * 60 * 60_000).toISOString(),
}, now), false, 'A stale capability result must eventually be rechecked.');
assert.equal(capabilityCacheFresh({
  probe_status: 'transient',
  checked_at: new Date(now - 10_000).toISOString(),
  retry_after: new Date(now + 60_000).toISOString(),
}, now), true, 'A temporary failure must yield to other modules until its retry window opens.');
assert.equal(capabilityCacheFresh({
  probe_status: 'transient',
  checked_at: new Date(now - 180_000).toISOString(),
  retry_after: new Date(now - 1).toISOString(),
}, now), false, 'An expired temporary hold must become eligible for a safe retry.');

console.log('\nSNIPERPLUG DISCOVERY RESILIENCE TESTS PASSED\n');
console.log('✓ Unknown app probes are bounded per request and cached across background passes.');
console.log('✓ Temporary Cloudflare or Whop failures retry without contradicting the verified connection state.');
console.log('✓ Failed modules yield to the rest of the source list and retry after a cooldown.');
