import {setMemberNumbers,schoolYear,SCHEMA,LEVEL_SETS,createSeatingMetricsExport,classAssessmentDistribution,getCriterionType,formatGrade,extractSeatingRoster,connectSeatingProfiles,fresh,sample,addClass,renameClass,addStudent,renameStudent,deactivateStudent,addAssessment,setGrade,getGrade,roster,restoreWorkspace,gradeCsv,validateWorkspace} from './model.mjs';
import {loadDraft,writeDraft,deleteDraft,listDrafts} from './storage.mjs';
import {buildStudentSubjectDashboard} from './student-dashboard.mjs';
import {GoogleCloud} from './google-cloud.mjs';
import {GOOGLE_CLIENT_ID} from './google-config.mjs';
import {projectRoster,inactiveMembers,relinkInactiveMembership} from './roster-projection.mjs';

const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={overview:['대시보드','CLASSROOM OVERVIEW','교실 관리 대시보드','학급, 학생, 평가를 하나의 작업공간에서 관리합니다.'],classes:['학급 · 학생명단','CLASS & STUDENT DIRECTORY','학급 · 학생명단','학급별 명단을 등록하고 관리합니다.'],assessments:['평가 관리','ASSESSMENT MANAGEMENT','평가 관리','같은 평가를 여러 학급에 연결합니다.'],grades:['성적 입력','GRADE WORKSPACE','성적 입력','점수·단계·기타 기록으로 평가 결과를 입력하고 학급별로 확인합니다.']};
const cloud=new GoogleCloud(GOOGLE_CLIENT_ID);
let cloudMode=false,cloudDirty=false,cloudFileKey=null,changeCounter=0;
let readOnlyYear=false,stage03InstallId=null,stage03ProjectionBusy=Promise.resolve(),stage03PendingDraft=Promise.resolve();
let cloudOpBusy=false,cloudLookupState='idle',cloudCandidates=[],cloudLookupSerial=0;
let year=schoolYear(),m=fresh(year),page='overview',selectedClass=null,selectedAssessment=null,selectedGradeClass='all',selectedGradeSubject=undefined,filter='',timer=null,edited=new Set(),persistFailed=false,stripOpen=true,gradeStripOpen=false,selectedMemberId=null,selectedPersonalSubject=null;
function toast(msg,isError=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',isError);t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.hidden=true,4200);}
function download(name,content,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function draftKey(){return `TT_STAGE03_${stage03InstallId||'UNBOUND'}_${year}`;}
function markChanged(){if(readOnlyYear)return;changeCounter++;if(cloudMode)cloudDirty=true;m.updatedAt=new Date().toISOString();$('draft-state').textContent=cloudMode?'● 미저장 변경 있음 · Sheets 저장 필요':'◌ 임시 보관 중';updateCloudUI();clearTimeout(timer);timer=setTimeout(async()=>{try{validateWorkspace(m);stage03PendingDraft=writeDraft(draftKey(),structuredClone(m));await stage03PendingDraft;persistFailed=false;$('draft-state').textContent=cloudMode?(cloudDirty?'● 이 기기에 임시 보관됨 · Sheets 미저장':'● Sheets 저장 확인됨'):'● 이 기기에 임시 보관됨';}catch(e){persistFailed=true;$('draft-state').textContent='⚠ 임시 보관 실패';toast('브라우저 임시 보관에 실패했습니다. JSON 백업을 내려받으세요.',true);}},500);}
function syncSelection(){if(!m.classes.some(c=>c.id===selectedClass))selectedClass=m.classes[0]?.id||null;if(!m.assessments.some(a=>a.id===selectedAssessment))selectedAssessment=m.assessments[0]?.id||null;const a=m.assessments.find(x=>x.id===selectedAssessment);if(!a || (selectedGradeClass!=='all'&&!a.classIds.includes(selectedGradeClass)))selectedGradeClass='all';}
function go(next){const priorPage=page;page=next;$('grade-toolbar-subject').classList.toggle('hidden',next!=='grades');if(next==='grades'&&priorPage!==next)activateDock('grades');selectedMemberId=null;$('student-detail').classList.add('hidden');document.querySelectorAll('.nav').forEach(b=>{b.classList.toggle('active',b.dataset.page===next);b.classList.toggle('on',b.dataset.page===next);});document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('hidden',x.dataset.view!==next));const n=names[next];$('crumb').textContent=n[0];$('eyebrow').textContent=n[1];$('heading').textContent=n[2];$('subheading').textContent=next==='classes'?'':n[3];render();}
function render(){syncSelection();updateCloudUI();$('n-classes').textContent=m.classes.length;$('n-students').textContent=m.memberships.filter(x=>x.active).length;$('n-assessments').textContent=m.assessments.length;$('n-grades').textContent=m.gradeValues.filter(x=>x.value!==null).length;renderOverview();renderClasses();renderAssessments();renderGrades();updateDock();renderStudentStrip();applyReadOnly();}
function applyReadOnly(){
 document.body.classList.toggle('is-read-only',readOnlyYear);
 if(!readOnlyYear)return;
 document.querySelectorAll('.grade-input,[data-view="assessments"] button,[data-view="assessments"] input').forEach(el=>{el.disabled=true});
}
async function fillYearChoices(){
 const start=`TT_STAGE03_${stage03InstallId}_`;
 const years=new Set([schoolYear()]);
 for(const row of await listDrafts(start)){const y=Number(row.key.slice(start.length));if(Number.isInteger(y))years.add(y)}
 $('view-year').replaceChildren(...[...years].sort((a,b)=>b-a).map(y=>new Option(y===schoolYear()?`${y} (이번 학년도)`:String(y),String(y))));
 $('view-year').value=String(year);
}
$('view-year').onchange=async()=>{
 const next=Number($('view-year').value);
 try{
  await stage03ProjectionBusy;
  await stage03Flush();
  readOnlyYear=next!==schoolYear();
  year=next;
  const draft=await loadDraft(draftKey());
  if(draft)validateWorkspace(draft);
  m=draft||fresh(year);
  selectedClass=null;selectedAssessment=null;selectedGradeClass='all';selectedMemberId=null;$('student-detail').classList.add('hidden');edited.clear();
  render();
  if(readOnlyYear)stage03Report(`${year}학년도 보기 · 읽기 전용입니다. 고치려면 이번 학년도로 돌아오세요.`);
  else window.parent.postMessage({type:'TT_STAGE03_READY',installId:null},location.origin);
 }catch(e){$('view-year').value=String(year);toast('학년도를 바꾸지 못했습니다: '+e.message,true)}
};
function renderOverview(){const cls=$('overview-classes'),asses=$('overview-assessments');cls.innerHTML=m.classes.length?m.classes.map(c=>`<div class="tile"><div><strong>${h(c.name)}</strong><small>학생 ${m.memberships.filter(x=>x.classId===c.id&&x.active).length}명</small></div><span class="mini-pill">학급</span></div>`).join(''):'<div class="empty-state">등록된 학급이 없습니다.<br>상단 반 관리에서 등록할 수 있습니다.</div>';asses.innerHTML=m.assessments.length?m.assessments.slice(-6).reverse().map(a=>`<div class="tile"><div><strong>${h(a.title)}</strong><small>${h(a.subject)} · ${h(getCriterionType(m.criteria.find(x=>x.assessmentId===a.id))==='level'?'단계 평가':getCriterionType(m.criteria.find(x=>x.assessmentId===a.id))==='other'?'기타 기록':'점수 평가')} · ${a.classIds.length}개 학급 연결</small></div><span class="mini-pill">평가</span></div>`).join(''):'<div class="empty-state">등록된 평가가 없습니다.<br>평가 관리 메뉴에서 새 평가를 등록할 수 있습니다.</div>';}
let numberEditing=false;
function renderInactiveStudents(c){
 const box=$('inactive-students'),rows=c?inactiveMembers(m,c.id):[],active=c?roster(m,c.id):[];
 box.classList.toggle('hidden',!rows.length);
 if(!rows.length){box.innerHTML='';return;}
 box.innerHTML=`<div class="panel-top"><div><h2>명단에서 제외된 학생</h2><p>성적은 보존되어 있습니다. 이름이 바뀐 학생이면 지금 명단의 학생과 다시 연결하세요.</p></div></div>`+rows.map(r=>`<div class="inactive-student-row"><strong>${h(r.name)}</strong><span>성적 ${r.gradeCount}건</span><select data-relink-select="${h(r.id)}" aria-label="${h(r.name)}을 연결할 학생"><option value="">연결할 학생 선택</option>${active.map(a=>`<option value="${h(a.id)}">${a.number}. ${h(a.name)}</option>`).join('')}</select><button type="button" class="ghost" data-relink="${h(r.id)}">다시 연결</button></div>`).join('');
 box.querySelectorAll('[data-relink]').forEach(b=>b.onclick=async()=>{
  const old=rows.find(x=>x.id===b.dataset.relink),target=active.find(x=>x.id===box.querySelector(`[data-relink-select="${CSS.escape(b.dataset.relink)}"]`).value);
  if(!old||!target){toast('연결할 학생을 선택하세요.',true);return;}
  if(!confirm(`${old.name}의 성적 ${old.gradeCount}건을 ${target.name} 학생에게 연결할까요?`))return;
  try{m=relinkInactiveMembership(m,old.id,target.id);markChanged();await stage03Flush();render();toast(`${target.name} 학생에게 성적을 연결했습니다.`)}catch(e){toast(e.message,true)}
 });
}
function renderClasses(){
 const list=$('class-list');
 list.innerHTML=m.classes.length?m.classes.map(c=>`<button type="button" class="class-item ${c.id===selectedClass?'active':''}" data-class-id="${h(c.id)}"><span>${h(c.name)}</span><small>${roster(m,c.id).length}명</small></button>`).join(''):'<div class="dock-empty">아직 등록된 학급이 없습니다.</div>';
 const c=m.classes.find(x=>x.id===selectedClass),rows=c?roster(m,c.id):[];
 $('selected-class-title').textContent=c?`${c.name} · 학생 명단`:'학급 · 학생 명단';
 $('class-count').textContent=c?`등록 학생 ${rows.length}명 · 연결 평가 ${m.assessments.filter(a=>a.classIds.includes(c.id)).length}개`:'';
 $('dock-roster-heading').textContent=c?`${c.name} · 학생 등록`:'학생 등록';

 $('class-stage-roster').innerHTML=rows.length?rows.map(r=>`<button type="button" class="class-stage-student" data-person="${h(r.id)}"><span class="number">${r.number}</span><span class="stage-student-name">${h(r.name)}</span><span class="stage-student-meta">개인 평가 보기</span></button>`).join(''):c?'<div class="empty-state">오른쪽 도구창에서 학생을 등록하세요.</div>':'';
 $('class-stage-roster').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>showStudent(b.dataset.person));
 $('edit-numbers').classList.toggle('hidden',!rows.length||numberEditing);
 $('edit-numbers').onclick=()=>{numberEditing=true;renderClasses()};
 if(numberEditing&&rows.length){
  $('class-stage-roster').innerHTML=`<div class="number-edit-list">${rows.map(r=>`<label class="number-edit-row"><input type="number" min="1" max="999" value="${r.number}" data-number-for="${h(r.id)}" aria-label="${h(r.name)} 번호"><span>${h(r.name)}</span></label>`).join('')}</div><div class="number-edit-actions"><button type="button" class="primary" id="save-numbers">번호 저장</button><button type="button" class="ghost" id="cancel-numbers">취소</button></div>`;
  $('cancel-numbers').onclick=()=>{numberEditing=false;renderClasses()};
  $('save-numbers').onclick=async()=>{
   try{
    const copy=structuredClone(m);
    setMemberNumbers(copy,c.id,Object.fromEntries([...$('class-stage-roster').querySelectorAll('[data-number-for]')].map(i=>[i.dataset.numberFor,Number(i.value)])));
    m=copy;numberEditing=false;markChanged();await stage03Flush();render();toast('번호를 저장했습니다.');
   }catch(e){toast(e.message,true)}
  };
 }
 renderInactiveStudents(c);
 const area=$('roster-ui');
 if(!c){area.innerHTML='<div class="dock-empty">학급을 선택하면 학생 입력란이 열립니다.</div>';}else{
  area.innerHTML=`<div class="dock-bulk roster-bulk"><label for="bulk-students" class="roster-bulk-title">학생 명단 한꺼번에 등록</label><p>학생 이름을 한 줄에 한 명씩 입력하거나 붙여넣으세요. 한 명만 등록할 때도 같은 입력창을 사용합니다.</p><textarea id="bulk-students" rows="7" placeholder="김가온&#10;이하늘&#10;박다온"></textarea><button type="button" id="bulk-submit" class="primary full">명단 등록</button></div><div class="dock-roster-list">${rows.length?rows.map(r=>`<div class="dock-roster-row"><span>${r.number}</span><strong>${h(r.name)}</strong><button type="button" data-rename-student="${h(r.id)}">수정</button><button type="button" class="danger-text" data-deactivate="${h(r.id)}">제외</button></div>`).join(''):'<p class="dock-empty">등록된 학생이 없습니다.</p>'}</div><p class="dock-note">명단에서 제외해도 기존 평가 기록은 보존됩니다.</p>`;
  $('bulk-submit').onclick=()=>{toast('학생명단은 자리배치에서만 변경합니다.',true);return;const lines=$('bulk-students').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length||lines.length>200||lines.some(x=>x.length>50)){toast('1~200명의 이름을 한 줄씩 입력하세요.',true);return;}try{const copy=structuredClone(m);for(const name of lines)addStudent(copy,c.id,name);m=copy;markChanged();render();toast(`${lines.length}명을 등록했습니다.`)}catch(x){toast(x.message,true)}};
  area.querySelectorAll('[data-rename-student]').forEach(b=>b.onclick=()=>{toast('이름은 자리배치에서 수정합니다.',true);return;const r=rows.find(x=>x.id===b.dataset.renameStudent);const val=prompt('학생 이름 수정',r?.name||'');if(val===null)return;try{renameStudent(m,b.dataset.renameStudent,val);markChanged();render()}catch(e){toast(e.message,true)}});
  area.querySelectorAll('[data-deactivate]').forEach(b=>b.onclick=()=>{toast('학생 제외는 자리배치에서만 처리합니다.',true);return;const r=rows.find(x=>x.id===b.dataset.deactivate);if(!confirm(`${r?.name||'학생'}을 현재 명단에서 제외할까요? 기존 성적 기록은 보존됩니다.`))return;try{deactivateStudent(m,b.dataset.deactivate);markChanged();render()}catch(e){toast(e.message,true)}});
 }
 list.querySelectorAll('[data-class-id]').forEach(b=>b.onclick=()=>{selectedClass=b.dataset.classId;selectedMemberId=null;$('student-detail').classList.add('hidden');renderClasses();renderStudentStrip()});
}
function renderAssessments(){
 const checks=$('class-checks');const previous=new Set([...checks.querySelectorAll('input:checked')].map(x=>x.value));
 if(!previous.size&&selectedClass)previous.add(selectedClass);
 checks.innerHTML=m.classes.length?m.classes.map(c=>`<label class="check"><input type="checkbox" name="targetClass" value="${h(c.id)}" ${previous.has(c.id)?'checked':''}> ${h(c.name)}</label>`).join(''):'<div class="empty-state">학급을 먼저 등록하세요.</div>';
 const list=$('assessment-list');list.innerHTML=m.assessments.length?m.assessments.slice().reverse().map(a=>{
  const c=m.criteria.find(x=>x.assessmentId===a.id),type=getCriterionType(c);
  const label=type==='level'?`${c.levelCount}단계`:type==='other'?`기타 · ${c.unit}`:`점수 · ${c.maxScore}점`;
  const direction=type==='other'?c.recordDirection=== 'lower'?'낮을수록 우수':c.recordDirection==='higher'?'높을수록 우수':'방향 설정 필요':'';
  return `<div class="assess-item"><span class="type-tag ${type}">${h(label)}</span><br><strong>${h(a.subject)} · ${h(a.title)}</strong><small>${h(c.name)}${type==='other'?` · ${h(direction)}`:''} · ${a.classIds.map(id=>m.classes.find(x=>x.id===id)?.name).filter(Boolean).map(h).join(' · ')}<br>학급별 평균·표준편차로 상대 위치 계산</small><div class="assess-actions"><button type="button" class="mini" data-open-grade="${h(a.id)}">성적 입력 →</button>${type==='other'?`<button type="button" class="mini" data-edit-direction="${h(a.id)}">기록 방향 변경</button>`:''}</div>${type==='other'?`<div class="interpretation-editor hidden" data-direction-editor="${h(a.id)}"><label>좋은 점수의 방향성<select class="interpret-direction"><option value="" ${!['higher','lower'].includes(c.recordDirection)?'selected':''}>방향 선택</option><option value="higher" ${c.recordDirection==='higher'?'selected':''}>높을수록 우수 (윗몸일으키기)</option><option value="lower" ${c.recordDirection==='lower'?'selected':''}>낮을수록 우수 (달리기)</option></select></label><button type="button" class="primary" data-save-direction="${h(a.id)}">방향 저장</button></div>`:''}</div>`;
 }).join(''):'<div class="empty-state">등록된 평가가 없습니다.</div>';
 list.querySelectorAll('[data-open-grade]').forEach(b=>b.onclick=()=>{selectedAssessment=b.dataset.openGrade;selectedGradeSubject=m.assessments.find(a=>a.id===selectedAssessment)?.subject||'';selectedGradeClass='all';go('grades')});
 list.querySelectorAll('[data-edit-direction]').forEach(b=>b.onclick=()=>{list.querySelector(`[data-direction-editor="${b.dataset.editDirection}"]`)?.classList.toggle('hidden')});
 list.querySelectorAll('[data-save-direction]').forEach(b=>b.onclick=()=>{
  const c=m.criteria.find(x=>x.assessmentId===b.dataset.saveDirection);
  const value=list.querySelector(`[data-direction-editor="${b.dataset.saveDirection}"] .interpret-direction`)?.value;
  if(!['higher','lower'].includes(value)){toast('높을수록 또는 낮을수록 우수를 선택하세요.',true);return;}
  c.recordDirection=value;markChanged();render();toast('기록 방향이 적용되었습니다. 학생 원본 기록은 변경되지 않았습니다.');
 });
}
// The grid is only a view: every editable cell still addresses one assessmentId + membershipId.
// Subject mode shows all assessments of one subject in independent columns, never a new merged grade.
const SHEET_PREF_KEY='tt.classroom.sheet-layout.v065';
const SHEET_LEGACY_PREF_KEY='tt.classroom.sheet-layout.v062';
const SHEET_FIXED_NAMES=['class','number','name'];
const SHEET_FIXED_DEFAULTS=[118,70,180];
function loadSheetLayout(){
 try{
  const cur=JSON.parse(localStorage.getItem(SHEET_PREF_KEY));
  if(cur&&Array.isArray(cur.fixed)&&cur.fixed.length===3&&typeof cur.results==='object')return {
   fixed:cur.fixed.map((v,i)=>Number.isFinite(v)&&v>=70&&v<=640?Math.round(v):SHEET_FIXED_DEFAULTS[i]),
   results:Object.fromEntries(Object.entries(cur.results).filter(([k,v])=>/^[\w-]{1,120}$/.test(k)&&Number.isFinite(v)&&v>=86&&v<=640)),
   defaultResult:Number.isFinite(cur.defaultResult)?cur.defaultResult:170,
   status:Number.isFinite(cur.status)?cur.status:134
  };
 }catch{}
 try{const prev=JSON.parse(localStorage.getItem(SHEET_LEGACY_PREF_KEY));if(Array.isArray(prev)&&prev.length===5)return {fixed:prev.slice(0,3),results:{},defaultResult:prev[3],status:prev[4]};}catch{}
 return {fixed:[...SHEET_FIXED_DEFAULTS],results:{},defaultResult:170,status:134};
}
let sheetLayout=loadSheetLayout(),sheetRowHeights=new Map(),gradeViewAssessments=[],gradeViewRows=[];
function displayAssessments(){
 if(selectedGradeSubject===undefined && m.assessments.length)selectedGradeSubject=m.assessments.find(a=>a.id===selectedAssessment)?.subject||m.assessments[0].subject;
 if(selectedGradeSubject&&!m.assessments.some(a=>a.subject===selectedGradeSubject))selectedGradeSubject=m.assessments[0]?.subject||'';
 return selectedGradeSubject?m.assessments.filter(a=>a.subject===selectedGradeSubject):m.assessments.filter(a=>a.id===selectedAssessment);
}
function currentGradeRows(assessments){const ids=new Set(assessments.flatMap(a=>a.classIds));return roster(m).filter(r=>ids.has(r.classId)&&(selectedGradeClass==='all'||r.classId===selectedGradeClass)&&(!filter||r.name.includes(filter)));}
function sheetColumnWidth(col){if(col.kind==='fixed')return sheetLayout.fixed[col.index];if(col.kind==='status')return sheetLayout.status;return sheetLayout.results[col.id]||sheetLayout.defaultResult;}
function sheetColumns(assessments){return [...SHEET_FIXED_NAMES.map((name,index)=>({kind:'fixed',name,index})),...assessments.map(a=>({kind:'assessment',id:a.id})),{kind:'status'}];}
function setSheetWidths(assessments){
 const table=$('grade-table'),cols=sheetColumns(assessments);
 table.style.setProperty('--sheet-grid-columns',`44px ${cols.map((col,i)=>i===cols.length-1?`minmax(${sheetColumnWidth(col)}px,1fr)`:`${sheetColumnWidth(col)}px`).join(' ')}`);
 table.style.minWidth=(44+cols.reduce((acc,col)=>acc+sheetColumnWidth(col),0))+'px';
}
function installSheetColumnResizers(assessments){
 const cols=sheetColumns(assessments);
 $('grade-table').querySelectorAll('[data-resize-col]').forEach(handle=>{
  handle.onpointerdown=e=>{
   if(e.button!==0)return;e.preventDefault();e.stopPropagation();
   const col=cols[Number(handle.dataset.resizeCol)];if(!col)return;
   const start=e.clientX,from=sheetColumnWidth(col);document.body.classList.add('sheet-resizing');
   const move=ev=>{
    const width=Math.min(640,Math.max(col.kind==='assessment'?86:70,Math.round(from+ev.clientX-start)));
    if(col.kind==='fixed')sheetLayout.fixed[col.index]=width;
    else if(col.kind==='assessment')sheetLayout.results[col.id]=width;
    else sheetLayout.status=width;
    setSheetWidths(assessments);
   };
   const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);document.body.classList.remove('sheet-resizing');try{localStorage.setItem(SHEET_PREF_KEY,JSON.stringify(sheetLayout))}catch{}};
   window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
  };
 });
}
function installSheetRowResizers(){
 $('grade-rows').querySelectorAll('[data-resize-row]').forEach(handle=>{
  handle.onpointerdown=e=>{
   if(e.button!==0)return;e.preventDefault();e.stopPropagation();
   const row=handle.closest('tr'),id=row.dataset.rowMember,start=e.clientY,from=row.getBoundingClientRect().height;
   document.body.classList.add('sheet-resizing-row');
   const move=ev=>{const height=Math.min(112,Math.max(32,Math.round(from+ev.clientY-start)));row.style.setProperty('--sheet-row-height',height+'px');sheetRowHeights.set(id,height)};
   const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);document.body.classList.remove('sheet-resizing-row')};
   window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
  };
 });
}
function gradeRowStatus(member,assessments){
 const applies=assessments.filter(a=>a.classIds.includes(member.classId));
 const entered=applies.filter(a=>getGrade(m,a.id,member.id)!==null).length;
 const changed=applies.some(a=>edited.has(`${a.id}|${member.id}`));
 return changed?`이번 작업 변경 · ${entered}/${applies.length}`:entered===0?'미입력':`${entered}/${applies.length} 입력`;
}
function updateGradeSummary(rows,assessments){
 const eligible=rows.reduce((sum,r)=>sum+assessments.filter(a=>a.classIds.includes(r.classId)).length,0);
 const entered=rows.reduce((sum,r)=>sum+assessments.filter(a=>a.classIds.includes(r.classId)&&getGrade(m,a.id,r.id)!==null).length,0);
 const label=`${rows.length}명 · ${entered}/${eligible}칸 입력`;
 if(assessments.length!==1){$('grade-summary').textContent=label;return;}
 const a=assessments[0],c=m.criteria.find(x=>x.assessmentId===a.id),level=getCriterionType(c)==='level',other=getCriterionType(c)==='other';
 const counted=rows.map(r=>a.classIds.includes(r.classId)?getGrade(m,a.id,r.id):null).filter(v=>v!==null);
 if(level)$('grade-summary').textContent=`${label} · ${c.levels.map(item=>`${item} ${counted.filter(v=>v===item).length}명`).join(' · ')}`;
 else $('grade-summary').textContent=`${label} · 평균 ${counted.length?(counted.reduce((x,y)=>x+y,0)/counted.length).toFixed(2):'—'}${other?` ${c.unit}`:'점'}`;
}
function spreadsheetColumnName(index){let value=index+1,result='';while(value){value--;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26);}return result;}
function renderGrades(){
 const pick=$('grade-assessment');
 pick.innerHTML=m.assessments.length?m.assessments.map(a=>`<option value="${h(a.id)}" ${a.id===selectedAssessment?'selected':''}>${h(a.subject)} · ${h(a.title)}</option>`).join(''):'<option value="">평가를 먼저 만들어주세요</option>';
 const subjectPick=$('grade-subject'),subjects=[...new Set(m.assessments.map(a=>a.subject))];
 if(selectedGradeSubject===undefined && m.assessments.length)selectedGradeSubject=m.assessments.find(a=>a.id===selectedAssessment)?.subject||m.assessments[0].subject;
 if(selectedGradeSubject&&!subjects.includes(selectedGradeSubject))selectedGradeSubject=subjects[0]||'';
 subjectPick.innerHTML=`<option value="">평가 하나씩 보기</option>`+subjects.map(sub=>`<option value="${h(sub)}" ${selectedGradeSubject===sub?'selected':''}>${h(sub)} · 평가 전체</option>`).join('');
 $('grade-assessment').closest('label').classList.toggle('hidden',Boolean(selectedGradeSubject));
 const assessments=displayAssessments(),tabs=$('class-tabs'),table=$('grade-rows'),thead=$('grade-table').querySelector('thead');
 gradeViewAssessments=assessments;
 if(!assessments.length){$('grade-toolbar-subject').textContent='과목 미선택';tabs.innerHTML='';table.innerHTML='<tr><td class="empty-state sheet-empty-row">선택된 평가가 없습니다.</td></tr>';gradeViewRows=[];$('grade-summary').textContent='';$('export-csv').disabled=true;$('grade-info').textContent='평가 관리에서 평가를 만들어주세요.';$('grade-guide').textContent='평가 생성 후 입력 가능합니다.';$('sheet-cell-info').textContent='셀을 선택하세요';return;}
 $('export-csv').disabled=false;
 const classIds=[...new Set(assessments.flatMap(a=>a.classIds))],classes=classIds.map(id=>m.classes.find(c=>c.id===id)).filter(Boolean);
 if(selectedGradeClass!=='all'&&!classIds.includes(selectedGradeClass))selectedGradeClass='all';
 tabs.innerHTML=[{id:'all',name:'전체'},...classes].map(c=>`<button type="button" role="tab" aria-selected="${selectedGradeClass===c.id?'true':'false'}" class="${selectedGradeClass===c.id?'active':''}" data-filter-class="${h(c.id)}">${h(c.name)}</button>`).join('');
 tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{selectedGradeClass=b.dataset.filterClass;renderGrades()});
 const first=assessments[0],subject=selectedGradeSubject;
 $('grade-info').textContent=subject?`${subject} · 평가 ${assessments.length}개를 나란히 입력 · 과목 내 단원별 독립 저장`:`${first.subject} · ${first.title}`;
 $('grade-toolbar-subject').textContent=subject?`${subject} · ${assessments.length}개 평가`:`${first.subject} · ${first.title}`;
 $('grade-guide').textContent='방향키: 상하좌우 셀 이동 · Tab: 오른쪽 · Enter: 아래쪽 · 드래그: 범위 선택 후 Ctrl/Cmd+C 복사'+(assessments.length>1&&!readOnlyYear?' · 평가 제목 끌기: 순서 바꾸기':'');
 const colHeaders=['학급','번호','학생 이름',...assessments.map(a=>a.title),'상태'];
 const details=['','','',...assessments.map(a=>{const c=m.criteria.find(x=>x.assessmentId===a.id);const type=getCriterionType(c);return type==='level'?`${c.levelCount}단계`:type==='other'?c.unit:`${c.maxScore}점`;}),''];
 const movable=i=>assessments.length>1&&!readOnlyYear&&i>=3&&i<3+assessments.length,moveAttr=i=>movable(i)?` class="sheet-movable" data-move-assessment="${h(assessments[i-3].id)}"`:'';
 thead.innerHTML=`<tr class="sheet-letters"><th class="sheet-corner" aria-hidden="true"></th>${colHeaders.map((label,i)=>`<th data-letter-col="${i}"${moveAttr(i)} title="${h(label)}${movable(i)?' · 끌어서 순서 바꾸기':''}">${spreadsheetColumnName(i)}<span class="sheet-resize" data-resize-col="${i}" title="드래그해 열 너비 변경"></span></th>`).join('')}</tr><tr class="sheet-labels"><th class="sheet-row-num">1</th>${colHeaders.map((label,i)=>`<th data-sheet-row="0" data-sheet-col="${i}"${moveAttr(i)} title="${h(label)}${details[i]?` · ${h(details[i])}`:''}${movable(i)?' · 끌어서 순서 바꾸기':''}">${h(label)}${details[i]?`<small class="grade-unit-hint">${h(details[i])}</small>`:''}</th>`).join('')}</tr>`;
 const rows=currentGradeRows(assessments);gradeViewRows=rows;
 table.innerHTML=rows.length?rows.map((r,i)=>{
  const cells=assessments.map((a,j)=>{
   if(!a.classIds.includes(r.classId))return `<td class="sheet-na-cell" data-sheet-row="${i+1}" data-sheet-col="${j+3}" title="이 학급에는 연결되지 않은 평가">—</td>`;
   const c=m.criteria.find(x=>x.assessmentId===a.id),type=getCriterionType(c),v=getGrade(m,a.id,r.id),key=`${a.id}|${r.id}`;
   const label=h(`${r.className} ${r.name} ${a.subject} ${a.title}`);
   const field=type==='level'?`<select class="grade-input ${edited.has(key)?'dirty':''}" aria-label="${label}" data-membership="${h(r.id)}" data-assessment="${h(a.id)}"><option value="">— 미입력 —</option>${c.levels.map(item=>`<option value="${h(item)}" ${v===item?'selected':''}>${h(item)}</option>`).join('')}</select>`:`<input class="grade-input ${edited.has(key)?'dirty':''}" inputmode="decimal" autocomplete="off" aria-label="${label}" data-membership="${h(r.id)}" data-assessment="${h(a.id)}" value="${v===null?'':h(v)}">${type==='other'?`<span class="unit-label sheet-unit">${h(c.unit)}</span>`:''}`;
   return `<td class="sheet-entry-cell" data-sheet-row="${i+1}" data-sheet-col="${j+3}">${field}</td>`;
  }).join('');
  return `<tr data-row-member="${h(r.id)}" style="--sheet-row-height:${sheetRowHeights.get(r.id)||42}px"><th scope="row" class="sheet-row-num">${i+2}<span class="sheet-row-resize" data-resize-row="${h(r.id)}" title="드래그해 행 높이 조절"></span></th><td data-sheet-row="${i+1}" data-sheet-col="0">${h(r.className)}</td><td data-sheet-row="${i+1}" data-sheet-col="1">${r.number}</td><td class="sheet-student-name" data-sheet-row="${i+1}" data-sheet-col="2" data-edit-member="${h(r.id)}" title="더블클릭: 이름 수정"><strong>${h(r.name)}</strong></td>${cells}<td class="sheet-state-cell" data-sheet-row="${i+1}" data-sheet-col="${assessments.length+3}"><span class="cell-tag">${h(gradeRowStatus(r,assessments))}</span></td></tr>`;
 }).join(''):'<tr><td class="empty-state sheet-empty-row">표시할 학생이 없습니다.</td></tr>';
 setSheetWidths(assessments);updateGradeSummary(rows,assessments);
 $('sheet-cell-info').textContent='결과 입력 셀을 선택하세요';installSheetColumnResizers(assessments);installSheetRowResizers();installSheetRangeCopy();installSheetColumnMove();installGradeNameEditors(rows);
 const inputs=[...table.querySelectorAll('.grade-input')];
 inputs.forEach((input,index)=>{
  const memberId=input.dataset.membership,assessmentId=input.dataset.assessment;
  const r=rows.find(x=>x.id===memberId),a=assessments.find(x=>x.id===assessmentId),key=`${assessmentId}|${memberId}`,col=assessments.indexOf(a);
  const isLevel=getCriterionType(m.criteria.find(x=>x.assessmentId===assessmentId))==='level';
  function refreshInfo(){$('sheet-cell-info').textContent=`${spreadsheetColumnName(3+col)}${rows.indexOf(r)+2} · ${r.className} ${r.number}번 ${r.name} · ${a.subject} ${a.title}`;}
  input.addEventListener('focus',()=>{refreshInfo();input.closest('tr')?.classList.add('sheet-focused-row')});
  input.addEventListener('blur',()=>input.closest('tr')?.classList.remove('sheet-focused-row'));
  input.addEventListener('input',()=>input.classList.remove('error'));
  function commit(){
   try{const before=getGrade(m,assessmentId,memberId),value=setGrade(m,assessmentId,memberId,input.value);
    input.classList.remove('error');if(before!==value){edited.add(key);markChanged();}
    input.classList.toggle('dirty',edited.has(key));input.closest('tr').querySelector('.cell-tag').textContent=gradeRowStatus(r,assessments);
    updateGradeSummary(rows,assessments);return true;
   }catch(e){input.classList.add('error');toast(e.message,true);return false;}
  }
  // Keep the same input element when changing one grade; otherwise the next click/Tab is lost.
  input.addEventListener('change',commit);
  input.addEventListener('keydown',e=>{
   const isArrow=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key);
   if(e.key==='Enter'||(isArrow&&!e.altKey&&!e.ctrlKey&&!e.metaKey)){
    e.preventDefault();if(!commit())return;
    const rowIndex=rows.indexOf(r),dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;
    const dy=e.key==='Enter'?(e.shiftKey?-1:1):e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
    let dest=null;
    if(dx){for(let j=col+dx;j>=0&&j<assessments.length;j+=dx){dest=table.querySelector(`.grade-input[data-assessment="${CSS.escape(assessments[j].id)}"][data-membership="${CSS.escape(memberId)}"]`);if(dest)break;}}
    if(dy){for(let i=rowIndex+dy;i>=0&&i<rows.length;i+=dy){dest=table.querySelector(`.grade-input[data-assessment="${CSS.escape(assessmentId)}"][data-membership="${CSS.escape(rows[i].id)}"]`);if(dest)break;}}
    if(dest){clearSheetRangeSelection();dest.focus();if(dest instanceof HTMLInputElement)dest.select();}return;
   }
   if(e.key==='Tab'&&!commit())e.preventDefault();
  });
  input.onpaste=e=>{
   const t=e.clipboardData?.getData('text/plain')||'';if(!t)return;
   e.preventDefault();pasteGradeText(t,rows.indexOf(r),col);
  };
  input.closest('.sheet-entry-cell').addEventListener('click',()=>{if(document.activeElement!==input){input.focus();if(input instanceof HTMLInputElement)input.select();}});
 });
}
// The browser scrolls a focused cell into the table's box but not clear of the sticky header, so the cell can stay hidden under it.
function revealSheetCell(input){
 const box=input.closest('.sheet-scroll'),cell=input.closest('td,th')||input;if(!box)return;
 const head=box.querySelector('thead')?.getBoundingClientRect().height||0,b=box.getBoundingClientRect(),c=cell.getBoundingClientRect();
 const top=b.top+box.clientTop+head,bottom=b.top+box.clientTop+box.clientHeight,left=b.left+box.clientLeft,right=left+box.clientWidth;
 if(c.top<top)box.scrollTop-=top-c.top;else if(c.bottom>bottom)box.scrollTop+=c.bottom-bottom;
 if(c.left<left)box.scrollLeft-=left-c.left;else if(c.right>right)box.scrollLeft+=c.right-right;
 box.scrollIntoView({block:'nearest',inline:'nearest'});
}
// Only keyboard moves scroll. A click, or the browser giving focus back when the window returns, must not move the sheet under the pointer.
let sheetKeyMove=false;
$('grade-table').addEventListener('keydown',e=>{sheetKeyMove=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Tab'].includes(e.key);},true);
$('grade-table').addEventListener('focusin',e=>{if(sheetKeyMove&&e.target.classList?.contains('grade-input'))revealSheetCell(e.target);sheetKeyMove=false;});
// Spreadsheet-style rectangular selection is COPY ONLY. It never writes grade values.
let sheetCopyRange=null;
let sheetCopyDrag=null;
function clearSheetRangeSelection(){
 sheetCopyRange=null;document.querySelectorAll('#grade-table .sheet-range-selected').forEach(el=>el.classList.remove('sheet-range-selected'));
}
function displaySheetRange(start,end){
 const lowR=Math.min(start.row,end.row),highR=Math.max(start.row,end.row);
 const lowC=Math.min(start.col,end.col),highC=Math.max(start.col,end.col);
 sheetCopyRange={lowR,highR,lowC,highC};
 $('grade-table').querySelectorAll('[data-sheet-row][data-sheet-col]').forEach(el=>{
  const r=Number(el.dataset.sheetRow),c=Number(el.dataset.sheetCol);
  el.classList.toggle('sheet-range-selected',r>=lowR&&r<=highR&&c>=lowC&&c<=highC);
 });
 $('sheet-cell-info').textContent=`${spreadsheetColumnName(lowC)}${lowR+1}:${spreadsheetColumnName(highC)}${highR+1} 선택 · Ctrl/Cmd+C 복사`;
}
function sheetCellText(row,col){
 if(row===0){const headers=['학급','번호','학생 이름',...gradeViewAssessments.map(a=>a.title),'상태'];return headers[col]||'';}
 const member=gradeViewRows[row-1];if(!member)return '';
 if(col===0)return member.className;
 if(col===1)return String(member.number);
 if(col===2)return member.name;
 if(col===gradeViewAssessments.length+3)return gradeRowStatus(member,gradeViewAssessments);
 const a=gradeViewAssessments[col-3];if(!a||!a.classIds.includes(member.classId))return '';
 return String(getGrade(m,a.id,member.id)??'');
}
function selectedSheetText(){
 if(!sheetCopyRange)return '';
 const {lowR,highR,lowC,highC}=sheetCopyRange,lines=[];
 for(let row=lowR;row<=highR;row++){
  const values=[];for(let col=lowC;col<=highC;col++)values.push(sheetCellText(row,col).replace(/[\t\r\n]+/g,' '));
  lines.push(values.join('\t'));
 }
 return lines.join('\r\n');
}
function installSheetRangeCopy(){
 const table=$('grade-table');clearSheetRangeSelection();
 if(table.dataset.rangeCopyBound)return;table.dataset.rangeCopyBound='true';
 const position=target=>{const el=target?.closest?.('[data-sheet-row][data-sheet-col]');return el&&table.contains(el)?{row:Number(el.dataset.sheetRow),col:Number(el.dataset.sheetCol)}:null;};
 table.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.pointerType==='touch'||e.target.closest('.sheet-resize,.sheet-row-resize,.sheet-rename-field,[data-move-assessment]'))return;
  const start=position(e.target);if(!start)return;
  clearSheetRangeSelection();sheetCopyDrag={start,last:start,startX:e.clientX,startY:e.clientY,active:false};
 });
 document.addEventListener('pointermove',e=>{
  const drag=sheetCopyDrag;if(!drag||!table.isConnected)return;
  if(!drag.active&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<7)return;
  const el=document.elementFromPoint(e.clientX,e.clientY),pos=position(el);
  if(!pos)return;
  if(pos.row!==drag.start.row||pos.col!==drag.start.col){drag.active=true;drag.last=pos;displaySheetRange(drag.start,pos);}
 });
 document.addEventListener('pointerup',()=>{sheetCopyDrag=null});
 document.addEventListener('pointercancel',()=>{sheetCopyDrag=null});
 table.addEventListener('copy',e=>{
  if(!sheetCopyRange||(sheetCopyRange.lowR===sheetCopyRange.highR&&sheetCopyRange.lowC===sheetCopyRange.highC))return;
  e.clipboardData?.setData('text/plain',selectedSheetText());e.preventDefault();toast('선택한 셀을 복사했습니다.');
 });
}
// Text copied from Excel or Google Sheets: tab-separated; a quoted cell may hold tabs, line breaks or "" quotes.
function parseSheetText(text){
 const grid=[[]];let cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=ch;continue;}
  if(ch==='"'&&cell==='')quoted=true;
  else if(ch==='\t'){grid.at(-1).push(cell);cell='';}
  else if(ch==='\n'){grid.at(-1).push(cell);cell='';grid.push([]);}
  else if(ch!=='\r')cell+=ch;
 }
 grid.at(-1).push(cell);
 while(grid.length&&grid.at(-1).every(v=>v.trim()===''))grid.pop();
 return grid;
}
// Spreadsheets often carry display text such as "95점", "1,200", full-width digits or a dash for an empty cell.
function cleanPastedValue(value,criterion){
 let v=String(value).replace(/[ 　]/g,' ').replace(/[０-９．]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xfee0)).trim();
 if(/^[-–—]$/.test(v))return '';
 const type=getCriterionType(criterion);if(type==='level')return v;
 v=v.replace(/\s+/g,'');if(/^\d{1,3}(,\d{3})+(\.\d+)?/.test(v))v=v.replace(/,/g,'');
 return type==='other'?v:v.replace(/점$/,'');
}
function pasteGradeText(text,startRow,startCol){
 const rows=gradeViewRows,assessments=gradeViewAssessments;
 const grid=parseSheetText(text);if(!grid.length)return;
 // Only score cells are written, in place from the chosen cell; names and titles are never read from the paste.
 const targets=[];let outside=0,blocked=0;
 grid.forEach((line,y)=>{const r=rows[startRow+y];if(r)targets.push({row:r,cells:line});else outside+=line.filter(v=>v.trim()).length;});
 const copy=structuredClone(m),changed=[],bad=[];
 targets.forEach(({row,cells})=>cells.forEach((raw,x)=>{
  const a=assessments[startCol+x];
  if(!a){if(raw.trim())outside++;return;}
  if(!a.classIds.includes(row.classId)){if(raw.trim())blocked++;return;}
  const c=copy.criteria.find(z=>z.assessmentId===a.id);
  try{const before=getGrade(copy,a.id,row.id),after=setGrade(copy,a.id,row.id,cleanPastedValue(raw,c));changed.push({key:`${a.id}|${row.id}`,same:before===after});}
  catch(err){bad.push({assessmentId:a.id,memberId:row.id,message:err.message});}
 }));
 const focusId=document.activeElement?.dataset?.assessment,focusMember=document.activeElement?.dataset?.membership;
 if(changed.length){m=copy;changed.forEach(v=>{if(!v.same)edited.add(v.key)});if(changed.some(v=>!v.same))markChanged();renderGrades();}
 const table=$('grade-rows'),cell=(aid,mid)=>table.querySelector(`.grade-input[data-assessment="${CSS.escape(aid)}"][data-membership="${CSS.escape(mid)}"]`);
 bad.forEach(v=>cell(v.assessmentId,v.memberId)?.classList.add('error'));
 if(focusId&&focusMember)cell(focusId,focusMember)?.focus();
 const notes=[];
 if(bad.length)notes.push(`형식이 맞지 않는 ${bad.length}칸은 그대로 둠(빨간 칸: ${bad[0].message})`);
 if(outside)notes.push(`표 밖으로 나가는 ${outside}칸 제외`);
 if(blocked)notes.push(`이 학급과 연결되지 않은 평가 ${blocked}칸 제외`);
 toast((changed.length?`${changed.length}칸을 붙여 넣었습니다.`:'붙여 넣은 칸이 없습니다.')+(notes.length?' '+notes.join(' · '):''),!changed.length||bad.length>0);
}
// Dragging a result column's header (letter or title) moves that assessment among the ones shown side by side.
let sheetColumnDrag=null;
function sheetColumnCells(col){return $('grade-table').querySelectorAll(`[data-sheet-col="${col}"],[data-letter-col="${col}"]`);}
function clearSheetColumnMarks(){$('grade-table').querySelectorAll('.sheet-col-dragging,.sheet-drop-before,.sheet-drop-after').forEach(el=>el.classList.remove('sheet-col-dragging','sheet-drop-before','sheet-drop-after'));}
function moveAssessmentOrder(order){
 const byId=new Map(m.assessments.map(a=>[a.id,a])),shown=new Set(order);let k=0;
 m.assessments=m.assessments.map(a=>shown.has(a.id)?byId.get(order[k++]):a);
 markChanged();render();toast('평가 순서를 바꿨습니다.');
}
function installSheetColumnMove(){
 const table=$('grade-table');if(table.dataset.columnMoveBound)return;table.dataset.columnMoveBound='true';
 table.addEventListener('pointerdown',e=>{
  const head=e.target.closest('[data-move-assessment]');
  if(!head||e.button!==0||readOnlyYear||e.target.closest('.sheet-resize'))return;
  const from=gradeViewAssessments.findIndex(a=>a.id===head.dataset.moveAssessment);if(from<0)return;
  e.preventDefault();clearSheetRangeSelection();sheetColumnDrag={from,to:null,startX:e.clientX,active:false};
 });
 document.addEventListener('pointermove',e=>{
  const drag=sheetColumnDrag;if(!drag||!table.isConnected)return;
  if(!drag.active){if(Math.abs(e.clientX-drag.startX)<7)return;drag.active=true;sheetColumnCells(drag.from+3).forEach(el=>el.classList.add('sheet-col-dragging'));}
  const heads=[...table.querySelectorAll('.sheet-labels [data-move-assessment]')];
  let to=heads.length;for(let i=0;i<heads.length;i++){const b=heads[i].getBoundingClientRect();if(e.clientX<b.left+b.width/2){to=i;break;}}
  drag.to=to;
  table.querySelectorAll('.sheet-drop-before,.sheet-drop-after').forEach(el=>el.classList.remove('sheet-drop-before','sheet-drop-after'));
  if(to!==drag.from&&to!==drag.from+1){if(to<heads.length)sheetColumnCells(to+3).forEach(el=>el.classList.add('sheet-drop-before'));else sheetColumnCells(heads.length+2).forEach(el=>el.classList.add('sheet-drop-after'));}
  const box=table.closest('.sheet-scroll'),b=box?.getBoundingClientRect();
  if(b){if(e.clientX<b.left+40)box.scrollLeft-=14;else if(e.clientX>b.right-40)box.scrollLeft+=14;}
 });
 document.addEventListener('pointerup',()=>{
  const drag=sheetColumnDrag;sheetColumnDrag=null;clearSheetColumnMarks();if(!drag?.active||drag.to===null)return;
  const to=drag.to>drag.from?drag.to-1:drag.to;if(to===drag.from)return;
  const order=gradeViewAssessments.map(a=>a.id);order.splice(to,0,order.splice(drag.from,1)[0]);moveAssessmentOrder(order);
 });
 document.addEventListener('pointercancel',()=>{sheetColumnDrag=null;clearSheetColumnMarks();});
}
function installGradeNameEditors(rows){return; // STAGE03: names are edited ONLY by the Seating host.

 $('grade-rows').querySelectorAll('[data-edit-member]').forEach(cell=>cell.addEventListener('dblclick',()=>{
  if(cell.querySelector('input'))return;
  clearSheetRangeSelection();const id=cell.dataset.editMember,student=rows.find(r=>r.id===id);if(!student)return;
  const original=student.name,field=document.createElement('input');field.className='sheet-rename-field';field.type='text';field.maxLength=50;field.value=original;field.setAttribute('aria-label',`${student.className} ${student.number}번 학생 이름 수정`);
  cell.replaceChildren(field);field.focus();field.select();let finished=false;
  function done(save){if(finished)return;finished=true;
   if(save&&field.value.trim()!==original){try{
    renameStudent(m,id,field.value);markChanged();render();
    const duplicated=roster(m,student.classId).filter(x=>x.name===field.value.trim()).length>1;
    toast(duplicated?'이름을 바꿨습니다. 동명이인은 자리배치 아바타 자동 연결을 확인하세요.':'학생 이름을 수정했습니다. 기존 성적은 그대로 유지됩니다.');
   }catch(err){cell.replaceChildren(document.createElement('strong'));cell.firstChild.textContent=original;toast(err.message,true);}return;}
   cell.replaceChildren(document.createElement('strong'));cell.firstChild.textContent=original;
  }
  field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();done(true)}else if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Tab'){done(true)}});
  field.addEventListener('blur',()=>done(true));
 }));
}

