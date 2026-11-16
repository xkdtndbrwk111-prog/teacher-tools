#!/usr/bin/env python3
"""V1.65.5 review: adaptive text-only vertical tools and exact spring pagoda correction."""
import hashlib,pathlib,sys,base64
raw=pathlib.Path(sys.argv[1]).read_bytes()
base=hashlib.sha256(raw).hexdigest()
assert base in {'b4c1dd9e045235ed8419015640f1f697e66eb333cefef4d40eda835fd6d14a42','c52ff31b7bf37967eb8764d998b9452734287bbd2006243d63ca4af0a5e2416b'},'Unexpected baseline'
s=raw.decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,a[:100]
 s=s.replace(a,b,1)
# Vertical layout only: fit active tiles into card; keep 28 px minimum and scroll only when physically too short.
rep('grid-auto-rows:clamp(52px,5vw,80px)!important;','grid-auto-rows:var(--tt-vertical-row,36px)!important;')
rep('grid-row:span 2!important;grid-template-rows:minmax(0,1fr) minmax(42px,34%)!important;','grid-row:span 3!important;grid-template-rows:minmax(0,1fr) minmax(28px,32%)!important;')
rep('body.layout-editing .grid>.card[data-widget="tools"].tt-tool-overlap', '''.grid>.card[data-widget="tools"][data-tools-direction="vertical"]>.tools{gap:3px!important;scrollbar-gutter:auto}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>button{padding:1px 2px!important;gap:0!important;overflow:hidden}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>button>svg,.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>button>.tool-icon{display:none!important}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>button>span[data-tt-vertical-label]{font-size:0!important;line-height:0!important;white-space:normal!important;max-width:100%!important;overflow:hidden}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>button>span[data-tt-vertical-label]::after{content:attr(data-tt-vertical-label);display:block;white-space:pre-line;word-break:keep-all;overflow-wrap:anywhere;font-size:var(--tt-vertical-font,16px);font-weight:800;line-height:1.04;max-width:100%;text-align:center}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>.spk-split>button{gap:0!important;padding:0 2px!important}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>.spk-split>button>svg.tt-icon.tool-icon-vector{width:clamp(15px,1.25vw,23px)!important;height:clamp(15px,1.25vw,23px)!important}
.grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>.spk-split>button>span:not(.tool-icon){font-size:clamp(10px,.9vw,16px)!important}
body.layout-editing .grid>.card[data-widget="tools"][data-tools-direction="vertical"] .tools>button[data-app]{padding-right:14px!important}
body.layout-editing #ttToolVisibilityLayer[data-tools-direction="vertical"] .tt-tool-toggle{width:16px;height:16px;font-size:13px;transform:translateX(7px);border-radius:4px}
#ttToolVisibilityLayer[data-tools-direction="vertical"] #ttUnusedTools .tt-unused-tile:not([data-speaker])>svg,#ttToolVisibilityLayer[data-tools-direction="vertical"] #ttUnusedTools .tt-unused-tile:not([data-speaker])>.tool-icon,#ttToolVisibilityLayer[data-tools-direction="vertical"] #ttToolDirection svg{display:none!important}
#ttToolVisibilityLayer[data-tools-direction="vertical"] #ttUnusedTools .tt-unused-label[data-tt-vertical-label]{font-size:0;line-height:0;white-space:normal}
#ttToolVisibilityLayer[data-tools-direction="vertical"] #ttUnusedTools .tt-unused-label[data-tt-vertical-label]::after{content:attr(data-tt-vertical-label);white-space:pre-line;display:block;font-size:clamp(12px,1vw,18px);line-height:1.05;font-weight:800}
body.layout-editing .grid>.card[data-widget="tools"].tt-tool-overlap''')
# Tag unused speaker group without modifying stored IDs or order.
rep("t.className='tt-unused-tile';t.setAttribute", "t.className='tt-unused-tile';if(b.classList.contains('spk-split'))t.dataset.speaker='1';t.setAttribute")
rep("n.textContent=label(b);const plus=", "n.textContent=label(b);n.dataset.ttVerticalLabel=window.ttVerticalToolLabel(n.textContent);const plus=")
rep(" const oldApply=applyApps;", ''' // Strip display spaces only for 2/3/4-character labels; underlying labels and IDs stay intact.
 window.ttVerticalToolLabel=text=>{const chars=Array.from(String(text).trim().replace(/\\s+/g,''));return chars.length===4?chars.slice(0,2).join('')+'\\n'+chars.slice(2).join(''):chars.length<=3?chars.join(''):String(text).trim()};
 const oldApply=applyApps;''')
