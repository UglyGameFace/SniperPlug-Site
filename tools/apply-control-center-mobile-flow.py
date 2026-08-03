from pathlib import Path

js_path = Path('assets/js/control-center-v2.js')
js = js_path.read_text()

replacements = [
("  const GUIDE_PAGE_SIZE = 60;\n", "  const GUIDE_PAGE_SIZE = 24;\n  const POST_PAGE_SIZE = 10;\n  const SOURCE_PAGE_SIZE = 12;\n  const MOBILE_QUERY = window.matchMedia('(max-width: 720px), (pointer: coarse)');\n"),
("    postRenderToken: 0,\n", "    postRenderToken: 0,\n    postRenderLimit: POST_PAGE_SIZE,\n    sourceRenderLimits: new Map(),\n"),
("""  function renderGroupSources(group, groupCard) {
    const list = $('.discovered-source-list', groupCard);
    if (!list || list.dataset.rendered === 'true') return;
    const query = elements.sourceSearch.value.trim().toLocaleLowerCase('en-US');
    const filter = elements.sourceFilter.value;
    const fragment = document.createDocumentFragment();
    for (const entry of group.sources || []) {
      const card = createSourceCard(entry);
      card.hidden = !sourceMatches(entry, query, filter);
      fragment.append(card);
    }
    list.replaceChildren(fragment);
    list.dataset.rendered = 'true';
  }
""", """  function renderGroupSources(group, groupCard, { more = false } = {}) {
    const list = $('.discovered-source-list', groupCard);
    if (!list) return;
    const key = groupKey(group);
    const current = state.sourceRenderLimits.get(key) || SOURCE_PAGE_SIZE;
    const limit = more ? current + SOURCE_PAGE_SIZE : current;
    state.sourceRenderLimits.set(key, limit);
    const query = elements.sourceSearch.value.trim().toLocaleLowerCase('en-US');
    const filter = elements.sourceFilter.value;
    const entries = group.sources || [];
    const fragment = document.createDocumentFragment();
    for (const entry of entries.slice(0, limit)) {
      const card = createSourceCard(entry);
      card.hidden = !sourceMatches(entry, query, filter);
      fragment.append(card);
    }
    if (limit < entries.length) {
      const moreButton = document.createElement('button');
      moreButton.type = 'button';
      moreButton.className = 'btn ghost source-load-more';
      moreButton.dataset.action = 'source-load-more';
      moreButton.textContent = `Load ${Math.min(SOURCE_PAGE_SIZE, entries.length - limit)} more · ${entries.length - limit} remaining`;
      fragment.append(moreButton);
    }
    list.replaceChildren(fragment);
    list.dataset.rendered = 'true';
  }
"""),
("""  function scheduleDiscoveryContinuation(data) {
    clearTimeout(state.discoveryTimer);
    state.discoveryTimer = null;
    const probe = data?.capabilityProbe || {};
    const pending = Number(probe.pending || 0);
    const checked = Number(probe.checked || 0);
    if (!pending || !checked || state.discoveryAutoPasses >= 8) return;
    state.discoveryAutoPasses += 1;
    state.discoveryTimer = setTimeout(() => {
      state.discoveryTimer = null;
      loadDiscovery({ background: true }).catch(() => null);
    }, 350);
  }
""", """  function scheduleDiscoveryContinuation(data) {
    clearTimeout(state.discoveryTimer);
    state.discoveryTimer = null;
    const pending = Number(data?.capabilityProbe?.pending || 0);
    if (pending > 0) {
      elements.discoveryMessage.textContent = `${discoveryStatusText(data)} · press Refresh sources to run another bounded pass.`;
    }
  }
"""),
("""  function renderPosts() {
    const token = ++state.postRenderToken;
    elements.postList.replaceChildren();
    let index = 0;
    const appendCount = (limit) => {
      if (token !== state.postRenderToken) return;
      const fragment = document.createDocumentFragment();
      let count = 0;
      while (index < state.postOrder.length && count < limit) {
        const post = state.posts.get(state.postOrder[index]);
        index += 1;
        count += 1;
        if (post) fragment.append(createPostCard(post));
      }
      elements.postList.append(fragment);
    };
    appendCount(Math.min(12, state.postOrder.length));
    const appendRemaining = (deadline) => {
      if (token !== state.postRenderToken) return;
      const budget = Math.max(8, Math.min(30, Math.floor(deadline.timeRemaining() * 3) || 8));
      appendCount(budget);
      if (index < state.postOrder.length) idle(appendRemaining);
    };
    if (index < state.postOrder.length) idle(appendRemaining);
    syncPostControls();
  }
""", """  function renderPosts() {
    state.postRenderToken += 1;
    const fragment = document.createDocumentFragment();
    const visibleKeys = state.postOrder.slice(0, state.postRenderLimit);
    for (const key of visibleKeys) {
      const post = state.posts.get(key);
      if (post) fragment.append(createPostCard(post));
    }
    if (visibleKeys.length < state.postOrder.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn ghost post-load-more';
      more.dataset.action = 'post-load-more';
      more.textContent = `Load ${Math.min(POST_PAGE_SIZE, state.postOrder.length - visibleKeys.length)} more · ${state.postOrder.length - visibleKeys.length} remaining`;
      fragment.append(more);
    }
    elements.postList.replaceChildren(fragment);
    syncPostControls();
  }
"""),
("      state.postOrder = (output.posts || []).map((post) => post.sourceKey);\n", "      state.postOrder = (output.posts || []).map((post) => post.sourceKey);\n      state.postRenderLimit = POST_PAGE_SIZE;\n"),
("      elements.postPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });\n", "      elements.postPanel.scrollIntoView({ behavior: MOBILE_QUERY.matches ? 'auto' : 'smooth', block: 'start' });\n"),
("""          await loadDiscovery({ manual: true });
          return data.whop;
""", """          elements.discoverySummary.textContent = 'Whop connected. Press Load sources when you are ready.';
          elements.discoveryMessage.textContent = 'Source discovery is manual so the Control Center stays responsive.';
          return data.whop;
"""),
("""      const background = [loadBulkJob(), loadRecentActions()];
      if (dashboard.whop?.verified) background.push(loadDiscovery({ manual: true }));
      else if (dashboard.whop?.connected) background.push(verifyWhopUntilSettled());
""", """      const background = [loadBulkJob(), loadRecentActions()];
      if (dashboard.whop?.verified) {
        elements.discoverySummary.textContent = 'Whop connected. Press Load sources when you are ready.';
        elements.discoveryMessage.textContent = 'Nothing scans automatically on page load.';
      } else if (dashboard.whop?.connected) background.push(verifyWhopUntilSettled());
"""),
("""        const background = [loadBulkJob(), loadRecentActions()];
        if (dashboard.whop?.verified) background.push(loadDiscovery({ manual: true }));
        else if (dashboard.whop?.connected) background.push(verifyWhopUntilSettled());
""", """        const background = [loadBulkJob(), loadRecentActions()];
        if (dashboard.whop?.verified) {
          elements.discoverySummary.textContent = 'Whop connected. Press Load sources when you are ready.';
          elements.discoveryMessage.textContent = 'Nothing scans automatically after unlock.';
        } else if (dashboard.whop?.connected) background.push(verifyWhopUntilSettled());
"""),
("        await checkSource(new FormData(form).get('source'), { scanIfApproved: true });\n", "        await checkSource(new FormData(form).get('source'), { scanIfApproved: false });\n"),
("          await checkSource(id, { scanIfApproved: true });\n", "          await checkSource(id, { scanIfApproved: false });\n"),
("""      if (decision === 'approved') await scanCurrent(elements.sourceScan);
      return;
""", """      if (decision === 'approved') showStatus('Source approved. Press Review content when you are ready to scan it.');
      return;
"""),
("    if (action?.startsWith('group-')) {\n", """    if (action === 'source-load-more') {
      const card = button.closest('.discovered-group');
      const group = (state.discovery?.groups || []).find((item) => groupKey(item) === card?.dataset.groupKey);
      if (group && card) renderGroupSources(group, card, { more: true });
      return;
    }
    if (action === 'post-load-more') {
      state.postRenderLimit += POST_PAGE_SIZE;
      renderPosts();
      return;
    }
    if (action?.startsWith('group-')) {
"""),
]

