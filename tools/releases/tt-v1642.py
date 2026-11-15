import sys,pathlib,re,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:180],s.count(a))
 s=s.replace(a,b)
rep("const REQUIRED_APPS=new Set(['classkit','dark']);", "const REQUIRED_APPS=new Set(['classkit','widgetmanager','dark']);")
rep("tools.insertBefore(b,$id('noApps'));};", "tools.insertBefore(b,$id('noApps'));return b;};")
rep("extra('⛶ 전체화면',()=>$id('full').click());", "extra('⛶ 전체화면',()=>$id('full').click());\n const manager=extra('▦ 위젯 관리',()=>{});manager.id='ttWidgetListBtn';manager.dataset.app='widgetmanager';manager.setAttribute('aria-expanded','false');manager.setAttribute('aria-haspopup','dialog');")
rep("const fixed=['classkit','dark','fixed:전체화면','fixed:설정'];", "const fixed=['classkit','widgetmanager','dark','fixed:전체화면','fixed:설정'];")
rep("restoreOrder(get(orderKey,[]));", "const savedToolOrder=get(orderKey,[]);restoreOrder(savedToolOrder);if(!savedToolOrder.includes('widgetmanager')){const a=toolArea.querySelector('[data-app=classkit]'),b=$('#ttWidgetListBtn');if(a&&b)a.after(b)}")
rep("const p={\n   monitor:", "const p={\n   ttFolderCog:'<path d=\"M20 11V6a2 2 0 0 0-2-2h-7L9 2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7\"/><circle cx=\"17\" cy=\"17\" r=\"3\"/><path d=\"M17 12v2m0 6v2m5-5h-2m-6 0h-2m8.5-3.5-1.5 1.5m-4 4-1.5 1.5m0-7 1.5 1.5m4 4 1.5 1.5\"/>',\n   ttGrid:'<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>',\n   ttEyeOff:'<path d=\"M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M6.7 6.7C3.8 8.5 2 12 2 12s3.6 6 10 6c1.8 0 3.4-.5 4.7-1.3M10 6.2a10.4 10.4 0 0 1 2-.2c6.4 0 10 6 10 6s-.8 1.5-2.3 3\"/>',\n   ttMaximize:'<path d=\"M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5\"/>',\n   monitor:")
rep("paint:'palette',dark:'square',todo:'check',memo:'memo',classkit:'sliders'};", "paint:'palette',dark:'ttEyeOff',todo:'check',memo:'memo',classkit:'ttFolderCog',widgetmanager:'ttGrid'};")
rep("/전체화면/.test(button.textContent)?'monitor':'settings'", "/전체화면/.test(button.textContent)?'ttMaximize':'settings'")
rep("(설정 → 화면 · 위젯에서 위젯 표시/숨기기는 가능합니다)", "(수업 도구 → 위젯 관리에서 표시/숨기기는 가능합니다)")
rep("위젯은 화면 → 화면 구성에서 켜요.", "위젯은 수업 도구 → 위젯 관리에서 켜요.")
rep("const b=document.createElement('button');b.type='button';b.id='ttWidgetListBtn';b.textContent='☰ 위젯 관리';b.setAttribute('aria-expanded','false');\n bar.insertBefore(b,$('#layoutAdd'));", "const b=$('#ttWidgetListBtn');if(!b)throw new Error('Widget manager tool missing');\n const inEdit=()=>document.body.classList.contains('layout-editing');")
rep("note.textContent='표시·숨기기와 새 위젯 만들기는 편집 완료 시 확정됩니다. 숨김은 데이터를 지우지 않습니다.';", "note.textContent=inEdit()?'표시·숨기기와 새 위젯 만들기는 편집 완료 시 확정됩니다. 숨김은 데이터를 지우지 않습니다.':'변경은 바로 저장됩니다. 숨김은 데이터를 지우지 않습니다. 크기와 위치는 레이아웃 편집에서 변경하세요.';")
rep("layoutSelect(id);const card=widgetCard(id);", "if(inEdit())layoutSelect(id);else{layoutLayer(id,true);layoutApply();layoutSave()}const card=widgetCard(id);")
rep("if(isVisible){layout.items[id].off=true;layoutApply();layoutDecorate();render()}\n    else if(widgetShow(id)){layoutApply();layoutDecorate();render()}", "if(isVisible){layout.items[id].off=true;layoutApply();if(inEdit())layoutDecorate();else layoutSave();render()}\n    else if(widgetShow(id)){layoutApply();if(inEdit())layoutDecorate();else layoutSave();render()}")
rep("create.append(make(title,()=>{const menu=$('#layoutAddMenu');const target=menu?.querySelector(selector);", "create.append(make(title,()=>{const editing=inEdit();if(!editing){layoutDecorate();document.querySelectorAll('.w-edit').forEach(el=>el.remove())}const menu=$('#layoutAddMenu');const target=menu?.querySelector(selector);")
rep("target.click();render();},'tt-create'));", "if(!editing)close();target.click();if(!editing){document.querySelectorAll('.w-edit').forEach(el=>el.remove());memoAdded=[];layoutSave();layoutApply()}render();},'tt-create'));")
rep("b.onclick=()=>{if(!panel.hidden){close();return}render();panel.hidden=false;b.setAttribute('aria-expanded','true')};", "window.ttOpenWidgetList=()=>{if(!panel.hidden){close();return}render();panel.hidden=false;b.setAttribute('aria-expanded','true')};b.onclick=window.ttOpenWidgetList;\n b.addEventListener('keydown',e=>{if(inEdit()&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();window.ttOpenWidgetList()}});")
rep("new MutationObserver(()=>{if(!document.body.classList.contains('layout-editing'))close()}).observe(document.body,{attributes:true,attributeFilter:['class']});", "let wasEditing=inEdit();new MutationObserver(()=>{const now=inEdit();if(wasEditing&&!now)close();wasEditing=now}).observe(document.body,{attributes:true,attributeFilter:['class']});")
rep("try{current.button.releasePointerCapture(e.pointerId)}catch{}\n}", "try{current.button.releasePointerCapture(e.pointerId)}catch{}\n if(current.button.id==='ttWidgetListBtn'&&!current.active&&e.type==='pointerup')window.ttOpenWidgetList?.();\n}")
rep("표시할 도구가 없습니다. ⚙ 설정의 앱 표시에서 켤 수 있습니다.", "표시할 도구가 없습니다. 레이아웃 편집에서 수업 도구를 켤 수 있습니다.")
rep('</body></html>', '''<style id="tt-v1642-management">
#widgetChoices,#widgetNotice,.tt-multi-add,.tt-legacy-app-settings{display:none!important}
#ttWidgetListBtn[aria-expanded="true"]{outline:2px solid var(--accent)}
</style><script id="tt-v1642-management-script">
(()=>{const apps=document.getElementById('appChoices'),widgets=document.getElementById('widgetChoices');
const clock=apps?.querySelector('[data-app-choice="clock"]')?.closest('label');
if(clock&&widgets){const block=document.createElement('div');block.className='app-choices';block.append(clock);widgets.before(block)}
if(apps)apps.closest('.settings-section')?.classList.add('tt-legacy-app-settings');
})();
</script></body></html>''')
s=s.replace('1.64.1','1.64.2')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
