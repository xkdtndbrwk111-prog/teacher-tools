// Only public renderers, memory-only store. No teacher authentication or telemetry.
(()=>{
 'use strict';
 const ready=()=>new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r,{once:true}):r());
 const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.append(s)});
 Promise.all([ready(),window.__TT_STORE.ready]).then(async([_,store])=>{
  if(!store.board||new URLSearchParams(location.search).get('present')!=='1'||window.parent===window)return;
  const {installId,prefix}=store;const registryKey=prefix+'.classes',activeId='board',makeKey=(id,kind)=>prefix+'.'+id+'.'+kind;
  window.__TT_STAGE031_CLASS={installId,prefix,registryKey,activeId,seatingKey:makeKey(activeId,'seating'),peKey:makeKey(activeId,'pe'),makeKey};
  document.documentElement.classList.add('tt-student-only','tt-board-presentation');
  await load('app.js');await load('pe-v1.js');await load('../classroom/host/board-present.js');
 }).catch(()=>{document.body.textContent='발표 화면을 준비하지 못했습니다.'});
})();
