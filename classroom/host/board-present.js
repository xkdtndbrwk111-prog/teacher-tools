// Offline student renderer inside the board's native dialog. No teacher store or popup.
(()=>{
 'use strict';
 if(window.parent===window||new URLSearchParams(location.search).get('present')!=='1')return;
 const origin=location.origin,session=location.hash.slice(1);if(!/^[a-f0-9]{32}$/.test(session))return;
 const send=(type,detail={})=>window.parent.postMessage({type,id:session,...detail},origin);
 const root=document.documentElement;root.classList.add('tt-board-presentation','tt-student-only');
 const style=document.createElement('link');style.rel='stylesheet';style.href='../classroom/host/board-present.css';document.head.append(style);
 let used=false;
 function theme(value){
  if(!value||typeof value!=='object')return;
  for(const key of ['panel','text','border','control','controlText','accent','sub','surface']){
   const v=value[key];if(typeof v==='string'&&v.length<=80&&CSS.supports('color',v))root.style.setProperty('--tt-present-'+key,v);
  }
  const computed=getComputedStyle(root),read=(k,f)=>computed.getPropertyValue('--tt-present-'+k).trim()||f;
  const pixel=document.createElement('canvas');pixel.width=pixel.height=1;const ctx=pixel.getContext('2d',{willReadFrequently:true});
  const rgb=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle='#000';ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3)};
  const mix=(a,b,t)=>{const x=rgb(a),y=rgb(b);return 'rgb('+x.map((v,i)=>Math.round(v*(1-t)+y[i]*t)).join(',')+')'};
  const contrast=bg=>rgb(bg).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)>.179?'#171a20':'#fff';
  const paper=read('surface','#eff8f5'),card=read('panel','#fbfffd'),text=read('text','#1b4546'),bar=read('control','#d8eeea');
  window.__TT_BOARD_CHART_THEME={palette:{paper,card,text,bar,barText:contrast(bar),border:read('border','#b4d8d2'),muted:read('sub','#567b7e')},group(color){const fill=mix(color,paper,.58);return {fill,text:contrast(fill)}}};
  if(root.dataset.presentKind==='seating'&&!document.getElementById('simpleView')?.classList.contains('hidden')&&typeof renderSimpleCanvas==='function')renderSimpleCanvas();
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==origin||event.source!==window.parent||!event.data)return;
  const d=event.data;
  if(d.type==='tt-present-theme'){theme(d.theme);return}
  if(used||d.type!=='tt-present-data'||d.id!==session)return;used=true;theme(d.theme);
  try{
   const [{normalizePresentation},{renderPublicPresentation}]=await Promise.all([import('./presentation-protocol.mjs'),import('./public-presentation.mjs')]);
   const clean=normalizePresentation(d.data,location.href);
   root.dataset.presentKind=clean.kind;
   await renderPublicPresentation(clean);
   // Acknowledgment after an actual rendered frame, not just receipt of data.
   requestAnimationFrame(()=>requestAnimationFrame(()=>send('tt-present-rendered',{id:d.id})));
  }catch(error){send('tt-present-error',{id:d.id});document.body.textContent='발표 자료를 표시하지 못했습니다.'}
 });
 send('tt-present-ready');
})();
