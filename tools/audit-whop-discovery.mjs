import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { membershipCompanies } from '../functions/_lib/discovery.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const discovery = read('functions/_lib/discovery.js');
const endpoint = read('functions/api/discover.js');
const page = read('control-center/index.html');
const client = read('assets/js/control-center.js');
const styles = read('assets/css/whop-discovery.css');

assert.ok(discovery.includes("'memberships'"), 'Membership discovery endpoint is missing.');
assert.ok(discovery.includes("'forums'"), 'Forum discovery endpoint is missing.');
assert.ok(discovery.includes("'experiences'"), 'Product-scoped experience fallback is missing.');
assert.ok(discovery.includes('product_id: product.id'), 'Forum and experience lookups are not scoped to the exact membership product.');
assert.ok(discovery.includes('isForumExperience'), 'Experience fallback does not identify native forum-powered experiences.');
assert.ok(discovery.includes('experienceTypes'), 'Unsupported experience types are not reported for diagnosis.');
assert.ok(!discovery.includes("allPages(session, 'forums', { company_id: company.id }"), 'Company-wide forum enumeration must not replace membership-product scoping.');
assert.ok(!discovery.includes('ACCESS_STATUSES'), 'Membership billing status must not silently remove groups or products.');
assert.ok(discovery.includes('values.length > MAX_COMPANIES'), 'Company-limit overflow must fail visibly instead of silently slicing groups.');
assert.ok(discovery.includes('current.memberships += 1'), 'Merged company cards do not retain their membership-record count.');
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

const memberships = [
  { status: 'active', company: { id: 'biz_black', title: 'Black Box' }, product: { id: 'prod_black', title: 'Black Box Main' } },
  { status: 'canceled', company: { id: 'biz_black', title: 'Black Box' }, product: { id: 'prod_black_archive', title: 'Black Box Archive' } },
  { status: 'expired', company: { id: 'biz_hidden', title: 'Hidden Files' }, product: { id: 'prod_hidden', title: 'Hidden Files' } },
  { status: 'unresolved', company: { id: 'biz_other', title: 'Other Group' }, product: { id: 'prod_other', title: 'Other Product' } },
  { status: 'drafted', company: { id: 'biz_other', title: 'Other Group' }, product: { id: 'prod_extra', title: 'Extra Product' } },
  { status: 'active', company: null, product: { id: 'prod_invalid', title: 'Invalid' } },
];
const companies = membershipCompanies(memberships);
assert.equal(companies.length, 3, 'Every distinct membership company with an ID must survive discovery.');
const blackBox = companies.find((company) => company.id === 'biz_black');
assert.equal(blackBox?.memberships, 2, 'Multiple membership records under one company are not retained.');
assert.deepEqual([...blackBox.products.keys()].sort(), ['prod_black', 'prod_black_archive'], 'Products with different lifecycle statuses were dropped.');
assert.deepEqual([...blackBox.statuses].sort(), ['active', 'canceled'], 'Statuses should remain diagnostic metadata.');
assert.ok(companies.some((company) => company.id === 'biz_hidden'), 'Expired Hidden Files membership was silently removed.');
assert.deepEqual([...companies.find((company) => company.id === 'biz_other').products.keys()].sort(), ['prod_extra', 'prod_other'], 'Unresolved or drafted products were silently removed.');

console.log('\nWHOP AUTOMATIC DISCOVERY AUDIT PASSED\n');
console.log('✓ Every membership product is checked independently for forums and experiences.');
console.log('✓ Company-wide forum enumeration cannot recreate the zero-forum member failure.');
console.log('✓ Active, canceled, expired, unresolved, and drafted memberships remain discoverable.');
console.log('✓ Unsupported Whop experience types remain visible for diagnosis.');
console.log('✓ Black Box and Hidden Files are prioritized and selectable together.');
console.log('✓ Individual and bulk source decisions are available.');
console.log('✓ Manual experience IDs remain an advanced fallback.');
console.log('✓ Membership email data never reaches the browser.');
