// The seating scripts read their data as they load, so they start only after the store is ready.
(()=>{
 'use strict';
 const SCRIPTS=['app.js?v=20261010-seatdrag2','pe-v1.js?v=20261115-step10-menu','classroom-trait-balance-v1.js?v=20261103-t8','backup-unified-v2.js?v=20261103-t8','../classroom/host/life-mount.js?v=20261116-board-present','../classroom/host/grade-mount.js?v=ui2-a','../classroom/host/class-ui.js','../classroom/host/storage-ui.js','../classroom/host/dashboard-link.js?v=ui2-lock-center','../classroom/host/cloud-sync.js?v=ui2-m'];
 const store=window.__TT_STORE;
 const domReady=()=>new Promise(resolve=>{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resolve,{once:true});else resolve()});
 const load=src=>new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;script.async=false;
  script.onload=resolve;script.onerror=()=>reject(Error('프로그램 파일을 읽지 못했습니다: '+src));
  document.body.append(script);
 });
 function stop(error){
  document.documentElement.classList.remove('tt-manager-starting');
  // Fail closed: a startup / single-tab lock error must not expose partially initialized controls.
  const teacher=document.getElementById('teacherScreen');if(teacher){teacher.inert=true;teacher.hidden=true;teacher.classList.add('hidden')}
  const loading=document.getElementById('tt-manager-loading');if(loading)loading.hidden=true;
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
 Promise.all([store.ready,domReady()]).then(async([{installId,prefix,board,student}])=>{
  const registryKey=prefix+'.classes';
  const registry=JSON.parse(store.getItem(registryKey));
  if(!registry||!Array.isArray(registry.classes)||!registry.classes.some(c=>c.id===registry.activeId))throw Error('학급 목록이 손상되었습니다. 자료는 변경하지 않았습니다.');
  const makeKey=(id,kind)=>prefix+'.'+id+'.'+kind;
  window.__TT_STAGE031_CLASS={installId,prefix,registryKey,activeId:registry.activeId,seatingKey:makeKey(registry.activeId,'seating'),peKey:makeKey(registry.activeId,'pe'),makeKey};
  store.setRosterSource(window.__TT_STAGE031_CLASS.seatingKey);
  if(student){
   document.documentElement.classList.add('tt-student-only');
   await load('app.js?v=20261010-seatdrag2');
   await load('pe-v1.js?v=20261115-step10-menu');
   await load('../classroom/host/student-window.js?v=ui2-j');
   return;
  }
  if(board){
   document.documentElement.classList.add('tt-board');
   await load('app.js?v=20261010-seatdrag2');
   await load('../classroom/host/board-view.js?v=ui2-f');
   return;
  }
  await load('../classroom/host/lock-ui.js?v=ui2-lock-center');
  await window.__TT_LOCK.start();
  for(const src of SCRIPTS)await load(src);
  window.__TT_LOCK.mount();
  await load('../classroom/host/hud-shell.js?v=20261116-board-only');
  await load('../classroom/host/board-status.js?v=ui2-lock-center');
  await load('../classroom/host/presentation-link.js?v=ui2-i');
  await load('../classroom/host/student-popup.js?v=ui2-i');
  await load('../classroom/host/settings-window.js?v=ui2-l');
  await load('../classroom/host/manager-home.js?v=ui2-lock-center');
  if(!window.__TT_MANAGER_THEME?.mount())throw Error('테마 설정을 준비하지 못했습니다.');
  if(!window.__TT_MANAGER_HOME)throw Error('공통 메뉴를 준비하지 못했습니다.');
  await load('../shared/hoja-manager-icons.js?v=ui2-l');
  window.__TT_MANAGER_ICONS?.();
  await window.__TT_MANAGER_THEME.prepareFirstPaint();
  document.documentElement.classList.remove('tt-manager-starting');
  window.__TT_LOCK.finishStartup();
 }).catch(error=>domReady().then(()=>stop(error)));
})();
