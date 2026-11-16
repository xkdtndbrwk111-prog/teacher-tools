#!/usr/bin/env python3
"""V1.65.3 review patch; preserve all non-UI content and runtime."""
import hashlib,pathlib,sys
p=pathlib.Path(sys.argv[1]);raw=p.read_bytes()
assert hashlib.sha256(raw).hexdigest() in {'4244805a025a6d9ad75134a0f5f2a80cd6ee9683a9d1d237e6a9944325539e54','7dd887db18ccb532324f7b752572dc23a66e3d63175f831532cf7af34bd4f1b0'},'Unexpected input'
s=raw.decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,repr(a[:100])
 s=s.replace(a,b,1)
# Keep it in the existing edit-only unused tools rail, outside the tracked/reordered tools.
rep("  rail.hidden=!unused.length;\n  if(!unused.length){rail.replaceChildren();railKey='';return}","  const directionButton=document.getElementById('ttToolDirection');\n  rail.hidden=!unused.length&&!directionButton;\n  if(rail.hidden){rail.replaceChildren();railKey='';return}")
rep("  let need=10;for(let i=0;i<unused.length;i++)", "  if(directionButton&&rail.lastElementChild!==directionButton)rail.append(directionButton);\n  let need=10+(directionButton?unit+4:0);if(directionButton)directionButton.style.width=unit+'px';for(let i=0;i<unused.length;i++)")
rep("#ttToolDirection{flex:none;display:flex;align-items:center;justify-content:center;gap:5px}\n#ttToolDirection svg{width:18px;height:18px}","#ttUnusedTools #ttToolDirection{box-sizing:border-box;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:0;padding:3px;border-radius:9px;border:1px solid var(--border);background:var(--control);color:var(--control-text);font:800 clamp(10px,.78vw,14px)/1.15 system-ui,sans-serif;white-space:normal;touch-action:manipulation}\n#ttToolDirection svg{width:clamp(22px,1.8vw,30px);height:clamp(22px,1.8vw,30px);flex:none}")
rep(" bar.append(scroll,button);", " bar.append(scroll);document.getElementById('ttUnusedTools').append(button);")
# A separate, clipped non-scrolling animation layer in the modal top layer.
rep("#podoDetail .podo-fly{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;transform-origin:center;pointer-events:none;overflow:hidden;z-index:4}","#podoDetail .podo-flight-layer{position:absolute;inset:0;overflow:hidden;contain:strict;pointer-events:none;z-index:50}\n#podoDetail .podo-fly{position:absolute;inset:auto;width:0;height:0;box-sizing:border-box;transform-origin:center;pointer-events:none;overflow:hidden;z-index:4}")
rep("detail.append(detailBar,detailInner);document.body.append(detail);", "const flightLayer=document.createElement('div');flightLayer.className='podo-flight-layer';flightLayer.setAttribute('aria-hidden','true');detail.append(detailBar,detailInner,flightLayer);document.body.append(detail);")
start=s.index('   // Use the destination slot as the containing block, not a fixed viewport position inside a modal.')
end=s.index('\n  }else sfxRemove();',start)
s=s[:start]+'''   // Fly in the dialog's isolated non-scrolling overlay. Transformed children of the sheet
   // would enlarge its scrollable overflow even though their normal layout box is unchanged.
   const target=grid.querySelector(`[data-index="${index}"]`),from=$('podoAdd');sfxAdd();
   if(target&&from&&target.offsetWidth){target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    const flyer=document.createElement('div');flyer.className='podo-fly';flyer.style.background=state.type==='green'?'#b6df72':'#b37cc5';flyer.append(makeStamp(person));flightLayer.append(flyer);
    function anchor(){const l=flightLayer.getBoundingClientRect(),b=target.getBoundingClientRect(),sx=l.width/Math.max(1,flightLayer.offsetWidth)||1,sy=l.height/Math.max(1,flightLayer.offsetHeight)||1;flyer.style.left=(b.left-l.left)/sx+'px';flyer.style.top=(b.top-l.top)/sy+'px';flyer.style.width=b.width/sx+'px';flyer.style.height=b.height/sy+'px';return {b,sx,sy}}
    const {b,sx,sy}=anchor(),a=from.getBoundingClientRect(),dx=(a.left+a.width/2-b.left-b.width/2)/sx,dy=(a.top+a.height/2-b.top-b.height/2)/sy;
    let raf=0;const follow=()=>{if(!detail.open)return;anchor();raf=requestAnimationFrame(follow)};
    try{activeFlight=flyer.animate([{transform:`translate(${dx}px,${dy}px) scale(.65) rotate(-12deg)`},{transform:`translate(${dx*.42}px,${dy*.42-45}px) scale(1.3) rotate(13deg)`,offset:.5},{transform:'translate(0,0) scale(1)'}],{duration:600,easing:'cubic-bezier(.26,.74,.22,1)',fill:'forwards'});raf=requestAnimationFrame(follow);await activeFlight.finished.catch(()=>{})}finally{cancelAnimationFrame(raf);activeFlight=null;flyer.remove()}
   }'''+s[end:]
# R6 release version only; leave review R7 version metadata unchanged.
if '4244805a'==hashlib.sha256(raw).hexdigest()[:8]:s=s.replace('1.65.2','1.65.3')
out=s.encode('utf-8');pathlib.Path(sys.argv[2]).write_bytes(out);print(hashlib.sha256(out).hexdigest())
