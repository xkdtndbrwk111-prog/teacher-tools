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
  assert.equal(await p.locator('.dock-tab[data-tab="settings"]').count(),0);
  assert.equal(await p.locator('.dock-tab.on').first().getAttribute('data-tab'),'student');
  if(await p.evaluate(()=>classState.students.length===0&&classState.ui.initialRosterApplied!==true)){
   await p.locator('#initialRosterDialog[open]').waitFor();
   assert.equal(await p.locator('#initialRosterBlock').isVisible(),true);
   await p.locator('#skipInitialRoster').click();
  }else{
   // Existing or seeded legacy classes must never be interrupted by onboarding.
   assert.equal(await p.locator('#initialRosterDialog').evaluate(el=>el.open),false);
  }
  await p.locator('#tt-manager-home-button').click();assert.equal(await p.locator('#tt-manager-home').isVisible(),true);
  await p.locator('[data-tt-ui2-open="board"]').click();assert.equal(await p.locator('#tt-manager-board').isVisible(),true);
  await p.waitForFunction(()=>document.getElementById('tt-ui2-board-status').textContent.includes('연결'));
  assert.match(await p.locator('#tt-ui2-active-class').textContent(),/현재 선택 학급 · .* \(\d+명\) · 이 반만 전송/);
  assert.equal(await p.locator('#tt-ui2-send').isDisabled(),true);
  assert.equal(await p.locator('#tt-ui2-send-roster').isDisabled(),true);
  assert.equal(await p.locator('#tt-ui2-placement .tt-student-placement-settings').isVisible(),true);
  await p.locator('#modeClassroom').click();assert.equal(await p.locator('#tt-seat-subtab').isVisible(),true);
  await p.locator('#quickGroup').click();
  assert.equal(await p.locator('.dock-panel[data-panel="groups"]').isVisible(),true);
  assert.equal(await p.locator('#groupEditor').isVisible(),true);
  await p.locator('#layoutGrid .layout-cell.seat').first().dispatchEvent('mousedown',{button:0,bubbles:true});
  await p.locator('#quickGroup').click();
  assert.equal(await p.locator('#groupSelectionCount').textContent(),'선택 1석');
  assert.equal(await p.locator('#quickGroup').getAttribute('aria-pressed'),'true');
  await p.locator('#cancelGroup').click();
  assert.equal(await p.locator('#quickGroup').getAttribute('aria-pressed'),'false');
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
  // Navigation must not drift when seating unfolds or its work controls disappear.
  const positions=()=>p.evaluate(()=>{
   const rect=e=>e.getBoundingClientRect(),nav=rect(document.querySelector('.prototype-mode-switch')),header=rect(document.querySelector('.studio-topbar'));
   const ids=['tt-grade-tab','tt-life-tab','tt-board-tab'];
   return {center:nav.left+nav.width/2-(header.left+header.width/2),left:nav.left,width:nav.width,tabs:ids.map(id=>{const r=rect(document.getElementById(id));return [r.left,r.width,r.top]}),seat:rect(document.querySelector('.tt-ui2-seat-group')).left,seatRight:rect(document.querySelector('.tt-ui2-seat-group')).right,seatButton:(()=>{const e=document.getElementById('modeClassroom'),r=rect(e);return e.hidden?null:[r.left,r.right,r.width]})(),split:(()=>{const sub=document.querySelector('.tt-ui2-seat-group>.tt-seating-submodes');return sub.hidden?null:[rect(sub).left,rect(sub).right]})()};
  });
  const same=(a,b,w)=>{assert.ok(Math.abs(a.center)<1.5&&Math.abs(b.center)<1.5,'center '+w);for(const key of ['left','width','seat'])assert.ok(Math.abs(a[key]-b[key])<1.5,key+' '+w);for(let i=0;i<a.tabs.length;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(a.tabs[i][j]-b.tabs[i][j])<1.5,'tab drift '+w+' '+i+' '+j)};
  const frameState=async expanded=>{
   await p.waitForFunction(expanded=>{
    const nav=document.querySelector('.prototype-mode-switch'),frame=getComputedStyle(nav,'::before'),base=getComputedStyle(nav);
    const expected=expanded?-1:parseFloat(base.getPropertyValue('--tt-hud-tab-width'))+2;
    return Math.abs(parseFloat(frame.left)-expected)<.5;
   },expanded);
   const paint=await p.locator('.prototype-mode-switch').evaluate(nav=>{
    const frame=getComputedStyle(nav,'::before'),base=getComputedStyle(nav),box=nav.getBoundingClientRect();
    return {background:base.backgroundColor,border:base.borderLeftColor,frameBackground:frame.backgroundColor,frameBorder:frame.borderLeftColor,left:box.left+parseFloat(base.borderLeftWidth)+parseFloat(frame.left),right:box.right-parseFloat(base.borderRightWidth)-parseFloat(frame.right)};
   });
   assert.equal(paint.background,'rgba(0, 0, 0, 0)');assert.equal(paint.border,'rgba(0, 0, 0, 0)');
   assert.notEqual(paint.frameBackground,'rgba(0, 0, 0, 0)');assert.notEqual(paint.frameBorder,'rgba(0, 0, 0, 0)');
   return paint;
  };
  for(const width of [390,768,1024,1280,1400,1600,1920]){
   await p.setViewportSize({width,height:820});
   await p.locator('#tt-board-tab').click();const board=await positions(),closedFrame=await frameState(false);assert.ok(Math.abs(closedFrame.left-(board.seatButton[0]-4))<2,'frame starts just before collapsed button '+width);
   assert.ok(Math.abs(board.seatButton[2]-board.tabs[0][1])<1.5,'same button width '+width);assert.ok(Math.abs(board.seatButton[1]-board.seatRight)<1.5,'right aligned collapsed '+width);assert.ok(board.seatButton[0]-board.seat>=board.tabs[0][1]-1,'reserved left slot '+width);
   await p.locator('#modeClassroom').click();await p.locator('#tt-seat-subtab').waitFor();await p.waitForFunction(()=>!document.querySelector('.tt-ui2-seat-group>.tt-seating-submodes').getAnimations().some(a=>a.playState==='running'));const expanded=await positions(),openFrame=await frameState(true);same(board,expanded,width);assert.ok(Math.abs(openFrame.left-(expanded.seat-4))<2,'frame covers expanded split '+width);assert.ok(Math.abs(openFrame.right-closedFrame.right)<1,'frame right is fixed '+width);assert.ok(Math.abs(expanded.split[0]-board.seat)<1.5&&Math.abs(expanded.split[1]-board.seatRight)<1.5,'left expansion '+width);
   await p.locator('#modePE').click();same(board,await positions(),width);
   await p.locator('#tt-board-tab').click();same(board,await positions(),width);const closedAgain=await frameState(false);assert.ok(Math.abs(closedAgain.left-closedFrame.left)<1,'frame folds completely '+width);
  }
  await p.setViewportSize({width:1920,height:820});const beforeGrade=await positions();
  await p.locator('#tt-grade-tab').click();
  await p.waitForFunction(()=>document.body.classList.contains('tt-grade-active')&&document.querySelector('.tt-grade-iframe'));
  await p.waitForFunction(()=>/공통 명단 연결/.test(document.getElementById('tt-stage03-status')?.textContent||''));
  same(beforeGrade,await positions(),1920);
  await p.locator('#tt-manager-home-button').click();
  await p.waitForFunction(()=>window.__TT_MANAGER_HOME.page()==='home'&&!document.body.classList.contains('tt-grade-active'));
  assert.equal(await p.locator('#tt-manager-home').isVisible(),true);
  const workshopLink=p.locator('#tt-workshop-home-link');
  assert.equal(await workshopLink.getAttribute('aria-label'),'역사보리꼬리 공작소로 이동');
  assert.equal(await workshopLink.getAttribute('href'),'../');
  assert.equal(await workshopLink.locator('svg').count(),1,'집 모양 아이콘만 상위 허브로 이동해야 함');
  assert.equal(await p.locator('#tt-manager-home-button svg').count(),0,'교실매니저 이름 버튼은 내부 홈으로 유지');
  assert.equal(await p.locator('#saveStatus').evaluate(el=>el.parentElement?.classList.contains('tt-hud-cloud')),true,'실제 저장 상태 문구가 클라우드 바로 위로 이동해야 함');
  assert.equal(await p.locator('.brand-block #saveStatus').count(),0,'집 아이콘 아래 이중 문구 제거');
  for(const width of [390,768,1024,1280,1600,1920]){
   await p.setViewportSize({width,height:820});
   const visual=await p.evaluate(()=>{
    const rect=selector=>{const b=document.querySelector(selector).getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};
    return{house:rect('#tt-workshop-home-link .tt-ui2-icon'),
      homeText:parseFloat(getComputedStyle(document.querySelector('#tt-manager-home-button>span')).fontSize),
      homeTextColor:getComputedStyle(document.querySelector('#tt-manager-home-button>span')).color,
      brand:rect('.studio-topbar>.brand-block'),nav:rect('.prototype-mode-switch'),
      right:rect('#tt-hud-right'),cloud:rect('.tt-hud-cloud'),
      status:rect('#saveStatus'),select:rect('#tt-class-select'),manage:rect('#tt-class-add')};
   });
   assert.ok(visual.house.width>=23.5,'24px house icon at '+width);
   assert.ok(visual.brand.left>=0&&visual.right.right<=width+1,'Header bounds at '+width);
   if(width>=1280){
    assert.ok(visual.homeText>=21.5,'22px actual text span, not only button, at '+width);
    assert.ok(visual.select.height>=39&&visual.manage.height>=39,'Larger class controls at '+width);
    assert.ok(visual.status.height<=1.1,'Old floating save caption is hidden at '+width);
    assert.ok(Math.abs(visual.cloud.height-visual.manage.height)<=1.1,'Storage pill height matches class management button at '+width);
    assert.ok(visual.cloud.width>=220,'Storage control remains wide at '+width);
    assert.ok(visual.brand.right<=visual.nav.left+2,'No left/nav overlap at '+width);
    assert.ok(visual.nav.right<=visual.right.left+2,'No nav/right overlap at '+width);
   }
  }
  await p.setViewportSize({width:1920,height:820});
  await p.waitForFunction(()=>document.querySelector('#tt-cloud-chip')?.dataset.ttHudShort);
  assert.equal(await p.locator('#tt-hud-browser-save').innerText(),'브라우저 저장');
  const segment=await p.evaluate(()=>{
   const parent=document.querySelector('.tt-hud-cloud'),left=document.querySelector('#tt-hud-browser-save'),
    right=document.querySelector('#tt-cloud-chip'),a=left.getBoundingClientRect(),b=right.getBoundingClientRect(),
    box=parent.getBoundingClientRect();
   return{left:a.left,leftRight:a.right,rightLeft:b.left,right:b.right,
    parentLeft:box.left,parentRight:box.right,rightLabel:getComputedStyle(right,'::before').content,
    caption:getComputedStyle(document.querySelector('#saveStatus')).clipPath,
    pillRadius:getComputedStyle(parent).borderTopLeftRadius,
    classRadius:getComputedStyle(document.querySelector('#tt-class-add')).borderTopLeftRadius};
  });
  assert.ok(Math.abs(segment.leftRight-segment.rightLeft)<1,'The storage pill has no gap between its two cells');
  assert.ok(Math.abs(segment.parentLeft-segment.left)<2&&Math.abs(segment.parentRight-segment.right)<2,'The storage pill fills both sides');
  assert.match(segment.rightLabel,/클라우드 저장/);
  assert.ok(segment.caption.includes('inset'),'Live save status is hidden visually but retained');
  assert.equal(segment.pillRadius,segment.classRadius,'Storage pill radius matches other top buttons');
  await p.locator('#tt-hud-browser-save').click();
  assert.equal(await p.locator('#tt-cloud-title').isVisible(),true,'Browser segment opens actual storage settings');
  await p.locator('#tt-cloud-close').click();
  await p.locator('#tt-cloud-chip').click();
  assert.equal(await p.locator('#tt-cloud-title').isVisible(),true,'Cloud segment retains original storage settings');
  await p.locator('#tt-cloud-close').click();
  const savedRoster=await p.evaluate(()=>localStorage.getItem('tt.classroom.active-roster'));
  await workshopLink.click();
  await p.waitForURL(origin+'/');
  assert.equal(await p.locator('.brand-name').textContent(),'역사보리꼬리 공작소');
  assert.equal(await p.evaluate(()=>localStorage.getItem('tt.classroom.active-roster')),savedRoster,'상위 허브 이동 중 학생 저장 자료를 변경하지 않는다');
  assert.deepEqual(errs,[]);
  console.log('PASS UI2 home icon opens workshop, label keeps internal home, student data remains intact');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
