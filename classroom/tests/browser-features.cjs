// Seating rules, PE teams, grade paste and Hanja in a real browser, with virtual data only.
// node classroom/tests/browser-features.cjs   (NODE_PATH may point to an existing Playwright installation)
const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const path=require('path');
const repo=path.resolve(__dirname,'../..');
const PORT=4198,BASE=`http://127.0.0.1:${PORT}`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
async function step(name,fn){
 try{await fn();results.push(true);console.log('PASS',name)}
 catch(e){results.push(false);console.log('FAIL',name,'\n ',String(e.message).slice(0,500))}
}
const started=p=>p.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-lock-now'));
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(PORT)],{stdio:'ignore'});
 await wait(500);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 const open=async(viewport={width:1600,height:1000},url='/seating/')=>{
  const ctx=await browser.newContext({viewport});
  await ctx.route(u=>!String(u).startsWith(BASE)&&!/^(data|blob):/.test(String(u)),r=>r.abort());
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(BASE+url);
  if(url.startsWith('/seating'))await started(p);
  return{ctx,p};
 };
 const generate=p=>p.evaluate(()=>{generateAssignment({allowSurplus:true});return previewAssignments.map(a=>({...a}))});
 try{
  await step('지정석·떨어뜨리기·남녀 좌석 규칙이 20번 모두 지켜진다',async()=>{
   const {ctx,p}=await open();
   const bad=await p.evaluate(()=>{
    const out=[],seats=usableCells();
    const [a,b,c]=classState.students;
    classState.rules.completeRandom=false;
    a.fixedSeatId=seats[4].id;classState.rules.fixedSeats=true;
    b.apartFrom=[c.id];c.apartFrom=[b.id];classState.rules.apartStudents=true;
    classState.students.forEach((s,i)=>{s.gender=i%2?'female':'male'});
    classState.layout.cells.filter(isUsable).forEach((cell,i)=>{cell.type=i%2?'female':'male'});
    classState.rules.genderSeats=true;
    const cellOf=id=>classState.layout.cells.find(x=>x.id===id);
    for(let n=0;n<20;n++){
     generateAssignment({allowSurplus:true});
     if(previewAssignments.length!==classState.students.length){out.push('배치 수 '+previewAssignments.length);continue}
     const seat=new Map(previewAssignments.map(x=>[x.studentId,x.seatId]));
     const seen=new Set(previewAssignments.map(x=>x.seatId));
     if(seen.size!==previewAssignments.length)out.push('좌석 중복');
     if(seat.get(a.id)!==a.fixedSeatId)out.push('지정석');
     for(const s of classState.students)if(cellOf(seat.get(s.id)).type!==s.gender)out.push('남녀 좌석 '+s.name);
     const bc=cellOf(seat.get(b.id)),cc=cellOf(seat.get(c.id));
     if(bc.row===cc.row&&Math.abs(bc.col-cc.col)<=1)out.push('옆자리');
    }
    return out;
   });
   assert.deepEqual(bad,[]);
   await ctx.close();
  });
  await step('뒷자리 반복 방지와 모둠 편성이 작동한다',async()=>{
   const {ctx,p}=await open();
   await p.click('#generateAssignment');await wait(100);
   if(await p.locator('#seatCountProceed:not(.hidden)').count())await p.click('#seatCountProceed');
   await wait(100);await p.click('#confirmAssignment');await wait(100);
   const r=await p.evaluate(()=>{
    const back=backRowStudentsFromHistory(latestHistoryRecord());
    classState.rules.completeRandom=false;classState.rules.backRowNoRepeat=true;
    const seats=usableCells();
    classState.groups=[{id:'g1',name:'A',color:'#f00',seatIds:seats.slice(0,4).map(x=>x.id)},{id:'g2',name:'B',color:'#00f',seatIds:seats.slice(4,8).map(x=>x.id)}];
    classState.rules.groupBalance=true;
    generateAssignment({allowSurplus:true});
    const seat=new Map(previewAssignments.map(x=>[x.studentId,x.seatId]));
    const maxRow=Math.max(...previewAssignments.map(a=>classState.layout.cells.find(c=>c.id===a.seatId).row));
    const again=[...back].filter(id=>classState.layout.cells.find(c=>c.id===seat.get(id)).row===maxRow);
    return{count:previewAssignments.length,backBefore:back.size,again:again.length,valid:validatePersistentState(classState).ok};
   });
   assert.equal(r.count,10);assert.equal(r.valid,true);assert.equal(r.again,0,JSON.stringify(r));
   await ctx.close();
  });
  await step('좌석 칠하기, 학생 끌어 놓기, 히스토리, 다시 열기가 작동한다',async()=>{
   const {ctx,p}=await open();
   await p.click('.toolbtn[data-tool="male"]');
   const cell=p.locator('.layout-cell.seat').first();
   await cell.click();await wait(100);
   assert.equal(await p.evaluate(()=>classState.layout.cells.filter(c=>c.type==='male').length),1);
   await p.click('.toolbtn[data-tool="seat"]');await cell.click();
   await p.click('#generateAssignment');await wait(100);
   if(await p.locator('#seatCountProceed:not(.hidden)').count())await p.click('#seatCountProceed');
   await wait(100);await p.click('#confirmAssignment');await wait(100);
   const empty=p.locator('.layout-cell.seat:not(.assignment-draggable)').first(),from=p.locator('.layout-cell.assignment-draggable').first();
   const seated=await p.evaluate(()=>JSON.stringify(previewAssignments));
   await from.dragTo(empty);await wait(200);
   assert.notEqual(await p.evaluate(()=>JSON.stringify(previewAssignments)),seated,'끌어 놓으면 자리가 바뀜');
   await p.click('#confirmAssignment');await wait(100);
   await p.locator('[data-tab="history"]').click();
   await p.locator('[data-view-history]').first().click();
   assert.equal(await p.locator('#historyBanner').isVisible(),true);
   await p.click('#exitHistoryView');
   const before=await p.evaluate(()=>JSON.stringify(classState.assignments));
   await p.reload();await started(p);
   assert.equal(await p.evaluate(()=>JSON.stringify(classState.assignments)),before);
   await ctx.close();
  });
  await step('30명 학생 화면에서 이름표가 겹치지 않는다',async()=>{
   const {ctx,p}=await open({width:1920,height:1080});
   await p.evaluate(()=>{const t=document.getElementById('targetStudentCount');t.value='30';t.dispatchEvent(new Event('input',{bubbles:true}))});
   await p.click('#fillStudentCount');await wait(200);
   if(await p.locator('#rosterChangeDialog:not(.hidden)').count())await p.click('#rosterChangeApply');
   const count=await p.evaluate(()=>classState.students.length);
   assert.equal(count,30);
   await p.evaluate(()=>{classState.layout={rows:5,cols:8,cells:classState.layout.cells};});
   await p.click('#rowPlus');await wait(100);
   await p.click('#generateAssignment');await wait(100);
   if(await p.locator('#seatCountProceed:not(.hidden)').count())await p.click('#seatCountProceed');
   await wait(100);await p.click('#confirmAssignment');await wait(100);await p.click('#openPlayback');
   await p.click('#instant');await wait(500);
   const overlaps=await p.evaluate(()=>{
    const boxes=[...document.querySelectorAll('#seats .name-tag,#seats .seat-name,#seats [class*="name"]')].filter(e=>e.textContent.trim()&&e.offsetParent).map(e=>({t:e.textContent.trim(),r:e.getBoundingClientRect()}));
    const out=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i].r,b=boxes[j].r;if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)out.push(boxes[i].t+'/'+boxes[j].t)}
    return{n:boxes.length,out};
   });
   assert.ok(overlaps.n>=30,'이름표 '+overlaps.n);assert.deepEqual(overlaps.out,[]);
   await ctx.close();
  });
  await step('체육 모둠: 팀 편성, 확정, 운동장 공개, 잠금, 칠판 버튼 위치',async()=>{
   const {ctx,p}=await open({width:1920,height:1080});
   await p.click('#modePE');await wait(200);
   await p.click('#generateAssignment');await wait(300);
   await p.click('#confirmAssignment');await wait(300);
   await p.click('#openPlayback');
   await p.locator('#pePitchReveal.is-open').waitFor();
   const tops=await p.evaluate(()=>[...document.querySelectorAll('#pePitchRun1,#pePitchRun5,[data-pe-instant],#pePitchBack,#pePitchSimpleOpen')].filter(e=>e.offsetParent).map(e=>[e.id||e.textContent.trim(),Math.round(e.getBoundingClientRect().top)]));
   for(const [id,top] of tops)assert.ok(top>=1080*.34,`${id} ${top}`);
   await p.click('[data-pe-instant]');await wait(300);
   assert.equal(await p.locator('#pePitchSimpleOpen').isDisabled(),false);
   await p.click('#pePitchSimpleOpen');await wait(200);
   assert.equal((await p.locator('#peSimpleGrid').textContent()).length>10,true);
   await p.click('#pePitchSimpleReturn');await wait(200);
   await p.click('#pePitchBack');await wait(200);
   assert.equal(await p.locator('#pePitchReveal.is-open').count(),0);
   await p.click('#modeClassroom');await wait(200);
   assert.equal(await p.evaluate(()=>validatePersistentState(classState).ok),true);
   await ctx.close();
  });
  await step('엑셀에서 복사한 점수를 붙여 넣을 수 있다',async()=>{
   const {ctx,p}=await open();
   await p.click('#tt-grade-tab');
   const f=p.frameLocator('.tt-grade-iframe');
   await p.waitForFunction(()=>/공통 명단 연결/.test(document.getElementById('tt-stage03-status')?.textContent||''));
   await f.locator('.nav[data-page="assessments"]').click();
   await f.locator('input[name="subject"]').fill('수학');await f.locator('input[name="title"]').fill('붙여넣기');
   await f.locator('#assessment-form button[type="submit"]').click();
   await f.locator('.nav[data-page="grades"]').click();
   const first=f.locator('input.grade-input').first();await first.waitFor();
   await first.evaluate(el=>{const dt=new DataTransfer();dt.setData('text/plain','90\r\n85\r\n70\r\n');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))});
   await wait(300);
   assert.deepEqual((await f.locator('input.grade-input').evaluateAll(xs=>xs.map(e=>e.value))).slice(0,4),['90','85','70','']);
   await ctx.close();
  });
  await step('한자 매니저: 명단, 문제 등록, 게임 진행',async()=>{
   const {ctx,p}=await open();
   await p.goto(BASE+'/hanja/');
   await p.locator('.hanja-student').first().waitFor();
   assert.equal(await p.locator('.hanja-student').count(),10);
   const rows=[['山','메','산'],['水','물','수'],['火','불','화'],['木','나무','목']];
   for(const [text,meaning,reading] of rows){
    await p.locator('#hanzi').fill(text);await p.locator('#meaning').fill(meaning);await p.locator('#reading').fill(reading);
    await p.locator('#entryForm button[type=submit]').click();
   }
   assert.equal(await p.locator('.entry-card').count(),4);
   await p.reload();
   await p.locator('.entry-card').first().waitFor();
   assert.equal(await p.locator('.entry-card').count(),4);
   await p.locator('[data-panel=questions]').click();
   await p.locator('#target').selectOption('single');
   await p.locator('#perStudent').fill('2');await p.locator('#perStudent').press('Tab');
   await p.locator('#start').click();
   await p.locator('#game').waitFor({state:'visible'});
   const name=await p.locator('#studentName').textContent();
   assert.ok(name.trim().length>0);
   assert.match(await p.locator('#progress').textContent(),/문제 1\/2/);
   assert.ok(await p.locator('#options button').count()>=2);
   await p.locator('#endGame').click();
   await ctx.close();
  });
  await step('남녀 자리: 이전 빈자리가 한쪽에 몰려도 새 배치가 만들어지고, 만들 수 없으면 이전 배치를 확정하지 않는다',async()=>{
   const {ctx,p}=await open();
   const setup=()=>p.evaluate(()=>{
    const seats=usableCells().slice(0,24);
    classState.layout.cells.filter(isUsable).forEach((c,i)=>{c.type=i%2?'female':'male'});
    classState.students=classState.students.slice(0,10);
    classState.students.forEach((s,i)=>{s.gender=i%2?'female':'male';s.fixedSeatId=null;s.assignmentExcluded=i===0});
    const male=seats.filter(c=>c.type==='male'),female=seats.filter(c=>c.type==='female');
    classState.assignments=[...male.slice(0,3),...female.slice(0,7)].map((c,i)=>({studentId:classState.students[i].id,seatId:c.id}));
    classState.rules.completeRandom=false;classState.rules.genderSeats=true;
    previewAssignments=classState.assignments.map(a=>({...a}));previewRevision=1;confirmedRevision=1;
   });
   for(let i=0;i<10;i++){
    await setup();
    const r=await p.evaluate(()=>{
     generateAssignment({allowSurplus:true});
     const cells=new Map(usableCells().map(c=>[c.id,c.type])),students=new Map(classState.students.map(s=>[s.id,s]));
     return{count:previewAssignments.length,mismatch:previewAssignments.filter(a=>cells.get(a.seatId)!==students.get(a.studentId).gender).length,excluded:previewAssignments.some(a=>a.studentId===classState.students[0].id)};
    });
    assert.deepEqual(r,{count:9,mismatch:0,excluded:false});
   }
   await setup();
   const before=await p.evaluate(()=>{
    usableCells().forEach(c=>{c.type='female'});
    generateAssignment({allowSurplus:true});
    return{status:document.getElementById('assignmentStatus').textContent,preview:previewAssignments.length,assigned:JSON.stringify(classState.assignments),history:classState.history.length};
   });
   assert.equal(before.preview,0);
   assert.doesNotMatch(before.status,/다른 후보/);
   await p.evaluate(()=>confirmAssignment());
   const after=await p.evaluate(()=>({status:document.getElementById('assignmentStatus').textContent,assigned:JSON.stringify(classState.assignments),history:classState.history.length}));
   assert.equal(after.assigned,before.assigned);assert.equal(after.history,before.history);
   assert.match(after.status,/새 배치를 생성/);
   await ctx.close();
  });
  await step('저장 뒤 자동 저장 문구가 전송 결과와 실패 안내를 덮어쓰지 않는다',async()=>{
   const {ctx,p}=await open();
   await p.evaluate(()=>{saveState();setSaveStatus('작은 창 차단 안내','error')});
   await wait(1500);
   assert.deepEqual(await p.evaluate(()=>{const n=document.getElementById('saveStatus');return[n.textContent,n.classList.contains('error')]}),['작은 창 차단 안내',true]);
   await p.evaluate(()=>saveState());
   await wait(1500);
   assert.match(await p.locator('#saveStatus').textContent(),/자동 저장/,'안내가 없으면 자동 저장 문구는 그대로');
   await ctx.close();
  });
  await step('페이지 오류가 없다',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();server.kill()}
 const failed=results.filter(r=>!r).length;
 console.log(`\n${results.length-failed} PASS / ${failed} FAIL`);
 process.exit(failed?1:0);
})();
