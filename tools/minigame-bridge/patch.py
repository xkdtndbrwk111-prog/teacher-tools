"""Patch only the R7/R8 board's game loader and reject obsolete requests before ledger access."""
from pathlib import Path
import re
HERE=Path(__file__).resolve().parent
def patch_dashboard(s):
    a=s.index("const miniOrigin=")
    b=s.index("// Editable layout:",a)
    if s.count("const miniOrigin=")!=1 or 'hoja-ready' not in s[a:b]:raise ValueError('mini loader anchor')
    return s[:a]+(HERE/'dashboard-bridge.js').read_text(encoding='utf-8')+'\n'+s[b:]
def patch_coins_ui(s):
    a="  const source=event.source,sessionId=event.data.sessionId;"
    b="  // A cached pre-V3 game lacks the session and must not reach the ledger.\n  if(typeof event.data.sessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.data.sessionId))return;\n"+a
    if s.count(a)!=1:raise ValueError('coin UI anchor')
    if "cached pre-V3 game" in s:return s
    return s.replace(a,b)
def apply(system):
    for n,f in [('dashboard.html',patch_dashboard),('coins-ui.js',patch_coins_ui)]:
        p=Path(system)/n;p.write_text(f(p.read_text(encoding='utf-8-sig')),encoding='utf-8')
if __name__=='__main__':
    import sys
    apply(sys.argv[1])
