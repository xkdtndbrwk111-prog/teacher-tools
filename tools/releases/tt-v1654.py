#!/usr/bin/env python3
"""R6/R7 review patch: preserve unchanged Podo image nodes, reuse landing image."""
import hashlib,pathlib,sys
raw=pathlib.Path(sys.argv[1]).read_bytes()
base=hashlib.sha256(raw).hexdigest()
assert base in {'0f1ed520f9827d39baf7e58e0217562a9dd4b5b06c818e3c448dfb1adfc53a70','2a545245bf77bd8017c53cd6feb69bc74035fc10ecf344fa1d3b3fb151ea2e6e'},'Unexpected input'
s=raw.decode('utf-8')
def span(a,b,new):
 global s
 i=s.index(a);j=s.index(b,i);s=s[:i]+new+s[j:]
def rep(a,b):
 global s
 assert s.count(a)==1,a[:100]
 s=s.replace(a,b,1)
span("let previewKey='';\nfunction renderPreview()",'const safe=(s,max=80)', '''// Build rows only when the goal changes. Preserve already painted image nodes on add/remove/redraw.
let previewKey='';
function makeStamp(person){const img=new Image();img.alt=person==='hoja'?'호자':'나한상';img.onerror=()=>{if(!img.dataset.tried){img.dataset.tried='1';img.src=FALLBACK[person]}else img.classList.add('err')};img.src=SRC[person];return img}
function setStampSlot(slot,person,index,preview,image){
 const key=person||'';if(slot.dataset.podoPerson===key)return;
 slot.dataset.podoPerson=key;slot.classList.toggle('filled',!!person);
 if(!person){slot.textContent=String(index+1);return}
 const img=image||makeStamp(person);
 if(preview){slot.replaceChildren(img);return}
 const fallback=document.createElement('span');fallback.className='podo-icon-fallback';fallback.textContent=person==='hoja'?'🐾':'🪨';slot.replaceChildren(img,fallback);
}
function syncStampGrid(host,preview){
 const goal=String(state.goal),slotClass=preview?'podo-preview-ball':'podo-ball';
 if(host.dataset.podoGoal!==goal){
  const frag=document.createDocumentFragment();let i=0;
  for(const len of rowFor(state.goal)){const row=document.createElement('div');row.className=preview?'podo-preview-row':'podo-row';for(let j=0;j<len;j++,i++){const slot=document.createElement('div');slot.className=slotClass;slot.dataset.index=String(i);row.append(slot)}frag.append(row)}
  host.replaceChildren(frag);host.dataset.podoGoal=goal;
 }
 const slots=host.querySelectorAll('.'+slotClass);for(let i=0;i<slots.length;i++)setStampSlot(slots[i],state.stamps[i],i,preview);
}
function renderPreview(){if(!state||!card.classList.contains('podo-expanded'))return;const key=JSON.stringify([state.goal,state.type,state.reward,state.stamps]);if(key===previewKey)return;syncStampGrid($('podoPreviewGrid'),true);previewKey=key;$('podoPreviewInfo').textContent=state.stamps.length+' / '+state.goal+'알 · '+safe(state.reward,20)}
''')
span(' if(activeFlight)return;grid.replaceChildren();let i=0;', ' if(detail.open)requestAnimationFrame(renderCutPaper);', ' if(activeFlight)return;syncStampGrid(grid,false);\n')
rep('flyer.append(makeStamp(person));flightLayer.append(flyer);','const flightImage=makeStamp(person);flyer.append(flightImage);flightLayer.append(flyer);')
rep('finally{cancelAnimationFrame(raf);activeFlight=null;flyer.remove()}', '''finally{cancelAnimationFrame(raf);activeFlight=null;
     // Hand the existing flight image to the destination before removing the overlay, in one paint.
     if(grid.contains(target)&&state?.stamps[index]===person)setStampSlot(target,person,index,false,flightImage);
     flyer.remove()}''')
# Keep the board title at all widget sizes. Migrate valid legacy 2-row rectangles in place.
rep("WIDGETS.podo.min=[3,2]; // V1.62.2: tiny status-only grape widget, even when collapsed to numbers.","WIDGETS.podo.min=[3,3]; // Keep the title and count visible in the smallest grape widget.")
rep("   const r=saved.items[id];if(!r||typeof r!=='object')continue;", "   let r=saved.items[id];if(!r||typeof r!=='object')continue;\n   if(id==='podo'&&r.h===2&&[r.x,r.y,r.w].every(Number.isInteger)&&r.y>=0&&r.y+2<=GRID_ROWS&&r.w>=3)r={...r,y:Math.min(r.y,GRID_ROWS-3),h:3};")
rep(".podo-card.podo-micro .podo-overview{padding:2px}",".podo-card.podo-micro .podo-overview{padding:3px;gap:3px}\n.podo-card .podo-overview-tiny-title{display:none;font:900 var(--podo-title-size,11px)/1.15 system-ui,sans-serif;max-width:100%;text-align:center;word-break:keep-all;overflow-wrap:anywhere;flex:none}\n.podo-card.podo-micro .podo-overview-tiny-title{display:block}")
rep('🍇 포도알 칭찬판</div><div class="podo-overview-count"','포도알 칭찬판</div><div class="podo-overview-count"')
rep('</div><strong class="podo-overview-tiny" id="podoSummaryTiny">','</div><strong class="podo-overview-tiny-title">포도알 칭찬판</strong><strong class="podo-overview-tiny" id="podoSummaryTiny">')
rep('<strong>🍇 우리 반 포도알</strong><span id="podoPreviewInfo">','<strong>포도알 칭찬판</strong><span id="podoPreviewInfo">')
rep(" card.classList.toggle('podo-micro',w<168||h<85);"," card.style.setProperty('--podo-title-size',Math.max(10,Math.min(14,Math.floor((w-6)/7)))+'px');\n card.classList.toggle('podo-micro',w<168||h<85);")
if base.startswith('0f1ed520'):s=s.replace('1.65.3','1.65.4')
output=s.encode('utf-8');pathlib.Path(sys.argv[2]).write_bytes(output);print(hashlib.sha256(output).hexdigest())
