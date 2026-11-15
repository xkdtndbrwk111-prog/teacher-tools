// Real-browser check of the classroom manager, with virtual data only. Needs Playwright and installed Google Chrome.
// node classroom/tests/browser.cjs   (NODE_PATH may point to an existing Playwright installation)
const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path');
const repo=path.resolve(__dirname,'../..');
const PORT=4199,BASE=`http://127.0.0.1:${PORT}`;
const LEGACY_SEAT='teacher-tools.seating.state.v1',LEGACY_PE='teacher-tools.seating.pe-prototype.v2';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
async function step(name,fn){
 try{await fn();results.push([name,true]);console.log('PASS',name)}
 catch(e){results.push([name,false]);console.log('FAIL',name,'\n ',e.message)}
}
const started=p=>p.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-full-backup'));
const classInfo=p=>p.evaluate(()=>{const c=window.__TT_STAGE031_CLASS;const r=JSON.parse(window.__TT_STORE.getItem(c.registryKey));return{installId:c.installId,activeId:c.activeId,seatingKey:c.seatingKey,peKey:c.peKey,registry:r,names:classState.students.map(s=>s.name)}});
async function download(p,click){
 const [d]=await Promise.all([p.waitForEvent('download'),click()]);
 return JSON.parse(fs.readFileSync(await d.path(),'utf8'));
}
async function uploadJson(p,selector,data){
 await p.setInputFiles(selector,{name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
async function openGrades(p){
 await p.click('#tt-grade-tab');
 const frame=p.frameLocator('.tt-grade-iframe');
 await frame.locator('.nav[data-page="assessments"]').waitFor();
 await p.waitForFunction(()=>/공통 명단 연결/.test(document.getElementById('tt-stage03-status')?.textContent||''));
 return frame;
}
async function openGradesAfterClose(p){await p.click('#tt-backup-close');return openGrades(p)}
const openSeating=p=>p.locator('.prototype-mode-switch button',{hasText:'자리배치'}).click();
async function setRoster(p,names){
 await p.locator('.prototype-mode-switch button',{hasText:'자리배치'}).waitFor();
 await p.evaluate(v=>{const t=document.getElementById('studentInput');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('applyStudents').click()},names.join('\n'));
}
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(PORT)],{stdio:'ignore'});
 await wait(500);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[],external=[];
 const newContext=async(clock)=>{
  const ctx=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
  ctx.on('request',r=>{if(!r.url().startsWith(BASE)&&!/^(data|blob):/.test(r.url())&&!r.url().includes('/npm/xlsx@'))external.push(r.url())});
  await ctx.route(u=>!String(u).startsWith(BASE)&&!/^(data|blob):/.test(String(u)),r=>r.abort());
  const p=await ctx.newPage();
  if(clock)await p.clock.setFixedTime(clock);
  p.on('pageerror',e=>errors.push(e.message));
  p.on('dialog',d=>d.accept());
  return{ctx,p};
 };
 try{
  const {ctx,p}=await newContext();
  const legacyState={version:10,className:'기존반',students:[{id:'legacy-1',name:'기존학생',gender:'none',balanceLevel:'none',apartFrom:[],fixedSeatId:null,assignmentExcluded:false}],layout:{rows:4,cols:8,cells:[]},groups:[],rules:{},assignments:[],history:[]};
  await p.goto(BASE+'/not-a-page');
  await p.evaluate(([k,v])=>localStorage.setItem(k,v),[LEGACY_SEAT,JSON.stringify(legacyState)]);
  await p.goto(BASE+'/seating/');await started(p);
  let first;
  await step('기존 자리배치 자료를 첫 반으로 옮기고 원본은 남긴다',async()=>{
   first=await classInfo(p);
   assert.deepEqual(first.names,['기존학생']);assert.equal(first.registry.classes[0].name,'기존반');
   assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),LEGACY_SEAT)).className,'기존반');
  });
  await step('다시 열어도 설치 ID와 자료가 유지된다',async()=>{
   await p.reload();await started(p);const again=await classInfo(p);
   assert.equal(again.installId,first.installId);assert.equal(again.activeId,first.activeId);assert.deepEqual(again.names,['기존학생']);
  });
  await setRoster(p,['가온','나래','다온','라온']);
  await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
  await p.selectOption('#rosterChangeRows select','');
  await p.click('#rosterChangeApply');
  await wait(200);
  let frame;
  await step('성적을 입력하면 명단과 연결된다',async()=>{
   frame=await openGrades(p);
   await frame.locator('.nav[data-page="assessments"]').click();
   await frame.locator('input[name="subject"]').fill('수학');
   await frame.locator('input[name="title"]').fill('1단원');
   await frame.locator('#assessment-form input[type="checkbox"]').first().check();
   await frame.locator('#assessment-form button[type="submit"]').click();
   await frame.locator('.nav[data-page="grades"]').click();
   const cells=frame.locator('input.grade-input');await cells.first().waitFor();
   assert.equal(await cells.count(),4);
   for(let i=0;i<4;i++){await cells.nth(i).fill(String(90-i*10));await cells.nth(i).blur()}
   await wait(300);
  });
  const gradeRows=async()=>frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>[e.getAttribute('aria-label').split(' ').slice(-4,-3)[0]||e.getAttribute('aria-label'),e.value]));
  await step('이름 수정과 추가를 함께 해도 같은 줄이면 성적이 이어진다',async()=>{
   await openSeating(p);await wait(300);
   await setRoster(p,['가온','나래2','다온','라온','전학생']);
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
   assert.equal(await p.locator('#rosterChangeRows select').inputValue(),'1');
   assert.match(await p.locator('#rosterChangeAdded').textContent(),/전학생/);
   await p.click('#rosterChangeApply');await wait(300);
   frame=await openGrades(p);await wait(400);
   const values=await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value));
   assert.deepEqual(values,['90','80','70','60','']);
   assert.equal(await p.evaluate(()=>classState.students[1].name),'나래2');
  });
  await step('확인 창에서 취소하면 명단이 그대로다',async()=>{
   await openSeating(p);await wait(300);
   const ids=await p.evaluate(()=>classState.students.map(s=>s.id));
   await setRoster(p,['가온','다온']);
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
   await p.click('#rosterChangeCancel');await wait(100);
   assert.deepEqual(await p.evaluate(()=>classState.students.map(s=>s.id)),ids);
  });
  await step('같은 새 이름을 두 학생에게 연결할 수 없다',async()=>{
   await setRoster(p,['가온','새이름','다온','전학생','라온']);
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
   const selects=p.locator('#rosterChangeRows select');
   assert.equal(await selects.count(),1);
   await p.click('#rosterChangeCancel');
   await setRoster(p,['가온','새이름','전학생']);
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
   assert.equal(await selects.count(),3);
   await selects.nth(0).selectOption({label:'이름 변경: 새이름'});
   await selects.nth(1).selectOption({label:'이름 변경: 새이름'});
   assert.equal(await p.locator('#rosterChangeApply').isDisabled(),true);
   await p.click('#rosterChangeCancel');
  });
  await step('제외한 학생은 성적이 보존되고 다시 연결할 수 있다',async()=>{
   await setRoster(p,['가온','새학생','다온','라온','전학생']);
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
   await p.selectOption('#rosterChangeRows select','');
   await p.click('#rosterChangeApply');await wait(300);
   frame=await openGrades(p);await wait(400);
   const hidden=await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value));
   assert.deepEqual(hidden,['90','70','60','','']);
   await frame.locator('.nav[data-page="classes"]').click();
   const row=frame.locator('.inactive-student-row');
   await row.waitFor();assert.match(await row.textContent(),/나래2.*성적 1건/);
   await row.locator('select').selectOption({label:'6. 새학생'});
   await row.locator('button').click();await wait(400);
   assert.equal(await frame.locator('.inactive-student-row').count(),0);
   await frame.locator('.nav[data-page="grades"]').click();await wait(300);
   const back=await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value));
   assert.deepEqual(back,['90','80','70','60','']);
  });
  await step('체육 능력치가 JSON 내보내기에 들어간다',async()=>{
   await openSeating(p);await wait(300);
   await p.evaluate(()=>{const c=window.__TT_STAGE031_CLASS,st=window.__TT_STORE,s=classState.students[0].id,pe=JSON.parse(st.getItem(c.peKey)||'{}');pe[s]={traits:{leadership:4,intelligence:3,stamina:2,charm:1,initiative:4},fixedTeam:0};st.setItem(c.peKey,JSON.stringify(pe))});
   const id=await p.evaluate(()=>classState.students[0].id);
   const data=await download(p,()=>p.evaluate(()=>document.getElementById('exportJson').click()));
   assert.deepEqual(data.peData.students[id].traits,{leadership:4,intelligence:3,stamina:2,charm:1,initiative:4});
  });
  await step('JSON 불러오기가 선택한 반에 적용되고 반 이름도 맞춰진다',async()=>{
   const data=await download(p,()=>p.evaluate(()=>document.getElementById('exportJson').click()));
   data.classState.className='불러온반';data.classState.students[0].name='불러온학생';
   const nav=p.waitForNavigation();
   await uploadJson(p,'#importJsonFile',data);await nav;await started(p);
   const now=await classInfo(p);
   assert.equal(now.names[0],'불러온학생');
   assert.equal(now.registry.classes.find(c=>c.id===now.activeId).name,'불러온반');
   assert.equal(await p.locator('#tt-class-select option:checked').textContent(),'불러온반');
   assert.equal(await p.evaluate(k=>localStorage.getItem(k),LEGACY_PE),null);
   assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),LEGACY_SEAT)).className,'기존반');
  });
  let secondId;
  await step('반을 나누면 명단과 체육 능력치가 섞이지 않는다',async()=>{
   const info=await classInfo(p);
   await p.click('#tt-class-add');
   await p.fill('#tt-class-names','둘째반');
   const nav=p.waitForNavigation();
   await p.click('#tt-class-create');await nav;await started(p);
   const after=await classInfo(p);
   secondId=after.registry.classes.find(c=>c.name==='둘째반').id;
   const nav2=p.waitForNavigation();
   await p.selectOption('#tt-class-select',secondId);await nav2;await started(p);
   const two=await classInfo(p);
   assert.equal(two.activeId,secondId);assert.notEqual(two.seatingKey,info.seatingKey);assert.deepEqual(two.names,[]);
   assert.equal(await p.evaluate(k=>Object.keys(JSON.parse(window.__TT_STORE.getItem(k)||'{}')).filter(x=>x!=='teamCount').length,two.peKey),0);
  });
  await step('모둠 균형 계산은 선택한 반의 능력치를 읽는다',async()=>{
   await setRoster(p,['하나','두리','세찬','네온']);await wait(200);
   const read=await p.evaluate(()=>{
    const c=window.__TT_STAGE031_CLASS,pe={},keys=[];
    const seats=classState.layout.cells.filter(x=>x.type!=='aisle'&&x.type!=='unused').slice(0,4).map(x=>x.id);
    classState.students.forEach((s,i)=>{pe[s.id]={traits:{leadership:i<2?4:1},fixedTeam:0}});
    const st=window.__TT_STORE;st.setItem(c.peKey,JSON.stringify(pe));
    classState.groups=[{id:'g1',name:'A',color:'#f00',seatIds:seats.slice(0,2)},{id:'g2',name:'B',color:'#00f',seatIds:seats.slice(2)}];
    const orig=st.getItem;
    st.getItem=k=>{keys.push(k);return orig(k)};
    const place=order=>order.map((i,n)=>({seatId:seats[n],studentId:classState.students[i].id}));
    let unbalanced,balanced;
    try{unbalanced=groupBalanceScore(place([0,1,2,3]));balanced=groupBalanceScore(place([0,2,1,3]))}finally{st.getItem=orig}
    classState.groups=[];
    return{keys,peKey:c.peKey,unbalanced,balanced};
   });
   assert.equal(read.keys.includes(LEGACY_PE),false);
   assert.equal(read.keys.includes(read.peKey),true);
   assert.ok(read.unbalanced>read.balanced,`${read.unbalanced} > ${read.balanced}`);
  });
  await step('한자 매니저 명단이 선택한 반을 따른다',async()=>{
   const hanja=await ctx.newPage();hanja.on('pageerror',e=>errors.push(e.message));
   await hanja.goto(BASE+'/hanja/');
   const names=await hanja.evaluate(async()=>(await import('/shared/student-registry.js')).readStudents().map(s=>s.name));
   assert.deepEqual(names,['하나','두리','세찬','네온']);
   await hanja.close();
  });
  await step('전체 백업과 복원이 성적까지 되돌린다',async()=>{
   const nav0=p.waitForNavigation();
   await p.selectOption('#tt-class-select',first.activeId);await nav0;await started(p);
   await p.click('#tt-full-backup');
   await p.check('#tt-backup-plain');
   const sealed=await download(p,()=>p.click('#tt-backup-export'));
   assert.equal(sealed.payload.classes.length,2);
   const grades=sealed.payload.gradeYears.flatMap(y=>y.workspace.gradeValues).filter(g=>g.value!==null);
   assert.equal(grades.length,4);
   const seat=sealed.payload.classes.find(c=>c.id===first.activeId);
   const id=seat.seating.students[0].id;assert.equal(seat.pe[id].traits.leadership,4);
   await p.click('#tt-backup-close');
   await setRoster(p,['덮어쓴학생']);
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
   await p.click('#rosterChangeApply');await wait(300);
   await p.click('#tt-full-backup');
   await uploadJson(p,'#tt-backup-file',sealed);
   await p.locator('#tt-backup-restore-confirm:not([hidden])').waitFor();
   await p.fill('#tt-backup-restore-word','복원');
   await p.check('#tt-backup-plain');
   const nav=p.waitForNavigation();
   const [before]=await Promise.all([p.waitForEvent('download'),p.click('#tt-backup-restore')]);
   assert.match(before.suggestedFilename(),/BEFORE_RESTORE/);
   await nav;await started(p);
   assert.equal((await classInfo(p)).names[0],'불러온학생');
   frame=await openGrades(p);await frame.locator('.nav[data-page="grades"]').click();await wait(400);
   const values=await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value));
   assert.deepEqual(values,['90','80','70','60','']);
   await openSeating(p);
  });
  await step('같은 이름의 반이 있으면 JSON 불러오기를 거부하고 자료를 바꾸지 않는다',async()=>{
   const data=await download(p,()=>p.evaluate(()=>document.getElementById('exportJson').click()));
   const beforeNames=(await classInfo(p)).names;
   data.classState.className='둘째반';data.classState.students[0].name='바뀌면안됨';
   await uploadJson(p,'#importJsonFile',data);await wait(500);
   assert.deepEqual((await classInfo(p)).names,beforeNames);
  });
  await step('복원을 되돌리면 복원 전 상태로 돌아간다',async()=>{
   await p.click('#tt-full-backup');
   await p.locator('#tt-backup-undo-box:not([hidden])').waitFor();
   const nav=p.waitForNavigation();
   await p.click('#tt-backup-undo');await nav;await started(p);
   assert.equal((await classInfo(p)).names[0],'덮어쓴학생');
   await p.click('#tt-full-backup');await wait(200);
   assert.equal(await p.locator('#tt-backup-undo-box').isVisible(),false);
   await p.click('#tt-backup-close');
   await p.evaluate(()=>{const t=document.getElementById('studentInput');t.value=['가','나','다','라'].join('\n');t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('applyStudents').click()});
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p.click('#rosterChangeApply');await wait(200);
  });
  await step('한 번에 저장이 실패하면 아무것도 바뀌지 않는다',async()=>{
   const out=await p.evaluate(async()=>{
    const s=window.__TT_STORE,c=window.__TT_STAGE031_CLASS,before=s.getItem(c.seatingKey);
    let failed=false;
    try{await s.commit({put:new Map([[c.seatingKey,'{"broken":true}'],['unsaveable',()=>1]])})}catch{failed=true}
    return{failed,same:s.getItem(c.seatingKey)===before,stored:await s.read(c.seatingKey)===before,extra:await s.read('unsaveable')};
   });
   assert.deepEqual(out,{failed:true,same:true,stored:true,extra:undefined});
  });
  await step('저장 실패는 화면에 알린다',async()=>{
   const shown=await p.evaluate(async()=>{
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(){throw new DOMException('quota','QuotaExceededError')};
    try{window.__TT_STORE.setItem('tt-fail-test','x');await new Promise(r=>setTimeout(r,100))}finally{IDBObjectStore.prototype.put=put}
    window.__TT_STORE.removeItem('tt-fail-test');
    const box=document.getElementById('storageAlert');return{hidden:box.classList.contains('hidden'),text:box.textContent};
   });
   assert.equal(shown.hidden,false);assert.match(shown.text,/저장에 실패/);
   await p.evaluate(()=>hideStorageAlert());
  });
  await step('두 번째 탭은 열리지 않고 자료를 건드리지 않는다',async()=>{
   const other=await ctx.newPage();
   await other.goto(BASE+'/seating/');
   await other.locator('.tt-start-blocked').waitFor({timeout:6000});
   assert.match(await other.locator('.tt-start-blocked').textContent(),/다른 탭/);
   assert.equal(await other.evaluate(()=>typeof classState),'undefined');
   await other.close();
  });
  await step('반 이름을 바꾼 뒤 바로 전체 백업할 수 있다',async()=>{
   const {ctx:cr,p:pr}=await newContext();
   await pr.goto(BASE+'/seating/');await started(pr);
   await pr.fill('#className','이름바꾼반');await pr.press('#className','Tab');await wait(200);
   await pr.click('#tt-full-backup');await pr.check('#tt-backup-plain');
   const b=await download(pr,()=>pr.click('#tt-backup-export'));
   assert.equal(b.payload.classes[0].name,'이름바꾼반');
   assert.equal(await pr.locator('#tt-class-select option:checked').textContent(),'이름바꾼반');
   await cr.close();
  });
  await step('학생 화면이 열린다',async()=>{
   await p.evaluate(()=>{classState.rules.completeRandom=true;classState.rules.groupBalance=false;classState.groups=[]});
   await p.click('#generateAssignment');await wait(200);
   if(await p.locator('#seatCountProceed:not(.hidden)').count())await p.click('#seatCountProceed');
   await wait(200);await p.click('#confirmAssignment');await wait(200);await p.click('#openPlayback');
   await p.locator('#playbackScreen:not(.hidden)').waitFor();
   await p.click('#instant');await wait(300);
   assert.ok(await p.locator('#seats .seat, #seats > *').count()>0);
   await p.click('#backToTeacher');
  });
  await ctx.close();
  await step('1~2월에는 전년도 학년도가 열린다',async()=>{
   const {ctx:c2,p:p2}=await newContext(new Date('2027-01-15T10:00:00+09:00'));
   await p2.goto(BASE+'/seating/');await started(p2);
   const f=await openGrades(p2);
   assert.equal(await f.locator('#year').inputValue(),'2026');
   const keys=await p2.evaluate(async()=>{const m=await import('/classroom/grades/storage.mjs');return(await m.listDrafts('TT_STAGE03_')).map(r=>r.key)});
   assert.ok(keys.length>0&&keys.every(k=>k.endsWith('_2026')),keys.join());
   await c2.close();
  });
  await step('04.1 자료와 성적을 옮기고 옛 자료는 남긴다',async()=>{
   const {ctx:c3,p:p3}=await newContext();
   await p3.goto(BASE+'/not-a-page');
   await p3.evaluate(async()=>{
    const {fresh,addAssessment,setGrade}=await import('/classroom/grades/model.mjs');
    const {projectRoster}=await import('/classroom/grades/roster-projection.mjs');
    const id='install-041',cls='class-041',pre=`tt.stage031.${id}`;
    const state={version:10,className:'이전반',students:[{id:'s1',name:'이전학생',gender:'none',balanceLevel:'none',apartFrom:[],fixedSeatId:null,assignmentExcluded:false}],layout:{rows:4,cols:8,cells:[]},groups:[],rules:{},assignments:[],history:[]};
    localStorage.setItem('tt.classroom.install-id',id);
    localStorage.setItem(`${pre}.classes`,JSON.stringify({version:1,activeId:cls,classes:[{id:cls,name:'이전반'}]}));
    localStorage.setItem(`${pre}.${cls}.seating`,JSON.stringify(state));
    localStorage.setItem(`${pre}.${cls}.pe`,'{}');
    const m=projectRoster(fresh(2026),{installId:id,sourceInstanceId:`${id}-${cls}`,className:'이전반',students:[{id:'s1',name:'이전학생',gender:'none'}]}).workspace;
    const a=addAssessment(m,{title:'옛평가',subject:'수학',criterion:'점수',maxScore:100,classIds:[m.classes[0].id]});
    setGrade(m,a.id,m.memberships[0].id,'77');
    await new Promise((res,rej)=>{const r=indexedDB.open('tt-integrated-mount-stage03-ISOLATED-v01',1);r.onupgradeneeded=()=>r.result.createObjectStore('workspaces');r.onerror=()=>rej(r.error);r.onsuccess=()=>{const tx=r.result.transaction('workspaces','readwrite');tx.objectStore('workspaces').put(m,`TT_STAGE03_${id}_2026`);tx.oncomplete=()=>{r.result.close();res()};tx.onerror=()=>rej(tx.error)}});
   });
   await p3.goto(BASE+'/seating/');await started(p3);
   const info=await classInfo(p3);
   assert.equal(info.installId,'install-041');assert.deepEqual(info.names,['이전학생']);
   const f=await openGrades(p3);await f.locator('.nav[data-page="grades"]').click();await wait(400);
   assert.deepEqual(await f.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value)),['77']);
   assert.notEqual(await p3.evaluate(()=>localStorage.getItem('tt.stage031.install-041.class-041.seating')),null);
   await openSeating(p3);await wait(300);
   await p3.click('#tt-full-backup');
   await p3.locator('#tt-old-data:not([hidden])').waitFor();
   await p3.click('#tt-old-data-remove');
   await p3.locator('#tt-old-data[hidden]').waitFor({state:'attached'});
   const left=await p3.evaluate(async()=>({keys:Object.keys(localStorage).filter(k=>k.startsWith('tt.stage031.')||k==='tt.classroom.install-id'),dbs:(await indexedDB.databases()).map(d=>d.name)}));
   assert.deepEqual(left.keys,[]);assert.equal(left.dbs.includes('tt-integrated-mount-stage03-ISOLATED-v01'),false);
   await p3.click('#tt-backup-close');
   await p3.reload();await started(p3);
   assert.deepEqual((await classInfo(p3)).names,['이전학생']);
   await c3.close();
  });
  await step('반을 지운 뒤 성적까지 복구하고, 완전 삭제하면 사라진다',async()=>{
   const {ctx:c4,p:p4}=await newContext();
   await p4.goto(BASE+'/seating/');await started(p4);
   await setRoster(p4,['가온','나래']);await p4.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p4.click('#rosterChangeApply');await wait(200);
   await p4.click('#tt-class-add');await p4.fill('#tt-class-names','지울반');
   let nav=p4.waitForNavigation();await p4.click('#tt-class-create');await nav;await started(p4);
   const keep=await classInfo(p4),doomed=keep.registry.classes.find(c=>c.name==='지울반').id;
   nav=p4.waitForNavigation();await p4.selectOption('#tt-class-select',doomed);await nav;await started(p4);
   await setRoster(p4,['다온']);await wait(200);
   let f=await openGrades(p4);
   await f.locator('.nav[data-page="assessments"]').click();
   await f.locator('input[name="subject"]').fill('과학');await f.locator('input[name="title"]').fill('실험');
   const boxes=f.locator('#assessment-form input[type="checkbox"]');
   assert.equal(await boxes.count(),1);
   await boxes.first().check();await f.locator('#assessment-form button[type="submit"]').click();
   await f.locator('.nav[data-page="grades"]').click();
   await f.locator('input.grade-input').first().fill('88');await f.locator('input.grade-input').first().blur();await wait(300);
   const remove=async()=>{
    await p4.click('#tt-class-add');
    await p4.locator('.tt-class-existing-row',{has:p4.locator('input[aria-label]')}).first().waitFor();
    const row=p4.locator('.tt-class-existing-row').filter({has:p4.locator(`input`)}).nth(1);
    await row.locator('button').click();await p4.click('#tt-class-create');
    await p4.fill('#tt-class-confirm-text','삭제');
    const n=p4.waitForNavigation();await p4.click('#tt-class-delete-final');await n;await started(p4);
   };
   await openSeating(p4);await wait(300);
   await remove();
   const gone=await classInfo(p4);
   assert.equal(gone.registry.classes.length,1);assert.equal(gone.activeId,keep.activeId);
   assert.equal(await p4.evaluate(k=>window.__TT_STORE.getItem(k),gone.seatingKey.replace(keep.activeId,doomed)),null);
   await p4.click('#tt-class-add');
   const rec=p4.locator('.tt-class-recovery-row');await rec.waitFor();
   assert.match(await rec.textContent(),/지울반.*학생 1명.*성적 1건/);
   nav=p4.waitForNavigation();await rec.getByRole('button',{name:'복구',exact:true}).click();await nav;await started(p4);
   const back=await classInfo(p4);
   assert.equal(back.registry.classes.length,2);
   nav=p4.waitForNavigation();await p4.selectOption('#tt-class-select',doomed);await nav;await started(p4);
   assert.deepEqual((await classInfo(p4)).names,['다온']);
   f=await openGrades(p4);await f.locator('.nav[data-page="grades"]').click();await wait(400);
   assert.deepEqual(await f.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value)),['88']);
   await openSeating(p4);await wait(300);
   nav=p4.waitForNavigation();await p4.selectOption('#tt-class-select',keep.activeId);await nav;await started(p4);
   await remove();
   await p4.click('#tt-class-add');
   await rec.waitFor();await rec.getByRole('button',{name:'완전 삭제'}).click();await wait(300);
   assert.equal(await p4.locator('.tt-class-recovery-row').count(),0);
   assert.equal(await p4.evaluate(async i=>(await window.__TT_STORE.list(`TT_DELETED_${i}_`)).length,keep.installId),0);
   await c4.close();
  });
  await step('저장 직후 강제 종료돼도 마지막 입력이 남는다',async()=>{
   const {ctx:c5,p:p5}=await newContext();
   await p5.goto(BASE+'/seating/');await started(p5);
   const cdp=await c5.newCDPSession(p5);
   await p5.evaluate(()=>{classState.className='종료직전';persistStateOnly()});
   cdp.send('Page.crash').catch(()=>{});await wait(600);
   const p6=await c5.newPage();p6.on('dialog',d=>d.accept());
   await p6.goto(BASE+'/seating/');await started(p6);
   assert.equal(await p6.evaluate(()=>classState.className),'종료직전');
   const key=(await classInfo(p6)).seatingKey;
   const raw=await p6.evaluate(k=>{const s=JSON.parse(window.__TT_STORE.getItem(k));s.className='임시기록';return JSON.stringify(s)},key);
   await p6.goto(BASE+'/not-a-page');
   await p6.evaluate(([k,v])=>localStorage.setItem('tt.classroom.wal.'+k,JSON.stringify(v)),[key,raw]);
   await p6.goto(BASE+'/seating/');await started(p6);
   assert.equal(await p6.evaluate(()=>classState.className),'임시기록');
   assert.equal(await p6.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tt.classroom.wal.')).length),0);
   await c5.close();
  });
  await step('복원 중 강제 종료돼도 자리와 성적이 어긋나지 않는다',async()=>{
   const {ctx:c6,p:p7}=await newContext();
   await p7.goto(BASE+'/seating/');await started(p7);
   const setState=async(name,score)=>{
    await p7.evaluate(n=>{classState.students[0].name=n;persistStateOnly()},name);
    const f=await openGrades(p7);
    await f.locator('.nav[data-page="grades"]').click();
    await f.locator('input.grade-input').first().fill(score);await f.locator('input.grade-input').first().blur();await wait(300);
    await openSeating(p7);await wait(300);
    await p7.click('#tt-full-backup');
    await p7.check('#tt-backup-plain');
    const b=await download(p7,()=>p7.click('#tt-backup-export'));
    await p7.click('#tt-backup-close');
    return b;
   };
   await setRoster(p7,['첫상태']);await p7.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p7.click('#rosterChangeApply');await wait(200);
   let f=await openGrades(p7);
   await f.locator('.nav[data-page="assessments"]').click();
   await f.locator('input[name="subject"]').fill('수학');await f.locator('input[name="title"]').fill('평가');
   await f.locator('#assessment-form input[type="checkbox"]').first().check();await f.locator('#assessment-form button[type="submit"]').click();
   await openSeating(p7);await wait(300);
   const bundles={첫상태:await setState('첫상태','11'),둘째상태:await setState('둘째상태','22')};
   const pair={첫상태:'11',둘째상태:'22'};
   let page=p7,current='둘째상태';const seen={old:0,new:0};
   for(const delay of [0,5,15,30,60,120,250,500]){
    const target=current==='첫상태'?'둘째상태':'첫상태';
    await page.click('#tt-full-backup');
    await uploadJson(page,'#tt-backup-file',bundles[target]);
    await page.locator('#tt-backup-restore-confirm:not([hidden])').waitFor();
    await page.fill('#tt-backup-restore-word','복원');
    await page.check('#tt-backup-plain');
    const cdp=await c6.newCDPSession(page);
    await page.click('#tt-backup-restore',{noWaitAfter:true});
    await wait(delay);
    cdp.send('Page.crash').catch(()=>{});await wait(500);
    page=await c6.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
    await page.goto(BASE+'/seating/');await started(page);
    const name=await page.evaluate(()=>classState.students[0].name);
    const fr=await openGrades(page);await fr.locator('.nav[data-page="grades"]').click();await wait(300);
    const score=await fr.locator('input.grade-input').first().inputValue();
    assert.equal(score,pair[name],`지연 ${delay}ms: ${name} / ${score}`);
    seen[name===target?'new':'old']++;
    current=name;
    await openSeating(page);await wait(200);
   }
   console.log('   강제 종료 결과: 복원 완료',seen.new,'회, 복원 전 상태',seen.old,'회');
   await c6.close();
  });
  await step('상단 메뉴가 노트북 폭에서도 잘리지 않는다',async()=>{
   const {ctx:c7,p:p8}=await newContext();
   await p8.goto(BASE+'/seating/');await started(p8);
   const bad=[];
   for(const width of [1280,1366,1440,1536,1600,1920]){
    await p8.setViewportSize({width,height:800});await wait(120);
    await p8.evaluate(()=>{document.getElementById('tt-cloud-chip').textContent='☁ 자료 차이 확인'});
    const r=await p8.evaluate(()=>{
     const ids=['undoButton','redoButton','generateAssignment','confirmAssignment','openPlayback','tt-full-backup','tt-lock-now','tt-cloud-chip','tt-class-add','tt-grade-tab','modeClassroom'];
     const out=ids.filter(id=>{const b=document.getElementById(id)?.getBoundingClientRect();return !b||b.top<0||b.left<0||b.right>innerWidth||b.bottom>innerHeight||b.width===0});
     return{out,scroll:document.documentElement.scrollWidth>innerWidth,bar:document.querySelector('.studio-topbar').getBoundingClientRect().height,overflow:document.querySelector('.studio-topbar').scrollHeight>document.querySelector('.studio-topbar').clientHeight+1};
    });
    if(r.out.length||r.scroll||r.overflow)bad.push([width,r]);
   }
   assert.deepEqual(bad,[]);
   await c7.close();
  });
  await step('임시 이름과 문구가 화면에 남아 있지 않다',async()=>{
   const {ctx:c8,p:p9}=await newContext();
   await p9.goto(BASE+'/seating/');await started(p9);
   assert.equal(await p9.title(),'교실 매니저');
   await p9.click('#tt-full-backup');
   const f=await openGradesAfterClose(p9);
   const texts=[await p9.evaluate(()=>document.body.innerText),await f.locator('body').evaluate(e=>e.innerText)];
   for(const t of texts)assert.doesNotMatch(t,/STAGE|시험판|시험용|시험 자료|통합 시험|V1\.00/);
   await c8.close();
  });
  await step('새 평가는 지금 반이 기본으로 선택된다',async()=>{
   const {ctx:c9,p:p10}=await newContext();
   await p10.goto(BASE+'/seating/');await started(p10);
   const f=await openGrades(p10);
   await f.locator('.nav[data-page="assessments"]').click();
   assert.equal(await f.locator('#class-checks input').first().isChecked(),true);
   await c9.close();
  });
  await step('번호를 고치면 성적표 순서가 따라가고 명단 순서는 번호를 바꾸지 않는다',async()=>{
   const {ctx:c10,p:p11}=await newContext();
   await p11.goto(BASE+'/seating/');await started(p11);
   await setRoster(p11,['가온','나래','다온']);await p11.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p11.click('#rosterChangeApply');await wait(200);
   let f=await openGrades(p11);
   await f.locator('.nav[data-page="classes"]').click();
   await f.locator('#edit-numbers').click();
   const input=n=>f.locator(`input[aria-label="${n} 번호"]`);
   await input('가온').fill('2');
   await f.locator('#save-numbers').click();await wait(200);
   assert.equal(await f.locator('input[aria-label="가온 번호"]').count(),1,'겹치는 번호는 저장되지 않음');
   await input('나래').fill('1');await input('다온').fill('15');
   await f.locator('#save-numbers').click();await wait(300);
   assert.deepEqual(await f.locator('.class-stage-student').evaluateAll(xs=>xs.map(x=>x.querySelector('.number').textContent+x.querySelector('.stage-student-name').textContent)),['1나래','2가온','15다온']);
   await openSeating(p11);await wait(300);
   await setRoster(p11,['다온','가온','나래','전학생']);await wait(300);
   f=await openGrades(p11);await wait(300);
   await f.locator('.nav[data-page="classes"]').click();
   assert.deepEqual(await f.locator('.class-stage-student').evaluateAll(xs=>xs.map(x=>x.querySelector('.number').textContent+x.querySelector('.stage-student-name').textContent)),['1나래','2가온','15다온','16전학생']);
   await c10.close();
  });
  await step('암호 백업은 맞는 암호로만 열리고 복원 전 파일도 암호로 저장된다',async()=>{
   const {ctx:c11,p:p12}=await newContext();
   await p12.goto(BASE+'/seating/');await started(p12);
   await setRoster(p12,['비밀학생']);await p12.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p12.click('#rosterChangeApply');await wait(200);
   await p12.click('#tt-full-backup');
   await p12.click('#tt-backup-export');await wait(200);
   assert.match(await p12.locator('#tt-backup-status').textContent(),/8자 이상/);
   await p12.fill('#tt-backup-pass','password1');await p12.fill('#tt-backup-pass2','password2');
   await p12.click('#tt-backup-export');await wait(200);
   assert.match(await p12.locator('#tt-backup-status').textContent(),/같지 않습니다/);
   await p12.fill('#tt-backup-pass2','password1');
   const [d]=await Promise.all([p12.waitForEvent('download'),p12.click('#tt-backup-export')]);
   const text=fs.readFileSync(await d.path(),'utf8');
   assert.doesNotMatch(text,/비밀학생/);
   const sealed=JSON.parse(text);assert.equal(sealed.header,'tt-encrypted-backup');
   await p12.click('#tt-backup-close');
   await setRoster(p12,['바뀐학생']);await p12.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p12.click('#rosterChangeApply');await wait(200);
   await p12.click('#tt-full-backup');
   await uploadJson(p12,'#tt-backup-file',sealed);
   await p12.locator('#tt-backup-open-box:not([hidden])').waitFor();
   await p12.fill('#tt-backup-open-pass','틀린암호입니다');await p12.click('#tt-backup-open');await wait(600);
   assert.match(await p12.locator('#tt-backup-status').textContent(),/맞지 않거나/);
   assert.equal(await p12.locator('#tt-backup-restore-confirm').isVisible(),false);
   await p12.fill('#tt-backup-open-pass','password1');await p12.click('#tt-backup-open');
   await p12.locator('#tt-backup-restore-confirm:not([hidden])').waitFor();
   await p12.fill('#tt-backup-restore-word','복원');
   const nav=p12.waitForNavigation();
   const [before]=await Promise.all([p12.waitForEvent('download'),p12.click('#tt-backup-restore')]);
   await nav;await started(p12);
   const beforeText=fs.readFileSync(await before.path(),'utf8');
   assert.doesNotMatch(beforeText,/바뀐학생/);assert.equal(JSON.parse(beforeText).header,'tt-encrypted-backup');
   assert.deepEqual((await classInfo(p12)).names,['비밀학생']);
   await c11.close();
  });
  await step('잠금: 번호로만 열리고 학생 화면에서 교사 화면으로 가지 못한다',async()=>{
   const {ctx:c12,p:p13}=await newContext();
   await p13.goto(BASE+'/seating/');await started(p13);
   await setRoster(p13,['가온','나래']);await p13.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p13.click('#rosterChangeApply');await wait(200);
   await p13.click('#tt-lock-now');
   await p13.fill('#tt-lock-new','12');await p13.fill('#tt-lock-new2','12');await p13.click('#tt-lock-save');await wait(100);
   assert.match(await p13.locator('#tt-lock-settings-error').textContent(),/4~8자리/);
   await p13.fill('#tt-lock-new','4826');await p13.fill('#tt-lock-new2','4826');await p13.click('#tt-lock-save');
   await p13.locator('#tt-lock-code-box:not([hidden])').waitFor({timeout:8000});
   const code=await p13.locator('#tt-lock-code-value').textContent();
   assert.match(code,/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
   await p13.click('#tt-lock-cancel');
   const locked=()=>p13.locator('.tt-lock:not([hidden])');
   const tap=async digits=>{for(const d of digits)await p13.click(`.tt-lock-keys [data-key="${d}"]`);await p13.click('.tt-lock-keys button[type=submit]')};
   await p13.click('#tt-lock-now');await locked().waitFor();
   assert.equal(await p13.evaluate(()=>document.getElementById('teacherScreen').inert),true);
   const box=await p13.locator('.tt-lock-keys').boundingBox();
   assert.ok(box.y>=1000*.34,'키패드는 화면 위쪽 34% 아래에 있다');
   await tap('1111');await p13.locator('#tt-lock-message',{hasText:'맞지 않습니다'}).waitFor({timeout:8000});
   assert.equal(await locked().count(),1);
   await tap('4826');await locked().waitFor({state:'detached',timeout:8000}).catch(()=>{});
   await p13.waitForFunction(()=>document.querySelector('.tt-lock').hidden,{},{timeout:8000});
   assert.equal(await p13.evaluate(()=>document.getElementById('teacherScreen').inert),false);
   await p13.reload();await started(p13);
   assert.equal(await locked().count(),1,'다시 열면 잠긴 상태');
   await tap('4826');await p13.waitForFunction(()=>document.querySelector('.tt-lock').hidden,{},{timeout:8000});
   await p13.click('#generateAssignment');await wait(200);
   if(await p13.locator('#seatCountProceed:not(.hidden)').count())await p13.click('#seatCountProceed');
   await wait(200);await p13.click('#confirmAssignment');await wait(200);await p13.click('#openPlayback');
   await p13.locator('#playbackScreen:not(.hidden)').waitFor();
   await p13.click('#backToTeacher');
   await locked().waitFor();
   assert.equal(await p13.locator('#playbackScreen').evaluate(e=>e.classList.contains('hidden')),false);
   await tap('4826');await p13.waitForFunction(()=>document.querySelector('.tt-lock').hidden,{},{timeout:8000});
   await p13.locator('#teacherScreen:not(.hidden)').waitFor();
   await p13.click('#tt-lock-now');await locked().waitFor();
   await p13.click('#tt-lock-forgot');
   await p13.fill('#tt-lock-code','WRONG-CODES');await p13.click('#tt-lock-recovery-form button[type=submit]');
   await p13.locator('#tt-lock-message',{hasText:'맞지 않습니다'}).waitFor({timeout:8000});
   await p13.fill('#tt-lock-code',code.toLowerCase());await p13.click('#tt-lock-recovery-form button[type=submit]');
   await p13.locator('.tt-lock-settings:not([hidden])').waitFor({timeout:8000});
   assert.equal(await p13.locator('#tt-lock-cancel').isVisible(),false);
   await p13.fill('#tt-lock-new','7391');await p13.fill('#tt-lock-new2','7391');await p13.click('#tt-lock-save');
   await p13.locator('#tt-lock-code-box:not([hidden])').waitFor({timeout:8000});
   await p13.click('#tt-lock-cancel');
   await p13.click('#tt-lock-open-settings');
   await p13.fill('#tt-lock-current','0000');await p13.click('#tt-lock-remove');
   await p13.locator('#tt-lock-settings-error',{hasText:'맞지 않습니다'}).waitFor({timeout:8000});
   await p13.fill('#tt-lock-current','7391');await p13.click('#tt-lock-remove');
   await p13.locator('.tt-lock-settings:has(#tt-lock-new)[hidden]').waitFor({state:'attached',timeout:8000});
   await p13.reload();await started(p13);
   assert.equal(await locked().count(),0,'잠금을 끄면 열린 상태로 시작');
   await c12.close();
  });
  await step('자동 잠금은 쉬면 작동하고 학생 화면 중에는 작동하지 않는다',async()=>{
   const {ctx:c13,p:p14}=await newContext();
   await p14.clock.install();
   await p14.goto(BASE+'/seating/');await started(p14);
   await p14.evaluate(()=>{const t=document.getElementById('studentInput');t.value='가온\n나래';t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('applyStudents').click()});
   await p14.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p14.click('#rosterChangeApply');
   await p14.click('#tt-lock-now');
   await p14.fill('#tt-lock-new','4826');await p14.fill('#tt-lock-new2','4826');await p14.selectOption('#tt-lock-idle','5');await p14.click('#tt-lock-save');
   await p14.locator('#tt-lock-code-box:not([hidden])').waitFor({timeout:8000});
   await p14.click('#tt-lock-cancel');
   await p14.click('#generateAssignment');await p14.clock.fastForward(300);
   if(await p14.locator('#seatCountProceed:not(.hidden)').count())await p14.click('#seatCountProceed');
   await p14.clock.fastForward(300);await p14.click('#confirmAssignment');await p14.clock.fastForward(300);await p14.click('#openPlayback');
   await p14.clock.fastForward('10:00');
   assert.equal(await p14.locator('.tt-lock').isVisible(),false,'학생 화면 중에는 잠기지 않음');
   await p14.evaluate(()=>{document.getElementById('playbackScreen').classList.add('hidden');document.getElementById('teacherScreen').classList.remove('hidden')});
   await p14.clock.fastForward('06:00');
   assert.equal(await p14.locator('.tt-lock').isVisible(),true,'쉬면 잠김');
   await c13.close();
  });
  await step('학생 화면 애니메이션이 끝까지 실행되고 되돌리기가 작동한다',async()=>{
   const {ctx:c14,p:p15}=await newContext();
   await p15.goto(BASE+'/seating/');await started(p15);
   const rows=await p15.evaluate(()=>classState.layout.rows);
   await p15.click('#rowPlus');await p15.click('#undoButton');
   assert.equal(await p15.evaluate(()=>classState.layout.rows),rows);
   await p15.click('#generateAssignment');await wait(200);
   if(await p15.locator('#seatCountProceed:not(.hidden)').count())await p15.click('#seatCountProceed');
   await wait(200);await p15.click('#confirmAssignment');await wait(200);await p15.click('#openPlayback');
   await p15.click('#run5');
   await p15.waitForFunction(()=>playbackCompleted,{},{timeout:90000});
   assert.equal(await p15.evaluate(()=>playbackStudents.length),10);
   await c14.close();
  });
  await step('공용 이미지와 도구 홈, 한자 매니저가 열린다',async()=>{
   const {ctx:c15,p:p16}=await newContext();
   const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
   const files=walk(path.join(repo,'shared/assets')).map(f=>path.relative(repo,f).split(path.sep).join('/'));
   assert.ok(files.length>50);
   for(const f of files)assert.equal((await c15.request.get(`${BASE}/${f}`)).status(),200,f);
   await p16.goto(BASE+'/');
   assert.equal(await p16.locator('a.app-card[href*="seating"]').count(),1);
   await p16.goto(BASE+'/hanja/');await p16.locator('body').waitFor();
   await c15.close();
  });
  await step('지난 학년도 성적을 읽기 전용으로 볼 수 있고 수정되지 않는다',async()=>{
   const {ctx:c16,p:p17}=await newContext();
   await p17.goto(BASE+'/seating/');await started(p17);
   await setRoster(p17,['올해학생']);await p17.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p17.click('#rosterChangeApply');await wait(200);
   const f=await openGrades(p17);
   const seeded=await p17.evaluate(async()=>{
    const {fresh,addAssessment,setGrade,schoolYear}=await import('/classroom/grades/model.mjs');
    const {projectRoster}=await import('/classroom/grades/roster-projection.mjs');
    const c=window.__TT_STAGE031_CLASS,past=schoolYear()-1;
    const w=projectRoster(fresh(past),{installId:c.installId,sourceInstanceId:c.installId+'-'+c.activeId,className:'작년반',students:[{id:'old-1',name:'작년학생',gender:'none'}]}).workspace;
    const a=addAssessment(w,{title:'작년평가',subject:'수학',criterion:'점수',maxScore:100,classIds:[w.classes[0].id]});
    setGrade(w,a.id,w.memberships[0].id,'66');
    await window.__TT_STORE.commit({put:new Map([[`TT_STAGE03_${c.installId}_${past}`,w]])});
    return{past,current:schoolYear()};
   });
   await openSeating(p17);await wait(200);
   const f2=await openGrades(p17);await wait(300);
   const select=f2.locator('#view-year');
   assert.deepEqual(await select.locator('option').evaluateAll(xs=>xs.map(x=>x.value)),[String(seeded.current),String(seeded.past)]);
   await select.selectOption(String(seeded.past));await wait(300);
   await f2.locator('.nav[data-page="grades"]').click();await wait(300);
   const cell=f2.locator('input.grade-input').first();
   assert.equal(await cell.inputValue(),'66');assert.equal(await cell.isDisabled(),true);
   assert.match(await p17.locator('#tt-stage03-status').textContent(),/읽기 전용/);
   await f2.locator('.nav[data-page="assessments"]').click();
   assert.equal(await f2.locator('#assessment-form').isVisible(),false);
   await p17.evaluate(()=>window.__TT_SEND=window.__TT_STAGE031_SEND_ROSTER&&window.__TT_STAGE031_SEND_ROSTER());await wait(300);
   const stored=await p17.evaluate(async y=>{const c=window.__TT_STAGE031_CLASS,w=await window.__TT_STORE.read(`TT_STAGE03_${c.installId}_${y}`);return w.memberships.map(m=>m.stage03SeatingId)},seeded.past);
   assert.deepEqual(stored,['old-1'],'지금 명단이 지난 학년도에 섞이지 않음');
   await select.selectOption(String(seeded.current));await wait(400);
   await f2.locator('.nav[data-page="grades"]').click();await wait(300);
   assert.equal(await f2.locator('input.grade-input').count(),0);
   await f2.locator('.nav[data-page="classes"]').click();
   assert.match(await f2.locator('.class-stage-student').first().textContent(),/올해학생/);
   assert.equal(await f2.locator('#edit-numbers').isVisible(),true);
   await c16.close();
  });
  await step('학생 화면 버튼은 칠판 위쪽 34% 아래에 있다',async()=>{
   const {ctx:c17,p:p18}=await newContext();
   await p18.setViewportSize({width:1920,height:1080});
   await p18.goto(BASE+'/seating/');await started(p18);
   await p18.click('#generateAssignment');await wait(200);
   if(await p18.locator('#seatCountProceed:not(.hidden)').count())await p18.click('#seatCountProceed');
   await wait(200);await p18.click('#confirmAssignment');await wait(200);await p18.click('#openPlayback');
   await p18.locator('#playbackScreen:not(.hidden)').waitFor();
   const tops=async sel=>p18.evaluate(s=>[...document.querySelectorAll(s)].filter(e=>e.offsetParent).map(e=>[e.id||e.textContent.trim(),Math.round(e.getBoundingClientRect().top)]),sel);
   for(const [id,top] of await tops('#run1,#run5,#instant,#backToTeacher'))assert.ok(top>=1080*.34,`${id} ${top}`);
   await p18.click('#instant');await p18.locator('#simpleViewButton:not(.hidden)').waitFor();
   await p18.click('#simpleViewButton');await wait(200);
   for(const [id,top] of await tops('.simple-actions button'))assert.ok(top>=1080*.34,`${id} ${top}`);
   await c17.close();
  });
  await step('외부로 나간 요청이 없다',async()=>assert.deepEqual(external,[]));
  await step('페이지 오류가 없다',async()=>assert.deepEqual(errors,[]));
 }finally{
  await browser.close();server.kill();
 }
 const failed=results.filter(r=>!r[1]).length;
 console.log(`\n${results.length-failed} PASS / ${failed} FAIL`);
 process.exit(failed?1:0);
})();