for old, new in replacements:
    if old not in js:
        raise SystemExit('missing control-center anchor: ' + old[:100].replace('\n', ' '))
    js = js.replace(old, new, 1)
js_path.write_text(js)

backup_path = Path('assets/js/control-center-whop-backups.js')
backup = backup_path.read_text()
anchor = """  const state = {
    overview: null,
    busy: false,
    pending: null,
    loaded: false,
  };
"""
insert = anchor + """
  function structureRecoveryPanel() {
    if (panel.dataset.structured === 'true') return;
    panel.dataset.structured = 'true';
    const app = elements.app;
    if (app instanceof HTMLElement) app.append(panel);

    const dialog = elements.dialog;
    const content = [...panel.children].filter((child) => child !== dialog);
    const workflow = document.createElement('details');
    workflow.className = 'whop-recovery-workflow';
    workflow.dataset.recoveryWorkflow = 'true';
    const summary = document.createElement('summary');
    summary.innerHTML = '<span><strong>Backup & recovery</strong><small>Open only when you need a backup, restore, or safe clear-and-resync.</small></span><b>Open safety tools</b>';
    const body = document.createElement('div');
    body.className = 'whop-recovery-body';
    for (const child of content) body.append(child);
    workflow.append(summary, body);
    panel.replaceChildren(workflow);
    if (dialog) panel.append(dialog);

    const heading = panel.querySelector('.panel-head h2');
    const intro = panel.querySelector('.panel-head p');
    const eyebrow = panel.querySelector('.panel-head .eyebrow');
    if (heading) heading.textContent = 'One safety center';
    if (intro) intro.textContent = 'Choose a source, choose one action, then review the matching recovery history below.';
    if (eyebrow) eyebrow.textContent = 'Safety · Backup & recovery';
    if (elements.refresh) elements.refresh.textContent = 'Refresh history';

    const actionRow = document.createElement('div');
    actionRow.className = 'whop-recovery-action';
    const label = document.createElement('label');
    label.innerHTML = '<span>What do you need to do?</span>';
    const select = document.createElement('select');
    select.dataset.backupAction = 'true';
    select.innerHTML = '<option value="backup">Create a recovery backup</option><option value="reset">Clear & resync safely (backup included)</option>';
    label.append(select);
    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'btn primary';
    continueButton.dataset.backupContinue = 'true';
    continueButton.textContent = 'Continue';
    actionRow.append(label, continueButton);

    const resetOptions = panel.querySelector('.whop-reset-options');
    if (resetOptions) {
      resetOptions.before(actionRow);
      const advanced = document.createElement('details');
      advanced.className = 'whop-recovery-advanced';
      advanced.innerHTML = '<summary>Advanced clear/reset options</summary>';
      for (const child of [...resetOptions.children]) {
        if (!child.classList?.contains('button-row')) advanced.append(child);
      }
      resetOptions.replaceChildren(advanced);
      resetOptions.hidden = true;
    }
    if (elements.create) elements.create.hidden = true;
    if (elements.reset) elements.reset.hidden = true;

    select.addEventListener('change', () => {
      if (resetOptions) resetOptions.hidden = select.value !== 'reset';
      continueButton.textContent = select.value === 'reset' ? 'Review safe clear & resync' : 'Create backup';
    });
    continueButton.addEventListener('click', () => {
      if (select.value === 'reset') previewReset();
      else createManualBackup();
    });
    workflow.addEventListener('toggle', () => {
      const stateLabel = summary.querySelector('b');
      if (stateLabel) stateLabel.textContent = workflow.open ? 'Close safety tools' : 'Open safety tools';
      if (workflow.open && !state.loaded) loadOverview();
    });
  }
"""
if anchor not in backup:
    raise SystemExit('backup state anchor missing')
