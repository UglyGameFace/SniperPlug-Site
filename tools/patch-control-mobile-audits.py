from pathlib import Path

path = Path('tools/audit-control-performance-media.mjs')
text = path.read_text()
old = "assert.ok(runtime.includes('requestIdleCallback') && runtime.includes('appendRemaining') && runtime.includes('appendCount(Math.min(12'), 'Large content scans do not yield between render chunks.');"
new = "assert.ok(runtime.includes('POST_PAGE_SIZE = 10') && runtime.includes(\"dataset.action = 'post-load-more'\") && runtime.includes('state.postRenderLimit'), 'Large content scans do not stay behind explicit bounded pagination.');"
if old not in text:
    raise SystemExit('old content-render audit anchor missing')
text = text.replace(old, new, 1)
old = "assert.ok(runtime.includes('GUIDE_PAGE_SIZE = 60') && runtime.includes('filteredGuideIds') && runtime.includes('guide-load-more'), 'The review queue still renders every guide at once.');"
new = "assert.ok(runtime.includes('GUIDE_PAGE_SIZE = 24') && runtime.includes('filteredGuideIds') && runtime.includes('guide-load-more'), 'The review queue still renders every guide at once.');"
if old not in text:
    raise SystemExit('old guide pagination audit anchor missing')
text = text.replace(old, new, 1)
path.write_text(text)
