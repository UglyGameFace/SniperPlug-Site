import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { membershipCompanies, membershipGrantsAccess } from '../functions/_lib/discovery.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const discovery = read('functions/_lib/discovery.js');
const accessTruth = read('functions/_lib/access-truth.js');
const endpoint = read('functions/api/discover.js');
const page = read('control-center/index.html');
const client = read('assets/js/control-center-v2.js');
const styles = read('assets/css/whop-discovery.css');
const capabilityMigration = read('migrations/0005_whop_capability_cache.sql');

assert.ok(discovery.includes("'memberships'"), 'Membership discovery endpoint is missing.');
assert.ok(discovery.includes("export async function loadWhopMemberships"), 'The canonical membership loader is not reusable by discovery and access verification.');
assert.ok(discovery.includes("'forums'"), 'Forum compatibility discovery endpoint is missing.');
assert.ok(discovery.includes("'experiences'"), 'Experience discovery endpoint is missing.');
assert.ok(discovery.includes('membershipProducts.length') && discovery.includes("[{ id: null, title: 'company-wide access' }]"), 'Company-wide discovery is not restricted to memberships without product scope.');
assert.ok(!discovery.includes("const scopes = [\n    { id: null, title: 'company-wide access' },\n    ...membershipProducts"), 'Every customer membership still pays for an unnecessary company-wide discovery sweep.');
assert.ok(discovery.includes('product_id: product.id'), 'Product-specific experience lookup is missing.');
assert.ok(discovery.includes("output.experiences = await allPages(session, 'experiences'"), 'Experiences are not the primary module inventory.');
assert.ok(discovery.includes('if (!output.experiences.length)') && discovery.includes("output.forums = await allPages(session, 'forums'"), 'Forum enumeration is not constrained to compatibility fallback when experience inventory is empty.');
assert.ok(discovery.includes('discovered.set(experience.id, experience)'), 'Product-scoped and fallback results are not deduplicated by exact experience ID.');
assert.ok(endpoint.includes('const memberships = await loadWhopMemberships(session)'), 'The discovery endpoint does not load one authoritative membership snapshot.');
assert.ok(endpoint.includes('discoverWhopSources(session, context.env, memberships)'), 'Discovery does not reuse the endpoint membership snapshot.');
assert.ok(endpoint.includes('enforceLiveWhopAccess(session, discovered, memberships)'), 'Live access verification does not reuse the same endpoint membership snapshot.');
assert.ok(!accessTruth.includes("whopApi(session, 'memberships'"), 'Access verification still performs a second membership pagination pass.');
assert.ok(discovery.includes("SUPPORTED_TYPES = new Set(['forum', 'course', 'chat'])"), 'Forum, Course, and Chat sources are not classified together.');
assert.ok(discovery.includes('requiredScopeForExperience'), 'Discovery does not map content types to their OAuth read scopes.');
assert.ok(discovery.includes('missingScopes'), 'Missing content-read permissions are not returned to the owner.');
assert.ok(discovery.includes('externalApps'), 'External custom-app modules are silently discarded.');
assert.ok(discovery.includes('group.sources.length || group.externalApps.length'), 'Empty stale groups are not removed from the source browser.');
assert.ok(!discovery.includes('group.sources.length || group.unsupported.length || group.builtIn'), 'Empty priority groups can still linger after access disappears.');
assert.ok(discovery.includes('emptyGroups'), 'Hidden empty-group count is not retained for diagnostics.');
assert.ok(discovery.includes('ACCESS_GRANTING_MEMBERSHIP_STATUSES'), 'Current-access membership filtering is missing.');
assert.ok(discovery.includes("'active'") && discovery.includes("'trialing'") && discovery.includes("'canceling'") && discovery.includes("'past_due'") && discovery.includes("'completed'"), 'Whop access-granting membership statuses are incomplete.');
assert.ok(discovery.includes('cancelation_status') && discovery.includes("cancelationStatus === 'left'"), 'Whop memberships whose member left can still reappear.');
assert.ok(discovery.includes('if (!membershipGrantsAccess(membership)) continue;'), 'Historical inactive memberships can still become active groups.');
assert.ok(discovery.includes('membership?.user === null || membership?.member === null'), 'Deleted users or missing member records can still appear as current access.');
assert.ok(discovery.includes("'joined_at'") && discovery.includes('membership.joined_at === null'), 'Memberships without a current member relationship can still appear.');
assert.ok(discovery.includes('values.length > MAX_COMPANIES'), 'Company-limit overflow must fail visibly instead of silently slicing groups.');
assert.ok(discovery.includes('current.memberships += 1'), 'Merged company cards do not retain their membership-record count.');
assert.ok(discovery.includes('member:basic:read') && discovery.includes('member:email:read'), 'Missing membership-scope recovery message is incomplete.');
assert.ok(discovery.includes('DEFAULT_GROUPS') && discovery.includes('black box') && discovery.includes('black box clips') && discovery.includes('hidden files'), 'Priority groups are not recognized completely.');
assert.ok(!discovery.includes('membership?.user?.email'), 'Membership email must not be exposed to the browser.');
assert.ok(endpoint.includes('requireAdmin') && endpoint.includes('requireWhopSession'), 'Discovery endpoint is not owner and OAuth protected.');
assert.ok(page.includes('data-discovered-groups'), 'Active source browser is missing.');
assert.ok(page.includes('data-approve-selected') && page.includes('data-disapprove-selected'), 'Source bulk controls are missing.');
assert.ok(page.includes('Advanced fallback'), 'Manual experience-ID input is not contained as an advanced fallback.');
assert.ok(page.includes('Forums, Courses, and Chat'), 'Supported content types are not explained in the UI.');
assert.ok(client.includes("requestJson('/api/discover'"), 'Browser does not call automatic discovery.');
assert.ok(page.includes('Select every Black Box and Hidden Files source'), 'Priority-group selection control is missing.');
assert.ok(client.includes('Review content') && client.includes('scanCurrent'), 'Discovered sources cannot open their content.');
assert.ok(discovery.includes('resolveWhopExperienceType') && discovery.includes('probeAttempted') && discovery.includes('MAX_CAPABILITY_PROBES_PER_REQUEST'), 'Unknown modules are not checked through bounded native Whop endpoint probes.');
assert.ok(discovery.includes('inspectWhopApp') && discovery.includes('hasOpenapiView'), 'App-specific modules do not retain their documented app capability metadata.');
assert.ok(client.includes('App-specific content') && client.includes('Native API probe completed'), 'App-specific modules are not explained clearly.');
assert.ok(client.includes('not a guessed endpoint'), 'The UI can still imply SniperPlug gave up without probing safe read paths.');
assert.ok(discovery.includes('whop_experience_capabilities') && discovery.includes('capabilityCacheFresh'), 'Whop capability probes are not cached between bounded discovery passes.');
assert.ok(discovery.includes('isTransientDiscoveryError') && discovery.includes('probe_status') && discovery.includes("'transient'"), 'One temporary app probe can still abort or starve the complete source scan.');
assert.ok(discovery.includes('budget.take()') && discovery.includes('capabilityProbe'), 'Discovery does not expose bounded background-probe progress.');
assert.ok(capabilityMigration.includes('CREATE TABLE IF NOT EXISTS whop_experience_capabilities'), 'The durable Whop capability cache migration is missing.');
assert.ok(endpoint.includes('DISCOVERY_TRANSIENT') && endpoint.includes('retryable: true'), 'Unexpected source-discovery failures still collapse into an unexplained generic importer error.');
assert.ok(client.includes('Whop connected · source refresh retrying') && client.includes('scheduleDiscoveryContinuation'), 'The browser does not retry bounded discovery work while preserving the verified connection state.');
assert.ok(client.includes('Connected & verified') && page.includes('data-whop-connection-detail'), 'The UI does not distinguish a verified OAuth connection from source-discovery progress.');
assert.ok(client.includes("dataset.idleDisabled = String(button.disabled)") && client.includes("button.disabled = button.dataset.idleDisabled === 'true'"), 'Temporary working labels can still leave buttons permanently disabled.');
assert.ok(!client.slice(client.indexOf('async function loadDiscovery'), client.indexOf('function updateSourceDecision')).includes("showStatus(error.message, 'error')"), 'A source-list failure can still overwrite the global connection truth with a contradictory red error.');
assert.ok(styles.includes('.state-pill[data-state="checking"]') && styles.includes('.whop-connection-detail'), 'Whop verification and connection details have no explicit visual states.');
assert.ok(client.includes('groupSelectionCount') && client.includes('updateGroupSelectionCards'), 'Select group has no immediate local confirmation.');
assert.ok(styles.includes('@media(max-width:620px)'), 'Mobile source-browser layout is missing.');

