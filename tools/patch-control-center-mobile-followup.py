from pathlib import Path

control_path = Path('assets/js/control-center-v2.js')
control = control_path.read_text()

old = """    recentSelection: new Set(),
    previewPostKey: null,
"""
new = """    recentSelection: new Set(),
    deferredHistoryLoaded: false,
    previewPostKey: null,
"""
if old not in control:
    raise SystemExit('state lazy-history anchor missing')
control = control.replace(old, new, 1)

old = """  document.body.append(operationBar);

  async function requestJson(url, options = {}) {
"""
new = """  document.body.append(operationBar);
  const discoveryIntro = elements.discoverySummary?.closest('.control-panel')?.querySelector('.panel-head p');
  if (discoveryIntro) discoveryIntro.textContent = 'Nothing scans automatically. Press Load sources, open one group, then review only the source you choose.';

  async function requestJson(url, options = {}) {
"""
if old not in control:
    raise SystemExit('discovery intro anchor missing')
control = control.replace(old, new, 1)

old = """  function renderDiscovery() {
    state.sourceCards.clear();
"""
new = """  function renderDiscovery() {
    state.sourceCards.clear();
    if (elements.refreshGroups) elements.refreshGroups.textContent = state.discovery ? 'Refresh sources' : 'Load sources';
"""
if old not in control:
    raise SystemExit('render discovery anchor missing')
control = control.replace(old, new, 1)

old = "const background = [loadBulkJob(), loadRecentActions()];"
if control.count(old) != 2:
    raise SystemExit(f'expected two eager history anchors, found {control.count(old)}')
control = control.replace(old, 'const background = [];')

anchor = """  elements.preview.addEventListener('click', (event) => {
"""
insert = """  elements.bulkWorkflow?.addEventListener('toggle', () => {
    if (!elements.bulkWorkflow.open || state.deferredHistoryLoaded) return;
    state.deferredHistoryLoaded = true;
    Promise.allSettled([loadBulkJob(), loadRecentActions()]).catch(() => null);
  });

""" + anchor
if anchor not in control:
    raise SystemExit('lazy history listener anchor missing')
control = control.replace(anchor, insert, 1)
control_path.write_text(control)

backup_path = Path('assets/js/control-center-whop-backups.js')
backup = backup_path.read_text()
old = """    for (const button of [elements.create, elements.reset, elements.refresh, elements.confirm]) {
"""
new = """    for (const button of [elements.create, elements.reset, elements.refresh, elements.confirm, elements.continue]) {
"""
if old not in backup:
    raise SystemExit('backup busy-lock anchor missing')
backup = backup.replace(old, new, 1)

old = """    if (elements.refresh instanceof HTMLButtonElement) elements.refresh.disabled = state.busy;
    if (elements.confirm instanceof HTMLButtonElement) {
"""
new = """    if (elements.refresh instanceof HTMLButtonElement) elements.refresh.disabled = state.busy;
    if (elements.continue instanceof HTMLButtonElement) elements.continue.disabled = state.busy || !valid;
    if (elements.action instanceof HTMLSelectElement) elements.action.disabled = state.busy;
    if (elements.confirm instanceof HTMLButtonElement) {
"""
if old not in backup:
    raise SystemExit('backup control-lock anchor missing')
backup = backup.replace(old, new, 1)

old = """    continueButton.dataset.backupContinue = 'true';
    continueButton.textContent = 'Continue';
    actionRow.append(label, continueButton);
"""
new = """    continueButton.dataset.backupContinue = 'true';
    continueButton.textContent = 'Create backup';
    elements.action = select;
    elements.continue = continueButton;
    actionRow.append(label, continueButton);
"""
if old not in backup:
    raise SystemExit('backup continue registration anchor missing')
backup = backup.replace(old, new, 1)
backup_path.write_text(backup)

css_path = Path('assets/css/control-center-hardening.css')
css = css_path.read_text()
old = """  .control-operation-track span,button[aria-busy=true]::after,.btn[aria-busy=true]::after{animation-duration:1.4s}
  *{scroll-behavior:auto!important}
"""
new = """  .control-operation-track span,button[aria-busy=true]::after,.btn[aria-busy=true]::after{animation:none!important}
  *{scroll-behavior:auto!important}
"""
if old not in css:
    raise SystemExit('mobile animation anchor missing')
css = css.replace(old, new, 1)
css_path.write_text(css)

audit_path = Path('tools/audit-control-mobile-flow.mjs')
audit = audit_path.read_text()
anchor = "assert.ok(control.includes('scanIfApproved: false'));\n"
extra = anchor + "assert.ok(control.includes('const background = [];') && control.includes('deferredHistoryLoaded'));\nassert.ok(control.includes(\"textContent = state.discovery ? 'Refresh sources' : 'Load sources'\"));\n"
if anchor not in audit:
    raise SystemExit('mobile audit control anchor missing')
audit = audit.replace(anchor, extra, 1)
anchor = "assert.ok(backups.includes('dataset.backupAction'));\n"
extra = anchor + "assert.ok(backups.includes('elements.continue = continueButton') && backups.includes('elements.continue.disabled = state.busy || !valid'));\n"
if anchor not in audit:
    raise SystemExit('mobile audit backup anchor missing')
audit = audit.replace(anchor, extra, 1)
audit_path.write_text(audit)
