#!/usr/bin/env python3
"""R7 review-only UI overlay; apply AFTER board-r7-review.patch. Never publish."""
import hashlib, pathlib, sys
BASE='f44b8f19d77fcbb0f22871c598b95bc574614ae0e588032afa86244a98192ebe'
p=pathlib.Path(sys.argv[1]); raw=p.read_bytes()
if hashlib.sha256(raw).hexdigest()!=BASE: raise SystemExit('Unexpected R7 dashboard hash; no write')
s=raw.decode('utf-8')
def change(a,b):
    global s
    if s.count(a)!=1: raise ValueError('Expected one match: '+a[:100])
    s=s.replace(a,b,1)
# The classkit storage ID and existing handlers remain unchanged.
assert s.count('관리 도구')==6
s=s.replace('관리 도구','앱관리').replace('🏫 앱관리','앱관리')
change("   ttFolderCog:","   ttAppSchool:'<path d=\"M4 8.5 12 3l8 5.5M6 7.2V21h12V7.2M6 11 2.5 13v7a1 1 0 0 0 1 1H6m12-10 3.5 2v7a1 1 0 0 1-1 1H18M10 21v-4a2 2 0 0 1 4 0v4\"/><circle cx=\"12\" cy=\"9.5\" r=\"1.8\"/>',\n   ttHojaFace:'<path d=\"M3 13C3 7 6.6 4 12 4s9 3 9 9-3.3 8-9 8-9-2-9-8Z\"/><path d=\"M6.7 8.6q1.2-.8 2.4 0m5.8 0q1.2-.8 2.4 0\" stroke-width=\"1.3\"/><ellipse cx=\"8\" cy=\"11.1\" rx=\".9\" ry=\"1.25\" fill=\"currentColor\" stroke=\"none\"/><ellipse cx=\"16\" cy=\"11.1\" rx=\".9\" ry=\"1.25\" fill=\"currentColor\" stroke=\"none\"/><ellipse cx=\"12\" cy=\"16.1\" rx=\"5.2\" ry=\"3.3\" fill=\"currentColor\" stroke=\"none\"/>',\n   ttFolderCog:")
change("classkit:'ttFolderCog'","classkit:'ttAppSchool'")
change("const settingsIcons={classkit:'sliders'","const settingsIcons={classkit:'ttAppSchool'")
change("window.ttIcon('sliders')} 앱관리","window.ttIcon('ttAppSchool')} 앱관리")
change("ttAddPane?.('hoja','dog','호자')","ttAddPane?.('hoja','ttHojaFace','호자')")
change("window.ttIcon('dog')} 호자","window.ttIcon('ttHojaFace')} 호자")
change("clock:'clock',hoja:'dog'","clock:'clock',hoja:'ttHojaFace'")
# Direction is in class-layout, already handled by both backup profiles and edit snapshots.
change("WIDGETS.tools.min[1]=3; // V1.63.3: three actual square-grid rows.","WIDGETS.tools.min[1]=3; // V1.63.3: three actual square-grid rows.\nconst ttToolHorizontalMin=[...WIDGETS.tools.min];\nconst ttToolMin=direction=>direction==='vertical'?[3,5]:[...ttToolHorizontalMin];")
change("function layoutLoad(){\n const base=layoutDefault();","function layoutLoad(){\n const base=layoutDefault();\n WIDGETS.tools.min=ttToolMin('horizontal');")
change("if(!saved||!saved.items)return base;\n  for(const id", "if(!saved||!saved.items)return base;\n  if(saved.toolsDirection==='vertical'){base.toolsDirection='vertical';WIDGETS.tools.min=ttToolMin('vertical');}\n  for(const id")
change("function layoutApply(){\n layout.items.tools.off=false;", "function layoutApply(){\n const direction=layout.toolsDirection==='vertical'?'vertical':'horizontal';\n WIDGETS.tools.min=ttToolMin(direction);widgetCard('tools').dataset.toolsDirection=direction;\n widgetCard('tools').querySelector('.spk-vol')?.setAttribute('aria-orientation',direction);\n layout.items.tools.off=false;")
change("const before=Math.abs(y-(r.top+r.height/2))>Math.max(orig.height,r.height)*.52?y<(r.top+r.height/2):x<(r.left+r.width/2);","const before=layout.toolsDirection==='vertical'?y<r.top+r.height/2:Math.abs(y-(r.top+r.height/2))>Math.max(orig.height,r.height)*.52?y<(r.top+r.height/2):x<(r.left+r.width/2);")
# Keep the existing speaker/sound group and no-jump-on-tap behavior.
change("const v=level===null?0:level;fill.style.width=v+'%';","const v=level===null?0:level;fill.style.width=v+'%';vol.style.setProperty('--tt-volume-fill',v+'%');vol.setAttribute('aria-orientation',wrap.closest('[data-tools-direction]')?.dataset.toolsDirection||'horizontal');")
change("const at=e=>{const r=track.getBoundingClientRect();return Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*100)};","const vertical=()=>wrap.closest('[data-tools-direction]')?.dataset.toolsDirection==='vertical';\n const at=e=>{const r=track.getBoundingClientRect();const ratio=vertical()?(r.bottom-e.clientY)/Math.max(1,r.height):(e.clientX-r.left)/Math.max(1,r.width);return Math.round(Math.max(0,Math.min(1,ratio))*100)};")
change("drag={id:e.pointerId,x:e.clientX,moved:false}","drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false}")
change("Math.abs(e.clientX-drag.x)<8","Math.abs(vertical()?e.clientY-drag.y:e.clientX-drag.x)<8")
change("vol.addEventListener('keydown',e=>{if(level===null)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();level=Math.max(0,Math.min(100,level+(e.key==='ArrowRight'?5:-5)));draw();send({level})}});","vol.addEventListener('keydown',e=>{if(level===null||document.body.classList.contains('layout-editing'))return;const inc=vertical()?'ArrowUp':'ArrowRight',dec=vertical()?'ArrowDown':'ArrowLeft';if(e.key===inc||e.key===dec){e.preventDefault();level=Math.max(0,Math.min(100,level+(e.key===inc?5:-5)));draw();send({level})}});")
# Scroll controls are only needed in edit mode, because tool dragging captures touches.
change('</body></html>', '''<style id="tt-r7-tool-direction">
.grid>.card[data-widget="tools"][data-tools-direction="vertical"]>.tools{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:none!important;grid-auto-flow:row!important;grid-auto-rows:clamp(52px,5vw,80px)!important;grid-auto-columns:minmax(0,1fr)!important;align-items:stretch!important;align-content:start;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>button,.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>.spk-split{height:100%!important;min-width:0!important;min-height:0!important;align-self:stretch!important}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>.spk-split{grid-column:1!important;grid-row:span 2!important;grid-template-rows:minmax(0,1fr) minmax(42px,34%)!important;background:var(--control);border-radius:10px;overflow:hidden}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .spk-vol{flex-direction:column;justify-content:center;gap:2px;padding:4px!important;min-height:0;cursor:ns-resize}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .spk-track{position:relative;flex:1 1 0;width:12px;height:auto;min-height:12px;overflow:hidden}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .spk-track i{position:absolute;bottom:0;width:100%!important;height:var(--tt-volume-fill,0%)}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .spk-num{min-width:0;text-align:center;font-size:12px;line-height:1}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .spk-mute{line-height:1}
body.layout-editing .grid>.card[data-widget="tools"].tt-tool-overlap{outline:2px solid #e5484d;outline-offset:-2px}
#ttToolDirection{flex:none;display:flex;align-items:center;justify-content:center;gap:5px}
#ttToolDirection svg{width:18px;height:18px}
#ttToolScroll[hidden]{display:none!important}#ttToolScroll{display:flex;gap:3px}#ttToolScroll button{padding-inline:8px!important}
</style><script id="tt-r7-tool-direction-script">
(()=>{
 const card=widgetCard('tools'),area=card.querySelector('.tools'),bar=document.getElementById('layoutBar');
 const button=document.createElement('button');button.type='button';button.id='ttToolDirection';
 const scroll=document.createElement('span');scroll.id='ttToolScroll';scroll.hidden=true;
 for(const [dy,label] of [[-1,'위로 스크롤'],[1,'아래로 스크롤']]){const b=document.createElement('button');b.type='button';b.textContent=dy<0?'↑':'↓';b.title=label;b.setAttribute('aria-label',label);b.onclick=()=>area.scrollBy({top:dy*Math.max(80,area.clientHeight*.65),behavior:'smooth'});scroll.append(b)}
 bar.append(scroll,button);
 function sync(){const v=layout.toolsDirection==='vertical';const text=v?'가로 배치':'세로 배치';if(button.dataset.next!==text){button.dataset.next=text;button.innerHTML=window.ttIcon('arrows')+'<span>'+text+'</span>';button.querySelector('svg').style.rotate=v?'90deg':'0deg';button.title='수업도구를 '+text+'로 전환';button.setAttribute('aria-label',button.title);}scroll.hidden=!v||area.scrollHeight<=area.clientHeight+1;
 const r=ttVisibleRect(layout.items.tools);card.classList.toggle('tt-tool-overlap',document.body.classList.contains('layout-editing')&&Object.entries(layout.items).some(([id,x])=>id!=='tools'&&!x.off&&rectsCross(r,ttVisibleRect(x))));}
 const original=layoutApply;layoutApply=function(){original();sync()};
 button.onclick=()=>{if(!document.body.classList.contains('layout-editing')||layoutDrag)return;const v=layout.toolsDirection!=='vertical',r=layout.items.tools,min=ttToolMin(v?'vertical':'horizontal');
 const w=Math.min(GRID_COLS,Math.max(min[0],r.h)),h=Math.min(GRID_ROWS,Math.max(min[1],r.w));
 layout.toolsDirection=v?'vertical':'horizontal';layout.items.tools={...r,x:Math.max(-GRID_SIDE,Math.min(GRID_BASE_COLS+GRID_SIDE-w,r.x)),y:Math.max(0,Math.min(GRID_ROWS-h,r.y)),w,h};
 layoutApply();area.scrollTop=0;area.scrollLeft=0;layoutDecorate();window.ttEditRailSync?.();sync();};
 new ResizeObserver(sync).observe(area);new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 // Existing hidden-tool rail and order are shared; refresh scroll controls after visibility changes.
 new MutationObserver(sync).observe(area,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 layoutApply();
})();</script></body></html>''')
out=s.encode('utf-8');p.write_bytes(out);print('R7 UI overlay sha256',hashlib.sha256(out).hexdigest())
