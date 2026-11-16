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
