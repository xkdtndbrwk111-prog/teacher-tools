const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..'),port=18139,origin='http://127.0.0.1:'+port;
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(port)],{stdio:'ignore'});
 let browser;
 try{
  await new Promise(r=>setTimeout(r,600));browser=await chromium.launch({channel:'chrome',headless:true});
  const p=await browser.newPage({viewport:{width:1280,height:820}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  let release;const gate=new Promise(r=>release=r);await p.route('**/classroom/host/manager-home.js*',async route=>{await gate;await route.continue()});
  await p.goto(origin+'/seating/',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>document.getElementById('tt-settings-overlay'));
  assert.equal(await p.locator('#teacherScreen').isVisible(),false);
  assert.equal(await p.locator('#tt-manager-loading').isVisible(),true);
  release();
  await p.waitForFunction(()=>window.__TT_MANAGER_HOME?.page()==='home'&&!document.documentElement.classList.contains('tt-manager-starting'));
  assert.equal(await p.locator('#tt-manager-home').isVisible(),true);
  assert.equal(await p.locator('#tt-manager-home [data-tt-ui2-open]').count(),4);
  assert.equal(await p.locator('.prototype-mode-switch button:visible').count(),4);
  assert.equal(await p.locator('#teacherScreen>.studio').isVisible(),false);
  await p.locator('[data-tt-ui2-open="seat"]').click();assert.equal(await p.locator('#teacherScreen>.studio').isVisible(),true);
  await p.locator('#tt-manager-home-button').click();assert.equal(await p.locator('#tt-manager-home').isVisible(),true);
  await p.locator('[data-tt-ui2-open="board"]').click();assert.equal(await p.locator('#tt-manager-board').isVisible(),true);
  await p.waitForFunction(()=>document.getElementById('tt-ui2-board-status').textContent.includes('연결'));
  assert.equal(await p.locator('#tt-ui2-send').isDisabled(),true);
  assert.equal(await p.locator('#tt-ui2-send-roster').isDisabled(),true);
  assert.equal(await p.locator('#tt-ui2-placement .tt-student-placement-settings').isVisible(),true);
  await p.locator('#modeClassroom').click();assert.equal(await p.locator('#tt-seat-subtab').isVisible(),true);
  assert.deepEqual(await p.locator('.prototype-mode-switch button.on:visible').evaluateAll(e=>e.map(x=>x.id)),['tt-seat-subtab']);
  await p.locator('#modePE').click();assert.deepEqual(await p.locator('.prototype-mode-switch button.on:visible').evaluateAll(e=>e.map(x=>x.id)),['modePE']);
  await p.locator('#tt-board-tab').click();assert.deepEqual(await p.locator('.prototype-mode-switch button.on:visible').evaluateAll(e=>e.map(x=>x.id)),['tt-board-tab']);
  await p.locator('#tt-hud-more-trigger').click();assert.equal(await p.locator('[data-tt-section="board"]').count(),0);
  await p.locator('[data-tt-section="privacy"]').click();
  const privacy=p.locator('[data-tt-panel="privacy"]');assert.equal(await privacy.isVisible(),true);
  for(const term of ['EASY','NORMAL','drive.file','Cloud Firestore','Supabase','암호화','삭제','xkdtndbrwk111@gmail.com'])assert.ok((await privacy.innerText()).includes(term),term);
  await p.locator('#tt-privacy-backup').click();assert.equal(await p.locator('[data-tt-panel="backup"]').isVisible(),true);
  await p.locator('#tt-settings-close').click();
  for(const width of [390,768,1024,1280,1600,1920]){
   await p.setViewportSize({width,height:820});
   const box=await p.locator('.studio-topbar').boundingBox();assert.ok(box.height<=61,'single header '+width);
   const geometry=await p.locator('.prototype-mode-switch').evaluate(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,w:innerWidth}));assert.ok(geometry.left>=0&&geometry.right<=geometry.w,'navigation in viewport '+width);
  }
  await p.setViewportSize({width:1280,height:820});
  await p.locator('#tt-grade-tab').click();
  await p.waitForFunction(()=>document.body.classList.contains('tt-grade-active')&&document.querySelector('.tt-grade-iframe'));
  await p.waitForFunction(()=>/공통 명단 연결/.test(document.getElementById('tt-stage03-status')?.textContent||''));
  await p.locator('#tt-manager-home-button').click();
  await p.waitForFunction(()=>window.__TT_MANAGER_HOME.page()==='home'&&!document.body.classList.contains('tt-grade-active'));
  assert.equal(await p.locator('#tt-manager-home').isVisible(),true);
  assert.deepEqual(errs,[]);
  console.log('PASS UI2 startup gate, 4 tiles/tabs, offline board, settings, grade exit');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