for (const status of ['active', 'trialing', 'canceling', 'past_due', 'completed']) {
  assert.equal(membershipGrantsAccess({ status }), true, `${status} must remain discoverable because it can grant access.`);
}
for (const status of ['canceled', 'expired', 'unresolved', 'drafted', '', 'unknown_future_status']) {
  assert.equal(membershipGrantsAccess({ status }), false, `${status || 'blank'} must not appear as a current joined membership.`);
}
assert.equal(membershipGrantsAccess({ status: 'completed', cancelation_status: 'left' }), false, 'A completed historical product must not keep a group visible after the member left.');
assert.equal(membershipGrantsAccess({ status: 'active', cancellation_status: 'left' }), false, 'The alternate cancellation-status spelling must also hide a left member.');
assert.equal(membershipGrantsAccess({ status: 'completed', cancelation_status: 'won_back' }), true, 'A won-back completed membership can remain discoverable.');
assert.equal(membershipGrantsAccess({ status: 'active', joined_at: null }), false, 'A membership with no current joined record must not appear.');
assert.equal(membershipGrantsAccess({ status: 'active', member: null }), false, 'A membership with no current member record must not appear.');
assert.equal(membershipGrantsAccess({ status: 'active', user: null }), false, 'A membership whose user no longer exists must not appear.');

