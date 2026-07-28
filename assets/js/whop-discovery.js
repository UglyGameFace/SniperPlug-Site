(() => {
  if (document.querySelector('link[href="/assets/css/whop-discovery.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/css/whop-discovery.css';
  document.head.append(link);
})();
