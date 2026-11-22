// Uses only loopback fixture pages and synthetic data; no live school or Cloud Run calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]),repo=path.resolve(__dirname,'../..'),board='http://127.0.0.1:17439',manager='http://127.0.0.1:4188';
const state={item:null,receipt:new Map(),ack:[],token:1},errors=[],missing=[];
const head='<meta charset="utf-8"><style>:root{--panel:#edf8f3;--text:#234b40;--border:#b8d4c4;--control:#dcefe2;--control-text:#1f4f3f;--accent:#398272;--surface:#f1f8f2;--sub:#5f8072}body{margin:0;background:#ccd9dc}dialog{border-radius:18px}#ttBackdropParticles{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}</style>';
const boardHtml=head+'<link rel="stylesheet" href="/presentation-board.css"><canvas id="ttBackdropParticles" width="1600" height="1000"></canvas><div id="existing-widget">unchanged dashboard</div><dialog id="ttPresentation"><div class="tt-present-head"><h2 id="ttPresentationTitle"></h2><button id="ttPresentationClose">닫기</button></div><iframe id="ttPresentationFrame"></iframe><div id="ttPresentationLoading">준비 중</div><canvas id="ttPresentationParticles"></canvas></dialog><script>document.querySelector("#ttBackdropParticles").getContext("2d").fillRect(0,0,1600,1000)</script><script src="/presentation-board.js"></script>';
const managerHtml=head+'<button id="send">send</button><script>window.readyForBoard=false;window.__TT_BOARD_CONNECTION={presentationReady:()=>window.readyForBoard};window.logs=[];window.addEventListener("tt-board-presentation-status",e=>logs.push(e.detail.message));</script><script src="/classroom/host/presentation-link.js"></script><script>window.send=(data)=>__TT_BOARD_PRESENTATION.sendIfReady(data,s=>logs.push(s),()=>logs.push("fallback"))</script>';
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
function service(isBoard){return http.createServer(async(req,res)=>{
 const u=new URL(req.url,board);const cors={'Access-Control-Allow-Origin':manager,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Private-Network':'true','Cache-Control':'no-store'};
 const json=(body,status=200)=>{res.writeHead(status,{...cors,'Content-Type':'application/json'});res.end(JSON.stringify(body))};
 if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end()}
 if(isBoard&&u.pathname.startsWith('/api/presentation/')){
  let body='';for await(const c of req)body+=c;
  if(u.pathname.endsWith('/poll'))return json(state.item||{id:null});
  if(u.pathname.endsWith('/send')){const {id,...data}=JSON.parse(Buffer.from(body,'base64').toString('utf8'));state.item={id,data};state.receipt.set(id,'pending');return json({id})}
  if(u.pathname.endsWith('/receipt'))return json({state:state.receipt.get(u.searchParams.get('id'))||'expired'});
  if(u.pathname.endsWith('/ack')){const [id,st]=body.split(':');state.ack.push({id,st});state.receipt.set(id,st);if(st!=='displayed'&&state.item?.id===id)state.item=null;return json({ok:true})}
  if(u.pathname.endsWith('/close')){if(state.item?.id===body)state.item=null;state.receipt.set(body,'closed');return json({ok:true})}
 }
 if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(isBoard?boardHtml:managerHtml)}
 let f=path.resolve(isBoard?root:repo,'.'+u.pathname);if(isBoard&&!fs.existsSync(f)&&/^\/presentation\/shared\/assets\/(playback|students|teacher)\/[A-Za-z0-9_-]+\.png$/.test(u.pathname)&&fs.existsSync(f.slice(0,-4)+'.webp'))f=f.slice(0,-4)+'.webp';if(!f.startsWith((isBoard?root:repo)+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){if(u.pathname!=='/favicon.ico')missing.push(u.pathname);res.writeHead(404);return res.end()}
 res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));
})}
const sprite='../shared/assets/students/boy1_black_green.png',rows=4,cols=8;
const cells=Array.from({length:rows*cols},(_,i)=>({id:'seat-r'+Math.floor(i/cols)+'-c'+i%cols,row:Math.floor(i/cols),col:i%cols,type:[2,5].includes(i%cols)?'aisle':'seat'}));
const seating={kind:'seating',payload:{layout:{rows,cols,cells},students:['black','red','none','navy'].map((glasses,i)=>({id:'s'+i,name:'virtual '+i,visual:sprite,glasses})),assignments:['seat-r0-c1','seat-r0-c0','seat-r1-c0','seat-r1-c1'].map((seatId,i)=>({studentId:'s'+i,seatId})),previousAssignments:['seat-r0-c0','seat-r0-c1','seat-r1-c0'].map((seatId,i)=>({studentId:'s'+i,seatId})),historyTransition:true,previousRound:1,groups:[],pairReactions:[],teacherAvatar:{gender:'female',skin:0,eyes:0,hair:0,hairColor:0,glasses:0,beard:0,outfit:2},className:'virtual class'}};
const pe={kind:'pe',payload:{teams:[[{id:'s1',name:'virtual 1',src:sprite},{id:'s2',name:'virtual 2',src:sprite}],[{id:'s3',name:'virtual 3',src:'../shared/assets/students/girl_brown_blue.png'}]],surface:'dirt',showLines:true}};
const qr={kind:'life-qr',payload:{url:'https://teacher-tools-class-life-397335421867.asia-northeast3.run.app/classroom/survey/student.html?owner=virtual-teacher&class=virtual-class&year=2026&month=11',year:2026,month:11,className:'virtual class',open:true}};
(async()=>{
 const s1=service(true),s2=service(false);await new Promise(r=>s1.listen(17439,'127.0.0.1',r));await new Promise(r=>s2.listen(4188,'127.0.0.1',r));
 let browser;try{
  browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
  await ctx.route('**/*',route=>[board,manager].some(x=>route.request().url().startsWith(x+'/'))?route.continue():route.abort());
  const bp=await ctx.newPage(),mp=await ctx.newPage();for(const p of [bp,mp])p.on('pageerror',e=>errors.push(e.message));
  await bp.goto(board);await mp.goto(manager);
  assert.equal(await mp.evaluate(d=>window.send(d),seating),false);assert.equal(state.item,null);console.log('unlinked manager uses original popup path');
  await mp.evaluate(()=>window.readyForBoard=true);
  async function offer(data){
   const oldId=state.item?.id;await mp.evaluate(()=>logs=[]);
   assert.equal(await mp.evaluate(d=>window.send(d),data),true);
   await bp.waitForFunction(old=>document.querySelector('#ttPresentation').open&&document.querySelector('#ttPresentationLoading').hidden&&document.querySelector('#ttPresentationFrame').src.split('#')[1]!==old,oldId||'',{timeout:20000});
   await mp.waitForFunction(()=>logs.some(x=>x.includes('표시 완료')),{},{timeout:20000});
   assert(state.ack.some(a=>a.id===state.item.id&&a.st==='displayed'));
   const f=bp.frames().find(f=>f.url().includes('/presentation/seating/'));assert(f);assert.equal(await f.locator('script[src*="manager-theme"],script[src*="hoja-theme"],link[href*="manager-theme"],link[href*="manager-home"]').count(),0,'offline renderer must not load manager-only theme assets');return f;
  }
  async function close(){await bp.locator('#ttPresentationClose').click();await bp.waitForFunction(()=>!document.querySelector('#ttPresentation').open);await mp.evaluate(()=>logs=[]);await new Promise(r=>setTimeout(r,700));assert.equal(state.item,null)}
  let f=await offer(seating);
  assert(await f.evaluate(()=>playbackData.historyTransition&&playbackData.previousAssignments.length===3&&new Set(playbackStudents.map(s=>s.glasses)).size===4));
  assert(await f.evaluate(()=>document.querySelectorAll('.history-start-student').length===2&&playbackStudents.find(s=>s.id==='s2').seat.querySelector('.student').classList.contains('visible')));
  assert.equal(await f.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tt-present-accent')),'#398272');
  await f.locator('#run5').click();await f.getByText('즉시 완료',{exact:false}).first().click();assert(await f.evaluate(()=>playbackCompleted));
  assert(await bp.locator('#ttPresentationParticles').evaluate(c=>c.getContext('2d').getImageData(5,5,1,1).data[3]>0));
  await f.locator('#simpleViewButton').click();
  assert.deepEqual(await f.locator('#simpleCanvas').evaluate(e=>Array.from(e.getContext('2d').getImageData(0,0,1,1).data)),[241,248,242,255]);
  assert.equal(await f.locator('.simple-head h1').evaluate(e=>getComputedStyle(e).color),'rgb(35, 75, 64)');
  const detached=f;console.log('seating chart theme and history PASS');
  f=await offer(pe);assert(detached.isDetached());assert(await f.evaluate(()=>document.querySelector('#pePitchReveal').classList.contains('is-dirt')&&document.querySelector('#pePitchTeamCount').textContent.includes('2팀')));
  for(const selector of ['.pe-pitch-identity','#pePitchTeamCount','.pe-pitch-entrance-meta','#pePitchSpriteStatus'])assert(!(await f.locator(selector).isVisible()));
  // The public/offline Hoja Board uses the same PE canvas renderer as the web manager.
  // Confirm both team zones are actually drawn *before* opening the simple team sheet.
  const zoneColors=await f.evaluate(()=>{
    const paint=document.querySelector('#pePitchCanvas').getContext('2d');
    const fill=paint.fill,colors=[];
    paint.fill=function(...args){
      if(Math.abs(this.globalAlpha-.19)<.001)colors.push(this.fillStyle.toLowerCase());
      return fill.apply(this,args);
    };
    try{document.querySelector('#pePitchInstant').click()}finally{paint.fill=fill}
    return colors;
  });
  assert.deepEqual(zoneColors,['#2563eb','#dc2626'],'two distinct translucent team zones should render in offline board canvas');
  await f.locator('#pePitchSimpleOpen').click();assert.equal(await f.locator('.pe-simple-team').count(),2);
  const peFrame=f;f=await offer(seating);assert(peFrame.isDetached());assert(await f.evaluate(()=>playbackData.historyTransition));await close();console.log('Seat simple -> PE -> seat without close, old frames detached, buttons only PASS');
  f=await offer(qr);assert((await f.locator('.tt-life-qr-code svg rect').count())>100);
  assert(await bp.evaluate(()=>{const c=document.querySelector('#ttPresentationParticles'),r=c.getBoundingClientRect(),f=document.querySelector('#ttPresentationFrame'),b=f.contentDocument.querySelector('.tt-life-qr-code').getBoundingClientRect(),fr=f.getBoundingClientRect();return c.getContext('2d').getImageData(Math.round(fr.left-r.left+b.left+b.width/2),Math.round(fr.top-r.top+b.top+b.height/2),1,1).data[3]===0}));
  await mp.evaluate(url=>__TT_BOARD_PRESENTATION.closeQr(url),qr.payload.url);await bp.waitForFunction(()=>!document.querySelector('#ttPresentation').open);console.log('QR generation, quiet zone, remote close PASS');
  assert.equal(await bp.locator('#existing-widget').innerText(),'unchanged dashboard');assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('all 3 actual offline renderer modes PASS; no page errors or missing assets');
 }finally{await browser?.close();s1.close();s2.close()}
})().catch(e=>{console.error(e);process.exit(1)});
