// Real-browser check of the classroom manager, with virtual data only. Needs Playwright and installed Google Chrome.
// node classroom/tests/browser.cjs   (NODE_PATH may point to an existing Playwright installation)
const {chromium}=require('playwright');
const {openStudent}=require('./student-popup-helper.cjs');
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
 catch(e){results.push([name,false]);console.log('FAIL',name,'\n ',e.stack||e.message)}
}
const started=async p=>{
 await p.waitForFunction(()=>window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting')||document.querySelector('.tt-start-blocked'));
 const blocked=await p.locator('.tt-start-blocked').count();
 if(blocked)throw Error('Manager startup blocked: '+await p.locator('.tt-start-blocked').innerText());
 assert.equal(await p.evaluate(()=>typeof classState!=='undefined'),true,'Manager startup initialized');
};
async function settingsAction(p,id,section){
 if(!await p.locator('#tt-settings-overlay').isVisible())await p.click('#tt-hud-more-trigger');
 await p.click('[data-tt-section="'+section+'"]');
 await p.click('#'+id);
 // Undo/redo remain in the Tools panel (unlike the old dropdown).
 if(await p.locator('#tt-settings-overlay').isVisible())await p.click('#tt-settings-close');
}
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
const openSeating=p=>p.locator('#modeClassroom:visible,#tt-seat-subtab:visible').click();
async function setRoster(p,names){
 await p.locator('#modeClassroom:visible,#tt-seat-subtab:visible').waitFor();
 await p.evaluate(v=>{const t=document.getElementById('studentInput');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('applyStudents').click()},names.join('\n'));
}
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(PORT)],{stdio:'ignore'});
 await wait(500);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[],external=[];
 const newContext=async(clock)=>{
  const ctx=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
  ctx.on('request',r=>{if(!r.url().startsWith(BASE)&&!/^(data|blob):/.test(r.url())&&!r.url().includes('/npm/xlsx@')&&!/^http:\/\/127\.0\.0\.1:17439\/api\/(board-status|theme)$/.test(r.url()))external.push(r.url())});
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
  await p.goto(BASE+'/seating/?section=seating');await started(p);
  let first;
  await step('기존 자리배치 자료를 첫 반으로 옮기고 원본은 남긴다',async()=>{
   first=await classInfo(p);
   assert.deepEqual(first.names,['기존학생']);assert.equal(first.registry.classes[0].name,'기존반');
   assert.equal(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),LEGACY_SEAT)).className,'기존반');
  });
  await step('기존 학급은 줄바꿈 명단 입력을 숨기고 학생 번호를 표시한다',async()=>{
   await openSeating(p);
   assert.equal(await p.locator('#initialRosterBlock').evaluate(el=>el.classList.contains('hidden')),true);
   assert.equal(await p.locator('#registeredRosterHint').evaluate(el=>el.classList.contains('hidden')),false);
   assert.equal(await p.locator('#legacyNumberHint').evaluate(el=>el.classList.contains('hidden')),false);
   assert.equal(await p.locator('#studentCards .shared-student-number').first().textContent(),'1');
   await p.locator('#studentCards .seating-student-card').first().click();
   assert.match(await p.locator('#studentNameSlot').textContent(),/1번/);
  });
  await step('설정 탭 제거 후 학생·좌석 모둠·반 관리 데이터 도구 유지',async()=>{
   assert.equal(await p.locator('.dock-tab[data-tab="settings"]').count(),0);
   assert.equal(await p.locator('.dock-tab.on').first().getAttribute('data-tab'),'student');
   await p.locator('.dock-tab[data-tab="groups"]').click();
   assert.equal(await p.locator('.dock-panel[data-panel="groups"] #resetLayout').count(),1);
   await p.locator('#tt-class-add').click();
   assert.equal(await p.locator('#tt-class-modal #tt-class-data-placement #exportJson').count(),1);
   assert.equal(await p.locator('#tt-class-modal #tt-class-data-placement #importJson').count(),1);
   await p.locator('#tt-class-cancel').click();
   await p.locator('.dock-tab[data-tab="student"]').click();
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
  await step('학생 목록 스크롤바는 넘칠 때만 보이고 카드를 덮지 않으며 키보드로도 움직인다',async()=>{
   await openSeating(p);
   const scroller=p.locator('#studentCards'),track=p.locator('#studentScrollTrack');
   await p.waitForFunction(()=>document.querySelector('#studentCards').clientWidth>0);
   assert.equal(await track.isVisible(),false,'명단이 화면에 들어가면 스크롤바 숨김');
   await p.evaluate(()=>{
     document.querySelector('#studentCards').style.width='250px';
     document.querySelector('#studentScrollTrack').style.width='250px';
   });
   try{
     await p.waitForFunction(()=>!document.getElementById('studentScrollTrack').hidden);
     const geo=await p.evaluate(()=>{
       const cards=document.getElementById('studentCards'),track=document.getElementById('studentScrollTrack');
       return{overflow:cards.scrollWidth>cards.clientWidth+10,
         cardBottom:cards.querySelector('.student-card').getBoundingClientRect().bottom,
         trackTop:track.getBoundingClientRect().top,
         trackBottom:track.getBoundingClientRect().bottom,
         stripBottom:document.querySelector('#teacherScreen .student-strip').getBoundingClientRect().bottom};
     });
     assert.ok(geo.overflow,'스크롤이 실제 필요함');
     assert.ok(geo.trackTop>=geo.cardBottom,'스크롤바가 학생 카드를 덮지 않음');
     assert.ok(geo.stripBottom>=geo.trackBottom,'트랙이 패널 아래로 튀어나오지 않음');
     await track.click({position:{x:225,y:9}});
     await p.waitForFunction(()=>document.getElementById('studentCards').scrollLeft>0);
     await track.focus();
     await p.keyboard.press('Home');
     assert.equal(await scroller.evaluate(e=>e.scrollLeft),0);
     await p.keyboard.press('End');
     assert.ok(await scroller.evaluate(e=>e.scrollLeft)>0,'키보드 End 작동');
   }finally{
     await p.evaluate(()=>{
       document.querySelector('#studentCards').style.removeProperty('width');
       document.querySelector('#studentScrollTrack').style.removeProperty('width');
     });
   }
   await p.waitForFunction(()=>document.getElementById('studentScrollTrack').hidden);
   const geometry=await p.evaluate(()=>{
     const strip=document.querySelector('#teacherScreen .student-strip'),cards=document.querySelector('#studentCards'),studio=document.querySelector('#teacherScreen .studio'),track=document.querySelector('#studentScrollTrack');
     return{leftover:strip.getBoundingClientRect().bottom-cards.getBoundingClientRect().bottom,
       stripHeight:strip.getBoundingClientRect().height,cardsHeight:cards.getBoundingClientRect().height,
       cssRows:getComputedStyle(studio).gridTemplateRows,cssHeight:getComputedStyle(strip).height,
       trackHidden:track.hidden,trackDisplay:getComputedStyle(track).display};
   });
   assert.ok(geometry.leftover<22,'남는 하단 공간이 과도함: '+JSON.stringify(geometry));
  });
  await step('아바타 길게 누르기: 포인터 이동·번호 교환·놓으면 즉시 종료',async()=>{
   await openSeating(p);
   const origin=await p.evaluate(()=>classState.students.map(s=>s.id));
   const first=p.locator('#studentCards .seating-student-card').nth(0);
   const sprite=first.locator('.shared-student-sprite');
   const source=await sprite.boundingBox();
   const target=await p.locator('#studentCards .seating-student-card').nth(1).boundingBox();
   assert.ok(source&&target,'학생 카드가 화면에 있어야 함');
   await p.mouse.move(source.x+source.width/2,source.y+source.height/2);
   await p.mouse.down();await wait(480);
   assert.equal(await p.locator('.roster-ghost').count(),1,'길게 누르면 드래그 프리뷰 등장');
   assert.equal(await p.locator('.roster-ghost .shared-student-sprite').count(),0,'이동 프리뷰에는 아바타가 없어야 한다');
   assert.equal(await p.locator('.roster-ghost .roster-ghost-number').textContent(),'1');
   assert.equal(await p.locator('.roster-ghost .roster-ghost-name').textContent(),await first.locator('.shared-student-name').textContent());
   const start=await p.locator('.roster-ghost').boundingBox();
   const targetX=target.x+target.width*.82,targetY=target.y+target.height*.55;
   await p.mouse.move(targetX,targetY,{steps:7});
   const moved=await p.locator('.roster-ghost').boundingBox();
   assert.ok(moved.x>start.x+15,'떠 있는 카드가 포인터를 따라 이동');
   assert.ok(Math.abs(moved.x+moved.width/2-targetX)<16,'프리뷰 중심과 마우스가 일치');
   await p.mouse.up();
   assert.equal(await p.locator('.roster-ghost').count(),0,'버튼을 놓으면 프리뷰 제거');
   assert.equal(await p.evaluate(()=>document.body.classList.contains('roster-grabbing')),false);
   assert.equal(await p.locator('#studentCards .seating-student-card').first().getAttribute('data-student-id'),origin[1],'카드 순서 변경');
   assert.equal(await p.locator('#studentCards .shared-student-number').first().textContent(),'1');
   assert.equal(await p.locator('#studentCards .shared-student-number').nth(1).textContent(),'2');
   assert.equal(await p.evaluate(ids=>reorderStudentsByIds(ids),origin),true);
  });
  await step('명단 밖에서 마우스 놓기·Escape·짧은 클릭은 유령 카드를 남기지 않는다',async()=>{
   await openSeating(p);
   const origin=await p.evaluate(()=>classState.students.map(s=>s.id));
   const sprite=p.locator('#studentCards .seating-student-card').nth(0).locator('.shared-student-sprite');
   let box=await sprite.boundingBox();
   const x=box.x+box.width/2,y=box.y+box.height/2;
   await p.mouse.move(x,y);await p.mouse.down();await wait(470);
   await p.mouse.move(x+45,y-120,{steps:5});
   assert.equal(await p.locator('.roster-ghost').count(),1,'명단 밖에서도 프리뷰가 존재');
   await p.mouse.up();
   assert.equal(await p.locator('.roster-ghost').count(),0,'명단 밖 놓기 후 종료');
   assert.deepEqual(await p.evaluate(()=>classState.students.map(s=>s.id)),origin);
   box=await sprite.boundingBox();
   await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
   await p.mouse.down();await wait(440);await p.keyboard.press('Escape');
   assert.equal(await p.locator('.roster-ghost').count(),0,'Escape 취소');
   await p.mouse.up();
   box=await sprite.boundingBox();
   await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
   await p.mouse.down();await wait(60);await p.mouse.up();
   assert.equal(await p.locator('.roster-ghost').count(),0,'짧은 클릭은 정렬 시작하지 않음');
   assert.equal(await p.locator('#studentCards .seating-student-card').first().getAttribute('draggable'),'true','기존 지정석 드래그 복원');
   assert.deepEqual(await p.evaluate(()=>classState.students.map(s=>s.id)),origin);
  });
  await step('성적을 입력하면 명단과 연결된다',async()=>{
   frame=await openGrades(p);
   const gradeBottomGap=await p.evaluate(()=>{
     const strip=document.querySelector('#teacherScreen .student-strip'),cards=document.getElementById('studentCards');
     return strip.getBoundingClientRect().bottom-cards.getBoundingClientRect().bottom;
   });
   assert.ok(gradeBottomGap<22,'성적관리 공용 셸도 여백 없이 학생 명단을 표시: '+gradeBottomGap);
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
  await step('학생 참가 태그 클릭과 기존 우클릭 모두 배치 참가를 전환한다',async()=>{
   await openSeating(p);
   const card=p.locator('#studentCards .seating-student-card').first();
   const id=await card.getAttribute('data-student-id');
   const excluded=()=>p.evaluate(id=>classState.students.find(s=>s.id===id)?.assignmentExcluded===true,id);
   assert.equal(await excluded(),false);
   await card.locator('button.shared-student-status').click();
   assert.equal(await excluded(),true);
   assert.equal(await card.locator('button.shared-student-status').textContent(),'제외');
   await card.locator('button.shared-student-status').click();
   assert.equal(await excluded(),false);
   await card.click({button:'right'});
   assert.equal(await excluded(),true);
   await card.click({button:'right'});
   assert.equal(await excluded(),false);
  });
  await step('카드 순서를 바꿔도 성적·학생 ID는 보존되고 번호만 변경된다',async()=>{
   await openSeating(p);
   const before=await p.evaluate(()=>classState.students.map(s=>s.id)),reverse=[...before].reverse();
   assert.equal(await p.evaluate(ids=>reorderStudentsByIds(ids),reverse),true);
   assert.deepEqual(await p.evaluate(()=>classState.students.map(s=>s.id)),reverse);
   assert.equal(await p.evaluate(()=>classState.ui.numberMode),'ordered');
   assert.equal(await p.locator('#legacyNumberHint').evaluate(el=>el.classList.contains('hidden')),true);
   frame=await openGrades(p);await wait(500);
   assert.deepEqual(await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value)),['60','70','80','90']);
   await openSeating(p);
   assert.equal(await p.evaluate(ids=>reorderStudentsByIds(ids),before),true);
   frame=await openGrades(p);await wait(500);
   assert.deepEqual(await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value)),['90','80','70','60']);
  });
  await step('이름 수정과 추가를 함께 해도 같은 줄이면 성적이 이어진다',async()=>{
   await openSeating(p);await wait(300);
   await setRoster(p,['가온','나래2','다온','라온','전학생']);
   await p.locator('#rosterChangeDialog:not(.hidden)').waitFor();
   assert.equal(await p.locator('#rosterChangeRows select').inputValue(),'');
   assert.match(await p.locator('#rosterChangeAdded').textContent(),/전학생/);
   await p.locator('#rosterChangeRows select').selectOption({label:'이름 변경: 나래2'});
   await p.click('#rosterChangeApply');await wait(300);
   frame=await openGrades(p);await wait(400);
   const values=await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value));
   assert.deepEqual(values,['90','80','70','60','']);
   assert.equal(await p.evaluate(()=>classState.students[1].name),'나래2');
  });
  await step('이름을 잘라 붙여 순서만 바꿔도 동일 학생 ID와 성적을 유지한다',async()=>{
   await openSeating(p);await wait(200);
   const before=await p.evaluate(()=>classState.students.map(s=>({id:s.id,name:s.name})));
   const names=[...before].reverse().map(s=>s.name);
   await setRoster(p,names);await wait(300);
   assert.deepEqual(await p.evaluate(()=>classState.students.map(s=>s.name)),names);
   const after=await p.evaluate(()=>classState.students.map(s=>({id:s.id,name:s.name})));
   assert.deepEqual(after.map(s=>s.id),[...before].reverse().map(s=>s.id));
   assert.equal(await p.locator('#rosterChangeDialog:not(.hidden)').count(),0);
   await setRoster(p,before.map(s=>s.name));await wait(300);
   frame=await openGrades(p);await wait(400);
   assert.deepEqual(await frame.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value)),['90','80','70','60','']);
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
   // Card-order numbering places the new student at their visible position.
   assert.deepEqual(hidden,['90','','70','60','']);
   await frame.locator('.nav[data-page="classes"]').click();
   const row=frame.locator('.inactive-student-row');
   await row.waitFor();assert.match(await row.textContent(),/나래2.*성적 1건/);
   await row.locator('select').selectOption({label:'2. 새학생'});
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
   assert.equal(await p.locator('#initialRosterBlock').evaluate(el=>el.classList.contains('hidden')),false);
   assert.equal(await p.evaluate(()=>classState.ui.numberMode),'legacy');
   await p.locator('#initialRosterDialog[open]').waitFor();
   assert.equal(await p.locator('#initialRosterBlock').isVisible(),true);
   await p.locator('#skipInitialRoster').click();
   assert.equal(await p.locator('#initialRosterDialog').evaluate(el=>el.open),false);
   assert.equal(await p.locator('#openRosterOnboarding').isVisible(),true);
   await p.locator('#openRosterOnboarding').click();
   await p.locator('#initialRosterDialog[open]').waitFor();
   assert.equal(await p.evaluate(k=>Object.keys(JSON.parse(window.__TT_STORE.getItem(k)||'{}')).filter(x=>x!=='teamCount').length,two.peKey),0);
  });
  await step('모둠 균형 계산은 선택한 반의 능력치를 읽는다',async()=>{
   await setRoster(p,['하나','두리','세찬','네온']);await wait(200);
   assert.equal(await p.locator('#initialRosterBlock').evaluate(el=>el.classList.contains('hidden')),true);
   assert.equal(await p.evaluate(()=>classState.ui.numberMode),'ordered');
   assert.equal(await p.locator('#initialRosterDialog').evaluate(el=>el.open),false);
   assert.equal(await p.locator('#openRosterOnboarding').isVisible(),false);
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
   await settingsAction(p,'tt-full-backup','backup');
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
   await settingsAction(p,'tt-full-backup','backup');
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
   await settingsAction(p,'tt-full-backup','backup');
   await p.locator('#tt-backup-undo-box:not([hidden])').waitFor();
   const nav=p.waitForNavigation();
   await p.click('#tt-backup-undo');await nav;await started(p);
   assert.equal((await classInfo(p)).names[0],'덮어쓴학생');
   await settingsAction(p,'tt-full-backup','backup');await wait(200);
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
   await other.goto(BASE+'/seating/?section=seating');
   await other.locator('.tt-start-blocked').waitFor({timeout:6000});
   assert.match(await other.locator('.tt-start-blocked').textContent(),/다른 탭/);
   assert.equal(await other.evaluate(()=>typeof classState),'undefined');
   await other.close();
  });
  await step('반 이름을 바꾼 뒤 바로 전체 백업할 수 있다',async()=>{
   const {ctx:cr,p:pr}=await newContext();
   await pr.goto(BASE+'/seating/?section=seating');await started(pr);
   // Initial classes can contain bundled sample pupils. Only a truly empty
   // new class opens the one-time roster dialog.
   if(await pr.evaluate(()=>classState.students.length===0&&classState.ui.initialRosterApplied!==true)){
    await pr.locator('#initialRosterDialog[open]').waitFor();
    await pr.locator('#skipInitialRoster').click();
   }
   await pr.locator('#tt-class-add').click();
   await pr.locator('#tt-class-existing input').first().fill('이름바꾼반');
   await Promise.all([pr.waitForEvent('load'),pr.locator('#tt-class-create').click()]);
   await started(pr);
   if(await pr.locator('#initialRosterDialog').evaluate(el=>el.open))await pr.locator('#skipInitialRoster').click();
   await settingsAction(pr,'tt-full-backup','backup');await pr.check('#tt-backup-plain');
   const b=await download(pr,()=>pr.click('#tt-backup-export'));
   assert.equal(b.payload.classes[0].name,'이름바꾼반');
   assert.equal(await pr.locator('#tt-class-select option:checked').textContent(),'이름바꾼반');
   await cr.close();
  });
  await step('학생 화면이 열린다',async()=>{
   await p.evaluate(()=>{classState.rules.completeRandom=true;classState.rules.groupBalance=false;classState.groups=[]});
   await p.click('#generateAssignment');await wait(200);
   if(await p.locator('#seatCountProceed:not(.hidden)').count())await p.click('#seatCountProceed');
   await wait(200);await p.click('#confirmAssignment');await wait(200);const student=await openStudent(p);
   await student.click('#instant');await wait(300);
   assert.ok(await student.locator('#seats .seat, #seats > *').count()>0);
   await student.close();
  });
  await ctx.close();
  await step('1~2월에는 전년도 학년도가 열린다',async()=>{
   const {ctx:c2,p:p2}=await newContext(new Date('2027-01-15T10:00:00+09:00'));
   await p2.goto(BASE+'/seating/?section=seating');await started(p2);
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
   await p3.goto(BASE+'/seating/?section=seating');await started(p3);
   const info=await classInfo(p3);
   assert.equal(info.installId,'install-041');assert.deepEqual(info.names,['이전학생']);
   const f=await openGrades(p3);await f.locator('.nav[data-page="grades"]').click();await wait(400);
   assert.deepEqual(await f.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value)),['77']);
   assert.notEqual(await p3.evaluate(()=>localStorage.getItem('tt.stage031.install-041.class-041.seating')),null);
   await openSeating(p3);await wait(300);
   await settingsAction(p3,'tt-full-backup','backup');
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
   await p4.goto(BASE+'/seating/?section=seating');await started(p4);
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
   await p5.goto(BASE+'/seating/?section=seating');await started(p5);
   const cdp=await c5.newCDPSession(p5);
   await p5.evaluate(()=>{classState.className='종료직전';persistStateOnly()});
   const crashed=p5.waitForEvent('crash',{timeout:10000});void cdp.send('Page.crash').catch(()=>{});await crashed;await p5.close();
   const p6=await c5.newPage();p6.on('dialog',d=>d.accept());
   await p6.goto(BASE+'/seating/?section=seating');await started(p6);
   assert.equal(await p6.evaluate(()=>classState.className),'종료직전');
   const key=(await classInfo(p6)).seatingKey;
   const raw=await p6.evaluate(k=>{const s=JSON.parse(window.__TT_STORE.getItem(k));s.className='임시기록';return JSON.stringify(s)},key);
   await p6.goto(BASE+'/not-a-page');
   await p6.evaluate(([k,v])=>localStorage.setItem('tt.classroom.wal.'+k,JSON.stringify(v)),[key,raw]);
   await p6.goto(BASE+'/seating/?section=seating');await started(p6);
   assert.equal(await p6.evaluate(()=>classState.className),'임시기록');
   assert.equal(await p6.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tt.classroom.wal.')).length),0);
   await c5.close();
  });
  await step('복원 중 강제 종료돼도 자리와 성적이 어긋나지 않는다',async()=>{
   const {ctx:c6,p:p7}=await newContext();
   await p7.goto(BASE+'/seating/?section=seating');await started(p7);
   const setState=async(name,score)=>{
    await p7.evaluate(n=>{classState.students[0].name=n;persistStateOnly()},name);
    const f=await openGrades(p7);
    await f.locator('.nav[data-page="grades"]').click();
    await f.locator('input.grade-input').first().fill(score);await f.locator('input.grade-input').first().blur();await wait(300);
    await openSeating(p7);await wait(300);
    await settingsAction(p7,'tt-full-backup','backup');
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
    await settingsAction(page,'tt-full-backup','backup');
    await uploadJson(page,'#tt-backup-file',bundles[target]);
    await page.locator('#tt-backup-restore-confirm:not([hidden])').waitFor();
    await page.fill('#tt-backup-restore-word','복원');
    await page.check('#tt-backup-plain');
    const cdp=await c6.newCDPSession(page);
    // A crash must actually have occurred, not just a rejected CDP request.
    // Keep the browser context/profile, close the crashed tab only after crash
    // acknowledgement, then start a new tab with the same IndexedDB and WAL.
    const crashed=page.waitForEvent('crash',{timeout:10000});
    await page.click('#tt-backup-restore',{noWaitAfter:true});
    await wait(delay);
    const request=cdp.send('Page.crash').catch(()=>{});
    await crashed;void request;
    await page.close();
    page=await c6.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
    try{
     await page.goto(BASE+'/seating/?section=seating');await started(page);
    }catch(e){throw Error('복원 강제 종료 '+delay+'ms / 새 탭 시작: '+e.message,{cause:e})}
    // Read committed data before opening grades: roster projection must not
    // repair or obscure a partially restored grade record.
    const persisted=await page.evaluate(async()=>{
     const c=window.__TT_STAGE031_CLASS,store=window.__TT_STORE;
     const {schoolYear}=await import('/classroom/grades/model.mjs');
     const raw=await store.read(c.seatingKey),w=await store.read('TT_STAGE03_'+c.installId+'_'+schoolYear());
     const pupil=JSON.parse(raw).students[0];
     const cls=w?.classes.find(x=>x.stage03SourceId===c.installId+'-'+c.activeId);
     const mem=w?.memberships.find(x=>x.classId===cls?.id&&x.stage03SeatingId===pupil.id&&x.active);
     const assessment=w?.assessments.find(x=>x.title==='평가'&&x.subject==='수학'&&x.classIds.includes(cls?.id));
     const grade=w?.gradeValues.find(x=>x.membershipId===mem?.id&&x.assessmentId===assessment?.id);
     return {name:pupil.name,linked:Boolean(mem&&assessment&&grade),score:grade?.value};
    });
    const name=await page.evaluate(()=>classState.students[0].name);
    assert.equal(persisted.name,name,'재시작 후 메모리/저장 명단 일치');
    assert.ok(Object.hasOwn(pair,name),'복원 전/후 상태 중 하나');
    assert.equal(persisted.linked,true,'원본 학생 ID와 평가 ID에 연결된 성적 존재');
    assert.equal(String(persisted.score),pair[name],'원본 성적과 자리 명단 일치');
    const fr=await openGrades(page);await fr.locator('.nav[data-page="grades"]').click();await wait(300);
    const score=await fr.locator('input.grade-input').first().inputValue();
    assert.equal(score,pair[name],`지연 ${delay}ms: ${name} / ${score}`);
    console.log('   강제 종료 '+delay+'ms: '+(name===target?'복원 완료':'복원 전 상태')+' / 자리·성적 일치');
    seen[name===target?'new':'old']++;
    current=name;
    await openSeating(page);await wait(200);
   }
   console.log('   강제 종료 결과: 복원 완료',seen.new,'회, 복원 전 상태',seen.old,'회');
   await c6.close();
  });
  await step('상단 메뉴가 노트북 폭에서도 잘리지 않는다',async()=>{
   const {ctx:c7,p:p8}=await newContext();
   await p8.goto(BASE+'/seating/?section=seating');await started(p8);
   const bad=[];
   for(const width of [1280,1366,1440,1536,1600,1920]){
    await p8.setViewportSize({width,height:800});await wait(120);
    await p8.evaluate(()=>{document.getElementById('tt-cloud-chip').textContent='☁ 자료 차이 확인'});
    const r=await p8.evaluate(()=>{
     const compact=innerWidth<=1400;
     const ids=['tt-manager-home-button',...(compact?['tt-hud-work-toggle']:['generateAssignment','confirmAssignment','openPlayback']),'tt-cloud-chip','tt-hud-more-trigger','tt-class-add','tt-grade-tab','tt-seat-subtab','modePE','tt-life-tab','tt-board-tab'];
     const out=ids.filter(id=>{const b=document.getElementById(id)?.getBoundingClientRect();return !b||b.top<0||b.left<0||b.right>innerWidth||b.bottom>innerHeight||b.width===0});
     const header=document.querySelector('.studio-topbar'),box=header.getBoundingClientRect();
     const clipped=ids.filter(id=>{const b=document.getElementById(id)?.getBoundingClientRect();return b&&(b.top<box.top-1||b.bottom>box.bottom+1)});
     const overflow=header.scrollHeight>header.clientHeight+1;
     return{out,clipped,scroll:document.documentElement.scrollWidth>innerWidth,bar:box.height,overflow,...(overflow?{detail:{scroll:header.scrollHeight,client:header.clientHeight,rows:getComputedStyle(header).gridTemplateRows,children:[...header.children].filter(e=>e.getClientRects().length).map(e=>[e.id||e.className,Math.round(e.getBoundingClientRect().top-box.top),Math.round(e.getBoundingClientRect().bottom-box.top)])}}:{})};
    });
    if(r.out.length||r.clipped.length||r.scroll||r.overflow||r.bar>61)bad.push([width,r]);
    if(width<=1400){
     await p8.locator('#tt-hud-work-toggle').click();
     for(const id of ['generateAssignment','confirmAssignment','openPlayback']){
      const button=p8.locator('#'+id);assert.ok(await button.isVisible(),'compact work button '+id+' '+width);
      const b=await button.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=800,'work popover bounds '+id+' '+width);
     }
     await p8.keyboard.press('Escape');assert.equal(await p8.locator('#generateAssignment').isVisible(),false);
    }
   }
   assert.deepEqual(bad,[]);
   await c7.close();
  });
  await step('임시 이름과 문구가 화면에 남아 있지 않다',async()=>{
   const {ctx:c8,p:p9}=await newContext();
   await p9.goto(BASE+'/seating/?section=seating');await started(p9);
   assert.equal(await p9.title(),'교실 매니저');
   await settingsAction(p9,'tt-full-backup','backup');
   const f=await openGradesAfterClose(p9);
   const texts=[await p9.evaluate(()=>document.body.innerText),await f.locator('body').evaluate(e=>e.innerText)];
   for(const t of texts)assert.doesNotMatch(t,/STAGE|시험판|시험용|시험 자료|통합 시험|V1\.00/);
   await c8.close();
  });
  await step('새 평가는 지금 반이 기본으로 선택된다',async()=>{
   const {ctx:c9,p:p10}=await newContext();
   await p10.goto(BASE+'/seating/?section=seating');await started(p10);
   const f=await openGrades(p10);
   await f.locator('.nav[data-page="assessments"]').click();
   assert.equal(await f.locator('#class-checks input').first().isChecked(),true);
   await c9.close();
  });
  await step('기존 레거시 학급은 수동 번호 편집을 유지하고 명단 정렬과 분리한다',async()=>{
   const {ctx:c10,p:p11}=await newContext();
   await p11.goto(BASE+'/seating/?section=seating');await started(p11);
   await setRoster(p11,['가온','나래','다온']);await p11.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p11.click('#rosterChangeApply');await wait(200);
   // Explicit legacy class: grade numbers were independently set before card-order mode.
   await p11.evaluate(()=>{classState.ui.numberMode='legacy';saveState()});
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
   await p12.goto(BASE+'/seating/?section=seating');await started(p12);
   await setRoster(p12,['비밀학생']);await p12.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p12.click('#rosterChangeApply');await wait(200);
   await settingsAction(p12,'tt-full-backup','backup');
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
   await settingsAction(p12,'tt-full-backup','backup');
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
   await p13.goto(BASE+'/seating/?section=seating');await started(p13);
   await setRoster(p13,['가온','나래']);await p13.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p13.click('#rosterChangeApply');await wait(200);
   await settingsAction(p13,'tt-lock-now','security');
   await p13.fill('#tt-lock-new','12');await p13.fill('#tt-lock-new2','12');await p13.click('#tt-lock-save');await wait(100);
   assert.match(await p13.locator('#tt-lock-settings-error').textContent(),/4~8자리/);
   await p13.fill('#tt-lock-new','4826');await p13.fill('#tt-lock-new2','4826');await p13.click('#tt-lock-save');
   await p13.locator('#tt-lock-code-box:not([hidden])').waitFor({timeout:8000});
   const code=await p13.locator('#tt-lock-code-value').textContent();
   assert.match(code,/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
   await p13.click('#tt-lock-cancel');
   const locked=()=>p13.locator('.tt-lock:not([hidden])');
   const tap=async digits=>{for(const d of digits)await p13.click(`.tt-lock-keys [data-key="${d}"]`);await p13.click('.tt-lock-keys button[type=submit]')};
   await settingsAction(p13,'tt-lock-now','security');await locked().waitFor();
   assert.equal(await p13.evaluate(()=>document.getElementById('teacherScreen').inert),true);
   const center=await p13.locator('.tt-lock-card').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2-innerWidth/2,y:r.y+r.height/2-innerHeight/2}});
   assert.ok(Math.abs(center.x)<2&&Math.abs(center.y)<2,'잠금 카드 화면 중앙');
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
   await wait(200);await p13.click('#confirmAssignment');await wait(200);const student=await openStudent(p13);
   assert.equal(await student.locator('#backToTeacher,#simpleBackToTeacher').count(),0,'학생 창에는 교사 복귀 버튼이 없음');
   assert.equal(await student.evaluate(()=>Boolean(window.__TT_LOCK)),false);
   await student.close();
   await p13.locator('#teacherScreen:not(.hidden)').waitFor();
   await settingsAction(p13,'tt-lock-now','security');await locked().waitFor();
   await p13.click('#tt-lock-forgot');
   await p13.fill('#tt-lock-code','WRONG-CODES');await p13.click('#tt-lock-recovery-form button[type=submit]');
   await p13.locator('#tt-lock-message',{hasText:'맞지 않습니다'}).waitFor({timeout:8000});
   await p13.fill('#tt-lock-code',code.toLowerCase());await p13.click('#tt-lock-recovery-form button[type=submit]');
   await p13.locator('.tt-lock-settings:not([hidden])').waitFor({timeout:8000});
   assert.equal(await p13.locator('#tt-lock-cancel').isVisible(),false);
   await p13.fill('#tt-lock-new','7391');await p13.fill('#tt-lock-new2','7391');await p13.click('#tt-lock-save');
   await p13.locator('#tt-lock-code-box:not([hidden])').waitFor({timeout:8000});
   await p13.click('#tt-lock-cancel');
   await settingsAction(p13,'tt-lock-open-settings','security');
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
   await p14.goto(BASE+'/seating/?section=seating');await started(p14);
   await p14.evaluate(()=>{const t=document.getElementById('studentInput');t.value='가온\n나래';t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('applyStudents').click()});
   await p14.locator('#rosterChangeDialog:not(.hidden)').waitFor();await p14.click('#rosterChangeApply');
   await settingsAction(p14,'tt-lock-now','security');
   await p14.fill('#tt-lock-new','4826');await p14.fill('#tt-lock-new2','4826');await p14.selectOption('#tt-lock-idle','5');await p14.click('#tt-lock-save');
   await p14.locator('#tt-lock-code-box:not([hidden])').waitFor({timeout:8000});
   await p14.click('#tt-lock-cancel');
   await p14.click('#generateAssignment');await p14.clock.fastForward(300);
   if(await p14.locator('#seatCountProceed:not(.hidden)').count())await p14.click('#seatCountProceed');
   await p14.clock.fastForward(300);await p14.click('#confirmAssignment');await p14.clock.fastForward(300);const student=await openStudent(p14);
   await p14.clock.fastForward('10:00');
   assert.equal(await p14.locator('.tt-lock').isVisible(),false,'학생 화면 중에는 잠기지 않음');
   await student.close();
   await p14.clock.fastForward('06:00');
   assert.equal(await p14.locator('.tt-lock').isVisible(),true,'쉬면 잠김');
   await c13.close();
  });
  await step('학생 화면 애니메이션이 끝까지 실행되고 되돌리기가 작동한다',async()=>{
   const {ctx:c14,p:p15}=await newContext();
   await p15.goto(BASE+'/seating/?section=seating');await started(p15);
   const rows=await p15.evaluate(()=>classState.layout.rows);
   await p15.click('#rowPlus');await settingsAction(p15,'undoButton','tools');
   assert.equal(await p15.evaluate(()=>classState.layout.rows),rows);
   await p15.click('#generateAssignment');await wait(200);
   if(await p15.locator('#seatCountProceed:not(.hidden)').count())await p15.click('#seatCountProceed');
   await wait(200);await p15.click('#confirmAssignment');await wait(200);const student=await openStudent(p15);
   await student.click('#run5');
   await student.waitForFunction(()=>playbackCompleted,{},{timeout:90000});
   assert.equal(await student.evaluate(()=>playbackStudents.length),10);
   await student.close();
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
   await p17.goto(BASE+'/seating/?section=seating');await started(p17);
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
   assert.deepEqual(await select.locator('option').evaluateAll(xs=>xs.map(x=>x.value)),[String(seeded.current),String(seeded.past),String(seeded.current-2)]);
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
   assert.equal(await f2.locator('#edit-numbers').isVisible(),false,'새 학급은 카드 순서가 출석번호의 기준');
   await c16.close();
  });
  await step('학생 화면 버튼은 칠판 위쪽 34% 아래에 있다',async()=>{
   const {ctx:c17,p:p18}=await newContext();
   await p18.setViewportSize({width:1920,height:1080});
   await p18.goto(BASE+'/seating/?section=seating');await started(p18);
   await p18.click('#generateAssignment');await wait(200);
   if(await p18.locator('#seatCountProceed:not(.hidden)').count())await p18.click('#seatCountProceed');
   await wait(200);await p18.click('#confirmAssignment');await wait(200);const student=await openStudent(p18);
   const tops=async sel=>student.evaluate(s=>[...document.querySelectorAll(s)].filter(e=>e.offsetParent).map(e=>[e.id||e.textContent.trim(),Math.round(e.getBoundingClientRect().top)]),sel);
   for(const [id,top] of await tops('#run1,#run5,#instant,#backToTeacher'))assert.ok(top>=1080*.34,`${id} ${top}`);
   await student.click('#instant');await student.locator('#simpleViewButton:not(.hidden)').waitFor();
   await student.click('#simpleViewButton');await wait(200);
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
