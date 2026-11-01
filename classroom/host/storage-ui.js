// Whole-workspace backup, restore and undo. Loaded after class-ui.js; no remote I/O.
(()=>{
'use strict';
const cfg=window.__TT_STAGE031_CLASS,classStore=window.__TT_STORE;
const RESTORE_POINT=`TT_RESTORE_POINT_${cfg?.installId}`;
if(!cfg)return;
const currentScript=document.currentScript;
const root=new URL('../',currentScript.src);
const controls=document.querySelector('.tt-class-controls');
if(!controls)return;
const menu=document.createElement('div');menu.className='tt-stage04-actions';
menu.innerHTML='<button type="button" id="tt-full-backup" title="전체 백업 · 복원">백업</button>';
controls.append(menu);
const modal=document.createElement('div');modal.className='tt-backup-modal';modal.hidden=true;modal.innerHTML=`
<div class="tt-backup-shade"></div><div class="tt-backup-box" role="dialog" aria-modal="true" aria-labelledby="tt-backup-heading">
 <header><div><h2 id="tt-backup-heading">전체 백업·복원</h2><p>모든 반의 자리배치 · 체육 능력치 · 학년도별 성적을 함께 보관합니다.</p></div><button type="button" id="tt-backup-close" aria-label="닫기">✕</button></header>
 <div class="tt-backup-mode"><strong>이 브라우저에만 자동 저장 중</strong> <span>Google 연결 없음</span></div>
 <div class="tt-backup-column"><h3>1. 전체 백업 저장</h3><p>모든 반과 성적을 포함한 하나의 백업 파일을 내려받습니다. 암호를 잊으면 파일을 열 수 없습니다.</p>
 <div class="tt-backup-pass"><label>파일 암호 (8자 이상)<input type="password" id="tt-backup-pass" autocomplete="new-password"></label><label>암호 확인<input type="password" id="tt-backup-pass2" autocomplete="new-password"></label></div>
 <label class="tt-backup-plain"><input type="checkbox" id="tt-backup-plain"> 암호 없이 저장 (학생 이름과 성적을 누구나 읽을 수 있습니다)</label>
 <button type="button" id="tt-backup-export">전체 백업 파일 저장</button></div>
 <div class="tt-backup-column"><h3>2. 백업 파일 확인 및 복원</h3><p>기존 데이터를 대체합니다. 먼저 파일을 검사하고 학급·성적 수를 비교합니다.</p><input type="file" id="tt-backup-file" accept=".json,application/json">
 <div id="tt-backup-open-box" class="tt-backup-pass" hidden><label>이 파일의 암호<input type="password" id="tt-backup-open-pass" autocomplete="off"></label><button type="button" id="tt-backup-open">열기</button></div>
 <div id="tt-backup-preview" aria-live="polite"></div>
 <div id="tt-backup-restore-confirm" hidden><p class="tt-backup-red">⚠ 반과 학생 정보, 자리·체육 설정 및 성적이 현재 파일 내용으로 교체됩니다. 현재 내용의 별도 백업 파일을 먼저 생성합니다.</p>
 <label>진행하려면 <strong>복원</strong>을 입력하세요 <input type="text" id="tt-backup-restore-word" autocomplete="off" maxlength="2" placeholder="복원"></label>
 <button type="button" id="tt-backup-restore" disabled>현재 작업공간 교체</button></div><div id="tt-old-data" hidden><h3>이전 버전 자료</h3><p id="tt-old-data-text"></p><button type="button" id="tt-old-data-remove">이전 버전 자료 지우기</button></div><div id="tt-backup-undo-box" hidden><p id="tt-backup-undo-text"></p><button type="button" id="tt-backup-undo">직전 복원 되돌리기</button></div></div>
 <footer><small id="tt-backup-status" role="status"></small><button type="button" id="tt-backup-done">닫기</button></footer>
</div>`;
document.body.append(modal);
const q=s=>modal.querySelector(s),status=q('#tt-backup-status'),fileInput=q('#tt-backup-file'),restoreWord=q('#tt-backup-restore-word');
let selected=null,selectedPass=null,pendingFile=null,locked=false,lastFocus=null;
const link=()=>import(new URL('host/workspace-bundle.mjs',root).href);
const gradeStore=()=>import(new URL('grades/storage.mjs',root).href);
const backupCrypto=()=>import(new URL('host/backup-crypto.mjs',root).href);
function message(msg,error=false){status.textContent=msg;status.classList.toggle('error',error)}
function clearPasswords(){for(const id of ['#tt-backup-pass','#tt-backup-pass2','#tt-backup-open-pass'])q(id).value='';q('#tt-backup-plain').checked=false;q('#tt-backup-open-box').hidden=true;selectedPass=null;pendingFile=null}
function close(){if(locked)return;clearPasswords();modal.hidden=true;selected=null;fileInput.value='';q('#tt-backup-preview').textContent='';q('#tt-backup-restore-confirm').hidden=true;restoreWord.value='';lastFocus?.focus?.()}
function open(){lastFocus=document.activeElement;modal.hidden=false;selected=null;fileInput.value='';q('#tt-backup-preview').textContent='';q('#tt-backup-restore-confirm').hidden=true;restoreWord.value='';message('');q('#tt-backup-export').focus();void showUndo();void showOldData()}
async function showUndo(){const point=await classStore.read(RESTORE_POINT);q('#tt-backup-undo-box').hidden=!point;if(point)q('#tt-backup-undo-text').textContent=`${new Date(point.createdAt).toLocaleString('ko-KR')}에 복원했습니다. 복원 전 상태로 되돌릴 수 있습니다.`}
document.getElementById('tt-full-backup').addEventListener('click',open);
q('#tt-backup-done').addEventListener('click',close);q('#tt-backup-close').addEventListener('click',close);q('.tt-backup-shade').addEventListener('click',close);
modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
const verifySeat=s=>{if(typeof validatePersistentState!=='function')throw Error('자리배치 검증기가 없습니다.');return validatePersistentState(s).ok;};
async function flush(){
 if(window.__TT_STAGE031_FLUSH_GRADE&&!await window.__TT_STAGE031_FLUSH_GRADE())throw Error('성적 저장이 완료되지 않았습니다.');
 document.activeElement?.blur?.();
 window.__TT_SAVE_CURRENT_CLASS();
}
async function capture(){
 await flush();
 const registry=JSON.parse(classStore.getItem(cfg.registryKey)||'null');
 if(!registry||registry.activeId!==cfg.activeId)throw Error('다른 탭에서 반을 바꿨습니다. 새로고침 후 다시 진행하세요.');
 const entries=registry.classes.map(c=>{
  const s=classStore.getItem(cfg.makeKey(c.id,'seating')),p=classStore.getItem(cfg.makeKey(c.id,'pe'));
  if(!s)throw Error('반의 자리배치 자료가 없습니다: '+c.name);
  return {id:c.id,seating:JSON.parse(s),pe:p?JSON.parse(p):{}};
 });
 const store=await gradeStore(),drafts=await store.listDrafts('TT_STAGE03_'+cfg.installId+'_');
 const years=[];
 for(const row of drafts){const year=Number(row.key.slice(('TT_STAGE03_'+cfg.installId+'_').length));
  if(!Number.isInteger(year)||!row.value)throw Error('알 수 없는 성적 저장 키가 있어 전체 백업을 중단합니다: '+row.key);
  years.push({year,workspace:row.value});}
 const bundle=await link();return bundle.capturePayload({installId:cfg.installId,registry,seatAndPe:entries,gradeYears:years,validateSeating:verifySeat});
}
function download(obj,prefix){
 const text=JSON.stringify(obj,null,2),blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=prefix+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportPassword(){
 if(q('#tt-backup-plain').checked)return null;
 const pass=q('#tt-backup-pass').value;
 if(pass.length<8)throw Error('파일 암호를 8자 이상 입력하세요.');
 if(pass!==q('#tt-backup-pass2').value)throw Error('두 암호가 같지 않습니다.');
 return pass;
}
const protect=async(sealed,pass)=>pass?(await backupCrypto()).encryptBundle(sealed,pass):sealed;
async function exportNow(){if(locked)return;locked=true;q('#tt-backup-export').disabled=true;
 try{message('모든 반과 학년도 성적을 검사하고 있습니다.');const b=await link();const pass=exportPassword();const payload=await capture();const sealed=await b.sealPayload(payload);download(await protect(sealed,pass),'TT_ALL_CLASSES');message(`백업 파일 생성 요청 완료 · ${payload.classes.length}반 · 성적 ${payload.gradeYears.reduce((n,y)=>n+y.workspace.gradeValues.length,0)}건`)}
 catch(e){message('백업 중단: '+e.message,true)}finally{locked=false;q('#tt-backup-export').disabled=false}
}
q('#tt-backup-export').addEventListener('click',exportNow);
async function inspect(data){
 const b=await link();const summary=await b.verifyBundle(data,{validateSeating:verifySeat});
 selected=data;q('#tt-backup-preview').textContent=`검사 통과 · 학급 ${summary.classCount}개 · 학생 ${summary.studentCount}명 · 성적 ${summary.gradeCount}건 · 학년도 ${summary.gradeYears.join(', ')||'없음'} · ${data.payload.sourceInstallId===cfg.installId?'현재 설치 백업':'다른 설치의 백업 (ID 연결 재지정 예정)'}`;
 q('#tt-backup-restore-confirm').hidden=false;message('파일 검사 완료. 현재 자료와 교체하기 전 반드시 별도 백업을 보관하세요.');
}
fileInput.addEventListener('change',async()=>{selected=null;selectedPass=null;pendingFile=null;q('#tt-backup-restore-confirm').hidden=true;q('#tt-backup-open-box').hidden=true;restoreWord.value='';q('#tt-backup-preview').textContent='';const f=fileInput.files?.[0];if(!f)return;
 try{
  if(f.size>40*1024*1024)throw Error('백업 파일은 40MB 이하여야 합니다.');
  const data=JSON.parse(await f.text());
  if((await backupCrypto()).isEncrypted(data)){pendingFile=data;q('#tt-backup-open-box').hidden=false;q('#tt-backup-open-pass').focus();message('암호로 보호된 파일입니다. 암호를 입력하세요.');return}
  await inspect(data);
 }catch(e){q('#tt-backup-preview').textContent='파일 검사 실패: '+e.message;message('잘못된 백업은 적용하지 않습니다.',true)}
});
q('#tt-backup-open').addEventListener('click',async()=>{
 if(!pendingFile)return;
 try{
  const pass=q('#tt-backup-open-pass').value;
  await inspect(await (await backupCrypto()).decryptBundle(pendingFile,pass));
  selectedPass=pass;pendingFile=null;q('#tt-backup-open-pass').value='';q('#tt-backup-open-box').hidden=true;
 }catch(e){q('#tt-backup-preview').textContent='';message(e.message,true)}
});
async function showOldData(){
 const old=await classStore.oldData();
 q('#tt-old-data').hidden=!old.keys&&!old.grades;
 q('#tt-old-data-text').textContent=`예전 버전이 남긴 자료${old.keys?` ${old.keys}건`:''}${old.grades?'과 성적 자료':''}가 이 브라우저에 그대로 있습니다. 지금 자료에는 쓰이지 않습니다. 학생 정보가 들어 있을 수 있으니, 지금 자료가 잘 보이는 것을 확인한 뒤 지워 주세요.`;
}
q('#tt-old-data-remove').addEventListener('click',async()=>{
 if(locked||!confirm('이전 버전 자료를 지웁니다. 되돌릴 수 없습니다. 지금 자료에는 영향이 없습니다. 계속할까요?'))return;
 try{await classStore.removeOldData();await showOldData();message('이전 버전 자료를 지웠습니다.')}
 catch(e){message('지우지 못했습니다: '+e.message,true)}
});
restoreWord.addEventListener('input',()=>{q('#tt-backup-restore').disabled=restoreWord.value!=='복원'||!selected||locked});
// One transaction: if the browser stops midway, the old data is still complete.
async function applyPayload(payload,{point=null,keepYears=false,extra=null}={}){
 const put=new Map(extra||[]),del=classStore.keys(cfg.prefix+'.');
 if(!keepYears){const drafts=await (await gradeStore()).listDrafts('TT_STAGE03_'+cfg.installId+'_');del.push(...drafts.map(row=>row.key))}
 put.set(cfg.registryKey,JSON.stringify({version:1,activeId:payload.registry.activeId,classes:payload.registry.classes.map(c=>({...c})),createdAt:new Date().toISOString()}));
 for(const c of payload.classes){put.set(cfg.makeKey(c.id,'seating'),JSON.stringify(c.seating));put.set(cfg.makeKey(c.id,'pe'),JSON.stringify(c.pe))}
 for(const y of payload.gradeYears)put.set(`TT_STAGE03_${cfg.installId}_${y.year}`,y.workspace);
 if(point)put.set(RESTORE_POINT,point);else del.push(RESTORE_POINT);
 await classStore.commit({put,del});
}
window.__TT_BACKUP={capture,applyPayload};
q('#tt-backup-restore').addEventListener('click',async()=>{
 if(locked||!selected||restoreWord.value!=='복원')return;
 locked=true;q('#tt-backup-restore').disabled=true;
 try{
  const b=await link();
  await b.verifyBundle(selected,{validateSeating:verifySeat});
  const previous=await capture();
  let beforePass=selectedPass;
  if(!beforePass){try{beforePass=exportPassword()}catch{throw Error('복원 전 자료를 저장할 암호를 1번 칸에 입력하거나, 암호 없이 저장을 선택하세요.')}}
  download(await protect(await b.sealPayload(previous),beforePass),'TT_BEFORE_RESTORE');
  const incoming=b.remapInstall(selected.payload,cfg.installId,{validateSeating:verifySeat});
  if(!confirm(`현재 ${previous.classes.length}개 반을 백업 파일의 ${incoming.classes.length}개 반으로 교체합니다.\n복원 후에도 이 창에서 되돌릴 수 있습니다. 계속할까요?`))throw Error('사용자가 복원을 취소했습니다.');
  await applyPayload(incoming,{point:{createdAt:new Date().toISOString(),payload:previous}});
  message('복원했습니다. 새로고침합니다.');location.reload();
 }catch(e){
  message('복원 중단 (자료는 그대로입니다): '+e.message,true);locked=false;q('#tt-backup-restore').disabled=restoreWord.value!=='복원';
 }
});
q('#tt-backup-undo').addEventListener('click',async()=>{
 if(locked)return;
 locked=true;
 try{
  const point=await classStore.read(RESTORE_POINT);
  if(!point)throw Error('되돌릴 복원이 없습니다.');
  const b=await link();
  b.validatePayload(point.payload,{validateSeating:verifySeat});
  if(!confirm(`${new Date(point.createdAt).toLocaleString('ko-KR')} 복원 직전 상태로 되돌립니다. 그 뒤에 입력한 내용은 사라집니다. 계속할까요?`)){locked=false;return}
  await applyPayload(point.payload);
  message('되돌렸습니다. 새로고침합니다.');location.reload();
 }catch(e){message('되돌리기 중단 (자료는 그대로입니다): '+e.message,true);locked=false}
});
})();
