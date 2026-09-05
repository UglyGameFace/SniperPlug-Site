import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const page = read('control-center/index.html');
const lifecycle = read('assets/js/control-center-lifecycle.js');
const control = read('assets/js/control-center-v2.js');
const api = read('functions/api/control.js');
const guides = read('functions/_lib/guides.js');

assert.ok(
  page.includes('/assets/js/control-center-lifecycle.js?v=20260905.1'),
  'Control Center does not cache-bust the publish-state lifecycle fix.',
);

assert.ok(
  lifecycle.includes("statePanel.dataset.editorPublishState = ''")
    && lifecycle.includes("actionStatus.dataset.editorActionStatus = ''"),
  'The guide editor is missing persistent local publish-state and action-status surfaces.',
);

for (const copy of [
  'Draft · not published',
  'Published and confirmed',
  'Published successfully. SniperPlug confirmed the guide is now available in Private Guides.',
  'Draft saved. It is still private and has not been published yet.',
  'Not published. Save your current changes first so the version you reviewed is exactly the version that goes live.',
  'Edit / unpublish',
  'View published guide',
]) {
  assert.ok(lifecycle.includes(copy), `Publish lifecycle is missing required user-visible state: ${copy}`);
}

assert.ok(
  lifecycle.includes('.draft-editor[data-guide-status="published"] input:disabled')
    && lifecycle.includes('.draft-editor[data-guide-status="published"] textarea:disabled')
    && lifecycle.includes('.draft-editor[data-guide-status="published"] select:disabled'),
  'Published fields do not have an unmistakable locked visual state.',
);

assert.ok(
  lifecycle.includes("publishButton.hidden = normalized !== 'draft'")
    && lifecycle.includes("saveButton.hidden = normalized !== 'draft'")
    && lifecycle.includes("returnButton.hidden = normalized === 'draft'"),
  'Published/draft actions are not being reduced to the actions that are valid for the current state.',
);

const genericRiskySelector = lifecycle.match(/const risky = target\.closest\(([^\n]+)\);/)?.[1] || '';
assert.ok(genericRiskySelector, 'Draft lifecycle no longer has its guarded navigation selector.');
assert.ok(
  !genericRiskySelector.includes('data-publish-guide'),
  'Publish is still routed through generic discard confirmation instead of its dedicated save-first gate.',
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
  'The existing authoritative publish mutation/render path was lost while improving feedback.',
);

assert.ok(
  api.includes("if (status === 'published') await assertGuidePublishable(env, admin, id);")
    && api.includes('reserveGuideVersion(env, admin, id, body.expectedUpdatedAt, operation)'),
  'Publish feedback is not backed by the existing publishability and version-confirmation server gate.',
);
assert.ok(
  guides.includes("UPDATE guides SET status = ?, updated_at = ?, published_at = ?")
    && guides.includes("status === 'published' ? now : null"),
  'The confirmed publish state is not persisted with a server publication timestamp.',
);

console.log('\nGUIDE PUBLISH FEEDBACK REGRESSION PASSED\n');
console.log('✓ Dirty drafts cannot publish a stale saved version; Save is required first.');
console.log('✓ Save, publish, published-lock, view, and edit/unpublish states have local mobile-visible feedback.');
console.log('✓ Successful publish switches the review queue to Published instead of making the selected guide appear unchanged.');
console.log('✓ Existing versioned server publication remains authoritative.');
