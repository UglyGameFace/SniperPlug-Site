(() => {
  const editor = document.querySelector('[data-draft-editor]');
  const status = document.querySelector('[data-editor-status]');
  if (!(editor instanceof HTMLFormElement) || !(status instanceof HTMLElement)) return;

  const editableNames = ['title', 'description', 'category', 'body', 'featured', 'attachmentsResolved'];
  const saveButton = editor.querySelector('button[type="submit"]');
  const message = document.createElement('p');
  message.className = 'editor-lock-message';
  message.setAttribute('role', 'status');
  message.hidden = true;
  editor.querySelector('.editor-actions')?.before(message);

  function sync() {
    const current = status.textContent.trim().toLowerCase();
    const editable = current === 'draft';
    for (const name of editableNames) {
      const field = editor.elements.namedItem(name);
      if (field instanceof HTMLElement) field.toggleAttribute('disabled', !editable);
    }
    if (saveButton instanceof HTMLButtonElement) saveButton.disabled = !editable;
    message.hidden = editable || editor.hidden;
    message.textContent = current === 'published'
      ? 'This guide is live. Press Return to draft before changing its content.'
      : current === 'rejected'
        ? 'This guide is rejected and private. Press Return to draft before editing it.'
        : '';
  }

  new MutationObserver(sync).observe(status, { childList: true, subtree: true });
  new MutationObserver(sync).observe(editor, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