backup = backup.replace(anchor, insert, 1)
old_tail = """  const observer = new MutationObserver(() => {
    if (elements.app instanceof HTMLElement && !elements.app.hidden && !state.loaded) loadOverview();
  });
  if (elements.app instanceof HTMLElement) observer.observe(elements.app, { attributes: true, attributeFilter: ['hidden'] });
  if (elements.app instanceof HTMLElement && !elements.app.hidden) loadOverview();
  syncControls();
})();
"""
new_tail = """  structureRecoveryPanel();
  syncControls();
})();
"""
if old_tail not in backup:
    raise SystemExit('backup auto-load anchor missing')
backup = backup.replace(old_tail, new_tail, 1)
backup_path.write_text(backup)

css_path = Path('assets/css/control-center-hardening.css')
css = css_path.read_text()
css += """

/* Ordered, low-work Control Center flow */
.whop-recovery-workflow>summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;cursor:pointer;list-style:none;padding:.25rem}
.whop-recovery-workflow>summary::-webkit-details-marker{display:none}
.whop-recovery-workflow>summary span{display:grid;gap:.3rem}
.whop-recovery-workflow>summary small{color:var(--muted);font-weight:650;line-height:1.45}
.whop-recovery-workflow>summary b{color:#71f2a2;font-size:.85rem}
.whop-recovery-body{display:grid;gap:1rem;padding-top:1rem}
.whop-recovery-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.75rem;align-items:end;padding:.9rem;border:1px solid rgba(96,239,134,.22);border-radius:16px;background:rgba(96,239,134,.055)}
.whop-recovery-action label{display:grid;gap:.4rem;color:var(--muted);font-weight:780}
.whop-recovery-action select{width:100%;min-width:0}
.whop-recovery-advanced{padding:.75rem;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#0a111c}
.whop-recovery-advanced>summary{cursor:pointer;font-weight:800;color:var(--muted)}
.source-load-more,.post-load-more{width:100%;margin-top:.5rem}
.post-card{content-visibility:auto;contain-intrinsic-size:auto 320px}
@media(max-width:720px){
  html{scroll-behavior:auto!important}
  .control-operation-bar{backdrop-filter:none;box-shadow:0 8px 22px rgba(0,0,0,.34)}
  .control-panel .btn.primary{box-shadow:none}
  .control-panel,.discovered-group,.discovered-source,.post-card{box-shadow:none!important}
  .whop-recovery-action{grid-template-columns:1fr}
  .whop-recovery-action .btn{width:100%}
  .whop-recovery-workflow>summary{align-items:flex-start}
}
@media(prefers-reduced-motion:reduce),(max-width:720px){
  .control-operation-track span,button[aria-busy=true]::after,.btn[aria-busy=true]::after{animation-duration:1.4s}
  *{scroll-behavior:auto!important}
}
"""
css_path.write_text(css)

