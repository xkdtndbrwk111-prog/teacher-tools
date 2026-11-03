// ③ 평가 관리 → 수행평가 불러오기: school → 학교알리미 plan file → read (or the teacher's own AI) → preview → assessments.
import {readPlanFile,itemComplete,aiPrompt,parseAiAnswer} from './plan-reader.mjs';
import {relay,schoolCodeFromUrl,schoolPageUrl} from './plan-relay.mjs';
import {addAssessment,validateWorkspace} from './model.mjs';

const SCHOOL_KEY='tt.classroom.planSchool.v1';
// The built-in list of elementary schools (classroom/tools/build-school-list.mjs) makes the search work without a key.
let schoolListPromise=null;
const loadSchoolList=()=>schoolListPromise ||= fetch(new URL('./schools-elementary.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('list '+r.status);return r.json();}).then(d=>d.schools.map(([name,region,code])=>({name,region,code,address:''}))).catch(e=>{schoolListPromise=null;throw e;});
export function searchSchools(list,q){
 const key=q.replace(/\s/g,'').replace(/초등학교$|초교$/,'');if(key.length<2)return [];
 return list.filter(s=>s.name.replace(/\s/g,'').includes(key)).sort((a,b)=>a.name.length-b.name.length||a.name.localeCompare(b.name,'ko')).slice(0,30);
}
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cut=(s,n)=>{s=String(s||'').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
const load=()=>{try{return JSON.parse(localStorage.getItem(SCHOOL_KEY)||'null')}catch{return null}};
const save=v=>{try{localStorage.setItem(SCHOOL_KEY,JSON.stringify(v))}catch{}};

export function mountPlanImport(root,api){
 const saved=load()||{};
 const st={school:saved.school||null,grade:saved.grade||'5',semester:saved.semester||(new Date().getMonth()>=7||new Date().getMonth()<1?'2':'1'),
  found:null,searching:false,busy:'',files:null,fileSeq:null,result:null,error:'',picked:new Set(),classIds:new Set(),aiOpen:false};
 const remember=()=>save({school:st.school,grade:st.grade,semester:st.semester});
 const existing=it=>{const m=api.getM();return m.criteria.some(c=>c.plan&&c.plan.code===it.code&&(c.plan.unit||'')===(it.unit||'')&&(c.plan.element||'')===(it.element||'')&&m.assessments.find(a=>a.id===c.assessmentId)?.subject===it.subject);};
 function setResult(res,source){
  st.result={...res,source};st.picked=new Set(res.items.map((it,i)=>itemComplete(it)&&!existing(it)?i:-1).filter(i=>i>=0));
  st.aiOpen=!res.items.length||res.kind==='pdf'||Boolean(res.reason);
  if(!st.classIds.size){const c=api.selectedClass();if(c)st.classIds.add(c);}
 }
 const wantGrade=name=>new RegExp(st.grade+'\\s*학년').test(name||'')?null:Number(st.grade);
 async function readBytes(name,bytes,source){
  st.busy='파일을 읽는 중…';render();
  try{setResult(await readPlanFile(name,bytes,{grade:wantGrade(name)}),source);st.error='';}
  catch(e){setResult({kind:'other',items:[],reason:'파일을 읽지 못했습니다: '+e.message},source);}
  st.busy='';render();
 }
 async function findFiles(){
  if(!st.school)return;
  st.busy='학교알리미에서 평가계획을 찾는 중…';st.error='';st.files=null;st.result=null;render();
  try{
   const r=await relay({action:'plans',code:st.school.code});
   st.files=r.files||[];if(r.school&&!st.school.name)st.school.name=r.school;
   const score=f=>(new RegExp(st.grade+'\\s*학년').test(f.name)?4:0)+(new RegExp(st.semester+'\\s*학기').test(f.name)?2:0)+(/평가/.test(f.name)?1:0)-(/규정|창의적|창체/.test(f.name)?9:0);
   st.fileSeq=st.files.length?[...st.files].sort((a,b)=>score(b)-score(a))[0].seq:null;
   if(!st.files.length)st.error='이 학교의 평가계획 공시 파일이 없습니다. 학교알리미에서 확인하거나 파일을 직접 올려 주세요.';
  }catch(e){st.error=e.message+' 아래에서 학교알리미를 열어 파일을 받은 뒤 직접 올려 주세요.';}
  st.busy='';render();
 }
 async function fetchFile(){
  const f=st.files?.find(x=>x.seq===st.fileSeq);if(!f)return;
  st.busy='파일을 받는 중…';render();
  try{const r=await relay({action:'file',code:st.school.code,seq:String(f.seq)},{bytes:true});await readBytes(r.name||f.name,r.bytes,f.name);}
  catch(e){st.busy='';st.error=e.message+' 학교알리미에서 파일을 받아 직접 올려 주세요.';render();}
 }
 async function search(q){
  st.searching=true;st.found=null;st.error='';render();
  try{
   let found;try{found=searchSchools(await loadSchoolList(),q);}catch{found=(await relay({action:'schools',q})).schools||[];}
   st.found=found;if(!found.length)st.error='찾는 학교가 없습니다. 학교 이름을 다시 확인하거나, 새로 생긴 학교라면 학교알리미 주소를 붙여 넣어 주세요.';
  }catch(e){st.found=null;st.error='학교 목록을 불러오지 못했습니다. 학교알리미에서 우리 학교 페이지를 열고 주소를 붙여 넣어 주세요.';}
  st.searching=false;render();
 }
 function create(){
  if(api.readOnly())return;
  const items=[...st.picked].sort((a,b)=>a-b).map(i=>st.result.items[i]);
  if(!items.length){api.toast('만들 평가를 골라 주세요.',true);return;}
  if(!st.classIds.size){api.toast('연결할 학급을 골라 주세요.',true);return;}
  const copy=structuredClone(api.getM()),count=new Map();
  items.forEach(it=>{const k=it.subject+'|'+it.unit;count.set(k,(count.get(k)||0)+1);});
  try{
   for(const it of items){
    const many=count.get(it.subject+'|'+it.unit)>1;
    const title=cut(it.unit?(many&&it.element?`${it.unit} · ${it.element}`:it.unit):it.element||it.code||'수행평가',100);
    addAssessment(copy,{title,subject:cut(it.subject||'기타',50),criterion:cut(it.element||it.unit||'수행평가',80),gradeType:'level',classIds:[...st.classIds],
     customLevels:it.levels.map(l=>l.name),levelNotes:Object.fromEntries(it.levels.map(l=>[l.name,l.note])),
     plan:{school:st.school?.name||'',schoolCode:st.school?.code||'',grade:st.grade,semester:st.semester,period:it.period,code:it.code,standard:it.standard,unit:it.unit,element:it.element,area:it.area,method:it.method,file:cut(st.result.source,200)}});
   }
   validateWorkspace(copy);
  }catch(e){api.toast('평가를 만들지 못했습니다: '+e.message,true);return;}
  api.setM(copy);api.markChanged();
  st.picked=new Set();api.toast(`수행평가 ${items.length}개를 만들었습니다. ④ 성적 입력에서 단계를 입력하세요.`);api.render();
 }
 function render(){
  const m=api.getM(),off=api.readOnly()?'disabled':'';
  const sch=st.school?`<div class="pi-school"><strong>${h(st.school.name||st.school.code)}</strong>${st.school.region?`<small>${h(st.school.region)}</small>`:''}<button type="button" class="mini" data-pi="change">학교 바꾸기</button></div>`:
   `<div class="pi-search"><input id="pi-q" placeholder="학교 이름 (예: 개원초)" maxlength="30" autocomplete="off"><button type="button" class="ghost" data-pi="search" ${st.searching?'disabled':''}>${st.searching?'찾는 중…':'학교 찾기'}</button></div>
   ${st.found?.length?`<div class="pi-found">${st.found.map((s,i)=>`<button type="button" data-pi-school="${i}"><strong>${h(s.name)}</strong><small>${h([s.region,s.address].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>`:''}
   <details class="pi-url" ${st.error&&!st.found?.length?'open':''}><summary>학교 검색이 안 되면: 학교알리미 주소 붙여넣기</summary><p>학교알리미(<a href="https://www.schoolinfo.go.kr" target="_blank" rel="noopener">schoolinfo.go.kr</a>)에서 우리 학교를 검색해 학교 페이지를 연 뒤, 주소창의 주소를 복사해 붙여 넣으세요.</p><div class="pi-search"><input id="pi-url" placeholder="https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?..." autocomplete="off"><button type="button" class="ghost" data-pi="url">적용</button></div></details>`;
  const files=st.files?.length?`<div class="pi-files">${st.files.map(f=>`<label class="pi-file"><input type="radio" name="pi-file" value="${f.seq}" ${f.seq===st.fileSeq?'checked':''}><span>${h(f.name)}</span></label>`).join('')}</div><button type="button" class="primary" data-pi="read" ${st.busy?'disabled':''}>이 파일 읽기</button>`:'';
  const manual=`<div class="pi-manual"><span>또는 파일 직접 올리기</span><label class="ghost pi-upload">한글·PDF 파일 고르기<input type="file" id="pi-upload" accept=".hwp,.hwpx,.pdf,application/pdf" hidden></label>${st.school?`<a href="${h(schoolPageUrl(st.school.code))}" target="_blank" rel="noopener">학교알리미에서 이 학교 열기 ↗</a>`:''}<small>학교알리미 학교 페이지 → 학업성취사항 → 교과별(학년별) 평가계획에서 파일을 받을 수 있어요.</small></div>`;
  const r=st.result;let result='';
  if(r){
   const ok=r.items.filter(itemComplete).length;
   const groups=[...new Set(r.items.map(it=>it.subject||'기타'))];
   const prev=r.items.length?groups.map(g=>`<div class="pi-group"><h4>${h(g)}</h4>${r.items.map((it,i)=>(it.subject||'기타')!==g?'':`<label class="pi-item ${itemComplete(it)?'':'is-partial'}"><input type="checkbox" data-pi-item="${i}" ${st.picked.has(i)?'checked':''} ${off}><div><div class="pi-item-top"><strong>${h(cut(it.unit||it.element||'(단원 없음)',60))}</strong>${it.period?`<em>${h(it.period)}</em>`:''}${it.code?`<code>${h(it.code)}</code>`:''}${existing(it)?'<span class="pi-dup">이미 있음</span>':''}${itemComplete(it)?'':'<span class="pi-warn">일부 빠짐</span>'}</div>${it.element?`<p>${h(cut(it.element,120))}</p>`:''}<div class="pi-levels">${it.levels.map(l=>`<span title="${h(l.note)}"><b>${h(l.name)}</b>${h(cut(l.note,46))}</span>`).join('')}</div>${it.method?.length?`<small>${h(it.method.join(' · '))}</small>`:''}</div></label>`).join('')}</div>`).join(''):'';
   result=`<div class="pi-result"><div class="pi-result-head"><strong>${r.items.length?`평가 ${r.items.length}개 찾음 · 바로 쓸 수 있는 평가 ${ok}개`:'평가를 찾지 못했습니다'}</strong><small>${h(r.source||'')}</small></div>${r.reason?`<div class="pi-reason">${h(r.reason)}</div>`:''}
   <details class="pi-ai" ${st.aiOpen?'open':''}><summary>${r.items.length?'결과가 이상하면: 내 AI 도구로 정리하기':'내 AI 도구로 정리하기'}</summary>
    <ol><li>아래 [부탁 글 복사]를 누릅니다.</li><li>Claude 등 사용하시는 AI 채팅에 <b>평가계획 파일을 첨부</b>하고, 복사한 부탁 글을 붙여 넣어 보냅니다.</li><li>AI가 돌려준 답을 아래 칸에 그대로 붙여 넣고 [AI 답 읽기]를 누릅니다.</li></ol>
    <div class="pi-ai-row"><button type="button" class="ghost" data-pi="copy">부탁 글 복사</button></div>
    <textarea id="pi-ai-answer" rows="5" placeholder='AI 답을 붙여 넣으세요. {"format":"tt.plan.v1", ... }'></textarea>
    <button type="button" class="ghost" data-pi="ai">AI 답 읽기</button></details>
   ${prev}${r.items.length?`<div class="pi-create"><div class="formlabel">연결할 학급</div><div class="checks">${m.classes.map(c=>`<label class="check"><input type="checkbox" data-pi-class="${h(c.id)}" ${st.classIds.has(c.id)?'checked':''} ${off}> ${h(c.name)}</label>`).join('')||'<div class="empty-state">학급을 먼저 등록하세요.</div>'}</div><button type="button" class="primary full" data-pi="create" ${off||(!st.picked.size?'disabled':'')}>선택한 ${st.picked.size}개 수행평가 만들기</button></div>`:''}</div>`;
  }
  root.innerHTML=`<div class="pi-step"><span class="pi-num">1</span><div class="pi-body"><div class="formlabel">학교</div>${sch}</div></div>
   <div class="pi-step"><span class="pi-num">2</span><div class="pi-body"><div class="form-row"><label>학년<select id="pi-grade">${[1,2,3,4,5,6].map(g=>`<option value="${g}" ${String(g)===st.grade?'selected':''}>${g}학년</option>`).join('')}</select></label><label>학기<select id="pi-sem"><option value="1" ${st.semester==='1'?'selected':''}>1학기</option><option value="2" ${st.semester==='2'?'selected':''}>2학기</option></select></label></div>
   <button type="button" class="primary full" data-pi="files" ${!st.school||st.busy?'disabled':''}>학교알리미에서 평가계획 찾기</button>${files}${manual}</div></div>
   ${st.busy?`<div class="pi-busy" role="status">${h(st.busy)}</div>`:''}${st.error?`<div class="pi-error" role="alert">${h(st.error)}</div>`:''}
   ${r?`<div class="pi-step"><span class="pi-num">3</span><div class="pi-body">${result}</div></div>`:''}`;
  const on=(sel,fn)=>root.querySelectorAll(sel).forEach(el=>el.onclick=fn);
  on('[data-pi="search"]',()=>{const q=root.querySelector('#pi-q').value.trim();if(q.length<2){st.error='학교 이름을 두 글자 이상 입력하세요.';render();return;}search(q);});
  root.querySelector('#pi-q')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();root.querySelector('[data-pi="search"]').click();}});
  root.querySelectorAll('[data-pi-school]').forEach(b=>b.onclick=()=>{st.school=st.found[Number(b.dataset.piSchool)];st.found=null;st.error='';remember();render();});
  on('[data-pi="url"]',()=>{const code=schoolCodeFromUrl(root.querySelector('#pi-url').value);if(!code){st.error='학교알리미 학교 페이지 주소가 아닙니다. 주소에 HG_CD 또는 SHL_IDF_CD가 들어 있어야 합니다.';render();return;}st.school={code,name:''};st.error='';remember();findFiles();});
  on('[data-pi="change"]',()=>{st.school=null;st.files=null;st.result=null;st.error='';remember();render();});
  root.querySelector('#pi-grade').onchange=e=>{st.grade=e.target.value;remember();};
  root.querySelector('#pi-sem').onchange=e=>{st.semester=e.target.value;remember();};
  on('[data-pi="files"]',findFiles);
  root.querySelectorAll('input[name="pi-file"]').forEach(x=>x.onchange=()=>{st.fileSeq=Number(x.value);});
  on('[data-pi="read"]',fetchFile);
  root.querySelector('#pi-upload').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>30*1024*1024){st.error='파일이 너무 큽니다. (30MB 이하)';render();return;}await readBytes(f.name,new Uint8Array(await f.arrayBuffer()),f.name);};
  on('[data-pi="copy"]',async()=>{const t=aiPrompt({school:st.school?.name||'',grade:st.grade,semester:st.semester});try{await navigator.clipboard.writeText(t);api.toast('부탁 글을 복사했습니다. AI 채팅에 파일과 함께 붙여 넣으세요.');}catch{const ta=root.querySelector('#pi-ai-answer');ta.value=t;ta.select();api.toast('복사가 막혀 아래 칸에 넣었습니다. Ctrl/Cmd+C로 복사하세요.',true);}});
  on('[data-pi="ai"]',()=>{try{const items=parseAiAnswer(root.querySelector('#pi-ai-answer').value);setResult({kind:'ai',items,reason:''},'AI 정리 결과');st.aiOpen=false;st.error='';}catch(e){st.error=e.message;}render();});
  root.querySelectorAll('[data-pi-item]').forEach(x=>x.onchange=()=>{const i=Number(x.dataset.piItem);x.checked?st.picked.add(i):st.picked.delete(i);render();});
  root.querySelectorAll('[data-pi-class]').forEach(x=>x.onchange=()=>{x.checked?st.classIds.add(x.dataset.piClass):st.classIds.delete(x.dataset.piClass);});
  on('[data-pi="create"]',create);
 }
 return {render,state:st};
}