function exportGradeViewCsv(){
 const assessments=gradeViewAssessments,rows=gradeViewRows;
 const quote=v=>`"${String(v??'').replace(/"/g,'""')}"`;
 const header=['학급','번호','학생 이름',...assessments.map(a=>`${a.subject} · ${a.title}`)];
 return [header.map(quote).join(','),...rows.map(r=>[r.className,r.number,r.name,...assessments.map(a=>a.classIds.includes(r.classId)?getGrade(m,a.id,r.id):'')].map(quote).join(','))].join('\r\n');
}

function updateType(){
 const type=document.querySelector('input[name="gradeType"]:checked')?.value||'score';
 for(const [name,id] of [['score','score-settings'],['level','level-settings'],['other','other-settings']]){
  const section=$(id),active=type===name;section.classList.toggle('hidden',!active);
  for(const el of section.querySelectorAll('input,select'))el.disabled=!active;
 }
 const n=Number($('level-count').value);$('level-options-preview').innerHTML=(LEVEL_SETS[n]||[]).map(x=>`<span class="level-chip">${h(x)}</span>`).join('');
}
const dockGuide={
 overview:['대시보드','학급과 평가를 한눈에 확인합니다. 먼저 학급을 만든 뒤 학생과 평가를 등록해 주세요.','학급 만들기로 이동 →','classes'],
 classes:['학급 · 학생명단','한 학급씩 만들고 학생 이름을 등록합니다. 여러 이름을 줄바꿈해서 한 번에 등록할 수도 있습니다.','평가 관리로 이동 →','assessments'],
 assessments:['평가 관리','점수·3/4/5단계·기타 단위 기록형 중 하나를 선택합니다. 평가 한 개를 여러 학급에 연결할 수 있습니다.','성적 입력으로 이동 →','grades'],
 grades:['성적 입력','점수·기타 기록은 숫자로, 단계 평가는 목록에서 선택합니다. 전체 학급과 각 반을 전환하며 확인합니다.','평가 관리로 이동 →','assessments']
};
function updateDock(){
 const d=dockGuide[page];$('dock-heading').textContent=d[0];$('dock-help').textContent=d[1];$('dock-next').textContent=d[2];$('dock-next').dataset.go=d[3];
 $('dock-stat').textContent=`학급 ${m.classes.length}개 · 평가 ${m.assessments.length}개`;
 $('dock-description').textContent=`등록 학생 ${m.memberships.filter(x=>x.active).length}명 · 입력 결과 ${m.gradeValues.filter(v=>v.value!==null).length}건`;
 const tabRow=document.querySelector('.tool-dock .dock-tabs');
 const leavingOverview=tabRow.classList.contains('tt-dashboard-data-only');
 if(page==='overview'){
  // Dashboard is a status overview; all class creation/editing lives in host '반 관리'.
  tabRow.classList.add('tt-dashboard-data-only');
  tabRow.querySelectorAll('[data-dock]').forEach(button=>button.classList.toggle('hidden',button.dataset.dock!=='data'));
  activateDock('data');
  return;
 }
 tabRow.classList.remove('tt-dashboard-data-only');
 document.querySelector('[data-dock="classes"]').classList.toggle('hidden',page!=='classes');
 document.querySelector('[data-dock="grades"]').classList.toggle('hidden',page!=='grades');
 document.querySelector('[data-dock="guide"]').classList.toggle('hidden',page==='grades');
 document.querySelector('[data-dock="data"]').classList.remove('hidden');
 if(page==='classes')activateDock('classes');
 else if(page==='grades' && (leavingOverview||!['grades','cloud','data'].includes(document.querySelector('.dock-tab.on')?.dataset.dock)))activateDock('grades');
 else if(page==='assessments' && leavingOverview)activateDock('guide');
 else if(page!=='grades' && ['grades','classes'].includes(document.querySelector('.dock-tab.on')?.dataset.dock))activateDock('guide');
}
function activateDock(name){document.querySelectorAll('.dock-tab').forEach(b=>b.classList.toggle('on',b.dataset.dock===name));document.querySelectorAll('[data-dock-panel]').forEach(x=>x.classList.toggle('hidden',x.dataset.dockPanel!==name));}
const SEATING_STORAGE_KEY='teacher-tools.seating.state.v1';
const SEATING_ASSET_BASE='../../shared/assets/students/';
const SEATING_GLASSES_URL='../../shared/assets/teacher/glasses_02.png';
const GLASSES_COLORS={black:[45,48,54],brown:[112,67,42],navy:[45,70,110],pink:[196,79,112],gray:[105,112,122]};
const glassesData=new Map();let glassesBusy=false;
function applyGlasses(){document.querySelectorAll('[data-glasses]').forEach(el=>{const id=el.dataset.glasses;if(id==='none')return;const src=id==='red'?SEATING_GLASSES_URL:glassesData.get(id);if(src){el.style.setProperty('--glasses-src',`url('${src}')`);el.classList.add('with-glasses');}});}
function prepareGlasses(){if(glassesBusy||glassesData.size)return;glassesBusy=true;
 const img=new Image();img.crossOrigin='anonymous';
 img.onload=()=>{try{const cv=document.createElement('canvas');cv.width=96;cv.height=128;const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const original=ctx.getImageData(0,0,96,128);
 for(const [id,color] of Object.entries(GLASSES_COLORS)){const pixels=new ImageData(new Uint8ClampedArray(original.data),96,128),d=pixels.data;const [tr,tg,tb]=color;
 for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const [r,g,b]=[d[i],d[i+1],d[i+2]];if(!(r>g*1.28&&r>b*1.28&&r-g>24&&r-b>24))continue;const lum=(r+g+b)/765,f=.70+lum*.38;d[i]=Math.min(255,tr*f);d[i+1]=Math.min(255,tg*f);d[i+2]=Math.min(255,tb*f);}
 ctx.putImageData(pixels,0,0);glassesData.set(id,cv.toDataURL('image/png'));}
 applyGlasses();}catch{ /* CORS 환경 제한 시 미리보기에서 안경 오버레이를 생략 */ }};
 img.onerror=()=>{};img.src=SEATING_GLASSES_URL;
}
function avatarHtml(member) {
 const student=m.students.find(x=>x.id===member.studentId),v=student?.seatingLink?.visual;
 if(v){const source=SEATING_ASSET_BASE+[v.character,v.hair,v.outfit].join('_')+'.png';
  return `<span class="roster-avatar" aria-hidden="true"><span class="roster-avatar-fallback">${h(member.name.slice(0,1))}</span><span class="roster-avatar-sprite" data-sprite-url="${h(source)}" data-glasses="${h(v.glasses||'none')}" style="background-image:url('${source}')"></span></span>`;}
 return `<span class="roster-avatar avatar-unlinked" aria-label="아바타 미연결"><span>${h(member.name.slice(0,1))}</span></span>`;
}
function renderStudentStrip(){
 const outer=$('student-strip'),isOverview=page==='overview';outer.classList.toggle('hidden',isOverview);
 const showStrip=page==='grades'?gradeStripOpen:stripOpen;
 document.querySelector('.studio').classList.toggle('strip-collapsed',!isOverview&&!showStrip);
 if(isOverview){$('student-cards').innerHTML='';return;}
 $('strip-toggle').querySelector('span').textContent=showStrip?'▼':'▲';$('strip-toggle').setAttribute('aria-label',showStrip?'학생 목록 접기':'학생 목록 펼치기');$('strip-toggle').setAttribute('title',showStrip?'학생 목록 접기':'학생 목록 펼치기');$('strip-toggle').setAttribute('aria-expanded',String(showStrip));
 const classOptions=m.classes.map(c=>`<option value="${h(c.id)}" ${selectedClass===c.id?'selected':''}>${h(c.name)}</option>`).join('');
 $('strip-class').innerHTML=classOptions||'<option value="">학급 없음</option>';
 const list=selectedClass?roster(m,selectedClass):[];
 $('strip-summary').textContent=m.classes.find(x=>x.id===selectedClass)?.name?`${m.classes.find(x=>x.id===selectedClass).name} · 전체 ${list.length}명 · 남 ${list.filter(r=>m.students.find(x=>x.id===r.studentId)?.seatingLink?.gender==='male').length}명 · 여 ${list.filter(r=>m.students.find(x=>x.id===r.studentId)?.seatingLink?.gender==='female').length}명 · 미지정 ${list.filter(r=>!['male','female'].includes(m.students.find(x=>x.id===r.studentId)?.seatingLink?.gender)).length}명`:'학급을 선택하세요';
 $('student-cards').innerHTML=list.length?list.map(r=>`<button type="button" class="student-avatar-card gender-${m.students.find(x=>x.id===r.studentId)?.seatingLink?.gender||'none'} ${selectedMemberId===r.id?'selected':''}" data-person="${h(r.id)}" aria-label="${h(r.name)} 개인 평가 기록 보기">${avatarHtml(r)}<span class="student-avatar-name">${h(r.name)}</span><small>${m.students.find(x=>x.id===r.studentId)?.seatingLink?.gender==='male'?'남':m.students.find(x=>x.id===r.studentId)?.seatingLink?.gender==='female'?'여':'미지정'}</small></button>`).join(''):'<div class="student-strip-empty">이 반에 등록된 학생이 없습니다.</div>';
 $('student-cards').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>showStudent(b.dataset.person));
 $('student-cards').querySelectorAll('[data-sprite-url]').forEach(el=>{const asset=new Image();asset.onload=()=>el.parentElement?.classList.add('asset-loaded');asset.onerror=()=>el.parentElement?.classList.remove('asset-loaded');asset.src=el.dataset.spriteUrl;});applyGlasses();prepareGlasses();
}
const statusText={no_comparable_assessments:'비교 가능한 평가 없음',incomplete:'평가 미입력',insufficient:'완료 학생 5명 미만',constant:'비교 대상 점수 동일'};
function zDisplay(z){return `${z>0?'+':''}${z.toFixed(2)}`;}
function normalCurve(z,compact=false){
 const width=compact?322:560,height=compact?95:167;
 const pad=compact?23:46,baseline=compact?70:128,amplitude=compact?48:92;
 const x=val=>pad+(Math.max(-3.2,Math.min(3.2,val))+3.2)/6.4*(width-2*pad);
 const y=val=>baseline-Math.exp(-val*val/2)*amplitude;
 const path=Array.from({length:129},(_,i)=>{const u=-3.2+i*.05;return `${i?'L':'M'}${x(u).toFixed(2)},${y(u).toFixed(2)}`}).join(' ');
 const ticks=[-2,0,2].map(v=>`<line x1="${x(v)}" y1="${baseline+2}" x2="${x(v)}" y2="${baseline+6}" stroke="#94a3b8"/><text x="${x(v)}" y="${baseline+17}" text-anchor="middle" font-size="${compact?11:12}" fill="#64748b">${v>0?'+':''}${v}</text>`).join('');
 const mark=z===null?'':`<line x1="${x(z)}" y1="${y(z)}" x2="${x(z)}" y2="${baseline}" stroke="#2563eb" stroke-width="${compact?1.7:2}" stroke-dasharray="4 3"/><circle cx="${x(z)}" cy="${y(z)}" r="${compact?5.2:7}" fill="#2563eb" stroke="white" stroke-width="2.5"/>`;
 return `<svg class="${compact?'normal-mini':'normal-large'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="정규분포 참고 곡선${z===null?', 계산된 위치 없음':`, 학생 표준점수 ${zDisplay(z)}`} (표시 범위 -3.2에서 +3.2)"><line x1="${pad}" y1="${baseline}" x2="${width-pad}" y2="${baseline}" stroke="#cbd5e1"/><line x1="${x(0)}" y1="${y(0)}" x2="${x(0)}" y2="${baseline}" stroke="#e2e8f0" stroke-dasharray="3 3"/><path d="${path}" fill="none" stroke="#64748b" stroke-width="${compact?2:2.8}" stroke-linecap="round"/>${mark}${ticks}</svg>`;
}
function renderPersonalView(){
 if(!selectedMemberId)return;
 const dashboard=buildStudentSubjectDashboard(m,selectedMemberId);
 if(!dashboard){selectedMemberId=null;$('student-detail').classList.add('hidden');return;}
 const subject=dashboard.subjects.find(v=>v.name===selectedPersonalSubject);
 $('personal-name').textContent=dashboard.name;
 $('personal-meta').textContent=`${dashboard.className} · ${dashboard.number}번 · ${dashboard.subjects.length}개 과목`;
 $('personal-back').classList.toggle('hidden',!subject);
 const count=dashboard.subjects.reduce((n,v)=>n+v.completed,0),total=dashboard.subjects.reduce((n,v)=>n+v.total,0);
 if(!subject){
  $('personal-summary').innerHTML=`<article><small>평가 과목</small><strong>${dashboard.subjects.length}</strong></article><article><small>입력 완료</small><strong>${count} / ${total}</strong></article><article><small>표준점수 계산 완료</small><strong>${dashboard.subjects.filter(v=>v.z!==null).length}</strong></article>`;
  $('personal-ability').innerHTML=`<div class="personal-section-heading"><h3>과목별 표준점수</h3><span>과목 카드를 눌러 단원별 상세 결과 보기</span></div><div class="personal-subject-list">${dashboard.subjects.map(v=>`<button type="button" class="personal-subject-card" data-personal-subject="${h(v.name)}"><div class="personal-subject-top"><strong>${h(v.name)}</strong><span class="personal-subject-score">${v.z!==null?`${zDisplay(v.z)} <small>Z</small>`:'—'}</span></div>${normalCurve(v.z,true)}<div class="personal-subject-meta"><span>${v.z===null?h(statusText[v.status]||'계산 불가'):'학급 내 상대 위치'}</span><span>${v.completed}/${v.total}개 평가 입력 · 상세 →</span></div></button>`).join('')||'<div class="personal-no-data">연결된 평가 과목이 없습니다.</div>'}</div>`;
  $('personal-results').innerHTML='<p class="personal-method-note">정규분포 곡선은 학생의 Z점수를 읽기 위한 참고 그림입니다. 실제 학급 점수 분포가 정규분포라는 뜻은 아닙니다. 과목 점수는 비교 가능한 단원별 Z점수 평균을 같은 반에서 다시 표준화합니다. 누락된 기록은 0점으로 처리하지 않습니다.</p>';
  $('personal-ability').querySelectorAll('[data-personal-subject]').forEach(b=>b.onclick=()=>{selectedPersonalSubject=b.dataset.personalSubject;renderPersonalView();$('student-detail').scrollTop=0;});
 }else{
  $('personal-summary').innerHTML='';
  $('personal-ability').innerHTML=`<div class="personal-detail-heading"><div><small>과목 상세 결과</small><h3>${h(subject.name)}</h3><p>표준점수: <strong>${subject.z===null?'계산 불가':zDisplay(subject.z)+' Z'}</strong> · ${subject.z===null?h(statusText[subject.status]||'입력 확인 필요'):`완료 학생 ${subject.peerCount}명 기준`}</p></div>${normalCurve(subject.z)}</div>`;
  $('personal-results').innerHTML=`<div class="personal-section-heading"><h3>단원별 원점수와 표준점수</h3><span>${subject.completed}/${subject.total}개 입력</span></div><table class="personal-table"><thead><tr><th>평가 / 단원</th><th>평가 기준</th><th>원점수 · 기록</th><th>표준점수 (Z)</th></tr></thead><tbody>${subject.details.map(v=>`<tr><td><strong>${h(v.title)}</strong></td><td>${h(v.criterion||'—')}</td><td>${h(v.display)}</td><td><strong>${v.z!==null?zDisplay(v.z):'—'}</strong>${v.z===null?`<small>${h(!v.completed?'미입력':v.status==='insufficient'?'표본 5명 미만':v.status==='constant'?'같은 기록':v.status==='needs_direction'?'기록 방향 미설정':'계산 불가')}</small>`:''}</td></tr>`).join('')}</tbody></table>`;
 }
 $('student-detail').classList.remove('hidden');
}
function showStudent(memberId){
 if(page==='overview')return;
 selectedMemberId=memberId;selectedPersonalSubject=null;
 renderPersonalView();renderStudentStrip();$('student-detail').scrollTop=0;
}
$('personal-back').onclick=()=>{selectedPersonalSubject=null;renderPersonalView();$('student-detail').scrollTop=0;};
$('close-student-detail').onclick=()=>{selectedMemberId=null;selectedPersonalSubject=null;$('student-detail').classList.add('hidden');renderStudentStrip()};
$('strip-toggle').onclick=()=>{if(page==='grades')gradeStripOpen=!gradeStripOpen;else stripOpen=!stripOpen;$('student-detail').classList.add('hidden');selectedMemberId=null;renderStudentStrip()};
$('strip-class').onchange=e=>{selectedClass=e.target.value;selectedMemberId=null;$('student-detail').classList.add('hidden');renderClasses();renderStudentStrip()};
function applySeating(source){
 const seat=extractSeatingRoster(source),current=m.classes.find(c=>c.id===selectedClass);if(!current)throw Error('먼저 학급을 선택하세요.');
 if(seat.className!==current.name&&!confirm(`자리배치 학급: ${seat.className}\n현재 학급: ${current.name}\n\n반 이름이 다릅니다. 현재 학급에서 이름이 유일하게 일치하는 학생의 아바타만 연결할까요?`))return;
 const result=connectSeatingProfiles(m,selectedClass,seat);
 if(result.linked){markChanged();render();}
 $('seating-link-status').textContent=`${result.linked}명 연결 · ${result.skipped}명 건너뜀 (동명이인·이름 불일치·아바타 누락)`;
 toast(`${result.linked}명의 자리배치 아바타 정보를 연결했습니다.`);
}
$('connect-seating-same-origin').onclick=()=>{try{const raw=localStorage.getItem(SEATING_STORAGE_KEY);if(!raw)throw Error('현재 주소의 브라우저 저장소에 자리배치 명단이 없습니다. 자리배치 JSON 백업을 선택해 주세요.');applySeating(raw);}catch(e){toast(e.message,true)}};
$('connect-seating-backup').onclick=()=>$('seating-backup-file').click();
$('seating-backup-file').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>10*1024*1024)throw Error('자리배치 백업 파일이 10MB를 초과합니다.');applySeating(await file.text());}catch(err){toast(err.message,true)}};
function waitToSave(){clearTimeout(timer);return writeDraft(draftKey(),m).then(()=>{$('draft-state').textContent='● 이 기기에 임시 보관됨';},()=>{$('draft-state').textContent='⚠ 임시 보관 실패';});}
async function loadYear(y){
 clearTimeout(timer);year=Number(y);m=fresh(year);
 if(cloudMode){
  cloud.switchYear(year);cloudFileKey=null;cloudDirty=false;cloudCandidates=[];cloudLookupState='idle';edited.clear();
  selectedClass=null;selectedAssessment=null;selectedGradeClass='all';selectedMemberId=null;
  $('student-detail').classList.add('hidden');$('draft-state').textContent='○ 기존 학년도 파일을 확인하는 중';render();
  await refreshYearFiles();return;
 }
 try{const draft=stage03InstallId?await loadDraft(draftKey()):null;if(draft){validateWorkspace(draft);m=draft;$('draft-state').textContent='● 이 기기에 임시 보관됨';}else $('draft-state').textContent='○ 로컬 작업 공간';}catch(e){$('draft-state').textContent='⚠ 임시 보관 사용 불가';}
 selectedClass=null;selectedAssessment=null;selectedGradeClass='all';selectedMemberId=null;$('student-detail').classList.add('hidden');edited.clear();render();
}
for(let y=schoolYear()-2;y<=schoolYear()+3;y++){const opt=document.createElement('option');opt.value=String(y);opt.textContent=y+'학년도';if(y===year)opt.selected=true;$('year').append(opt)}
$('year').onchange=async()=>{toast('지금은 이번 학년도만 볼 수 있습니다.',true);$('year').value=String(year);return;if(cloudOpBusy||cloud.busy){toast('Google 파일 확인 또는 저장 작업이 끝난 뒤 학년도를 바꿔 주세요.',true);$('year').value=String(year);return;}if(cloudMode&&cloudDirty){toast('먼저 현재 작업을 Sheets에 저장하거나 JSON 백업으로 보관해 주세요.',true);$('year').value=String(year);return;}await waitToSave().catch(()=>{});await loadYear($('year').value)};
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>go(b.dataset.page));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('dock-next').onclick=()=>go($('dock-next').dataset.go);document.querySelectorAll('.dock-tab').forEach(b=>b.onclick=()=>activateDock(b.dataset.dock));document.querySelectorAll('input[name="gradeType"]').forEach(i=>i.onchange=updateType);$('level-count').onchange=updateType;updateType();
$('class-form').onsubmit=e=>{e.preventDefault();if(true){toast('학생과 학급은 자리배치 메뉴에서만 수정합니다.',true);return;}try{const c=addClass(m,$('new-class').value);selectedClass=c.id;$('new-class').value='';markChanged();render();toast('새 학급이 등록되었습니다.')}catch(x){toast(x.message,true)}};
$('assessment-form').onsubmit=e=>{e.preventDefault();try{const c=new BroadcastChannel('tt-classroom-changes');c.postMessage({important:true});c.close()}catch{};const form=e.currentTarget;const fd=new FormData(form);try{const gradeType=fd.get('gradeType');if(gradeType==='other'&&!['higher','lower'].includes(fd.get('recordDirection')))throw Error('기타 기록의 우수 방향을 선택해 주세요.');const a=addAssessment(m,{title:fd.get('title'),subject:fd.get('subject'),gradeType,criterion:gradeType==='level'?fd.get('criterionLevel'):gradeType==='other'?fd.get('criterionOther'):fd.get('criterionScore'),unit:fd.get('recordUnit'),recordDirection:fd.get('recordDirection'),levelCount:fd.get('levelCount'),maxScore:fd.get('maxScore'),classIds:fd.getAll('targetClass')});selectedAssessment=a.id;selectedGradeClass='all';markChanged();form.reset();updateType();render();toast('평가를 생성했습니다.')}catch(x){toast(x.message,true)}};
$('grade-subject').onchange=e=>{selectedGradeSubject=e.target.value;selectedGradeClass='all';renderGrades()};$('grade-assessment').onchange=e=>{selectedAssessment=e.target.value;selectedGradeSubject='';selectedGradeClass='all';renderGrades()};$('student-search').oninput=e=>{filter=e.target.value.trim();renderGrades()};
$('export-seating-metrics').onclick=()=>{try{const data=createSeatingMetricsExport(m);download(`classroom_${year}_SEATING_METRICS.json`,JSON.stringify(data,null,2),'application/json;charset=utf-8');toast('자리배치용 상대평가 자료를 내려받았습니다. 학생 ID 연결과 5축 선택은 자리배치에서 진행합니다.')}catch(e){toast(e.message,true)}};
$('export-json').onclick=()=>{try{validateWorkspace(m);download(`classroom_${year}_LOCAL_BACKUP.json`,JSON.stringify(m,null,2),'application/json;charset=utf-8');toast('JSON 백업을 내려받았습니다. Google Sheets 저장과 별개입니다.')}catch(x){toast(x.message,true)}};
$('export-csv').onclick=()=>{try{download(`grades_${year}.csv`,'\uFEFF'+exportGradeViewCsv(),'text/csv;charset=utf-8');toast('CSV 내보내기 완료')}catch(x){toast(x.message,true)}};
$('import-json').onclick=()=>{toast('통합 테스트의 JSON 가져오기는 비활성화했습니다.',true);return;if(cloudMode){toast('Google 계정 연결 중에는 출처가 확인되지 않은 JSON 백업의 덮어쓰기를 차단합니다. 로컬 모드에서 백업을 먼저 검토하세요.',true);return;}$('json-file').click()};$('json-file').onchange=async e=>{if(cloudMode){e.target.value='';toast('Google 연결 중 외부 JSON 복원 차단',true);return;}const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5e6)throw Error('백업 용량이 너무 큽니다.');const text=await file.text();const next=restoreWorkspace(text,year);if(!confirm(`현재 ${year}학년도 작업공간을 이 백업 내용으로 교체할까요? 이 기기에서만 변경되며 Google Sheets에는 영향을 주지 않습니다.`))return;m=next;selectedClass=null;selectedAssessment=null;selectedMemberId=null;$('student-detail').classList.add('hidden');edited.clear();markChanged();render();toast('백업을 작업공간에 불러왔습니다.')}catch(x){toast('백업 불러오기 실패: '+x.message,true)}};
$('load-sample').onclick=()=>{toast('가상 예시로 공통 명단을 교체할 수 없습니다.',true);return;if(cloudMode){toast('Google 연결 중에는 가상 예시 데이터로 전체 작업공간을 교체할 수 없습니다. 로그아웃 후 로컬에서 확인하세요.',true);return;}if(m.classes.length||m.assessments.length){if(!confirm('현재 학년도 작업공간을 예시 데이터로 교체할까요? 기존 데이터는 JSON 백업 후 진행하세요.'))return;}m=sample(year);selectedClass=null;selectedAssessment=null;selectedMemberId=null;$('student-detail').classList.add('hidden');edited.clear();markChanged();render();toast('가상 학생 20명과 다학급 평가를 불러왔습니다.')};
$('reset').onclick=async()=>{toast('통합 테스트에서는 초기화를 차단합니다.',true);return;if(cloudMode){toast('Google 연결 중에는 학년도 초기화를 사용할 수 없습니다. 먼저 JSON 백업을 저장하고 Google 파일에서 관리해 주세요.',true);return;}if(!confirm(`${year}학년도 이 기기의 작업공간을 초기화할까요? 삭제 전 JSON 백업을 권장합니다.`))return;try{await deleteDraft(year);m=fresh(year);edited.clear();selectedClass=null;selectedAssessment=null;selectedMemberId=null;$('student-detail').classList.add('hidden');$('draft-state').textContent='○ 로컬 작업 공간';render();toast('현재 학년도 작업공간을 초기화했습니다.')}catch(x){toast('초기화 실패: '+x.message,true)}};
// Product Google integration: explicit teacher sign-in + owned app-managed workbook only.
function updateCloudUI(){
 const user=cloud.user,connected=Boolean(cloud.active),ok=cloud.available();
 $('cloud-user').textContent=user?user.email:'Google 로그인 필요';
 const statusText={idle:'연결된 Google Sheets 파일 없음',searching:`${year}학년도 기존 파일 검색 중…`,ready:cloudCandidates.length?`${year}학년도 파일 ${cloudCandidates.length}개 발견`:`${year}학년도 앱 연결 파일 없음`,error:'기존 파일 검색 실패 · 새 파일 생성 차단',connected:'Google Sheets 연결됨'};
 $('cloud-file').textContent=connected?`연결됨 · ${cloud.active.id.slice(0,6)}… · ${cloud.active.year}학년도`:statusText[cloudLookupState];
 const sdkReady=Boolean(globalThis.google?.accounts?.oauth2);
 $('cloud-login').textContent=user?'계정 연결됨':sdkReady?'Google 로그인':'Google 로그인 준비 중…';
 $('cloud-login').disabled=Boolean(user)||cloudOpBusy||!sdkReady;
 $('cloud-find').disabled=!ok||cloudOpBusy||cloud.busy||cloudDirty;
 $('cloud-create').disabled=!ok||cloudOpBusy||cloud.busy||connected||cloudLookupState!=='ready'||cloudCandidates.length!==0;
 $('cloud-picker').disabled=!ok||cloudOpBusy||cloud.busy||connected;
 $('cloud-reload').disabled=!ok||cloudOpBusy||!connected||cloudDirty;
 $('cloud-recover').disabled=!ok||cloudOpBusy||!cloud.lastFileId||connected;
 $('cloud-logout').disabled=!user||cloudOpBusy||cloud.busy;
 $('cloud-save').disabled=!ok||cloudOpBusy||!connected||!cloudDirty||cloud.busy;
 const box=$('cloud-candidates');
 if(!box)return;
 box.classList.toggle('hidden',!ok||connected||cloudLookupState!=='ready'||cloudCandidates.length===0);
 if(cloudLookupState!=='ready'||!cloudCandidates.length){box.innerHTML='';return;}
 box.innerHTML=`<strong>${cloudCandidates.length>1?'동일 학년도 파일이 여러 개 있습니다. 사용할 원본을 선택하세요.':'기존 학년도 파일'}</strong><small>새 파일은 만들지 않습니다. 생성일·파일 식별자를 보고 기존 파일을 확인하세요.</small>${cloudCandidates.map((f,i)=>`<button type="button" class="ghost full candidate-file" data-file-id="${h(f.id)}">${h(f.name)} · ${f.createdTime?h(new Date(f.createdTime).toLocaleDateString('ko-KR')):'생성일 미확인'} · …${h(f.id.slice(-6))}</button>`).join('')}`;
 box.querySelectorAll('[data-file-id]').forEach(b=>b.onclick=()=>void openYearCandidate(b.dataset.fileId));
}
async function openYearCandidate(id){
 if(cloudOpBusy||cloud.busy||cloudDirty||cloud.active)return;
 if(!cloudCandidates.some(f=>f.id===id)){toast('선택 가능한 현재 학년도 파일이 아닙니다.',true);return;}
 cloudOpBusy=true;updateCloudUI();
 try{const result=await cloud.open(id,year);applyCloudWorkspace(result.workspace,result.id);toast('선택한 기존 학년도 시트를 연결했습니다.');}
 catch(e){toast(`파일 연결 실패: ${e.message}`,true);}
 finally{cloudOpBusy=false;updateCloudUI();}
}
async function refreshYearFiles(){
 if(!cloud.available()||cloud.busy||cloudOpBusy)return;
 const searchSerial=++cloudLookupSerial, targetYear=year,sub=cloud.user.sub;
 cloudOpBusy=true;cloudLookupState='searching';cloudCandidates=[];updateCloudUI();
 try{
  const files=await cloud.findYearFiles(targetYear);
  if(searchSerial!==cloudLookupSerial||targetYear!==year||sub!==cloud.user?.sub)return;
  cloudCandidates=files;cloudLookupState='ready';
  const chosen=files.length===1?files[0]:files.find(f=>f.id===cloud.preferredYearFile(targetYear));
  if(chosen){
   const result=await cloud.open(chosen.id,targetYear);
   if(searchSerial!==cloudLookupSerial||targetYear!==year||sub!==cloud.user?.sub)return;
   applyCloudWorkspace(result.workspace,result.id);
   cloudLookupState='connected';
   toast(`${targetYear}학년도 기존 시트를 다시 연결했습니다.`);
  }else if(files.length>1){
   $('draft-state').textContent='⚠ 중복 학년도 파일 발견 · 원본 선택 필요';
   toast(`${targetYear}학년도 파일 ${files.length}개 발견. 새 파일을 만들지 않고 선택을 기다립니다.`,true);
  }else $('draft-state').textContent='○ 기존 파일 없음 · 새 파일 생성 가능';
 }catch(e){
  if(searchSerial===cloudLookupSerial){cloudLookupState='error';$('draft-state').textContent='⚠ 기존 파일 검색 실패 · 생성 차단';toast(`Drive 검색 실패: ${e.message} · 새 파일을 만들지 마세요.`,true);}
 }finally{cloudOpBusy=false;updateCloudUI();}
}
function ensureNotLosingWork(){
 if(cloudDirty)throw Error('저장되지 않은 변경이 있습니다. Sheets 저장 또는 JSON 백업 후 진행하세요.');
}
function applyCloudWorkspace(remote,id){
 cloudMode=true;cloudFileKey=`cloud:${cloud.user.sub}:${year}:${id}`;cloudDirty=false;
 m=remote;edited.clear();selectedClass=null;selectedAssessment=null;selectedGradeClass='all';selectedMemberId=null;
 $('student-detail').classList.add('hidden');
 $('draft-state').textContent='● Google Sheets에서 불러옴';
 render();activateDock('cloud');
}
$('cloud-login').onclick=async()=>{
 if(cloudOpBusy||cloud.busy||cloud.user)return;
 try{
  if(m.classes.length||m.assessments.length){
   if(!confirm('현재 로컬 작업공간은 Google 계정에 자동 전송하지 않습니다. 로그인하면 Google 작업공간으로 전환됩니다. 로컬 JSON 백업을 먼저 저장했나요?'))return;
  }
  // One gesture starts OAuth; never require an extra click just to wait for the SDK.
  cloudOpBusy=true;updateCloudUI();
  const user=await cloud.connect();
  cloudMode=true;cloudFileKey=null;cloudDirty=false;m=fresh(year);edited.clear();cloudLookupState='idle';cloudCandidates=[];
  selectedClass=null;selectedAssessment=null;selectedMemberId=null;
  $('student-detail').classList.add('hidden');
  $('draft-state').textContent='○ 기존 학년도 시트를 찾는 중';cloudOpBusy=false;render();activateDock('cloud');
  await refreshYearFiles();
  toast(cloud.active?`${year}학년도 기존 시트를 자동 연결했습니다.`:`${user.email} 로그인 완료. 기존 학년도 파일 확인 결과를 확인하세요.`);
 }catch(e){toast(`Google 로그인 실패: ${e.message}`,true)}
 finally{cloudOpBusy=false;updateCloudUI()}
};
$('cloud-find').onclick=()=>void refreshYearFiles();
$('cloud-create').onclick=async()=>{
 if(cloudOpBusy||cloud.busy||cloudLookupState!=='ready'||cloudCandidates.length||cloud.active){toast('기존 파일 검색을 완료하고 중복이 없는 경우에만 생성할 수 있습니다.',true);return;}
 try{
  ensureNotLosingWork();
  if(!confirm(`${year}학년도 기존 앱 연결 파일을 다시 확인합니다. 앱에 허용된 파일이 없을 때만 새 시트를 만들며, 다른 앱으로 만든 파일까지 검색되지는 않습니다. 계속할까요?`))return;
  cloudOpBusy=true;updateCloudUI();
  const result=await cloud.create(year);applyCloudWorkspace(result.workspace,result.id);
  toast(result.reused?'기존 학년도 시트를 발견해 재사용했습니다.':'교사 소유 새 학년도 시트를 생성하고 연결했습니다.');
 }catch(e){cloudLookupState='error';toast(`시트 생성/연결 중단: ${e.message} · 파일이 이미 생성됐을 수 있습니다. 다시 검색해 주세요.`,true);}
 finally{cloudOpBusy=false;updateCloudUI();}
};
$('cloud-picker').onclick=async()=>{
 if(cloudOpBusy||cloud.busy)return;
 cloudOpBusy=true;updateCloudUI();
 try{ensureNotLosingWork();
  const key=$('picker-key').value.trim();if(!key)throw Error('제한된 Google Picker API 키를 입력하세요.');
  const result=await cloud.choose(key,year);applyCloudWorkspace(result.workspace,result.id);
  toast('교사 본인 소유 교실 관리 시트를 연결했습니다.');
 }catch(e){toast(`파일 연결 실패: ${e.message}`,true)}finally{cloudOpBusy=false;updateCloudUI()}
};
$('cloud-recover').onclick=async()=>{
 if(!cloud.lastFileId||cloudOpBusy||cloud.busy)return;
 if(cloudDirty){
  if(!confirm('미저장 내용을 JSON 백업으로 내려받은 뒤 Google Sheets의 현재 상태를 다시 확인합니다. 로컬 작업은 교체됩니다. 계속할까요?'))return;
  download(`classroom_${year}_RECOVERY_BACKUP.json`,JSON.stringify(m,null,2),'application/json;charset=utf-8');
 }
 cloudOpBusy=true;updateCloudUI();
 try{const result=await cloud.open(cloud.lastFileId,year);applyCloudWorkspace(result.workspace,result.id);toast('Sheets에서 현재 저장 상태를 다시 확인했습니다.');}
 catch(e){toast(`파일 복구 실패: ${e.message}`,true)}finally{cloudOpBusy=false;updateCloudUI()}
};
$('cloud-reload').onclick=async()=>{
 if(cloudOpBusy||cloud.busy)return;cloudOpBusy=true;updateCloudUI();
 try{ensureNotLosingWork();const result=await cloud.reload();applyCloudWorkspace(result.workspace,result.id);toast('Google Sheets 최신 데이터를 불러왔습니다.');}
 catch(e){toast(`다시 불러오기 실패: ${e.message}`,true)}finally{cloudOpBusy=false;updateCloudUI()}
};
$('sheets-save-dialog').addEventListener('click',e=>{const b=e.target.closest('[data-save-confirm]');if(b)$('sheets-save-dialog').close(b.dataset.saveConfirm);});
function confirmSheetsSave(){
 const dialog=$('sheets-save-dialog');
 if(dialog.open)return Promise.resolve(false);
 dialog.returnValue='cancel';
 return new Promise(resolve=>{
  dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});
  dialog.showModal();
 });
}
$('cloud-save').onclick=async()=>{
 if(cloudOpBusy||cloud.busy||!cloudDirty||!cloud.active)return;
 if(!(await confirmSheetsSave()))return;
 if(cloudOpBusy||cloud.busy||!cloudDirty||!cloud.active)return;
 const revision=changeCounter;const snapshot=structuredClone(m);cloudOpBusy=true;updateCloudUI();
 try{validateWorkspace(snapshot);$('draft-state').textContent='◌ Sheets 저장 중';updateCloudUI();await cloud.save(snapshot);if(revision===changeCounter){cloudDirty=false;$('draft-state').textContent='● Sheets 저장 확인됨';}else{$('draft-state').textContent='● 저장 중 추가 변경 있음 · 재저장 필요';}
  toast('Google Sheets에 저장하고 재조회로 일치 여부를 확인했습니다.');
 }catch(e){cloudDirty=true;$('draft-state').textContent='⚠ 저장 결과 확인 필요';toast(`저장 중단: ${e.message} · 자동 재시도 금지, JSON 백업을 보관하세요.`,true)}finally{cloudOpBusy=false;updateCloudUI()}
};
$('cloud-logout').onclick=async()=>{
 if(cloudOpBusy||cloud.busy)return;
 try{if(cloudDirty){if(!confirm('Sheets에 저장되지 않은 작업을 JSON으로 내려받고 Google에서 로그아웃할까요?'))return;download(`classroom_${year}_UNSAVED.json`,JSON.stringify(m,null,2),'application/json;charset=utf-8');}
  cloud.logout();++cloudLookupSerial;cloudMode=false;cloudFileKey=null;cloudDirty=false;cloudCandidates=[];cloudLookupState='idle';
  await loadYear(year);activateDock('guide');$('picker-key').value='';toast('Google 연결을 해제하고 로컬 작업공간으로 전환했습니다.');
 }catch(e){toast(e.message,true)}finally{updateCloudUI()}
};
// STAGE03: no unreliable async beforeunload save. Navigation requests explicit IDB commit.
window.addEventListener('beforeunload',event=>{if(timer||persistFailed){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>cloud.logout({clearAccountHint:false}));
const sdkScript=document.getElementById('google-gis-sdk');
if(sdkScript){sdkScript.addEventListener('load',updateCloudUI);sdkScript.addEventListener('error',()=>{updateCloudUI();toast('Google 로그인 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.',true)});}
// Keep the grade's class selector synchronized with the Seating host, not a second local selector.
document.addEventListener('click',event=>{
  const item=event.target.closest('[data-class-id]');
  if(!item||!stage03InstallId)return;
  const id=item.getAttribute('data-class-id');
  const cls=m.classes.find(c=>c.id===id);
  if(!cls||!cls.stage03SourceId)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(readOnlyYear)return;
  window.parent.postMessage({type:'TT_STAGE031_SWITCH_CLASS',installId:stage03InstallId,sourceInstanceId:cls.stage03SourceId},location.origin);
},true);
const stage03Startup=loadYear(year);
const stage03BridgeStatus=()=>{let el=document.getElementById('tt-grade-bridge-status');if(!el){el=document.createElement('div');el.id='tt-grade-bridge-status';el.className='tt-grade-bridge-status';document.getElementById('app')?.prepend(el)}return el;};
function stage03Report(message,error=false){const el=stage03BridgeStatus();if(el){el.textContent=message;el.classList.toggle('is-error',error)}window.parent.postMessage({type:'TT_STAGE03_SYNC_RESULT',installId:stage03InstallId,message,error},location.origin);}
async function stage03Flush(){
 clearTimeout(timer);timer=null;
 if(readOnlyYear)return;
 // Blurring invokes ordinary input commit/change before final draft write.
 const el=document.activeElement;if(el&&el!==document.body)el.blur();
 await stage03PendingDraft;
 validateWorkspace(m);
 await writeDraft(draftKey(),structuredClone(m));
 persistFailed=false;$('draft-state').textContent='● 이 기기에 저장 완료 · Google 미연결';
}
async function stage03ApplyHost(message){
 if(readOnlyYear)return;
 if(!message.installId||!message.sourceInstanceId?.startsWith(message.installId+'-'))throw Error('학급·시험 원본 식별자 불일치');
 if(stage03InstallId&&stage03InstallId!==message.installId)throw Error('다른 시험 설치의 학생명단은 자동 연결하지 않습니다.');
 if(!stage03InstallId){
  stage03InstallId=message.installId;
  const found=await loadDraft(draftKey());
  if(found){validateWorkspace(found);m=found;}
 }
 const result=projectRoster(m,message);
 void fillYearChoices();
 if(result.changed){m=result.workspace;markChanged();await stage03Flush();}
 else m=result.workspace;
 selectedClass=m.classes.find(c=>c.stage03SourceId===message.sourceInstanceId)?.id||null;
 render();
 const v=result.stats;
 const excluded=inactiveMembers(m,selectedClass).length;
 const warning=excluded?` · 명단에서 제외된 학생 ${excluded}명의 성적 보존 중 (② 학급 · 학생에서 다시 연결)`:'';
 stage03Report(`공통 명단 연결 · ${v.active}명 · 신규 ${v.added} / 이름 갱신 ${v.renamed}${warning} · 성적은 이 브라우저에만 저장`);
}
window.addEventListener('message',e=>{
 if(e.source!==window.parent||e.origin!==location.origin||!e.data||typeof e.data!=='object')return;
 const msg=e.data;
 if(msg.type==='TT_STAGE031_SELECT_STUDENT' && msg.installId===stage03InstallId){
  const target=m.memberships.find(mem=>mem.active&&mem.classId===selectedClass&&mem.stage03SeatingId===msg.seatingStudentId);
  if(target)showStudent(target.id);
 }else if(msg.type==='TT_STAGE03_ROSTER'){
  stage03ProjectionBusy=stage03ProjectionBusy.then(()=>stage03ApplyHost(msg)).catch(err=>{stage03Report('⚠ 명단 동기화 보류: '+err.message,true)});
 }else if(msg.type==='TT_STAGE03_FLUSH'){
  const installId=msg.installId,id=msg.id;
  stage03ProjectionBusy=stage03ProjectionBusy.then(async()=>{let ok=false;
   try{if(stage03InstallId!==installId)throw Error('원본 불일치');await stage03Flush();ok=true}
   catch(err){stage03Report('⚠ 브라우저 저장 실패: '+err.message,true)}
   window.parent.postMessage({type:'TT_STAGE03_FLUSH_ACK',installId,id,ok},location.origin);
  });
 }
});
void stage03Startup.then(()=>{stage03BridgeStatus().textContent='자리배치 공통 학생명단 연결 대기 중';window.parent.postMessage({type:'TT_STAGE03_READY',installId:null},location.origin)}).catch(e=>stage03Report('초기화 실패: '+e.message,true));

