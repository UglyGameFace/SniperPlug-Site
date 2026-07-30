(() => {
  const root = document.querySelector('[data-control-root]');
  if (!(root instanceof HTMLElement)) return;

  const riskySelector = '.draft-item,.discovered-source,.discovered-group';
  let queued = false;

  function normalizeElement(element) {
    if (!(element instanceof HTMLElement)) return;
    element.style.removeProperty('content-visibility');
    element.style.removeProperty('contain-intrinsic-size');
    element.style.removeProperty('contain');
  }

  function sweep(scope = root) {
    if (scope instanceof HTMLElement && scope.matches(riskySelector)) normalizeElement(scope);
    for (const element of scope.querySelectorAll?.(riskySelector) || []) normalizeElement(element);
  }

  function queueSweep() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sweep();
    });
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && (node.matches(riskySelector) || node.querySelector(riskySelector))) {
          queueSweep();
          return;
        }
      }
      if (record.type === 'attributes' && record.target instanceof HTMLElement && record.target.matches(riskySelector)) {
        queueSweep();
        return;
      }
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  });

  root.addEventListener('sniperplug:dashboard-refreshed', queueSweep);
  root.addEventListener('sniperplug:selection-updated', queueSweep);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) queueSweep(); });
  window.addEventListener('pageshow', queueSweep);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });

  sweep();
})();