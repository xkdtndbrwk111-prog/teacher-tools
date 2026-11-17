// School, grade and class, and the optional weekly sheet. All of it is kept in school.json on this PC.
(()=>{
 'use strict';
 const REGIONS=[['','전체 지역'],['B10','서울'],['C10','부산'],['D10','대구'],['E10','인천'],['F10','광주'],['G10','대전'],['H10','울산'],['I10','세종'],['J10','경기'],['K10','강원'],['M10','충북'],['N10','충남'],['P10','전북'],['Q10','전남'],['R10','경북'],['S10','경남'],['T10','제주']];
 const box=document.createElement('dialog');box.id='schoolSetup';box.setAttribute('aria-labelledby','schoolSetupTitle');
 box.innerHTML=`<div class="school-card">
  <h2 id="schoolSetupTitle">우리 학교 고르기</h2>
  <p class="sub">나이스에서 이 학교의 급식, 일정, 기본 시간표를 가져옵니다.</p>
  <div class="settings-inline"><select id="schoolRegion" aria-label="지역">${REGIONS.map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select><input id="schoolQuery" type="text" maxlength="30" placeholder="학교 이름 (예: 한빛초)" aria-label="학교 이름"><button type="button" id="schoolSearch" class="accent">찾기</button></div>
  <div id="schoolResults" class="school-results"></div>
  <p id="schoolNote" class="sub" role="status"></p>
  <div id="schoolClass" class="settings-inline" hidden><strong id="schoolPicked"></strong><select id="schoolGrade" aria-label="학년"></select><input id="schoolCls" type="text" inputmode="numeric" maxlength="4" placeholder="반 (예: 3)" aria-label="반"></div>
  <div class="settings-inline school-actions"><button type="button" id="schoolCancel" hidden>닫기</button><button type="button" id="schoolSave" class="accent" disabled>저장</button></div>
 </div>`;
 document.body.append(box);
 const $id=id=>document.getElementById(id);
 const encode=text=>{const bytes=new TextEncoder().encode(text);let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out)};
 let current=null,template='',picked=null;
 const save=async next=>{
  const res=await fetch('/api/school',{method:'POST',headers:{'Content-Type':'text/plain'},body:encode(JSON.stringify(next))});
  if(!res.ok)throw new Error('save');
  current=next;
  for(const key of Object.keys(localStorage))if(key.startsWith('class-cache-'))localStorage.removeItem(key);
 };
 function pick(school){
  picked=school;$id('schoolPicked').textContent=school.name;
  const grades=school.kind==='초등학교'?6:3;
  $id('schoolGrade').replaceChildren(...Array.from({length:grades},(_,i)=>{const o=document.createElement('option');o.value=String(i+1);o.textContent=(i+1)+'학년';return o}));
  $id('schoolClass').hidden=false;$id('schoolSave').disabled=false;
 }
 async function search(){
  const q=$id('schoolQuery').value.trim(),note=$id('schoolNote');
  if(!q){note.textContent='학교 이름을 입력하세요.';return}
  note.textContent='찾는 중입니다.';$id('schoolResults').replaceChildren();
  try{
   const res=await fetch('/api/school/search?q='+encodeURIComponent(q)+'&office='+$id('schoolRegion').value);
   if(!res.ok)throw new Error('search');
   const data=await res.json(),rows=data.rows||[];
   $id('schoolResults').replaceChildren(...rows.map(school=>{
    const b=document.createElement('button');b.type='button';b.textContent=school.name+' · '+school.address;
    b.addEventListener('click',()=>{for(const x of $id('schoolResults').children)x.classList.remove('accent');b.classList.add('accent');pick(school)});
    return b;
   }));
   // Without an API key NEIS answers with five schools at most.
   note.textContent=!rows.length?'찾는 학교가 없습니다. 이름을 줄여 보세요.':data.total>rows.length?`${data.total}곳 중 ${rows.length}곳만 보입니다. 지역을 고르거나 이름을 더 적어 주세요.`:'';
  }catch{note.textContent='나이스에 연결하지 못했습니다. 인터넷 연결을 확인하세요.'}
 }
 $id('schoolSearch').addEventListener('click',search);
 $id('schoolQuery').addEventListener('keydown',event=>{if(event.key==='Enter')search()});
 $id('schoolCancel').addEventListener('click',()=>box.close());
 // The first choice cannot be skipped: nothing on the board works without a school.
 box.addEventListener('cancel',event=>{if(!current)event.preventDefault()});
 $id('schoolSave').addEventListener('click',async()=>{
  const cls=$id('schoolCls').value.trim();
  try{await save({...picked,grade:cls?$id('schoolGrade').value:'',cls,sheet:current?.sheet||''});location.reload()}
  catch{$id('schoolNote').textContent='저장하지 못했습니다. 다시 눌러 주세요.'}
 });
 function openSetup(){$id('schoolCancel').hidden=!current;box.showModal()}
 function showSettings(){
  $id('schoolNow').textContent=current?current.name+(current.cls?` · ${current.grade}학년 ${current.cls}반`:' · 학년과 반을 고르면 기본 시간표가 나옵니다'):'아직 고르지 않았습니다';
  $id('sheetNow').textContent=current?.sheet?'주간학습 시트가 연결되어 있습니다.':'연결 전에는 나이스 기본 시간표가 나옵니다.';
  $id('sheetRemove').hidden=!current?.sheet;
  $id('sheetCopy').disabled=!template;
 }
 $id('schoolChange').addEventListener('click',openSetup);
 $id('sheetCopy').addEventListener('click',async()=>{
  const res=await fetch('/api/open-sheet-copy',{method:'POST'}).catch(()=>null);
  $id('sheetStatus').textContent=res?.ok?'평소 쓰는 브라우저에 사본 만들기 화면을 열었습니다.':'열지 못했습니다. 다시 눌러 주세요.';
 });
 $id('sheetConnect').addEventListener('click',async()=>{
  const status=$id('sheetStatus'),id=$id('sheetAddress').value.match(/\/d\/([\w-]{20,80})/)?.[1];
  if(!current){status.textContent='먼저 학교를 고르세요.';return}
  if(!id){status.textContent='구글 시트 주소 전체를 붙여 넣으세요.';return}
  const before=current;status.textContent='시트를 읽어 보는 중입니다.';
  try{
   await save({...current,sheet:id});
   const res=await fetch('/api/week',{cache:'no-store'}),data=await res.json();
   if(!res.ok&&data.code!=='WEEK_NOT_FOUND'){await save(before);status.textContent='시트를 읽지 못해 연결하지 않았습니다. 공유가 "링크가 있는 모든 사용자"인지 확인하세요.';return}
   location.reload();
  }catch{status.textContent='연결하지 못했습니다. 다시 눌러 주세요.'}
 });
 $id('sheetRemove').addEventListener('click',async()=>{
  try{await save({...current,sheet:''});location.reload()}catch{$id('sheetStatus').textContent='해제하지 못했습니다. 다시 눌러 주세요.'}
 });
 fetch('/api/school',{cache:'no-store'}).then(r=>r.json()).then(data=>{
  current=data.school||null;template=data.template||'';showSettings();
  if(!current)openSetup();
 }).catch(()=>{});
})();
