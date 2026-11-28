// Actual packaged manager, isolated Chrome context, no cloud or operational board.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const online=process.env.HOJA_FIELD_ONLINE==='1';
const manager=online?'https://xkdtndbrwk111-prog.github.io':'http://127.0.0.1:4188',board=online?'http://127.0.0.1:17439':'http://127.0.0.1:17451';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const ctx=await browser.newContext(),errors=[],operational=[],localErrors=[],bridge=[];
   // The disposable Chrome context models the user's explicit site permission.
   // Never disable LNA, CORS or the browser's enforcement flags.
   if(online){
    const cdp=await browser.newBrowserCDPSession();
    const {browserContextIds}=await cdp.send('Target.getBrowserContexts');
    assert.equal(browserContextIds.length,1);
    let granted=false;
    for(const permission of ['loopbackNetwork','localNetworkAccess']){
     try{
      await cdp.send('Browser.grantPermissions',{origin:manager,permissions:[permission],browserContextId:browserContextIds[0]});
      console.log('CI scoped browser permission: '+permission);granted=true;break;
     }catch(e){console.log('CI scoped permission unsupported: '+permission+' '+String(e.message).slice(0,180))}
    }
    assert(granted,'Cannot model explicit loopback permission on this Chrome version');
   }
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.origin===board)return route.continue();
    if(u.origin===manager&&(!online||(route.request().method()==='GET'&&u.pathname.startsWith('/teacher-tools/'))))return route.continue();
   if(u.port==='17439'||u.port==='17451'||u.port==='4188'||u.port==='4189')operational.push(u.href);
   return route.abort();
  });
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{const u=new URL(r.url());if(r.status()>=400&&u.origin===manager)localErrors.push(r.status()+' '+u.pathname);if(u.origin===board&&bridge.length<30)bridge.push(r.request().method()+' '+u.pathname+' '+r.status())});
   page.on('requestfailed',r=>{const u=new URL(r.url());if(u.origin===board&&bridge.length<30)bridge.push(r.method()+' '+u.pathname+' '+r.failure()?.errorText)});
   page.on('console',m=>{if(m.type()==='error'&&/CORS|Local Network|loopback|private network|127\.0\.0\.1/i.test(m.text())&&bridge.length<30)bridge.push(m.text().slice(0,250))});
  await page.goto(manager+(online?'/teacher-tools':'')+'/seating/');
  await page.waitForFunction(()=>!!window.__TT_BOARD_CONNECTION&&!!window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting')||!!document.querySelector('.tt-start-blocked'),null,{timeout:25000});
  const failure=await page.locator('.tt-start-blocked').count();
  if(failure)throw Error(await page.locator('.tt-start-blocked').innerText()+' missing='+localErrors.join(',')+' errors='+errors.join(','));
  try{
    await page.evaluate(()=>window.__TT_BOARD_CONNECTION.check());
    await page.waitForFunction(()=>window.__TT_BOARD_CONNECTION?.rosterReady()&&window.__TT_BOARD_CONNECTION?.presentationReady(),null,{timeout:20000});
   }catch(error){
    const status=await page.evaluate(async ({board,online})=>{
     let permission='not queried';
     if(online)try{permission=(await navigator.permissions.query({name:'loopback-network'})).state}catch(e){permission='unsupported'}
     let probe;
     try{const r=await fetch(board+'/api/board-status',{mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(3500)});probe={http:r.status,body:await r.json()}}catch(e){probe=String(e)}
     return {permission,probe,note:document.getElementById('tt-board-connection-status')?.textContent,roster:window.__TT_BOARD_CONNECTION?.rosterReady(),presentation:window.__TT_BOARD_CONNECTION?.presentationReady()};
    },{board,online});
    throw Error('Actual manager capability failed: '+JSON.stringify({status,bridge,localErrors,errors,cause:error.message}));
   }
  assert.equal(await page.locator('#tt-send-board').count(),1);
  assert.equal(await page.evaluate(()=>typeof window.__TT_SEND_ROSTER),'function');
  // Seed TWO synthetic students in the actual application, not a replacement sender.
  // The real packaged manager builds the payload, opens the real inbox, and
  // receives its acknowledgement. No direct seating API writes from this test.
  const expected=await page.evaluate(()=>{
   const base=defaultState();
   const students=['FIELD_TEST_ONE','FIELD_TEST_TWO'].map((name,i)=>{
    const s={id:'field-test-'+(i+1),name,gender:i?'female':'male',balanceLevel:'none',apartFrom:[],fixedSeatId:null,assignmentExcluded:false};
    s.visual=defaultStudentVisual(s,i);return s;
   });
   const cells=base.layout.cells.filter(isUsable).slice(0,2);
   classState={...base,className:'FIELD TEST CLASS',students,assignments:students.map((s,i)=>({studentId:s.id,seatId:cells[i].id})),ui:{...base.ui,initialRosterApplied:true,numberMode:'ordered'}};
   // A temporary click target ensures genuine user activation even on the home page.
   const control=document.createElement('button');control.id='field-test-send';control.textContent='FIELD TEST';
   Object.assign(control.style,{position:'fixed',left:'0',top:'0',zIndex:'2147483647'});
   control.onclick=()=>document.getElementById('tt-send-board').click();document.body.append(control);
   return {classId:window.__TT_STAGE031_CLASS.activeId,ids:students.map(s=>s.id),assignments:classState.assignments};
  });
  const fs=require('node:fs'),path=require('node:path');
  const root=process.env.HOJA_LAB_ROOT;
  assert(root&&/^hoja-webview-lab-[a-f0-9]{32}$/.test(path.basename(root)));
  const file=path.join(root,'local','TeacherToolsLocal','seating.json');
  const read=()=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  async function until(fn,label,ms=12000){
   const end=Date.now()+ms;let last;
   while(Date.now()<end){try{if(last=await fn())return last}catch(e){last=e.message}await new Promise(r=>setTimeout(r,100))}
   throw Error(label+' timeout; last='+String(last)+' local='+localErrors.join(',')+' errors='+errors.join(','));
  }
  await page.locator('#field-test-send').click({force:true});
  await until(()=>{const v=read();return v.classId===expected.classId&&v.roster?.some(s=>s.id===expected.ids[0])},'actual manager seat send');
  const first=read();
  assert.deepEqual(first.assignments,expected.assignments);
  assert.deepEqual(first.roster.map(s=>s.name),['FIELD_TEST_ONE','FIELD_TEST_TWO']);
  await until(()=>page.evaluate(()=>localStorage.getItem('tt.classroom.board-linked')==='1'),'real sender acknowledgement');
  await until(()=>ctx.pages().every(p=>p===page||p.isClosed()),'inbox closed');
  await page.evaluate(()=>{
   classState.students[0].name='FIELD_TEST_RENAMED';
   document.getElementById('field-test-send').onclick=()=>window.__TT_SEND_ROSTER();
  });
  await page.locator('#field-test-send').click({force:true});
  await until(()=>read().roster?.some(s=>s.name==='FIELD_TEST_RENAMED'),'roster-only send');
  const second=read();
  assert.deepEqual(second.assignments,first.assignments);assert.deepEqual(second.layout,first.layout);
  assert.equal(second.students.find(s=>s.id===expected.ids[0]).name,'FIELD_TEST_RENAMED');
  await until(()=>ctx.pages().every(p=>p===page||p.isClosed()),'roster inbox closed');
  console.log('PASS installed manager actual seating and roster-only inbox, exact assignments and preserved layout');
  // The independent coin test can proceed only after the real roster checks passed.
  fs.writeFileSync(path.join(root,'field-manager-roster.pass'),'synthetic roster verified');
  const receipts=[];
  page.on('response',async r=>{
   const u=new URL(r.url());
   if(u.origin===board&&u.pathname==='/api/presentation/receipt'&&r.request().method()==='GET'){
    try{receipts.push(r.status()+':'+(await r.json()).state)}catch{receipts.push(String(r.status()))}
   }
  });
  const receipt=page.waitForResponse(r=>new URL(r.url()).origin===board&&new URL(r.url()).pathname==='/api/presentation/receipt'&&r.status()===200&&r.request().method()==='GET'&&r.url().includes('id='),{timeout:12000});
  assert.equal(await page.evaluate(()=>{
   window.__fieldPresentation=[];
   return window.__TT_BOARD_PRESENTATION.sendIfReady({kind:'seating',payload:buildPlaybackInput()},msg=>window.__fieldPresentation.push(msg),()=>window.__fieldPresentation.push('FALLBACK'));
  }),true);
  const firstReceipt=await receipt;
  const receiptId=new URL(firstReceipt.url()).searchParams.get('id');
  await page.waitForFunction(()=>window.__fieldPresentation?.some(s=>s.includes('표시 완료')||s.includes('표시 확인 실패')),null,{timeout:30000});
  const messages=await page.evaluate(()=>window.__fieldPresentation);
  assert(messages.some(s=>s.includes('표시 완료')),JSON.stringify({messages,receipts}));
  assert(!messages.includes('FALLBACK'));
  const closed=await page.evaluate(async ({id,board})=>{
   const r=await fetch(board+'/api/presentation/close',{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'text/plain'},body:id});return r.ok;
  },{id:receiptId,board});
  assert.equal(closed,true);
  await until(()=>page.evaluate(async ({id,board})=>{
   const r=await fetch(board+'/api/presentation/receipt?id='+id,{mode:'cors',credentials:'omit',cache:'no-store'});return r.ok&&(await r.json()).state==='closed';
  },{id:receiptId,board}),'presentation closed receipt');
  console.log('PASS installed manager real seating presentation receipt and close');
  assert.deepEqual(operational,[]);
  assert.deepEqual(errors,[]);
  console.log('PASS actual manager bootstrap, roster/presentation capability and no unintended loopback requests');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
