// 5-axis traits: 4/8 levels, per-axis manual or grade link, and the link page in the grade tab. Virtual data only.
// node classroom/tests/browser-traits.cjs   (NODE_PATH may point to an existing Playwright installation; SHOTS=<folder> saves screenshots)
const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const path=require('path');
const repo=path.resolve(__dirname,'../..');
const PORT=4196,BASE=`http://127.0.0.1:${PORT}`,SHOTS=process.env.SHOTS;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
async function step(name,fn){
 try{await fn();results.push(true);console.log('PASS',name)}
 catch(e){results.push(false);console.log('FAIL',name,'\n ',String(e.message).slice(0,600))}
}
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(PORT)],{stdio:'ignore'});
 await wait(500);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 const open=async viewport=>{
  const ctx=await browser.newContext({viewport});
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});
  await ctx.route(u=>!String(u).startsWith(BASE)&&!/^(data|blob):/.test(String(u)),r=>r.abort());
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(BASE+'/seating/');
  await p.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-lock-now'));
  await p.click('[data-tab="student"]');
  return{ctx,p,f:p.frameLocator('.tt-grade-iframe')};
 };
 const pe=p=>p.evaluate(()=>JSON.parse(window.__TT_STORE.getItem(window.__TT_STAGE031_CLASS.peKey)||'{}'));
 const traitsOf=async(p,i)=>{const s=await pe(p),id=await p.evaluate(i=>classState.students[i].id,i);return s[id].traits};
 const setTrait=(p,axis,v)=>p.click(`.trait-prototype [data-trait="${axis}"][data-value="${v}"]`);
 const gradeReady=p=>p.waitForFunction(()=>/공통 명단 연결/.test(document.getElementById('tt-stage03-status')?.textContent||''));
 const paste=async(p,cell,text)=>{await cell.click();await cell.evaluate((el,t)=>navigator.clipboard.writeText(t),text);await p.keyboard.press(process.platform==='darwin'?'Meta+V':'Control+V');await wait(250)};
 async function makeGrades(p,f,n){
  for(const [subject,order] of [['국어',1],['수학',1],['체육',-1]]){
   await f.locator('.nav[data-page="assessments"]').click();
   await f.locator('input[name="subject"]').fill(subject);await f.locator('input[name="title"]').fill(subject+' 평가');
   await f.locator('#assessment-form input[type="checkbox"]').first().check();
   await f.locator('#assessment-form button[type="submit"]').click();await wait(150);
   await f.locator('.nav[data-page="grades"]').click();
   await f.locator('#grade-subject').selectOption(subject);await wait(150);
   const scores=Array.from({length:n},(_,i)=>order>0?100-i*5:40+i*5);
   await paste(p,f.locator('input.grade-input').first(),scores.join('\n'));
  }
 }
 const expected=(i,n,scale)=>scale-Math.floor(i*scale/n);
 try{
  const {ctx,p,f}=await open({width:1600,height:1000});
  const n=await p.evaluate(()=>classState.students.length);
  await step('처음은 4단계이고, 학생 탭에 단계 선택과 성적 연결 버튼이 있다',async()=>{
   assert.ok(n>=5,'학생 '+n);
   assert.equal(await p.locator('.trait-prototype [data-trait-scale="4"].on').count(),1);
   assert.equal(await p.locator('.trait-prototype [data-trait="leadership"]').count(),4);
   assert.equal(await p.locator('#traitGradeLink').isVisible(),true);
  });
  await step('4→8단계는 2배, 8→4단계는 안 바꾼 값은 예전 값·바꾼 값은 2로 나눠 버림',async()=>{
   await setTrait(p,'leadership',4);await setTrait(p,'charm',1);await setTrait(p,'stamina',3);
   await p.click('.trait-prototype [data-trait-scale="8"]');
   assert.equal(await p.locator('.trait-prototype [data-trait="leadership"]').count(),8);
   assert.deepEqual(await traitsOf(p,0),{leadership:8,intelligence:null,stamina:6,charm:2,initiative:null});
   for(const b of await p.locator('.trait-prototype [data-trait="leadership"]').evaluateAll(xs=>xs.map(e=>e.getBoundingClientRect().width)))assert.ok(b>=18,'버튼 폭 '+b);
   await setTrait(p,'leadership',7);await setTrait(p,'initiative',5);await setTrait(p,'stamina',1);
   await p.click('.trait-prototype [data-trait-scale="4"]');
   assert.deepEqual(await traitsOf(p,0),{leadership:3,intelligence:null,stamina:1,charm:1,initiative:2});
   assert.equal((await pe(p))[await p.evaluate(()=>classState.students[0].id)].prev4,undefined);
  });
  await step('성적 연결 버튼을 누르면 성적 관리의 능력치 연동 화면이 열린다',async()=>{
   await p.click('#traitGradeLink');await gradeReady(p);
   await f.locator('[data-view="traits"]:not(.hidden)').waitFor();
   assert.match(await f.locator('#trait-link').textContent(),/능력치 4단계/);
  });
  const levelsAre=(p,axis,scale,order=i=>i)=>p.waitForFunction(([axis,want])=>{const s=JSON.parse(window.__TT_STORE.getItem(window.__TT_STAGE031_CLASS.peKey)||'{}');return classState.students.every((st,i)=>s[st.id]?.traits?.[axis]===want[i])},[axis,Array.from({length:n},(_,i)=>expected(order(i),n,scale))],{timeout:8000});
  await step('성적 연동을 켜고 교과를 고르면 버튼 없이 바로 반영되고, 연동 축만 바뀐다',async()=>{
   await makeGrades(p,f,n);
   await f.locator('.nav[data-page="traits"]').click();
   await f.locator('[data-trait-mode="intelligence"][data-value="linked"]').click();await wait(150);
   assert.equal(await f.locator('#trait-apply').count(),0,'반영 버튼 없음');
   await f.locator('[data-trait-subject="intelligence"][value="국어"]').check();
   await levelsAre(p,'intelligence',4);
   await f.locator('[data-trait-subject="intelligence"][value="수학"]').check();await wait(300);
   await f.locator('[data-trait-mode="stamina"][data-value="linked"]').click();await wait(150);
   await f.locator('[data-trait-subject="stamina"][value="체육"]').check();
   await levelsAre(p,'stamina',4,i=>n-1-i);
   await levelsAre(p,'intelligence',4);
   assert.equal(await f.locator('[data-trait-subject="stamina"][value="국어"]').isChecked(),false);
   await wait(300);
   assert.match(await f.locator('.trait-apply-bar.is-auto').textContent(),/자동 반영됨/);
   assert.equal(await f.locator('.trait-preview td.trait-change').count(),0);
   if(SHOTS)await p.screenshot({path:path.join(SHOTS,'traits-pc.png')});
   const t0=await traitsOf(p,0);assert.equal(t0.leadership,3);assert.equal(t0.charm,1);assert.equal(t0.initiative,2);
  });
  await step('학생 탭: 연동 축은 잠기고 표시가 붙으며, 수동 축은 그대로 바꿀 수 있다',async()=>{
   await p.click('#modeClassroom');await wait(300);await p.click('[data-tab="student"]');
   assert.equal(await p.locator('.trait-prototype .trait-linked-tag').count(),2);
   assert.equal(await p.locator('.trait-prototype [data-trait="intelligence"][data-value="1"]').isDisabled(),true);
   await p.locator('.trait-prototype [data-trait="intelligence"][data-value="1"]').click({force:true});
   assert.equal((await traitsOf(p,0)).intelligence,4);
   await setTrait(p,'charm',3);assert.equal((await traitsOf(p,0)).charm,3);
   if(SHOTS)await p.locator('#studentInspector').screenshot({path:path.join(SHOTS,'student-tab-pc.png')});
  });
  await step('단계 수를 4→8로 바꾸면 성적 연동 축은 버튼 없이 8등분되고, 수동 축은 2배가 된다',async()=>{
   await p.click('.trait-prototype [data-trait-scale="8"]');
   await levelsAre(p,'intelligence',8);
   for(let i=0;i<n;i++)assert.equal((await traitsOf(p,i)).stamina,expected(n-1-i,n,8),'체력 '+i);
   assert.equal((await traitsOf(p,0)).charm,6,'수동 축은 2배');
   assert.equal((await pe(p)).traitSettings.rerankPending,undefined);
   await p.click('#traitGradeLink');await f.locator('[data-view="traits"]:not(.hidden)').waitFor();await wait(300);
   assert.match(await f.locator('#trait-link').textContent(),/능력치 8단계/);
   assert.match(await f.locator('.trait-apply-bar').textContent(),/자동 반영됨/);
  });
  await step('수동으로 되돌리면 잠금이 풀리고 마지막 값은 남는다',async()=>{
   await f.locator('[data-trait-mode="stamina"][data-value="manual"]').click();await wait(200);
   await p.click('#modeClassroom');await wait(300);await p.click('[data-tab="student"]');
   assert.equal(await p.locator('.trait-prototype .trait-linked-tag').count(),1);
   assert.equal(await p.locator('.trait-prototype [data-trait="stamina"][data-value="1"]').isDisabled(),false);
   assert.equal((await traitsOf(p,0)).stamina,expected(n-1,n,8),'8단계로 마지막 반영된 값');
  });
  await step('모둠 배치와 체육 팀 편성이 8단계 값으로 돌아간다',async()=>{
   const r=await p.evaluate(()=>{generateAssignment({allowSurplus:true});return previewAssignments.length});
   assert.ok(r>0);
   await p.click('#modePE');await wait(200);await p.click('#generateAssignment');await wait(300);
   assert.ok(await p.locator('.pe-member').count()>=n);
   await p.click('#modeClassroom');await wait(200);
  });
  await step('성적 관리를 연 적 없는 새 화면에서 8→4로 바꿔도 연동 축이 다시 나뉜다',async()=>{
   await p.reload();await p.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-lock-now'));
   await p.click('[data-tab="student"]');
   assert.equal(await p.locator('.tt-grade-iframe').count(),0,'성적 관리 아직 안 열림');
   await p.click('.trait-prototype [data-trait-scale="4"]');
   await levelsAre(p,'intelligence',4);
   assert.equal((await traitsOf(p,0)).charm,3,'수동 축은 예전 값');
   assert.equal(await p.locator('body.tt-grade-active').count(),0,'화면은 자리배치 그대로');
  });
  await step('성적을 고치면 성적 연동 축이 바로 다시 계산된다',async()=>{
   await p.click('#tt-grade-tab');await f.locator('.nav[data-page="grades"]').click();
   for(const subject of ['국어','수학']){
    await f.locator('#grade-subject').selectOption(subject);await wait(150);
    const last=f.locator('input.grade-input').nth(n-1);await last.fill('100');await last.press('Enter');await wait(150);
   }
   const id=await p.evaluate(()=>classState.students.at(-1).id);
   await p.waitForFunction(id=>JSON.parse(window.__TT_STORE.getItem(window.__TT_STAGE031_CLASS.peKey)).traitSettings&&JSON.parse(window.__TT_STORE.getItem(window.__TT_STAGE031_CLASS.peKey))[id].traits.intelligence===4,id,{timeout:8000});
   assert.equal((await traitsOf(p,1)).intelligence<=4,true);
  });
  await ctx.close();
  await step('태블릿: 학생 탭 8단계 줄과 능력치 연동 화면이 넘치지 않는다',async()=>{
   const {ctx,p,f}=await open({width:1024,height:768});
   await p.click('.trait-prototype [data-trait-scale="8"]');
   const over=await p.evaluate(()=>[...document.querySelectorAll('.trait-prototype .trait-row,.trait-prototype .trait-head')].filter(e=>e.scrollWidth>e.clientWidth+1).length);
   assert.equal(over,0);
   if(SHOTS)await p.locator('#studentInspector').screenshot({path:path.join(SHOTS,'student-tab-tablet.png')});
   await p.click('#traitGradeLink');await gradeReady(p);await f.locator('[data-view="traits"]:not(.hidden)').waitFor();
   await f.locator('[data-trait-mode="intelligence"][data-value="linked"]').click();await wait(200);
   const wide=await f.locator('.trait-link-row').evaluateAll(xs=>xs.filter(e=>e.scrollWidth>e.clientWidth+1).length);
   assert.equal(wide,0);
   if(SHOTS)await p.screenshot({path:path.join(SHOTS,'traits-tablet.png')});
   await ctx.close();
  });
  await step('페이지 오류가 없다',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();server.kill()}
 const failed=results.filter(x=>!x).length;
 console.log(`\n${results.length-failed} PASS / ${failed} FAIL`);process.exit(failed?1:0);
})();