package_path = Path('package.json')
package = package_path.read_text()
needle = 'node tools/audit-control-performance-media.mjs && '
if needle not in package:
    raise SystemExit('package audit anchor missing')
package = package.replace(needle, needle + 'node tools/audit-control-mobile-flow.mjs && ', 1)
package_path.write_text(package)

Path('tools/audit-control-mobile-flow.mjs').write_text("""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const control = readFileSync('assets/js/control-center-v2.js', 'utf8');
const backups = readFileSync('assets/js/control-center-whop-backups.js', 'utf8');
const css = readFileSync('assets/css/control-center-hardening.css', 'utf8');

assert.ok(control.includes('const POST_PAGE_SIZE = 10'));
assert.ok(control.includes('const SOURCE_PAGE_SIZE = 12'));
assert.ok(control.includes('Press Load sources when you are ready'));
assert.ok(!control.includes('state.discoveryAutoPasses >= 8'));
assert.ok(!control.includes('idle(appendRemaining)'));
assert.ok(control.includes("dataset.action = 'post-load-more'"));
assert.ok(control.includes("dataset.action = 'source-load-more'"));
assert.ok(control.includes('scanIfApproved: false'));
assert.ok(backups.includes('structureRecoveryPanel'));
assert.ok(backups.includes('dataset.backupAction'));
assert.ok(!backups.includes('new MutationObserver'));
assert.ok(css.includes('.whop-recovery-workflow'));
assert.ok(css.includes('@media(max-width:720px)'));
console.log('CONTROL CENTER MOBILE FLOW AUDIT PASSED');
""")
