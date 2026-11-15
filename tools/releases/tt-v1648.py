import pathlib,sys,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a))
 s=s.replace(a,b)
rep('justify-content:flex-end;gap:12px;width:100%;max-height:100%', 'justify-content:flex-end;gap:0;width:100%;max-height:100%')
rep('max-width:100%;margin:0;padding:.48em .85em;', 'max-width:100%;margin:0;padding:.48em .85em;transform:translateY(8px);z-index:1;')
rep(' const {bg,panel,text,accent}=t;', ''' const {bg,panel,text,accent}=t,modal=/^#[0-9a-f]{6}$/i.test(t.modal||'')?t.modal:panel;
  const surface=mix(panel,bg,.5),border=mix(panel,text,.2);''')
rep("'--control-text':text};", "'--control-text':text,'--tt-modal-panel':modal,'--tt-glass-rgb':hex(panel).join(','),'--tt-glass-modal-rgb':hex(modal).join(','),'--tt-glass-inner-rgb':hex(surface).join(','),'--tt-glass-border-rgb':hex(border).join(','),'--tt-glass-foreground':text};")
rep('.card,dialog{background:var(--panel);border-color:var(--border);color:var(--text)}', '.card,dialog{background:var(--panel);border-color:var(--border);color:var(--text)}dialog{background:var(--tt-modal-panel,var(--panel))}')
rep('<label>카드 <input type="color" id="ctPanel"></label>', '<label>위젯 배경 <input type="color" id="ctPanel"></label><label>설정창·모달 배경 <input type="color" id="ctModal"></label>')
rep("panel:$id('ctPanel'),text:$id('ctText')", "panel:$id('ctPanel'),modal:$id('ctModal'),text:$id('ctText')")
rep('panel:f.panel.value,text:f.text.value', 'panel:f.panel.value,modal:f.modal.value,text:f.text.value')
rep('Math.min(contrast(t.text,t.panel),contrast(t.text,t.bg))', 'Math.min(contrast(t.text,t.panel),contrast(t.text,t.modal),contrast(t.text,t.bg))')
rep('f.panel.value=t.panel;f.text.value=t.text;', "f.panel.value=t.panel;f.modal.value=/^#[0-9a-f]{6}$/i.test(t.modal||'')?t.modal:t.panel;f.text.value=t.text;")
rep('[f.bg.value,f.panel.value,f.text.value,f.accent.value]=b;check()', '[f.bg.value,f.panel.value,f.text.value,f.accent.value]=b;f.modal.value=b[1];check()')
rep("['bg','panel','text','accent'].forEach(k=>f[k].oninput=check)", "['bg','panel','modal','text','accent'].forEach(k=>f[k].oninput=check)")
rep("contrast('#ffffff',t.panel)>=contrast('#111111',t.panel)", "Math.min(...[t.bg,t.panel,t.modal].map(c=>contrast('#ffffff',c)))>=Math.min(...[t.bg,t.panel,t.modal].map(c=>contrast('#111111',c)))")
rep('body.tt-scene-glass{--tt-glass-rgb:', 'body{--tt-glass-rgb:')
for theme in ['sky','pink','green','black']:
 rep('body.tt-scene-glass[data-theme='+theme+']{--tt-glass-rgb:', 'body[data-theme='+theme+']{--tt-glass-rgb:')
rep('background:rgba(var(--tt-glass-rgb),var(--tt-modal-alpha,.78))!important;', 'background:rgba(var(--tt-glass-modal-rgb,var(--tt-glass-rgb)),var(--tt-modal-alpha,.78))!important;')
rep(' #sceneSection .scene-field select{', ''' #sceneSection .tt-glass-demo-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,220px);gap:14px;align-items:center}
 #sceneSection .tt-glass-demo-row .scene-field input[type=range]{max-width:100%;flex:1 1 90px}
 #sceneSection .tt-glass-demo{margin:0;min-width:0}
 #sceneSection .tt-glass-demo figcaption{font-size:12px;color:var(--sub);margin-bottom:5px}
 #sceneSection .tt-glass-demo-bg{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:10px;padding:10px;display:grid;gap:8px;min-height:130px;background:radial-gradient(circle at 75% 18%,#ffe3a0 0 12%,transparent 13%),linear-gradient(145deg,transparent 0 38%,#517d68 39% 60%,transparent 61%),linear-gradient(25deg,#799e59 0 36%,#b9dbe5 37% 100%)}
 #sceneSection .tt-glass-demo-card{border-radius:8px;border:1px solid rgba(var(--tt-glass-border-rgb),.43);padding:7px 9px;background:rgba(var(--tt-glass-rgb),var(--tt-glass-alpha,.78));backdrop-filter:blur(var(--tt-glass-blur,12px)) saturate(1.12);color:var(--text);font-size:12px;line-height:1.4;box-shadow:0 2px 6px #0002}
 #sceneSection .tt-glass-demo-modal{background:rgba(var(--tt-glass-modal-rgb,var(--tt-glass-rgb)),var(--tt-modal-alpha,.78))}
 #sceneSection .tt-glass-demo-card b{display:block;font-size:13px}
 @media(max-width:1000px){#sceneSection .tt-glass-demo-row{grid-template-columns:minmax(0,1fr)}#sceneSection .tt-glass-demo{max-width:260px}}
 #sceneSection .scene-field select{''')
rep('   <div class="scene-field"><label for="sceneGlassOpacity">', '   <div class="tt-glass-demo-row"><div class="tt-glass-controls"><div class="scene-field"><label for="sceneGlassOpacity">')
rep('id="sceneGlassReset">기본값 복원</button></div>', '''id="sceneGlassReset">기본값 복원</button></div></div>
   <figure class="tt-glass-demo" aria-label="글라스 효과 미리보기"><figcaption>실시간 미리보기 · 예시 배경</figcaption><div class="tt-glass-demo-bg"><div class="tt-glass-demo-card"><b>위젯</b>1교시 · 국어</div><div class="tt-glass-demo-card tt-glass-demo-modal"><b>설정창·모달</b>배경과 글자 미리보기</div></div></figure></div>''')
rep('return Object.keys(allowed).length===4?allowed:null;', "if(Object.keys(allowed).length!==4)return null;if(typeof t.modal==='string'&&/^#[0-9a-f]{6}$/i.test(t.modal))allowed.modal=t.modal;return allowed;")
s=s.replace('1.64.7','1.64.8')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
