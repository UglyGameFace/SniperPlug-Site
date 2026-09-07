#!/usr/bin/env bash
set -euo pipefail
python - <<'PY'
from pathlib import Path
p = Path('tools/tmp-capture-reliability-patch.sh')
text = p.read_text()
old = '''    traversalTimer = setTimeout(() => {
      traversalTimer = 0;
      runTraversalSnapshot();
    }, TRAVERSAL_SETTLE_MS);'''
new = '''    traversalTimer = setTimeout(() => {
      traversalTimer = 0;
      return runTraversalSnapshot();
    }, TRAVERSAL_SETTLE_MS);'''
if old not in text:
    raise SystemExit('temporary scheduler callback pattern not found')
p.write_text(text.replace(old, new, 1))

for name in [
    'tools/test-browser-auto-traversal.mjs',
    'tools/test-browser-popup-latency.mjs',
    'tools/test-firefox-candidate-retention.mjs',
    'tools/test-firefox-better-content-frame-selection.mjs',
]:
    file = Path(name)
    body = file.read_text()
    if '0.2.4' in body:
        file.write_text(body.replace('0.2.4', '0.2.5'))
PY
