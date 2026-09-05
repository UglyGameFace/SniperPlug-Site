(() => {
  const root = document.querySelector('[data-control-root]');
  const editor = document.querySelector('[data-draft-editor]');
  if (!(root instanceof HTMLElement) || !(editor instanceof HTMLFormElement)) return;

  const statePanel = editor.querySelector('[data-editor-publish-state]');
  const stateTitle = statePanel?.querySelector('strong');
  const stateCopy = statePanel?.querySelector('span');
  const status = editor.querySelector('[data-editor-status]');
  const actions = editor.querySelector('.editor-actions');
  const actionStatus = editor.querySelector('[data-editor-action-status]');
  const saveButton = editor.querySelector('button[type="submit"]');
  const publishButton = editor.querySelector('[data-publish-guide]');
  const rejectButton = editor.querySelector('[data-reject-guide]');
  const returnButton = editor.querySelector('[data-return-draft]');
  const bodyField = editor.elements.namedItem('body');
  const featured = editor.elements.namedItem('featured');
  const exactPreview = editor.querySelector('.exact-preview');

  // The lifecycle previously rendered a second persistent warning directly beside the
  // real action status. Keep one source of truth so mobile users are not forced to
  // interpret two boxes that say nearly the same thing.
  editor.querySelector('.editor-lock-message')?.remove();

  const style = document.createElement('style');
  style.dataset.sniperplugEditorClarity = '';
  style.textContent = `
    .draft-editor textarea[name="body"]{height:min(36vh,420px);min-height:260px;max-height:54vh;resize:vertical}
    .draft-editor .editor-publish-state{padding:.75rem .85rem}
    .draft-editor .editor-publish-state>div{gap:.12rem}
    .draft-editor .editor-publish-state span{font-size:.92rem;line-height:1.35}
    .draft-editor .editor-action-status{margin:.15rem 0;padding:.68rem .8rem}
    .draft-editor .editor-actions{align-items:center}
    .draft-editor .guide-options{border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#0d1421;overflow:hidden}
    .draft-editor .guide-options>summary{padding:.75rem .85rem;cursor:pointer;font-weight:800;color:var(--muted)}
    .draft-editor .guide-options>.rights-check{margin:.65rem;border:0;background:rgba(255,255,255,.025)}
    @media(max-width:1000px),(pointer:coarse){
      .draft-editor textarea[name="body"]{height:min(34vh,400px);min-height:250px;max-height:48vh}
      .draft-editor .editor-actions{position:sticky;bottom:max(.55rem,env(safe-area-inset-bottom));z-index:12;padding:.65rem;border:1px solid rgba(255,255,255,.11);border-radius:16px;background:#0b111c;box-shadow:0 10px 28px rgba(0,0,0,.34)}
      .draft-editor .editor-actions>*{min-height:48px;flex:1 1 145px}
    }
  `;
  document.head.append(style);

  const bodyLabel = bodyField instanceof HTMLTextAreaElement ? bodyField.closest('label') : null;
  const bodyLabelText = bodyLabel?.querySelector(':scope > span');
  if (bodyLabelText) bodyLabelText.textContent = 'Guide content';

  const featureLabel = featured instanceof HTMLInputElement ? featured.closest('label')?.querySelector('span') : null;
  if (featureLabel) featureLabel.textContent = 'Feature this guide';

  if (saveButton instanceof HTMLButtonElement) saveButton.textContent = 'Save changes';
  if (publishButton instanceof HTMLButtonElement) publishButton.textContent = 'Publish guide';
  if (rejectButton instanceof HTMLButtonElement) rejectButton.textContent = 'Remove draft';
  if (exactPreview instanceof HTMLDetailsElement) exactPreview.hidden = true;

  function guideStatus() {
    return String(status?.textContent || 'draft').trim().toLowerCase();
  }

  function isDirty() {
    return window.SniperPlugDraftSafety?.isDirty?.() === true;
  }

  function sync() {
    const current = guideStatus();
    const dirty = current === 'draft' && isDirty();

    if (saveButton instanceof HTMLButtonElement) saveButton.textContent = 'Save changes';
    if (publishButton instanceof HTMLButtonElement) publishButton.textContent = 'Publish guide';
    if (rejectButton instanceof HTMLButtonElement) rejectButton.textContent = 'Remove draft';
    if (returnButton instanceof HTMLButtonElement && current === 'published') returnButton.textContent = 'Unpublish & edit';

    if (!(statePanel instanceof HTMLElement) || !(stateTitle instanceof HTMLElement) || !(stateCopy instanceof HTMLElement)) return;

    if (current === 'published') {
      statePanel.dataset.state = 'published';
      stateTitle.textContent = 'Published';
      stateCopy.textContent = 'Available in Private Guides. Unpublish it before editing.';
      return;
    }
    if (current === 'rejected') {
      statePanel.dataset.state = 'rejected';
      stateTitle.textContent = 'Removed';
      stateCopy.textContent = 'This guide is private and not published.';
      return;
    }
    if (dirty) {
      statePanel.dataset.state = 'draft';
      stateTitle.textContent = 'Unsaved changes';
      stateCopy.textContent = 'Save before publishing so the live guide matches what you see here.';
      return;
    }

    statePanel.dataset.state = 'draft';
    stateTitle.textContent = 'Ready to review';
    stateCopy.textContent = 'If this looks right, publish it. If you edit anything, save first.';
  }

  editor.addEventListener('input', () => queueMicrotask(sync));
  editor.addEventListener('change', () => queueMicrotask(sync));
  root.addEventListener('sniperplug:guide-loaded', () => queueMicrotask(sync));

  if (actionStatus instanceof HTMLElement) {
    actionStatus.addEventListener('DOMSubtreeModified', () => {});
  }

  sync();
})();
