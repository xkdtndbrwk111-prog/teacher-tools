import pathlib,sys,re,hashlib
s=pathlib.Path(sys.argv[1]).read_bytes().decode('utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a[:120],s.count(a))
 s=s.replace(a,b)
rep('function renderWeek(d){', '''// Match each column to its real ISO date, never infer a year from the PC display.
function ttWeekDate(d,i){
 const ref=String(d?.referenceDate||''),m=Date.parse(ref+'T00:00:00Z');
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(ref)||!Number.isFinite(m)||i<0||i>4)return '';
 const r=new Date(m),dow=r.getUTCDay();if(dow<1||dow>5||r.toISOString().slice(0,10)!==ref)return '';
 const dt=new Date(m+(i+1-dow)*86400000);
 return d.dates?.[i]===`${dt.getUTCMonth()+1}/${dt.getUTCDate()}`?dt.toISOString().slice(0,10):'';
}
function ttWeekEditable(d,i){const date=ttWeekDate(d,i);return !!date&&date>=seoulClock().date&&(Array.isArray(d.ttEditableDates)?d.ttEditableDates.includes(date):d.rows.some(r=>String(r.cells?.[i]||'').trim()))}
function renderWeek(d){''')
rep("(matches&&day===i+1?' data-tt-period=\"'+ri+'\"':'')", "(ttWeekEditable(d,i)?' data-tt-period=\"'+ri+'\" data-tt-date=\"'+ttWeekDate(d,i)+'\"':'')")
rep("let col=heads.findIndex(th=>th.classList.contains('today'));if(col<1)col=1;", "let col=heads.findIndex(th=>th.classList.contains('today'));if(col<1){const i=Array.from({length:5},(_,i)=>i).find(i=>ttWeekEditable(lastWeek,i));col=i===undefined?1:i+1;}if(one&&!heads[col]?.classList.contains('today'))$('#weekTitle').textContent='📚 다가오는 시간표';")
rep("table.querySelectorAll('.tt-subject[data-tt-period]').forEach(el=>{if(one){el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',el.textContent+' 과목 수정');el.title=el.textContent+' · 길게 누르거나 더블클릭하여 수정'}else{el.removeAttribute('tabindex');el.removeAttribute('role');el.removeAttribute('aria-label');el.removeAttribute('title')}});", "table.querySelectorAll('.tt-subject[data-tt-period]').forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',el.dataset.ttDate+' '+el.textContent+' 과목 수정');el.title=el.textContent+' · 길게 누르거나 더블클릭하여 수정'});")
s=s.replace('#week.week-one .tt-subject[data-tt-period]','#week .tt-subject[data-tt-period]')
rep('window.ttClasskit?.editSubject?.(period);','window.ttClasskit?.editSubject?.(period,subject.dataset.ttDate);')
rep('window.ttClasskit?.editSubject?.(Number(el.dataset.ttPeriod))','window.ttClasskit?.editSubject?.(Number(el.dataset.ttPeriod),el.dataset.ttDate)')
rep("if(e.target.closest('button,a,input,select,label,#week .tt-subject[data-tt-period]'))return;", "if(e.target.closest('button,a,input,select,label,#week .tt-subject[data-tt-period]'))return;")
rep('📚 오늘 시간표 수정','📚 시간표 수정')
rep('📚 오늘만 시간표 수정','📚 시간표 일시 변경')
rep('학교 원본 주간학습은 변경하지 않습니다. 이 PC의 오늘 표시만 덮어쓰며 자정 이후에는 적용되지 않습니다.','학교 원본 주간학습은 변경하지 않습니다. 선택한 날짜에만 과목과 교시 공지를 적용합니다.')
rep('<p id="ckTodayDate" class="ck-status"></p><div id="ckScheduleRows"></div>', '<div class="ck-line"><label for="ckScheduleDate">변경할 날짜</label><select id="ckScheduleDate"></select></div><p id="ckTodayDate" class="ck-status"></p><div id="ckScheduleRows"></div>')
rep('오늘 변경 저장','선택 날짜 저장')
rep('오늘의 표시만 변경합니다. 학교 원본은 그대로 유지됩니다.','선택한 날짜의 표시만 변경합니다. 학교 원본은 그대로 유지됩니다.')
rep("if(d<0||d>4||!originalWeek||originalWeek.dates?.[d]!==c.md)return null;","if(d<0||d>4||!originalWeek||ttWeekDate(originalWeek,d)!==c.date)return null;")
rep("matches=d.dates[day-1]===clock.md","matches=ttWeekDate(d,day-1)===clock.date")
a=s.index('  function sheetPeriodNotice(i){');b=s.index('  function periodNoticeWindow(){',a)
s=s[:a]+'''  function sheetPeriodNotice(i,date=day()){
   const index=dateIndex(date);return index<0?'':String(originalWeek.rows?.[i]?.notices?.[index]||'').trim().slice(0,180);
  }
  function periodNoticeValue(i,date=day()){const label=String(originalWeek?.rows?.[i]?.label||'');return String(editsFor(date).notes?.[label]||sheetPeriodNotice(i,date)).slice(0,180)}
'''+s[b:]
rep("!String(row.cells?.[d]||'').trim()", "!String(lastWeek?.rows?.[i]?.cells?.[d]||'').trim()")
a=s.index(' // ---------- Today-only timetable ----------');b=s.index(' // ---------- Shared daily checklist ----------',a)
old=s[a:b]; qstart=old.index(' const quickSubject='); qend=old.index(' function currentSubjectCells()'); quick=old[qstart:qend]
new=''' // ---------- Date-specific local timetable overrides ----------
 const renderBaseWeek=renderWeek;
 let scheduleDate='';
 function dateIndex(date){return originalWeek?Array.from({length:5},(_,i)=>i).findIndex(i=>ttWeekDate(originalWeek,i)===date):-1}
 function editableDates(){return originalWeek?Array.from({length:5},(_,i)=>ttWeekEditable(originalWeek,i)?ttWeekDate(originalWeek,i):'').filter(Boolean):[]}
 function canEditDate(date){return !!lastWeek&&editableDates().includes(date)}
 // Version 2 is a single atomic localStorage value. Legacy today-only edits remain readable.
 function scheduleState(){
  const old=read(KEYS.schedule,null),legacy=read(KEYS.periodNotice,null),byDate={};
  if(old?.version===2&&old.byDate&&typeof old.byDate==='object'){
   for(const [date,v] of Object.entries(old.byDate))if(/^\\d{4}-\\d{2}-\\d{2}$/.test(date)&&date>=day()&&v&&typeof v==='object')byDate[date]=v;
  }else{
   for(const date of new Set([old?.date,legacy?.date])){
    if(!date||date<day()||dateIndex(date)<0)continue;
    const subjects={},notes={};originalWeek.rows.forEach((r,i)=>{const k=String(r.label);if(old?.date===date&&typeof old.cells?.[i]==='string'&&old.cells[i]!==String(r.cells?.[dateIndex(date)]||''))subjects[k]=old.cells[i];if(legacy?.date===date&&typeof legacy.texts?.[i]==='string'&&legacy.texts[i])notes[k]=legacy.texts[i]});
    if(Object.keys(subjects).length||Object.keys(notes).length)byDate[date]={subjects,notes};
   }
  }return {version:2,byDate};
 }
 function editsFor(date){return scheduleState().byDate[date]||{subjects:{},notes:{}}}
 function currentSubjectCells(date){const idx=dateIndex(date),base=originalWeek.rows.map(r=>String(r.cells?.[idx]||'')),over=editsFor(date);return {base,cells:base.map((v,i)=>typeof over.subjects?.[originalWeek.rows[i].label]==='string'?over.subjects[originalWeek.rows[i].label]:v)}}
 function saveDate(date,subjects,notes){if(!canEditDate(date))return false;const st=scheduleState();if(Object.keys(subjects).length||Object.keys(notes).length)st.byDate[date]={subjects,notes};else delete st.byDate[date];return store(KEYS.schedule,st)}
 renderWeek=function(data){
  if(!data||!Array.isArray(data.rows)){return renderBaseWeek(data)}
  if(data!==lastWeek)originalWeek=JSON.parse(JSON.stringify(data));
  const copy=JSON.parse(JSON.stringify(originalWeek||data)),st=scheduleState();copy.ttEditableDates=editableDates();let changed=false;
  for(let idx=0;idx<5;idx++){
   const date=ttWeekDate(copy,idx),over=st.byDate[date];if(!over||!ttWeekEditable(originalWeek,idx))continue;
   copy.rows.forEach(r=>{const v=over.subjects?.[r.label];if(typeof v==='string'&&r.cells){r.cells[idx]=v;changed=true}if(over.notes?.[r.label])changed=true});
  }
  renderBaseWeek(copy);bannerDraw();if(changed)$('#weekName').textContent+=' · 임시 변경';
 };
'''+quick+''' function editSubject(i,date=day()){
  if(document.body.classList.contains('layout-editing')||!canEditDate(date)||!Number.isInteger(i)||i<0||i>=originalWeek.rows.length)return false;
  const row=originalWeek.rows[i];subjectEdit={i,date,label:String(row.label)};
  $('#ttSubjectHeading').textContent=date+' · '+row.label+' 과목·공지 수정';$('#ttSubjectInput').value=currentSubjectCells(date).cells[i];$('#ttSubjectNotice').value=periodNoticeValue(i,date);$('#ttSubjectStatus').textContent='';
  if(!quickSubject.open)quickSubject.showModal();$('#ttSubjectInput').focus();$('#ttSubjectInput').select();return true;
 }
 function saveSubject(useOriginal=false){
  const e=subjectEdit;if(!e||!canEditDate(e.date)||String(originalWeek.rows[e.i]?.label)!==e.label){$('#ttSubjectStatus').textContent='날짜 또는 원본 시간표가 바뀌었습니다. 닫은 뒤 다시 수정해 주세요.';return}
  const {base}=currentSubjectCells(e.date),over=editsFor(e.date),subjects={...over.subjects},notes={...over.notes};
  const v=useOriginal?base[e.i]:$('#ttSubjectInput').value.trim().slice(0,50),n=useOriginal?'':$('#ttSubjectNotice').value.trim().slice(0,180);
  if(v===base[e.i])delete subjects[e.label];else subjects[e.label]=v;
  if(!n||n===sheetPeriodNotice(e.i,e.date))delete notes[e.label];else notes[e.label]=n;
  if(!saveDate(e.date,subjects,notes)){$('#ttSubjectStatus').textContent='저장하지 못했습니다.';return}
  renderWeek(originalWeek);quickSubject.close();
 }
 $('#ttSubjectForm').onsubmit=e=>{e.preventDefault();saveSubject()};$('#ttSubjectOriginal').onclick=()=>saveSubject(true);$('#ttSubjectClose').onclick=$('#ttSubjectCancel').onclick=()=>quickSubject.close();quickSubject.addEventListener('close',()=>{subjectEdit=null});
 function scheduleForm(){
  const host=$('#ckScheduleRows'),select=$('#ckScheduleDate'),dates=lastWeek?editableDates():[];host.replaceChildren();select.replaceChildren();
  if(!dates.includes(scheduleDate))scheduleDate=dates[0]||'';
  for(const date of dates){const opt=document.createElement('option');opt.value=date;opt.textContent=date+(date===day()?' · 오늘':' · '+['일','월','화','수','목','금','토'][new Date(date+'T00:00:00Z').getUTCDay()]+'요일');select.append(opt)}select.value=scheduleDate;
  const ok=canEditDate(scheduleDate);select.disabled=!ok;$('#ckScheduleSave').disabled=!ok;$('#ckScheduleReset').disabled=!ok;$('#ckScheduleStatus').textContent='';
  $('#ckTodayDate').textContent=ok?scheduleDate+' · 이 날짜에만 적용됩니다.':'수정할 수 있는 오늘 또는 미래 시간표가 없습니다.';
  if(!ok){host.textContent='주간학습을 새로고침해 주세요. 불러온 원본에 수업이 있는 날짜만 수정할 수 있습니다.';return}
  const {cells}=currentSubjectCells(scheduleDate);
  originalWeek.rows.forEach((r,i)=>{
   const div=document.createElement('div');div.className='ck-period';const label=document.createElement('label');label.textContent=r.label||`${i+1}교시`;
   const input=document.createElement('input');input.type='text';input.maxLength=50;input.dataset.period=String(i);input.dataset.label=r.label;input.value=cells[i];
   const noteLabel=document.createElement('label');noteLabel.textContent='교시 공지';const noteInput=document.createElement('textarea');noteInput.maxLength=180;noteInput.dataset.periodNotice=String(i);noteInput.placeholder='시트 공지 또는 직접 입력';noteInput.value=periodNoticeValue(i,scheduleDate);
   div.append(label,input,noteLabel,noteInput);host.append(div);
  });
  if(scheduleState().byDate[scheduleDate])$('#ckScheduleStatus').textContent='이 날짜의 임시 변경이 저장되어 있습니다.';
 }
 $('#ckScheduleDate').onchange=()=>{scheduleDate=$('#ckScheduleDate').value;scheduleForm()};
 $('#ckScheduleSave').onclick=()=>{
  if(!canEditDate(scheduleDate))return;
  const {base}=currentSubjectCells(scheduleDate),inputs=$all('#ckScheduleRows [data-period]'),subjects={},notes={};
  if(inputs.length!==base.length||inputs.some((x,i)=>x.dataset.label!==String(originalWeek.rows[i].label))){$('#ckScheduleStatus').textContent='원본 시간표가 바뀌었습니다. 다시 열어 주세요.';return}
  inputs.forEach((x,i)=>{const v=x.value.trim().slice(0,50);if(v!==base[i])subjects[originalWeek.rows[i].label]=v});
  $all('#ckScheduleRows [data-period-notice]').forEach(x=>{const i=Number(x.dataset.periodNotice),v=x.value.trim().slice(0,180);if(v&&v!==sheetPeriodNotice(i,scheduleDate))notes[originalWeek.rows[i].label]=v});
  if(!saveDate(scheduleDate,subjects,notes)){$('#ckScheduleStatus').textContent='저장하지 못했습니다.';return}
  renderWeek(originalWeek);scheduleForm();$('#ckScheduleStatus').textContent='선택 날짜의 과목과 공지를 저장했습니다. 학교 시트는 변경되지 않았습니다.';
 };
 $('#ckScheduleReset').onclick=()=>{if(!saveDate(scheduleDate,{},{}))return;renderWeek(originalWeek);scheduleForm();$('#ckScheduleStatus').textContent='선택 날짜만 시트 원본으로 되돌렸습니다.'};
'''
s=s[:a]+new+s[b:]
# Avoid stale source after a missing week, keep original date validation for today alerts.
rep("lastWeek=null;window.weekEvents=[];", "lastWeek=null;window.ttClasskit?.invalidateWeek?.();window.weekEvents=[];")
s=s.replace('window.ttClasskit={open:openKit,editSubject};','window.ttClasskit={open:openKit,editSubject,invalidateWeek:()=>{originalWeek=null;}};')
rep("window.ttClasskit={open:openKit,editSubject,invalidateWeek:()=>{originalWeek=null;}};\n})();","window.ttClasskit={open:openKit,editSubject,invalidateWeek:()=>{originalWeek=null;}};\n if(lastWeek&&!originalWeek){originalWeek=JSON.parse(JSON.stringify(lastWeek));renderWeek(lastWeek); }\n})();")
rep("if(tab==='schedule')scheduleForm();", "if(tab==='schedule'){scheduleDate='';scheduleForm();}")
# Avoid temporal dead zone if activate is called during init (same scope, function only executes after script).
rep('white-space:normal;line-height:1.25;padding:8px 4px;min-width:0;font-size:clamp(12px,1.1vw,18px);min-height:44px','white-space:nowrap;line-height:1.25;padding:8px 4px;min-width:0;font-size:clamp(10px,1vw,16px);min-height:44px')
# Fit actual rendered content on resizing, including SVG icons; no wrapping.
rep('</body></html>', '''<script id="tt-1643-kit-fit">(()=>{const d=document.querySelector('#ttClasskit');if(!d)return;function fit(){if(!d.open)return;d.querySelectorAll('.tt-kit-group>button').forEach(b=>{b.style.fontSize='';let n=parseFloat(getComputedStyle(b).fontSize);while(b.scrollWidth>b.clientWidth+1&&n>8){n-=.5;b.style.fontSize=n+'px'}})}new ResizeObserver(fit).observe(d);new MutationObserver(fit).observe(d,{attributes:true,attributeFilter:['open']});document.fonts?.ready.then(fit)})();</script></body></html>''')
s=s.replace('1.64.2','1.64.3')
pathlib.Path(sys.argv[2]).write_bytes(s.encode('utf-8'))
print(hashlib.sha256(s.encode()).hexdigest())
