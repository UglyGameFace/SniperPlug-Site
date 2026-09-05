import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const page = read('control-center/index.html');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const control = read('assets/js/control-center-v2.js');
const integrityFix = read('assets/js/control-center-integrity-fix.js');
const networkGuard = read('assets/js/control-center-network-guard.js');
const api = read('functions/api/control.js');
const guides = read('functions/_lib/guides.js');
const publish = read('functions/_lib/publish.js');

assert.ok(
  page.includes('/assets/js/control-center-lifecycle.js?v=20260905.3')
    && page.includes('/assets/js/control-center-integrity-fix.js?v=20260905.3')
    && !page.includes('control-center-editor-clarity.js'),
  'Control Center does not load the cache-busted consolidated guide lifecycle.',
);

assert.ok(
  lifecycle.includes("statePanel.dataset.editorPublishState = ''")
    && lifecycle.includes("actionStatus.dataset.editorActionStatus = ''")
    && !lifecycle.includes('editor-lock-message'),
  'The guide editor still has competing persistent status surfaces.',
);

for (const copy of [
  'Save changes',
  'Publish guide',
  'Remove draft',
  'Unpublish & edit',
  'Guide content',
  'If this looks right, publish it. If you edit anything, save first.',
  'Save before publishing so the live guide matches what you see here.',
  'Guide returned to draft. Editing is unlocked.',
]) {
  assert.ok(lifecycle.includes(copy) || page.includes(copy), `Guide lifecycle is missing required user-visible copy: ${copy}`);
}

assert.ok(
  lifecycle.includes('textarea[name="body"]{height:min(36vh,420px)')
    && lifecycle.includes('position:sticky')
    && page.includes('rows="12"')
    && page.includes('class="exact-preview" hidden'),
  'The guide editor still lets raw Markdown dominate the tablet/mobile viewport or hides primary actions below it.',
);

assert.ok(
  !lifecycle.includes('MutationObserver')
    && lifecycle.includes('function watchPendingFailure()')
    && lifecycle.includes("globalStatus.dataset.type === 'error'")
    && lifecycle.includes("actionWatchTimer = setTimeout(poll, 250)"),
  'Guide lifecycle feedback introduced a broad observer or lost bounded write confirmation.',
);

assert.ok(
  page.indexOf('/assets/js/control-center-network-guard.js') < page.indexOf('/assets/js/control-center-v2.js')
    && lifecycle.includes('control-center-network-guard.js')
    && lifecycle.includes("name === 'controlNetworkGuard' && window.__sniperplugApiFetchGuardInstalled === true"),
  'The network guard no longer loads before v2, lacks stale-page fallback, or is redundantly requested after it is already installed.',
);

const genericRiskySelector = lifecycle.match(/const risky = target\.closest\(([^\n]+)\);/)?.[1] || '';
assert.ok(genericRiskySelector, 'Draft lifecycle no longer has its guarded navigation selector.');
assert.ok(
  !genericRiskySelector.includes('data-publish-guide'),
  'Publish is still routed through generic discard confirmation instead of its dedicated dirty-draft gate.',
);
assert.ok(
  lifecycle.includes("const publish = target.closest('[data-publish-guide]')")
    && lifecycle.includes('if (dirty)')
    && lifecycle.includes('event.stopImmediatePropagation();'),
  'Unsaved edits can still fall through into the publish request.',
);

assert.ok(
  lifecycle.includes("statusFilter.value = 'published'")
    && lifecycle.includes("statusFilter.value = 'draft'")
    && lifecycle.includes("statusFilter.dispatchEvent(new Event('change', { bubbles: true }))"),
  'Publish/unpublish no longer moves the visible queue to the authoritative saved status.',
);

assert.ok(
  control.includes('[elements.publishGuide, elements.rejectGuide, elements.returnDraft].includes(button)')
    && control.includes("const status = button === elements.publishGuide ? 'published' : button === elements.rejectGuide ? 'rejected' : 'draft'")
    && control.includes("api('guide-status', { method: 'POST'")
    && control.includes("renderGuideEditor(output.guide, 'status')"),
  'The canonical publish/unpublish mutation and render path is incomplete.',
);

assert.ok(
  !integrityFix.includes('[data-return-draft]')
    && !integrityFix.includes("action=guide-status")
    && !integrityFix.includes('window.location.replace'),
  'A legacy integrity workaround still intercepts Unpublish & edit before the canonical runtime.',
);

assert.ok(
  networkGuard.includes("['guide-save', 'guide-status'].includes(action)")
    && networkGuard.includes('const expectedUpdatedAt = guideVersions.get(id)')
    && networkGuard.includes('JSON.stringify({ ...body, expectedUpdatedAt })'),
  'Canonical unpublish is no longer protected by the last server-confirmed guide version.',
);

assert.ok(
  api.includes("const operation = status === 'published' ? 'publish' : status === 'rejected' ? 'reject' : 'return-to-draft'")
    && api.includes('reserveGuideVersion(env, admin, id, body.expectedUpdatedAt, operation)')
    && api.includes("if (status === 'published') await assertGuidePublishable(env, admin, id);"),
  'Publish/unpublish is not backed by the exact-version server gate.',
);

assert.ok(
  publish.includes('async function auditRow(db, principalId, row, { manualReviewConfirmed = false } = {})')
    && publish.includes('manualReviewCompleted: true')
    && publish.includes('await auditRow(db, principalId, row, { manualReviewConfirmed: true })')
    && publish.includes('const { attachments, integrity, linkAudit, holdReason } = await auditRow(db, principalId, row);'),
  'Manual Publish no longer counts as explicit review, or bulk publishing can incorrectly inherit that confirmation.',
);

assert.ok(
  guides.includes("UPDATE guides SET status = ?, updated_at = ?, published_at = ?")
    && guides.includes("status === 'published' ? now : null"),
  'The confirmed publish state is not persisted with a server publication timestamp.',
);

console.log('\nGUIDE PUBLISH / UNPUBLISH LIFECYCLE REGRESSION PASSED\n');
console.log('✓ One lifecycle owns editor state, labels, dirty feedback, locking, and mobile action layout.');
console.log('✓ The legacy capture-phase Unpublish workaround and forced page reload are gone.');
console.log('✓ Unpublish uses the same versioned guide-status mutation and canonical renderer as Publish.');
console.log('✓ Dirty drafts still cannot publish stale unsaved edits.');
console.log('✓ Manual Publish and bulk manual-review policy remain isolated.');
console.log('✓ Network/version, attachment, integrity, and publication persistence protections remain authoritative.');
