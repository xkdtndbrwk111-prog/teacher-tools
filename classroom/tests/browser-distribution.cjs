// Teacher-only class distribution modal in the grade tab. Virtual data only.
// node classroom/tests/browser-distribution.cjs   (NODE_PATH may point to an existing Playwright installation; SHOTS=<folder> saves screenshots)
const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const path=require('path');
const repo=path.resolve(__dirname,'../..');
const PORT=4194,BASE=`http://127.0.0.1:${PORT}`,SHOTS=process.env.SHOTS;
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
 async function open(viewport){
  const ctx=await browser.newContext({viewport});
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});
  await ctx.route(u=>!String(u).startsWith(BASE)&&!/^(data|blob):/.test(String(u)),r=>r.abort());
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(BASE+'/seating/');
  await p.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-lock-now'));
  await p.click('#tt-grade-tab');
  await p.waitForFunction(()=>/공통 명단 연결/.test(document.getElementById('tt-stage03-status')?.textContent||''));
  const f=p.frameLocator('.tt-grade-iframe');
  const n=await p.evaluate(()=>classState.students.length);
  const paste=async(cell,text)=>{await cell.click();await cell.evaluate((el,t)=>navigator.clipboard.writeText(t),text);await p.keyboard.press(process.platform==='darwin'?'Meta+V':'Control+V');await wait(250)};
  for(const title of ['1단원','2단원']){
   await f.locator('.nav[data-page="assessments"]').click();
   await f.locator('input[name="subject"]').fill('수학');await f.locator('input[name="title"]').fill(title);
   await f.locator('#assessment-form input[type="checkbox"]').first().check();
   await f.locator('#assessment-form button[type="submit"]').click();await wait(150);
  }
  await f.locator('.nav[data-page="grades"]').click();await f.locator('input.grade-input').first().waitFor();
  // Many ties so name chips must stack; the last pupil has no 2단원 result.
  const rows=Array.from({length:n},(_,i)=>`${[80,80,80,80,70,70,90,60,50,85][i%10]}\t${i===n-1?'':[75,75,75,75,70,70,95,60,55,80][i%10]}`);
  await paste(f.locator('input.grade-input').first(),rows.join('\n'));
  return{ctx,p,f,n};
 }
 try{
  const {ctx,p,f,n}=await open({width:1600,height:1000});
  await step('성적 도구의 학급 분포 보기: 처음부터 이름이 보이고, 학생 수만큼 점이 겹치지 않게 놓인다',async()=>{
   const sent=[];await p.evaluate(()=>{window.__sent=[];window.addEventListener('message',e=>window.__sent.push(e.data?.type))});
   const requests=[];p.on('request',r=>requests.push(r.url()));
   await f.locator('#open-class-dist').click();
   await f.locator('#class-dist-dialog[open]').waitFor();
   assert.match(await f.locator('.dist-chart-title').textContent(),/수학 · 교과 전체 · 표준점수 \d+명/);
   const chips=f.locator('.dist-chip');assert.equal(await chips.count(),n-1);
   const names=await f.locator('.dist-chip text').allTextContents();
   const roster=await p.evaluate(()=>classState.students.map(s=>s.name.length>4?s.name.slice(0,4)+'…':s.name));
   assert.ok(names.every(x=>roster.includes(x)),'이름 표시');
   const boxes=await chips.evaluateAll(xs=>xs.map(g=>{const r=g.querySelector('rect').getBoundingClientRect();return[r.left,r.top,r.right,r.bottom]}));
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a[2]<=b[0]+.5||b[2]<=a[0]+.5||a[3]<=b[1]+.5||b[3]<=a[1]+.5,`겹침 ${i} ${j}`)}
   assert.match(await f.locator('.dist-excluded').textContent(),/계산 제외 1명.*평가 일부 미입력/);
   // Pick a pupil from the chart, then from the list.
   await chips.first().click();
   assert.match(await f.locator('.dist-detail').textContent(),/반 \d+등 \/ \d+명.*표준점수/);
   await f.locator('.dist-list button').nth(2).click();
   assert.equal(await f.locator('.dist-list button.on').count(),1);assert.equal(await f.locator('.dist-chip.on').count(),1);
   if(SHOTS)await p.screenshot({path:path.join(SHOTS,'dist-pc.png')});
   await f.locator('[data-dist-mode="unit"]').click();
   assert.match(await f.locator('.dist-chart-title').textContent(),/수학 · 1단원/);
   assert.equal(await f.locator('.dist-chip').count(),n);
   await f.locator('#dist-unit').selectOption({label:'2단원'});
   assert.equal(await f.locator('.dist-chip').count(),n-1);
   assert.match(await f.locator('.dist-excluded').textContent(),/미입력/);
   await f.locator('.dist-chip').first().click();await f.locator('#dist-personal').click();
   assert.equal(await f.locator('#class-dist-dialog[open]').count(),0);
   assert.equal(await f.locator('#student-detail:not(.hidden)').count(),1,'개인 화면 열림');
   const types=(await p.evaluate(()=>window.__sent)).filter(t=>t!=='TT_STAGE03_SYNC_RESULT');
   assert.deepEqual(types,[],'성적 관리 밖으로 보낸 메시지 없음');
   assert.deepEqual(requests.filter(u=>!/\/classroom\/grades\//.test(u)),[],'바깥 요청 없음');
  });
  await step('분포 자료는 칠판 보기와 대시보드 보내기에 들어가지 않는다',async()=>{
   const keys=await p.evaluate(()=>{const out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i),v=localStorage.getItem(k)||'';if(/표준점수|dist-chip|class-dist/.test(v))out.push(k)}return out});
   assert.deepEqual(keys,[]);
   const host=await p.evaluate(()=>document.body.innerHTML.includes('class-dist'));
   assert.equal(host,false,'자리배치 화면에는 분포가 없음');
  });
  await ctx.close();
  await step('태블릿: 모달이 화면 안에 들어오고 목록은 아래로 내려간다',async()=>{
   const {ctx,p,f,n}=await open({width:1024,height:768});
   await f.locator('#open-class-dist').click();await f.locator('#class-dist-dialog[open]').waitFor();
   const r=await f.locator('#class-dist-dialog').evaluate(d=>{const b=d.getBoundingClientRect();return{l:b.left,t:b.top,r:b.right,b:b.bottom,W:innerWidth,H:innerHeight,wide:d.scrollWidth>d.clientWidth+1}});
   assert.ok(r.l>=0&&r.t>=0&&r.r<=r.W&&r.b<=r.H&&!r.wide,JSON.stringify(r));
   assert.equal(await f.locator('.dist-chip').count(),n-1);
   const [chart,side]=await Promise.all(['.dist-chart-wrap','.dist-side'].map(q=>f.locator(q).boundingBox()));
   assert.ok(side.y>=chart.y+chart.height-1,'목록이 그래프 아래');
   const svg=await f.locator('.dist-chart').boundingBox();assert.ok(svg.y+svg.height<=chart.y+chart.height+1,'그래프가 상자 안');
   const font=await f.locator('.dist-chip text').first().evaluate(t=>t.getBoundingClientRect().height);assert.ok(font>=11,'이름 글자 높이 '+font);
   if(SHOTS)await p.screenshot({path:path.join(SHOTS,'dist-tablet.png')});
   await f.locator('#class-dist-close').click();assert.equal(await f.locator('#class-dist-dialog[open]').count(),0);
   await ctx.close();
  });
  await step('페이지 오류가 없다',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();server.kill()}
 const failed=results.filter(x=>!x).length;
 console.log(`\n${results.length-failed} PASS / ${failed} FAIL`);process.exit(failed?1:0);
})();
