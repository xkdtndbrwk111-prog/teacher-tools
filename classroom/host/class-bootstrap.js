// The seating scripts read their data as they load, so they start only after the store is ready.
(()=>{
 'use strict';
 const SCRIPTS=['app.js?v=20261010-seatdrag2','pe-v1.js?v=20261103-t8b','classroom-trait-balance-v1.js?v=20261103-t8','backup-unified-v2.js?v=20261103-t8','../classroom/host/grade-mount.js','../classroom/host/class-ui.js','../classroom/host/storage-ui.js','../classroom/host/dashboard-link.js','../classroom/host/cloud-sync.js'];
 const store=window.__TT_STORE;
 const domReady=()=>new Promise(resolve=>{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resolve,{once:true});else resolve()});
 const load=src=>new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;script.async=false;
  script.onload=resolve;script.onerror=()=>reject(Error('프로그램 파일을 읽지 못했습니다: '+src));
  document.body.append(script);
 });
 function stop(error){
  const box=document.createElement('div');box.className='tt-start-blocked';box.setAttribute('role','alert');
  const card=document.createElement('div'),title=document.createElement('h1'),text=document.createElement('p'),again=document.createElement('button');
  title.textContent=error.otherTab?'이미 열려 있습니다':'시작하지 못했습니다';text.textContent=error.message;
  again.type='button';again.textContent='다시 시도';again.onclick=()=>location.reload();
  card.append(title,text,again);box.append(card);document.body.append(box);
 }
 window.addEventListener('tt-store-error',event=>{
  const message='브라우저 저장에 실패했습니다. 전체 백업 파일을 저장한 뒤 저장 공간을 확인해 주세요. ('+(event.detail?.message||'원인 불명')+')';
  if(typeof showStorageAlert==='function')showStorageAlert(message,'error');else alert(message);
 });
 Promise.all([store.ready,domReady()]).then(async([{installId,prefix,board}])=>{
  const registryKey=prefix+'.classes';
  const registry=JSON.parse(store.getItem(registryKey));
  if(!registry||!Array.isArray(registry.classes)||!registry.classes.some(c=>c.id===registry.activeId))throw Error('학급 목록이 손상되었습니다. 자료는 변경하지 않았습니다.');
  const makeKey=(id,kind)=>prefix+'.'+id+'.'+kind;
  window.__TT_STAGE031_CLASS={installId,prefix,registryKey,activeId:registry.activeId,seatingKey:makeKey(registry.activeId,'seating'),peKey:makeKey(registry.activeId,'pe'),makeKey};
  store.setRosterSource(window.__TT_STAGE031_CLASS.seatingKey);
  if(board){
   document.documentElement.classList.add('tt-board');
   await load('app.js?v=20261010-seatdrag2');
   await load('../classroom/host/board-view.js');
   return;
  }
  await load('../classroom/host/lock-ui.js');
  await window.__TT_LOCK.start();
  for(const src of SCRIPTS)await load(src);
  window.__TT_LOCK.mount();
 }).catch(error=>domReady().then(()=>stop(error)));
})();
