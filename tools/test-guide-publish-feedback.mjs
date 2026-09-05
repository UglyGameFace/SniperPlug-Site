import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const page = read('control-center/index.html');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const clarity = read('assets/js/control-center-editor-clarity.js');
const control = read('assets/js/control-center-v2.js');
const api = read('functions/api/control.js');
const guides = read('functions/_lib/guides.js');
const publish = read('functions/_lib/publish.js');

assert.ok(
  page.includes('/assets/js/control-center-lifecycle.js?v=20260905.1')
    && page.includes('/assets/js/control-center-editor-clarity.js?v=20260905.2'),
  'Control Center does not load the publish lifecycle and cache-busted editor-clarity layer.',
);

assert.ok(
  lifecycle.includes("statePanel.dataset.editorPublishState = ''")
    && lifecycle.includes("actionStatus.dataset.editorActionStatus = ''"),
  'The guide editor is missing persistent publish-state and action-status surfaces.',
);

assert.ok(
  clarity.includes("editor.querySelector('.editor-lock-message')?.remove()")
    && clarity.includes("stateTitle.textContent = 'Unsaved changes'")
    && clarity.includes("stateTitle.textContent = 'Ready to review'")
    && clarity.includes("stateTitle.textContent = 'Published'"),
  'The mobile editor still renders duplicate or ambiguous persistent state messaging.',
);

for (const copy of [
  'Save changes',
  'Publish guide',
  'Remove draft',
  'Unpublish & edit',
  'Guide content',
  'If this looks right, publish it. If you edit anything, save first.',
  'Save before publishing so the live guide matches what you see here.',
]) {
  assert.ok(clarity.includes(copy) || page.includes(copy), `Simplified guide editor is missing required user-visible copy: ${copy}`);
}

assert.ok(
  clarity.includes('textarea[name="body"]{height:min(36vh,420px)')
    && clarity.includes('position:sticky')
    && page.includes('rows="12"')
    && page.includes('class="exact-preview" hidden'),
  'The guide editor still lets raw Markdown dominate the tablet/mobile viewport or hides primary actions below it.',
);

assert.ok(
  !clarity.includes('MutationObserver')
    && !clarity.includes('fetch(')
    && lifecycle.includes('function watchPendingFailure()')
    && lifecycle.includes("globalStatus.dataset.type === 'error'")
    && lifecycle.includes("actionWatchTimer = setTimeout(poll, 250)"),
  'Editor simplification introduced a polling/network/DOM-observer side channel instead of reusing the canonical lifecycle.',
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
    && lifecycle.includes("statusFilter.dispatchEvent(new Event('change', { bubbles: true }))"),
  'Successful publishing does not move the visible queue into the Published view.',
);

assert.ok(
  control.includes("const status = button === elements.publishGuide ? 'published'")
    && control.includes("api('guide-status', { method: 'POST'")
    && control.includes("renderGuideEditor(output.guide, 'status')"),
  'The authoritative publish mutation/render path was lost while simplifying the editor.',
);

assert.ok(
  api.includes("if (status === 'published') await assertGuidePublishable(env, admin, id);")
    && api.includes('reserveGuideVersion(env, admin, id, body.expectedUpdatedAt, operation)'),
  'Manual Publish is not backed by the existing publishability and exact-version server gate.',
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

console.log('\nGUIDE PUBLISH FEEDBACK REGRESSION PASSED\n');
console.log('✓ The editor uses one concise state surface instead of stacked warning boxes.');
console.log('✓ Raw guide content is bounded on tablet/mobile and primary actions stay reachable.');
console.log('✓ Dirty drafts still cannot publish stale unsaved edits.');
console.log('✓ Clicking Publish is the explicit manual review action for an unchanged imported guide.');
console.log('✓ Bulk publishing remains unable to bypass manual-review-only policy.');
console.log('✓ Existing versioned server publication remains authoritative.');
