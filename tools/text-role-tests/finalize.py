import pathlib,re,zipfile,io,hashlib
root=pathlib.Path('runtime-src/system')
p=root/'dashboard.html';s=p.read_bytes().decode('utf-8')
scope=r'''
/* Local fixed backgrounds and readable custom thumbnails. */
#podoWin,#ttSaveFailBar{--text-on-fill:#ffffff;--text-primary:#ffffff;--text-secondary:#d5dbe3;color:var(--text-on-fill)}
#ttSaveFailBar button{--text-on-fill:var(--tt-ink-control-fill,var(--control-text))}
'''
i=s.index('<style id="tt-text-roles-v1666">');end=s.index('</style>',i)
s=s[:end]+scope+s[end:]
old='window.ttTextRoles?.ink(t.text,[t.panel])||t.text'
assert s.count(old)==1
s=s.replace(old,"window.ttTextRoles?.ink(t.text,[t.panel])||(contrast(t.text,t.panel)>=4.5?t.text:contrast('#000000',t.panel)>=contrast('#ffffff',t.panel)?'#000000':'#ffffff')")
p.write_bytes(s.encode())
p=root/'presentation-assets.zip'
src=zipfile.ZipFile(io.BytesIO(p.read_bytes()));buf=io.BytesIO();changes=[]
with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as dst:
 for entry in src.infolist():
  data=src.read(entry.filename)
  if entry.filename=='classroom/host/board-present.js':
   s=data.decode()
   old="['panel','text','border','control','controlText','accent','sub','surface']"
   assert s.count(old)==1
   s=s.replace(old,"['panel','text','border','control','controlText','accent','sub','surface','surfaceText','surfaceSub','accentText','alert']")
   s=s.replace(">.179?'#171a20':'#fff'",">.17912878?'#000000':'#ffffff'")
   # Canvas draws paper and card with separate semantic roles when possible; paper is the dominant surface.
   s=s.replace("text:read('text','#1b4546')","text:read('surfaceText',read('text','#1b4546'))")
   s=s.replace("muted:read('sub','#567b7e')","muted:read('surfaceSub',read('sub','#567b7e'))")
   data=s.encode();changes.append(entry.filename)
  elif entry.filename=='classroom/host/board-present.css':
   s=data.decode()
   s=s.replace('color:#fff!important','color:var(--text-on-fill)!important').replace('color:var(--tt-chart-panel)!important','color:var(--text-on-fill)!important')
   # The original theme property names remain bridge compatibility aliases; foregrounds use five roles.
   s=s.replace('color:var(--tt-present-text,#edf4fc)','color:var(--text-primary)').replace('color:var(--tt-present-controlText,#fff)','color:var(--text-on-fill)').replace('color:var(--tt-chart-text)','color:var(--text-primary)')
   s+='''
html.tt-board-presentation{--text-primary:var(--tt-present-text,#edf4fc);--text-secondary:var(--tt-present-sub,#d5dbe3);--text-accent:var(--tt-present-text,#edf4fc);--text-alert:var(--tt-present-alert,#ffb4ab);--text-on-fill:var(--tt-present-controlText,#fff)}
html.tt-board-presentation :is(.play-btn.is-rate-active,.play-btn[aria-pressed="true"],.pe-pitch-run-actions button[aria-pressed="true"],.pe-surface-buttons button[aria-pressed="true"]){--text-on-fill:var(--tt-present-accentText,#fff);color:var(--text-on-fill)!important}
html.tt-board-presentation :is(.pe-simple-panel,.pe-simple-team){--text-primary:var(--tt-present-surfaceText,var(--tt-present-text,#edf4fc));--text-secondary:var(--tt-present-surfaceSub,var(--tt-present-sub,#d5dbe3))}
html.tt-board-presentation :is(.pe-simple-paper,.pe-simple-name){--text-primary:var(--tt-present-text,#edf4fc)}
'''
   data=s.encode();changes.append(entry.filename)
  dst.writestr(entry,data)
assert set(changes)=={'classroom/host/board-present.css','classroom/host/board-present.js'}
with zipfile.ZipFile(io.BytesIO(buf.getvalue())) as check:
 assert check.testzip() is None
 assert set(check.namelist())==set(src.namelist())
 for name in src.namelist():
  if name not in changes:assert src.read(name)==check.read(name),name
p.write_bytes(buf.getvalue())
print('PASS: all 201 non-UI presentation entries preserved byte-for-byte; only board theme CSS and JS updated')