const memberships = [
  { status: 'active', company: { id: 'biz_black', title: 'Black Box Clips' }, product: { id: 'prod_black', title: 'Black Box Main' } },
  { status: 'completed', company: { id: 'biz_black', title: 'Black Box Clips' }, product: { id: 'prod_black_archive', title: 'Black Box Archive' } },
  { status: 'trialing', company: { id: 'biz_hidden', title: 'Hidden Files' }, product: { id: 'prod_hidden', title: 'Hidden Files' } },
  { status: 'past_due', company: { id: 'biz_other', title: 'Other Group' }, product: { id: 'prod_other', title: 'Other Product' } },
  { status: 'canceling', company: { id: 'biz_other', title: 'Other Group' }, product: { id: 'prod_extra', title: 'Extra Product' } },
  { status: 'completed', cancelation_status: 'left', company: { id: 'biz_completed_left', title: 'Completed But Left' }, product: { id: 'prod_completed_left', title: 'Old Product' } },
  { status: 'canceled', company: { id: 'biz_left', title: 'Left Group' }, product: { id: 'prod_left', title: 'Left Product' } },
  { status: 'expired', company: { id: 'biz_expired', title: 'Expired Group' }, product: { id: 'prod_expired', title: 'Expired Product' } },
  { status: 'unresolved', company: { id: 'biz_unresolved', title: 'Unresolved Group' }, product: { id: 'prod_unresolved', title: 'Unresolved Product' } },
  { status: 'drafted', company: { id: 'biz_drafted', title: 'Drafted Group' }, product: { id: 'prod_drafted', title: 'Drafted Product' } },
  { status: 'active', company: null, product: { id: 'prod_invalid', title: 'Invalid' } },
];
const companies = membershipCompanies(memberships);
assert.equal(companies.length, 3, 'Only currently access-granting membership companies should survive discovery.');
const blackBox = companies.find((company) => company.id === 'biz_black');
assert.equal(blackBox?.memberships, 2, 'Multiple valid membership records under one company are not retained.');
assert.deepEqual([...blackBox.products.keys()].sort(), ['prod_black', 'prod_black_archive'], 'Valid products under one company were dropped.');
assert.deepEqual([...blackBox.statuses].sort(), ['active', 'completed'], 'Valid statuses should remain diagnostic metadata.');
assert.ok(companies.some((company) => company.id === 'biz_hidden'), 'Trialing Hidden Files membership was removed.');
assert.deepEqual([...companies.find((company) => company.id === 'biz_other').products.keys()].sort(), ['prod_extra', 'prod_other'], 'Past-due or canceling products were removed even though they still grant access.');
assert.ok(!companies.some((company) => ['biz_completed_left', 'biz_left', 'biz_expired', 'biz_unresolved', 'biz_drafted'].includes(company.id)), 'Historical or explicitly left groups leaked back into current discovery.');

console.log('\nWHOP MULTI-CONTENT DISCOVERY AUDIT PASSED\n');
console.log('✓ One membership snapshot drives both discovery and live access verification.');
console.log('✓ Product-scoped memberships avoid an unrelated company-wide source sweep.');
console.log('✓ Experiences are the primary module inventory; forum enumeration is a bounded compatibility fallback.');
console.log('✓ Forum, Course, and Chat sources are classified with their exact permission requirements.');
console.log('✓ External app modules remain visible with a separate-integration explanation.');
console.log('✓ Empty stale groups, left members, and missing member records stay out of the source browser.');
console.log('✓ Active, trialing, canceling, past-due, and completed memberships remain discoverable only while access remains current.');
console.log('✓ Canceled, expired, unresolved, drafted, and explicitly left historical memberships stay hidden.');
console.log('✓ Black Box, Black Box Clips, and Hidden Files remain prioritized.');
console.log('✓ Individual and bulk source decisions remain available.');
console.log('✓ Manual experience IDs remain an advanced fallback.');
console.log('✓ Membership email data never reaches the browser.');
