from pathlib import Path

page_path = Path('control-center/index.html')
page = page_path.read_text()
replacements = {
    '/assets/css/control-center-hardening.css?v=20260730.14': '/assets/css/control-center-hardening.css?v=20260803.2',
    '/assets/js/control-center-v2.js?v=20260730.14': '/assets/js/control-center-v2.js?v=20260803.2',
    '/assets/js/control-center-whop-backups.js?v=20260803.1': '/assets/js/control-center-whop-backups.js?v=20260803.2',
}
for old, new in replacements.items():
    if old not in page:
        raise SystemExit(f'asset-version anchor missing: {old}')
    page = page.replace(old, new, 1)
page_path.write_text(page)

audit_path = Path('tools/audit-control-mobile-flow.mjs')
audit = audit_path.read_text()
old = "const css = readFileSync('assets/css/control-center-hardening.css', 'utf8');\n"
new = old + "const page = readFileSync('control-center/index.html', 'utf8');\n"
if old not in audit:
    raise SystemExit('mobile audit page-read anchor missing')
audit = audit.replace(old, new, 1)
anchor = "assert.ok(css.includes('@media(max-width:720px)'));\n"
addition = anchor + "for (const asset of ['control-center-hardening.css', 'control-center-v2.js', 'control-center-whop-backups.js']) {\n  assert.ok(page.includes(`/assets/${asset.endsWith('.css') ? 'css' : 'js'}/${asset}?v=20260803.2`), `${asset} cache version was not bumped with the mobile repair.`);\n}\n"
if anchor not in audit:
    raise SystemExit('mobile audit cache anchor missing')
audit = audit.replace(anchor, addition, 1)
audit_path.write_text(audit)
