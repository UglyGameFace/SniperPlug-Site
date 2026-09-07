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
text = text.replace(old, new, 1)
p.write_text(text)
PY
