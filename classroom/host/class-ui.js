(()=>{
 'use strict';
 const cfg=window.__TT_STAGE031_CLASS,classStore=window.__TT_STORE;
 const stageRoot=new URL('../',document.currentScript?.src||location.href);
 const DELETED=`TT_DELETED_${cfg.installId}_`;
 if(!cfg)throw Error('다학급 저장소 초기화 누락');
 const read=()=>{
  const r=JSON.parse(classStore.getItem(cfg.registryKey));
  if(!r||!Array.isArray(r.classes)||!r.classes.some(c=>c.id===r.activeId))throw Error('학급 관리 목록을 읽을 수 없습니다.');
  return r;
 };
 const selected=()=>read().classes.find(c=>c.id===cfg.activeId);
 const host=document.querySelector('.studio-topbar .brand-block');
 if(!host){console.error('[STAGE031] 상단 학급 메뉴를 찾지 못했습니다.');return}
 const wrap=document.createElement('div');wrap.className='tt-class-controls';
 wrap.innerHTML=`<label for="tt-class-select">학급</label><select id="tt-class-select" aria-label="공통 학급 선택"></select><button type="button" id="tt-class-add" title="반 관리">반 관리</button>`;
 host.appendChild(wrap);
 const drop=wrap.querySelector('select');
 function render(){const r=read();drop.replaceChildren(...r.classes.map(c=>{const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.name;return opt}));drop.value=r.activeId;}
 function guardSnapshot(){
  const list=read();
  const current=list.classes.find(c=>c.id===cfg.activeId);
  if(!current)throw Error('현재 학급을 찾지 못했습니다.');
  const currentName=String(classState.className||'').trim();
  if(!currentName||currentName.length>30)throw Error('현재 학급 이름이 올바르지 않습니다.');
  if(list.classes.some(c=>c.id!==cfg.activeId&&c.name===currentName))throw Error('동일 학급 이름이 중복됩니다. 이름을 수정해 주세요.');
  if(typeof persistStateOnly!=='function'||!persistStateOnly())throw Error('자리배치 브라우저 저장이 완료되지 않았습니다. 전환을 중단합니다.');
  // PE runs inside its own IIFE; validate the last persisted record, never invent a copy.
  const peRaw=classStore.getItem(cfg.peKey);
  if(peRaw!==null){const parsed=JSON.parse(peRaw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('체육 데이터 저장본이 손상되었습니다.');}
  if(current.name!==currentName){
   const latest=read();if(latest.activeId!==cfg.activeId)throw Error('다른 탭의 변경이 감지됐습니다.');
   latest.classes.find(c=>c.id===cfg.activeId).name=currentName;
   classStore.setItem(cfg.registryKey,JSON.stringify(latest));render();
  }
 }
 window.__TT_SAVE_CURRENT_CLASS=guardSnapshot;
 let switching=false;
 async function move(id,resume='seating'){
  if(switching)return false;
  const reg=read();if(!reg.classes.some(c=>c.id===id))throw Error('존재하지 않는 학급 ID입니다.');
  if(id===cfg.activeId){render();return true}
  switching=true;drop.disabled=true;
  try{
   if(window.__TT_STAGE031_FLUSH_GRADE&&!(await window.__TT_STAGE031_FLUSH_GRADE()))throw Error('성적 편집의 로컬 저장이 완료되지 않았습니다.');
   document.activeElement?.blur?.();guardSnapshot();
   // Never switch to a missing or invalid existing class file.
   const nextText=classStore.getItem(cfg.makeKey(id,'seating'));
   if(nextText===null)throw Error('선택한 학급의 자리배치 저장본이 없습니다.');
   const nextState=JSON.parse(nextText);
   if(!Array.isArray(nextState.students)||nextState.className!==reg.classes.find(c=>c.id===id)?.name)throw Error('학급 데이터 불일치. 전환 중단.');
   const current=read();if(current.activeId!==cfg.activeId)throw Error('다른 탭에서 학급이 변경되었습니다. 새로고침 후 확인하세요.');
   current.activeId=id;
   classStore.setItem(cfg.registryKey,JSON.stringify(current));
   if(classStore.getItem(cfg.registryKey)!==JSON.stringify(current))throw Error('학급 전환 기록을 확인하지 못했습니다.');
   if(resume==='grade')sessionStorage.setItem('tt.stage031.resume','grade');
   await classStore.flush();
   location.reload();return true;
  }catch(e){alert('학급 이동 중단: '+e.message);render();return false}
  finally{switching=false;drop.disabled=false}
 }
 window.__TT_STAGE031_SWITCH_TO=move;
 drop.addEventListener('change',()=>{const id=drop.value;void move(id,document.body.classList.contains('tt-grade-active')?'grade':'seating')});
 // Class manager: edit existing classes, add batches, and stage explicit deletions.
 const modal=document.createElement('div');modal.id='tt-class-modal';modal.className='tt-class-modal';modal.hidden=true;
 modal.innerHTML=`<div class="tt-class-modal-backdrop" data-close="true"></div>
 <section class="tt-class-modal-box" role="dialog" aria-modal="true" aria-labelledby="tt-class-modal-heading" aria-describedby="tt-class-modal-help">
  <div class="tt-class-modal-top"><div><h2 id="tt-class-modal-heading">반 관리</h2><p id="tt-class-modal-help">등록된 반의 이름을 수정하거나 여러 반을 추가할 수 있습니다.</p></div><button type="button" class="tt-class-close" id="tt-class-close" aria-label="닫기">✕</button></div>
  <div class="tt-class-modal-label">등록된 반 · 이름 수정 / 삭제</div>
  <div id="tt-class-existing" class="tt-class-existing"></div>
  <label class="tt-class-modal-label" for="tt-class-names">새로 추가할 반 (한 줄에 하나)</label>
  <textarea id="tt-class-names" rows="3" maxlength="1024" placeholder="6학년 1반&#10;6학년 2반" spellcheck="false"></textarea>
  <div class="tt-class-modal-batch"><strong>빠른 학급 만들기</strong><label>학년 <input type="number" id="tt-class-grade" min="1" max="6" value="6"></label><label>시작 반 <input type="number" id="tt-class-from" min="1" max="30" value="1"></label><label>끝 반 <input type="number" id="tt-class-to" min="1" max="30" value="4"></label><button type="button" id="tt-class-generate">목록 채우기</button></div>
  <div class="tt-class-modal-feedback"><span id="tt-class-preview" aria-live="polite">수정할 반을 선택하세요.</span><span id="tt-class-error" role="alert"></span></div>
  <div id="tt-class-danger" class="tt-class-danger" hidden>
   <strong>⚠ 반 삭제를 눌렀습니다.</strong><p>기존 학생 정보등이 같이 삭제 됩니다.</p>
   <p id="tt-class-delete-details"></p><label for="tt-class-confirm-text">삭제를 진행하려면 아래에 <strong>삭제</strong>라고 입력하세요.</label>
   <input id="tt-class-confirm-text" type="text" autocomplete="off" spellcheck="false" placeholder="삭제" maxlength="2">
   <div class="tt-class-danger-actions"><button type="button" id="tt-class-delete-back">돌아가기</button><button type="button" id="tt-class-delete-final" class="tt-class-delete-button" disabled>반 삭제 확인 후 저장</button></div>
  </div>
  <div id="tt-class-recovery" class="tt-class-recovery" hidden><div class="tt-class-modal-label">삭제한 반 · 복구 / 완전 삭제</div><div id="tt-class-recovery-rows"></div></div>
  <div class="tt-class-modal-actions"><button type="button" id="tt-class-cancel">취소</button><button type="button" id="tt-class-create" class="tt-class-primary" disabled>변경사항 저장</button></div>
 </section>`;
 document.body.append(modal);
 const namesInput=modal.querySelector('#tt-class-names'),errorBox=modal.querySelector('#tt-class-error');
 const createButton=modal.querySelector('#tt-class-create'),preview=modal.querySelector('#tt-class-preview');
 const rows=modal.querySelector('#tt-class-existing'),danger=modal.querySelector('#tt-class-danger');
 const confirmInput=modal.querySelector('#tt-class-confirm-text');
 const finalButton=modal.querySelector('#tt-class-delete-final');
 let creating=false,lastFocus=null,baseRaw='',draftClasses=[],baseClassIds=new Set();
 const norm=n=>n.normalize('NFC').toLocaleLowerCase('ko-KR');
 function renderRows(){
  rows.replaceChildren();
  draftClasses.forEach((c,i)=>{
   const line=document.createElement('div');line.className='tt-class-existing-row';line.dataset.classId=c.id;
   if(c.deleted)line.classList.add('pending-delete');
   const count=document.createElement('span');count.className='tt-class-row-order';count.textContent=String(i+1);
   const input=document.createElement('input');input.type='text';input.maxLength=30;input.value=c.name;input.setAttribute('aria-label',`${i+1}번째 반 이름`);input.disabled=c.deleted;
   input.addEventListener('input',()=>{c.name=input.value;hideDanger();updatePreview()});
   const btn=document.createElement('button');btn.type='button';btn.textContent=c.deleted?'삭제 취소':'삭제';btn.className=c.deleted?'tt-class-undo':'tt-class-row-remove';
   btn.setAttribute('aria-label',`${c.name} ${c.deleted?'삭제 취소':'삭제 예정으로 표시'}`);
   btn.addEventListener('click',()=>{c.deleted=!c.deleted;renderRows();hideDanger();updatePreview()});
   line.append(count,input,btn);rows.append(line);
  });
 }
 function newNames(){return namesInput.value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);}
 function plan(){
  const active=draftClasses.filter(c=>!c.deleted).map(c=>({id:c.id,name:c.name.trim()}));
  const added=newNames();
  if(!active.length&&!added.length)throw Error('마지막 반은 삭제할 수 없습니다. 최소 1개의 반을 남겨 주세요.');
  if(active.length+added.length>30||added.length>30)throw Error('총 30개 반까지 관리할 수 있습니다.');
  const names=[...active.map(c=>c.name),...added];
  if(names.some(n=>!n||n.length>30||/[\u0000-\u001f]/.test(n)))throw Error('반 이름은 각각 1~30자로 입력해야 합니다.');
  if(new Set(names.map(norm)).size!==names.length)throw Error('동일한 반 이름이 중복되었습니다.');
  const current=read();
  if(current.classes.length!==draftClasses.length||draftClasses.some(c=>!current.classes.some(x=>x.id===c.id)))throw Error('반 관리 목록이 변경되었습니다. 다시 열어 주세요.');
  const deleted=draftClasses.filter(c=>c.deleted).map(c=>c.id);
  const renamed=active.filter(c=>current.classes.find(x=>x.id===c.id)?.name!==c.name);
  return {active,added,deleted,renamed,dirty:Boolean(deleted.length||renamed.length||added.length)};
 }
 function hideDanger(){danger.hidden=true;confirmInput.value='';finalButton.disabled=true;}
 function updatePreview(){
  try{const p=plan();preview.textContent=`현재 ${p.active.length}개 반 · 추가 ${p.added.length}개 · 이름 변경 ${p.renamed.length}개 · 삭제 예정 ${p.deleted.length}개`;
   errorBox.textContent='';createButton.disabled=creating||!p.dirty;
  }catch(e){preview.textContent='반 목록 확인 필요';errorBox.textContent=e.message;createButton.disabled=true;}
 }
 function openModal(){if(switching||creating)return;lastFocus=document.activeElement;baseRaw=classStore.getItem(cfg.registryKey);
  draftClasses=read().classes.map(c=>({...c,deleted:false}));baseClassIds=new Set(draftClasses.map(c=>c.id));
  modal.hidden=false;namesInput.value='';hideDanger();renderRows();updatePreview();rows.querySelector('input')?.focus();void renderRecovery();}
 function closeModal(){if(creating)return;modal.hidden=true;hideDanger();lastFocus?.focus?.();}
 wrap.querySelector('#tt-class-add').addEventListener('click',openModal);
 modal.querySelector('#tt-class-close').addEventListener('click',closeModal);
 modal.querySelector('#tt-class-cancel').addEventListener('click',closeModal);
 modal.querySelector('.tt-class-modal-backdrop').addEventListener('click',closeModal);
 modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeModal()}
  if(e.key==='Tab'){const els=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea')].filter(el=>el.offsetParent!==null);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();createButton.click()}
 });
 namesInput.addEventListener('input',()=>{hideDanger();updatePreview()});
 modal.querySelector('#tt-class-generate').addEventListener('click',()=>{
  const grade=Number(modal.querySelector('#tt-class-grade').value),start=Number(modal.querySelector('#tt-class-from').value),end=Number(modal.querySelector('#tt-class-to').value);
  if(!Number.isInteger(grade)||grade<1||grade>6||!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>30||end<start){errorBox.textContent='학년은 1~6, 반은 1~30에서 시작 반이 끝 반보다 작거나 같아야 합니다.';return}
  namesInput.value=Array.from({length:end-start+1},(_,i)=>`${grade}학년 ${start+i}반`).join('\n');hideDanger();updatePreview();namesInput.focus();
 });
 confirmInput.addEventListener('input',()=>{finalButton.disabled=confirmInput.value.trim()!=='삭제'});
 modal.querySelector('#tt-class-delete-back').addEventListener('click',()=>{hideDanger();createButton.focus()});
 createButton.addEventListener('click',()=>{
  if(creating||modal.hidden)return;let p;try{p=plan()}catch(e){errorBox.textContent=e.message;return}
  if(!p.dirty)return;
  if(p.deleted.length){
   danger.hidden=false;modal.querySelector('#tt-class-delete-details').textContent=`삭제 예정: ${p.deleted.map(id=>draftClasses.find(c=>c.id===id)?.name).join(', ')}. 이 반의 학생명단, 좌석·체육 설정, 이번 학년도 성적 기록이 삭제됩니다. 지난 학년도 성적과 다른 반의 자료는 유지됩니다. 삭제한 반은 복구 목록에 30일 동안 남은 뒤 자동으로 지워집니다.`;
   confirmInput.value='';finalButton.disabled=true;confirmInput.focus();danger.scrollIntoView({block:'end'});return;
  }
  void saveChanges(p);
 });
 finalButton.addEventListener('click',()=>{if(confirmInput.value.trim()!=='삭제')return;let p;try{p=plan()}catch(e){errorBox.textContent=e.message;return};if(!p.deleted.length)return;void saveChanges(p)});
 async function saveChanges(p){
  if(creating||switching)return;creating=true;createButton.disabled=true;finalButton.disabled=true;errorBox.textContent='';
  try{
   const base=classStore.getItem(cfg.registryKey);
   if(base!==baseRaw)throw Error('반 목록이 변경되었습니다. 창을 다시 열어 주세요.');
   if(window.__TT_STAGE031_FLUSH_GRADE&&!(await window.__TT_STAGE031_FLUSH_GRADE()))throw Error('성적 로컬 저장이 실패했습니다. 반 관리를 중단합니다.');
   document.activeElement?.blur?.();guardSnapshot();
   const before=read();if(!baseClassIds.has(before.activeId))throw Error('선택된 반 정보가 다릅니다.');
   const newClasses=p.added.map(name=>({id:crypto.randomUUID(),name}));
   const remaining=[...p.active,...newClasses];
   const nextActive=remaining.some(c=>c.id===before.activeId)?before.activeId:remaining[0].id;
   const gradeStore=await import(new URL('grades/storage.mjs',stageRoot).href);
   const {reconcileGradeClasses}=await import(new URL('host/class-management-grade.mjs',stageRoot).href);
   const {schoolYear}=await import(new URL('grades/model.mjs',stageRoot).href);
   const year=schoolYear(),gradeKey=`TT_STAGE03_${cfg.installId}_${year}`;
   const gradePlan=reconcileGradeClasses(await gradeStore.loadDraft(gradeKey)??null,cfg.installId,remaining,p.deleted);
   const put=new Map(),del=[];
   for(const c of p.renamed){const key=cfg.makeKey(c.id,'seating');const raw=classStore.getItem(key);if(raw===null)throw Error('반의 좌석 데이터가 없습니다: '+c.name);
    const state=JSON.parse(raw);if(!Array.isArray(state.students))throw Error('좌석 데이터 형식 오류: '+c.name);
    state.className=c.name;put.set(key,JSON.stringify(state));}
   for(const c of newClasses){const state=defaultState();state.className=c.name;state.students=[];state.assignments=[];state.history=[];state.groups=[];
    if(!validatePersistentState(state).ok)throw Error('새 학급 데이터 검증 실패');put.set(cfg.makeKey(c.id,'seating'),JSON.stringify(state));put.set(cfg.makeKey(c.id,'pe'),'{}');}
   if(gradePlan.changed)put.set(gradeKey,gradePlan.workspace);
   for(const classId of p.deleted){
    const seating=classStore.getItem(cfg.makeKey(classId,'seating')),grade=gradePlan.removedByClass[classId]||null;
    let studentCount=0;try{studentCount=JSON.parse(seating)?.students?.length||0}catch{}
    put.set(`${DELETED}${crypto.randomUUID()}`,{classId,name:before.classes.find(c=>c.id===classId)?.name||'이름 없는 반',deletedAt:new Date().toISOString(),year,seating,pe:classStore.getItem(cfg.makeKey(classId,'pe')),grade,studentCount});
    del.push(cfg.makeKey(classId,'seating'),cfg.makeKey(classId,'pe'));
   }
   put.set(cfg.registryKey,JSON.stringify({...before,classes:remaining,activeId:nextActive}));
   await classStore.commit({put,del});
   if(document.body.classList.contains('tt-grade-active'))sessionStorage.setItem('tt.stage031.resume','grade');
   location.reload();
  }catch(e){
   errorBox.textContent='반 관리 저장 중단 (자료는 그대로입니다): '+e.message;
   creating=false;updatePreview();
  }
 }
 const KEEP_DAYS=30,DAY_MS=86400000;
 async function purgeOldDeleted(){
  const old=(await classStore.list(DELETED)).filter(r=>Date.now()-new Date(r.value.deletedAt).getTime()>=KEEP_DAYS*DAY_MS);
  if(old.length)await classStore.commit({del:old.map(r=>r.key),quiet:true});
 }
 void purgeOldDeleted().catch(error=>console.warn('삭제 반 정리 실패',error));
 async function renderRecovery(){
  const box=modal.querySelector('#tt-class-recovery'),list=modal.querySelector('#tt-class-recovery-rows');
  const records=(await classStore.list(DELETED)).sort((a,b)=>String(b.value.deletedAt).localeCompare(String(a.value.deletedAt)));
  box.hidden=!records.length;list.replaceChildren();
  for(const {key,value} of records){
   const row=document.createElement('div');row.className='tt-class-recovery-row';
   const label=document.createElement('span');
   const grades=value.grade?.gradeValues?.filter(g=>g.value!==null).length||0;
   const left=Math.max(1,KEEP_DAYS-Math.floor((Date.now()-new Date(value.deletedAt).getTime())/DAY_MS));
   label.textContent=`${value.name} · 학생 ${value.studentCount}명 · 성적 ${grades}건 · ${left}일 뒤 자동 삭제`;
   const restore=document.createElement('button');restore.type='button';restore.textContent='복구';restore.onclick=()=>void recoverClass(key,value);
   const purge=document.createElement('button');purge.type='button';purge.className='tt-class-row-remove';purge.textContent='완전 삭제';purge.onclick=()=>void purgeClass(key,value);
   row.append(label,restore,purge);list.append(row);
  }
 }
 async function recoverClass(key,value){
  if(creating||switching)return;creating=true;errorBox.textContent='';
  try{
   if(classStore.getItem(cfg.registryKey)!==baseRaw)throw Error('반 목록이 변경되었습니다. 창을 다시 열어 주세요.');
   if(window.__TT_STAGE031_FLUSH_GRADE&&!(await window.__TT_STAGE031_FLUSH_GRADE()))throw Error('성적 로컬 저장이 실패했습니다.');
   document.activeElement?.blur?.();guardSnapshot();
   const registry=read();
   if(registry.classes.length>=30)throw Error('총 30개 반까지 관리할 수 있습니다.');
   if(registry.classes.some(c=>c.id===value.classId))throw Error('같은 반이 이미 있습니다.');
   const taken=new Set(registry.classes.map(c=>norm(c.name)));
   let name=value.name;
   if(taken.has(norm(name)))name=`${value.name.slice(0,26)} (복구)`;
   if(taken.has(norm(name)))throw Error('같은 이름의 반이 있습니다. 반 이름을 먼저 바꿔 주세요.');
   let state;
   if(value.seating){state=JSON.parse(value.seating)}else{state=defaultState();state.students=[];state.assignments=[];state.history=[];state.groups=[]}
   state.className=name;
   const put=new Map([[cfg.makeKey(value.classId,'seating'),JSON.stringify(state)],[cfg.makeKey(value.classId,'pe'),value.pe??'{}'],[cfg.registryKey,JSON.stringify({...registry,classes:[...registry.classes,{id:value.classId,name}]})]]);
   if(value.grade){
    const gradeStore=await import(new URL('grades/storage.mjs',stageRoot).href);
    const {restoreDeletedClass}=await import(new URL('host/class-management-grade.mjs',stageRoot).href);
    const gradeKey=`TT_STAGE03_${cfg.installId}_${value.year}`;
    put.set(gradeKey,restoreDeletedClass(await gradeStore.loadDraft(gradeKey)??null,value.grade,{year:value.year,installId:cfg.installId,name}));
   }
   await classStore.commit({put,del:[key]});
   if(document.body.classList.contains('tt-grade-active'))sessionStorage.setItem('tt.stage031.resume','grade');
   location.reload();
  }catch(e){errorBox.textContent='복구 중단 (자료는 그대로입니다): '+e.message;creating=false}
 }
 async function purgeClass(key,value){
  if(creating||switching)return;
  if(!confirm(`${value.name}의 학생명단과 성적을 복구 목록에서도 지웁니다. 되돌릴 수 없습니다. 계속할까요?`))return;
  try{await classStore.commit({del:[key]});await renderRecovery()}
  catch(e){errorBox.textContent='완전 삭제 중단: '+e.message}
 }
 render();
})();