rep("  const directionButton=document.getElementById('ttToolDirection');", "  layer.dataset.toolsDirection=layout.toolsDirection==='vertical'?'vertical':'horizontal';\n  const directionButton=document.getElementById('ttToolDirection');")
rep(" scroll.hidden=!v||area.scrollHeight<=area.clientHeight+1;", " scroll.hidden=!v||area.scrollHeight<=area.clientHeight+1;") if False else None
rep(" function sync(){const v=layout.toolsDirection==='vertical';const text=", """ function fitVertical(){
  if(layout.toolsDirection!=='vertical')return;
  const tiles=[...area.querySelectorAll(':scope>button,:scope>.spk-split')].filter(b=>!b.hidden);
  for(const b of tiles){if(b.classList.contains('spk-split'))continue;const label=b.querySelector(':scope>span:not(.tool-icon)');if(label){const formatted=window.ttVerticalToolLabel(label.textContent);if(label.dataset.ttVerticalLabel!==formatted)label.dataset.ttVerticalLabel=formatted}}
  const units=tiles.reduce((sum,b)=>sum+(b.classList.contains('spk-split')?3:1),0);if(!units||!area.clientHeight)return;
  const row=Math.max(28,Math.min(56,Math.floor((area.clientHeight-3*(units-1))/units)));
  const font=Math.max(10,Math.min(22,Math.floor(row*.43),Math.floor((area.clientWidth-(document.body.classList.contains('layout-editing')?19:6))/3.05)));
  for(const [k,n] of [['--tt-vertical-row',row],['--tt-vertical-font',font]]){const val=n+'px';if(area.style.getPropertyValue(k)!==val)area.style.setProperty(k,val)}
 }
 function sync(){const v=layout.toolsDirection==='vertical';fitVertical();const text=""")
# Observe text edits as well as added/hidden tools (e.g. custom web tool rename).
rep("new MutationObserver(sync).observe(area,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});", "new MutationObserver(sync).observe(area,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']});")
# Correct only the 79x91 region of the spring base, preserving the shared sky, clouds, sway sheet,
# all other pixels and other seasons. This is compatible with the HTML-only R6 content updater.
crop=pathlib.Path(__file__).with_name('spring-patch.png').read_bytes()
assert hashlib.sha256(crop).hexdigest()=='bb4346938d8a43b22fefdcba75a08ea82d8104d1d6a40065e7127b9199859a0b'
uri='data:image/png;base64,'+base64.b64encode(crop).decode('ascii')
rep("foregroundLoading[season]=loadSceneImage(FG_ROUTE[season]).then(im=>{", "foregroundLoading[season]=loadSceneImage(FG_ROUTE[season]).then(async im=>{")
rep("   cloudAssets.foreground[season]=im;", """   if(season==='spring'){
    const patch=await loadSceneImage('"""+uri+"""');
    if(patch.width!==79||patch.height!==91)throw Error('봄 석탑 보정 이미지 규격 오류');
    const corrected=document.createElement('canvas');corrected.width=768;corrected.height=256;
    const g=corrected.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(im,0,0);g.drawImage(patch,344,107);im=corrected;
   }
   cloudAssets.foreground[season]=im;""")
if base.startswith('b4c1dd9e'):s=s.replace('1.65.4','1.65.5')
output=s.encode('utf-8');pathlib.Path(sys.argv[2]).write_bytes(output);print(hashlib.sha256(output).hexdigest())
