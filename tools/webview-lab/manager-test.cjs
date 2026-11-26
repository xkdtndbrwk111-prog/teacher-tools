// Phase 2B: real Chrome, real manager sender scripts, real inbox/server and native board.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=process.argv[2],repo=path.resolve(__dirname,'../..'),manager='http://127.0.0.1:4188',board='http://127.0.0.1:17449';
assert(root&&fs.existsSync(path.join(root,'manager.ready')));
const files=new Set(['/classroom/host/dashboard-link.js','/classroom/host/board-status.js','/classroom/host/presentation-link.js','/classroom/host/presentation-protocol.mjs','/classroom/host/life-public-url.mjs','/classroom/host/life-cloud-config.mjs','/classroom/grades/model.mjs']);
const html='<!doctype html><meta charset=utf-8><div class="top-actions"></div><button id="confirmAssignment">confirm</button><button id="lab-roster" onclick="__TT_SEND_ROSTER()">send roster</button><div id="tt-hud-more-menu"></div><script>window.logs=[];window.__TT_STAGE031_CLASS={activeId:"LAB_CLASS_2",installId:"lab"};window.__TT_STORE={read:async()=>({memberships:[]})};window.setSaveStatus=(...a)=>logs.push(a[0]);window.historyView=false;window.confirmedRevision=1;window.previewRevision=1;const sprite="../shared/assets/students/boy1_black_green.png";const students=[{id:"m1",name:"LAB_MANAGER_ONE",gender:"male",visual:sprite},{id:"m2",name:"LAB_MANAGER_TWO",gender:"male",visual:sprite}];const layout={rows:2,cols:2,cells:Array.from({length:4},(_,i)=>({id:"s"+i,row:Math.floor(i/2),col:i%2,type:"seat"}))};window.classState={className:"LAB CLASS TWO",students,layout,assignments:[{studentId:"m1",seatId:"s0"},{studentId:"m2",seatId:"s1"}],rules:{completeRandom:true},ui:{numberMode:"ordered"}};window.buildPlaybackInput=()=>({className:classState.className,students:classState.students,assignments:classState.assignments,layout,groups:[],teacherAvatar:{gender:"female",skin:0,eyes:0,hair:0,hairColor:0,glasses:0,beard:0,outfit:2}});window.addEventListener("tt-board-presentation-status",e=>logs.push(e.detail.message));</script><script src="/classroom/host/dashboard-link.js"></script><script src="/classroom/host/board-status.js"></script><script src="/classroom/host/presentation-link.js"></script>';
const s=http.createServer((req,res)=>{
 const u=new URL(req.url,manager);
 if(req.method!=='GET'){res.writeHead(405);return res.end()}
 if(u.pathname==='/seating/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html)}
 if(!files.has(u.pathname)){res.writeHead(404);return res.end()}
 let source=fs.readFileSync(path.join(repo,u.pathname.slice(1)),'utf8');
 // Only the isolated Chrome response is adapted to the lab port, never the repository/production code.
 if(/\/(dashboard-link|board-status|presentation-link)\.js$/.test(u.pathname))source=source.replaceAll('127.0.0.1:17439','127.0.0.1:17449');
 if(u.pathname==='/classroom/host/presentation-link.js')source=source.replace('}catch(error){','}catch(error){console.error("LAB presentation exception",String(error));');
 res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(source);
});
(async()=>{
 let browser;
 try{
  await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(4188,'127.0.0.1',resolve)});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext();
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.origin===manager&&(u.pathname==='/seating/'||files.has(u.pathname)))return route.continue();
   if(u.origin===board&&['/api/board-status','/api/presentation/send','/api/presentation/receipt','/api/presentation/close','/seating-inbox','/coins.js','/api/seating','/api/roster'].includes(u.pathname))return route.continue();
   if(u.origin===manager||u.origin===board)console.log('LAB blocked '+u.origin+u.pathname);
   return route.abort();
  });
  const page=await ctx.newPage();const errors=[],trace=[];
  const note=x=>{trace.push(x);console.log(x)};
  const observe=p=>{p.on('pageerror',e=>{errors.push(e.message);note('pageerror '+e.message)});p.on('console',m=>{if(m.type()==='error')note('console '+m.text())});p.on('close',()=>note('page closed'))};
  observe(page);ctx.on('page',p=>{note('popup opened');observe(p)});
  ctx.on('response',r=>{const u=new URL(r.url());if(u.origin===board&&['/seating-inbox','/api/seating','/api/roster','/api/presentation/send','/api/presentation/receipt','/api/presentation/close'].includes(u.pathname))note(r.request().method()+' '+u.pathname+' '+r.status())});
  ctx.on('requestfailed',r=>{const u=new URL(r.url());if(u.origin===manager||u.origin===board)note('request failed '+u.pathname+' '+r.failure()?.errorText)});
  const seatPath=path.join(root,'local','TeacherToolsLocal','seating.json');
  const readSeat=()=>JSON.parse(fs.readFileSync(seatPath,'utf8'));
  async function sendClick(selector,label){
   await page.evaluate(()=>{logs.length=0});
   // Do not reuse a named window until the previous actual inbox has closed.
   const end=Date.now()+5000;while(ctx.pages().some(p=>p!==page&&!p.isClosed())){if(Date.now()>end)throw Error('previous inbox still open');await new Promise(r=>setTimeout(r,100))}
   await page.locator(selector).click();
   await page.waitForFunction(label=>logs.some(x=>x.includes(label))||logs.some(x=>/막았습니다|보내지 못|연결되지|만들지 못|확인해 주세요/.test(x)),label,{timeout:10000}).catch(async e=>{throw Error(selector+' timeout: '+JSON.stringify(await page.evaluate(()=>({logs,ready:__TT_BOARD_CONNECTION.rosterReady()})))+'; '+trace.slice(-12).join('; ')+'; '+e.message)});
   const logs=await page.evaluate(()=>window.logs.slice());
   assert(logs.some(x=>x.includes(label)),selector+': '+JSON.stringify(logs));
  }
  await page.goto(manager+'/seating/');
  await page.waitForFunction(()=>window.__TT_BOARD_CONNECTION?.rosterReady()&&window.__TT_BOARD_CONNECTION?.presentationReady(),null,{timeout:20000});
  assert.equal(await page.locator('#tt-send-board').isEnabled(),true);
  await sendClick('#tt-send-board','칠판으로 보냄');
  assert.equal(readSeat().classId,'LAB_CLASS_2');
  assert.equal(readSeat().assignments.length,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('tt.classroom.board-linked')),'1');
  console.log('PASS Chrome actual sender/inbox and connected native window');
  // Roster-only same class updates name, then a real second confirmed transfer.
  await page.evaluate(()=>{classState.students[0].name='LAB_MANAGER_RENAMED'});
  const beforeRoster=readSeat();
  await sendClick('#lab-roster','학생 명단 보냄');
  const afterRoster=readSeat();
  assert.equal(afterRoster.roster.find(s=>s.id==='m1').name,'LAB_MANAGER_RENAMED');
  assert.equal(afterRoster.students.find(s=>s.id==='m1').name,'LAB_MANAGER_RENAMED');
  assert.deepEqual(afterRoster.assignments,beforeRoster.assignments);
  assert.deepEqual(afterRoster.layout,beforeRoster.layout);
  console.log('PASS roster-only persisted and preserved layout');
  await page.evaluate(()=>{classState.assignments=[{studentId:'m1',seatId:'s1'},{studentId:'m2',seatId:'s0'}]});
  await sendClick('#confirmAssignment','칠판으로 보냄');
  assert.equal(readSeat().assignments.find(a=>a.studentId==='m1').seatId,'s1');
  console.log('PASS roster-only and confirm auto-send');
  const offer=async kind=>{
   assert.equal(await page.evaluate(kind=>{
    logs.length=0;
    const data=kind==='seating'?{kind,payload:buildPlaybackInput()}:{kind,payload:{teams:[[ {id:'m1',name:'LAB_MANAGER_RENAMED',src:classState.students[0].visual} ],[ {id:'m2',name:'LAB_MANAGER_TWO',src:classState.students[1].visual} ]],surface:'dirt',showLines:true}};
    return __TT_BOARD_PRESENTATION.sendIfReady(data,()=>{},()=>logs.push('unexpected fallback'));
   },kind),true);
   await page.waitForFunction(()=>logs.some(x=>x.includes('표시 완료')||x.includes('표시 확인 실패')),null,{timeout:30000});
   assert((await page.evaluate(()=>logs)).some(x=>x.includes('표시 완료')),kind+': '+JSON.stringify(await page.evaluate(()=>logs)));
   assert.equal(await page.evaluate(()=>logs.includes('unexpected fallback')),false);
   console.log('PASS real WebView2 renderer receipt: '+kind);
  };
  await offer('seating');await offer('pe');
  fs.writeFileSync(path.join(root,'manager.close'),'close');
  await page.waitForFunction(()=>!__TT_BOARD_PRESENTATION.isActive(),null,{timeout:20000});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'manager.done'),'ok');
 }finally{await browser?.close();s.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
