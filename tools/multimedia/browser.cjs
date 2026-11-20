const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('runtime-src/system');
(async()=>{let volume={level:52,muted:false},delayVolumeRead=false;const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;if(p==='/api/volume'){res.setHeader('Content-Type','application/json');if(req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{volume={...volume,...JSON.parse(Buffer.from(body,'base64').toString('utf8'))};res.end(JSON.stringify(volume))});return}const snapshot=JSON.stringify(volume);if(delayVolumeRead){setTimeout(()=>res.end(snapshot),300)}else res.end(snapshot);return}if(p.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{}');return}const f=path.join(root,p==='/'?'dashboard.html':p.slice(1));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return}res.setHeader('Content-Type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(f))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1280,height:720}});let direct=0;const checkCaptions=async()=>{const f=page.frames().find(x=>x.url().startsWith('https://www.youtube.com/embed/'));assert.ok(f);await f.waitForFunction(()=>window.captionClears===2&&window.captionUnloads===2)};
await page.route('https://**/*',async r=>{
 const u=new URL(r.request().url());
 if(u.hostname==='www.youtube.com'&&u.pathname.startsWith('/embed/')){
  direct++;assert.equal(u.searchParams.get('enablejsapi'),'1');assert.equal(u.searchParams.get('cc_load_policy'),'0');assert.equal(u.searchParams.get('origin'),'http://127.0.0.1:'+server.address().port);
  assert.equal(r.request().headers().referer,'http://127.0.0.1:'+server.address().port+'/');
  return r.fulfill({contentType:'text/html',body:'<html><script>let started=false;window.captionClears=0;window.captionUnloads=0;addEventListener("message",e=>{if(e.source!==parent||e.origin!==new URL(location.href).searchParams.get("origin"))return;let m=JSON.parse(e.data);let send=(event,info)=>parent.postMessage(JSON.stringify({event,info,id:m.id,channel:"widget"}),e.origin);if(m.event==="listening"){send("initialDelivery",{playerState:-1});send("onReady",null)}if(m.event==="command"&&m.func==="setOption"&&m.args[0]==="captions"&&m.args[1]==="track"&&Object.keys(m.args[2]).length===0)window.captionClears++;if(m.event==="command"&&m.func==="unloadModule"&&m.args[0]==="captions")window.captionUnloads++;if(m.event==="command"&&m.func==="playVideo"&&!started){if(!window.captionClears||!window.captionUnloads)throw Error("caption startup command missing");started=true;send("onApiChange",null);send("infoDelivery",{playerState:1});setTimeout(()=>send("onStateChange",0),2500)}});<\/script></html>'});
 }
 if(u.hostname==='www.youtube.com'&&u.pathname==='/iframe_api')throw Error('Third-party script must not be loaded in dashboard');
 return r.fulfill({contentType:'text/html',body:'<html>mock external</html>'})
});await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>!!window.ttMultimedia);const policy=await page.evaluate(()=>{const p=ttMultimedia.policy;return [p.youtube('https://youtu.be/sVoh_DAt9is?si=test'),p.youtube('https://youtube.com.evil.test/watch?v=sVoh_DAt9is'),p.canva('https://evil.test'),p.available({media:{}}).length,p.available({media:{'2':{kind:'youtube',id:'sVoh_DAt9is'}}}).map(x=>x.n),p.after('anthem',{media:{}}),p.after('anthem',{media:{song:{}}}),p.after('song',{media:{}})]});assert.deepEqual(policy,['sVoh_DAt9is','','',4,[2],'B2','B1','C']);
const initial=await page.evaluate(()=>({items:Object.fromEntries(Object.entries(layout.items).filter(([k,v])=>!v.off).map(([k,v])=>[k,[v.x,v.y,v.w,v.h]])),memoHidden:document.querySelector('[data-widget="memo"]').hidden,tail:[...document.querySelectorAll('.card[data-widget="tools"] .tools > button:not([hidden]),.card[data-widget="tools"] .tools > .spk-split:not([hidden])')].slice(-4).map(b=>b.dataset.app||b.dataset.toolKey||b.textContent.trim())}));
assert.deepEqual(initial.items,{week:[0,0,12,22],meal:[12,11,12,11],calendar:[36,0,12,22],tools:[0,22,48,5],photos:[12,0,24,11],weather:[24,11,12,11]});
assert.equal(initial.memoHidden,true);assert.deepEqual(initial.tail,['classkit','widgetmanager','fixed:전체화면','fixed:설정']);
const rects=Object.values(initial.items);for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const [x,y,w,h]=rects[i],[a,b,c,d]=rects[j];assert.ok(!(x<a+c&&a<x+w&&y<b+d&&b<y+h),'initial widgets overlap')}
console.log('PASS clean first-install layout exact 48x27, no overlaps, memo hidden and four rightmost management buttons');
await page.evaluate(()=>ttMultimedia.open());const dlg=page.locator('#ttMediaDialog');await dlg.getByRole('heading',{name:'멀티미디어',exact:true}).waitFor();const compact=await dlg.boundingBox();assert.ok(compact.width<=1060&&compact.height<350,JSON.stringify(compact));const tile=dlg.locator('.mm-card');
const mediaKeys=await dlg.locator('.mm-home > [data-media-tool]').evaluateAll(els=>els.map(e=>e.dataset.mediaTool));assert.deepEqual(mediaKeys,['meeting','books','youtube-downloader']);
const beforeDownloader=direct;
await dlg.locator('[data-media-tool="youtube-downloader"]').click();
await dlg.getByRole('heading',{name:'유튜브 다운로더',exact:true}).waitFor();
const dlURL=dlg.locator('input[type=url]');
for(const [url,expected] of [['https://www.youtube.com/watch?v=sVoh_DAt9is',true],['https://youtu.be/sVoh_DAt9is',true],['https://m.youtube.com/watch?v=sVoh_DAt9is',true],['https://www.youtube.com/shorts/sVoh_DAt9is',true],['https://youtube.com.evil.test/watch?v=sVoh_DAt9is',false],['https://youtu.be/abc',false],['https://www.youtube.com/playlist?list=PL123',false],['http://youtube.com/watch?v=sVoh_DAt9is',false]]){
 await dlURL.fill(url);await dlg.getByRole('button',{name:'주소 확인',exact:true}).click();
 assert.equal((await dlg.locator('#ttMediaStatus').textContent()).includes('단일 영상 주소 확인 완료'),expected,url);
}
assert.equal(direct,beforeDownloader);assert.equal(await dlg.locator('iframe,video').count(),0);
await dlg.getByRole('button',{name:'← 멀티미디어',exact:true}).click();
assert.equal(await dlg.locator('[data-media-tool="books"]').count(),1);
assert.equal(await dlg.locator('[data-media-tool="meeting"]').count(),1);
console.log('PASS downloader tile, valid and invalid single-video URLs, no playback/request, return to multimedia');
async function checkFlip(reverse=false){
 const result=await page.evaluate(async reverse=>{
  const d=document.querySelector('#ttMediaDialog'),stage=d.querySelector('.mm-stage'),card=d.querySelector('.mm-card'),inner=card.querySelector('.mm-card-inner');
  const snapshot=()=>{const a=d.getBoundingClientRect(),b=card.getBoundingClientRect();return {dw:a.width,dh:a.height,cw:b.width,ch:b.height,cx:b.x,cy:b.y,sw:stage.scrollWidth-stage.clientWidth,sh:stage.scrollHeight-stage.clientHeight,sl:stage.scrollLeft,st:stage.scrollTop}};
  const before=snapshot(),bad=[];let frames=0,moving=0;const started=performance.now();
  const target=reverse?card.querySelector('.mm-back-head button'):card.querySelector('.mm-tile');target.click();
  await new Promise(resolve=>{function sample(now){const v=snapshot();frames++;const p=inner.getAnimations().some(a=>a.playState==='running');if(p)moving++;if(v.sw>0||v.sh>0||v.sl!==0||v.st!==0||['dw','dh','cw','ch','cx','cy'].some(k=>Math.abs(v[k]-before[k])>.5))bad.push({at:Math.round(now-started),...v});if(now-started<380)requestAnimationFrame(sample);else resolve()}requestAnimationFrame(sample)});
  return {before,bad,frames,moving,flipped:card.classList.contains('is-flipped')};
 },reverse);
 assert.equal(result.flipped,!reverse);assert.ok(result.frames>=2&&result.moving>=1,JSON.stringify(result));assert.deepEqual(result.bad,[],JSON.stringify(result));
}
await checkFlip();await checkFlip(true);await checkFlip();await dlg.getByRole('button',{name:'실행하기',exact:true}).waitFor();assert.equal(await dlg.getByRole('button',{name:'앱 목록',exact:true}).count(),0);
await checkFlip(true);await page.setViewportSize({width:1920,height:1080});await checkFlip();await checkFlip(true);
await page.setViewportSize({width:390,height:700});await checkFlip();await checkFlip(true);
await page.setViewportSize({width:1280,height:720});await checkFlip();
console.log('PASS flip per-frame fixed modal/card bounds and no scroll overflow at 1280, 1920 and 390px in both directions');await page.locator('#ttMediaDialog').getByRole('button',{name:'실행하기',exact:true}).click();await page.locator('#ttMediaActions').getByText('애국가 1절',{exact:true}).waitFor();assert.equal(await page.locator('#ttMediaActions button').count(),4);assert.equal(await page.locator('#ttMediaActions').getByText('교가 재생').count(),0);assert.equal(await page.locator('#ttMediaDialog').evaluate(el=>el.matches(':modal')),true);const rect=await page.locator('#ttMediaDialog').boundingBox();assert.ok(rect.width>=1250&&rect.height>=700);assert.equal(await page.locator('#ttMediaDialog .mm-head').isVisible(),false);await page.locator('#ttMediaFull').click();assert.equal(await page.locator('#ttMediaDialog').evaluate(el=>el.classList.contains('mm-full')),true);await page.locator('#ttMediaFull').click();assert.equal(await page.locator('#ttMediaDialog').evaluate(el=>el.classList.contains('mm-full')),false);await page.locator('#ttMediaActions').getByText('애국가 1절',{exact:true}).click();await page.locator('#ttMediaDialog').getByText('조작하지 마세요. 자동으로 진행됩니다.',{exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!!document.querySelector('#ttMediaDialog iframe'));await checkCaptions();assert.equal(await page.locator('#ttMediaActions button:visible').count(),0);await page.waitForFunction(()=>document.querySelector('#ttMediaHeading').textContent.includes('교가 제외'),{},{timeout:10000});assert.equal(await page.locator('#ttMediaActions button').count(),1);assert.equal(await page.locator('#ttMediaDialog iframe').count(),1);await page.locator('#ttMediaBottomClose').click();assert.equal(await page.locator('#ttMediaDialog iframe').count(),0);console.log('PASS multimedia default route, direct iframe simulated video end, teardown, native dialog and URL policy');
await page.evaluate(()=>ttMultimedia.open(true));
await page.locator('#ttMediaDialog').getByRole('button',{name:'개인화',exact:true}).click();assert.ok((await dlg.boundingBox()).width<=920);assert.equal(await dlg.evaluate(el=>el.classList.contains('mm-config')),true);
await page.locator('#ttMediaDialog').getByText('애국가 · 기본 또는 직접 등록',{exact:true}).click();
await page.locator('#ttMediaSlot2').selectOption('youtube');
let inp=page.locator('#ttMediaSlot2').locator('..').locator('input[type=url]');
await inp.fill('https://www.youtube.com/watch?v=FlCynziVAy8');await inp.press('Tab');
await page.locator('#ttMediaDialog').getByText('학교 교가',{exact:true}).click();
await page.locator('#ttMediaSlotsong').selectOption('youtube');
inp=page.locator('#ttMediaSlotsong').locator('..').locator('input[type=url]');
await inp.fill('https://youtu.be/sVoh_DAt9is');await inp.press('Tab');
await page.locator('#ttMediaDialog').getByRole('button',{name:'저장',exact:true}).click();
await page.locator('#ttMediaDialog').getByRole('button',{name:'실행하기',exact:true}).waitFor();assert.ok((await dlg.boundingBox()).height<350);assert.equal(await dlg.locator('.mm-card.is-flipped').count(),1);
await page.reload();await page.waitForFunction(()=>!!window.ttMultimedia);
await page.evaluate(()=>ttMultimedia.open(true));await page.locator('#ttMediaDialog').getByRole('button',{name:'실행하기',exact:true}).click();
assert.equal(await page.locator('#ttMediaActions button').count(),1);
await page.locator('#ttMediaDialog').getByRole('button',{name:'애국가 2절',exact:true}).waitFor();
await page.waitForFunction(()=>!document.querySelector('#ttMediaVolume').disabled);
delayVolumeRead=true;
const staleRead=page.waitForRequest(r=>r.url().endsWith('/api/volume')&&r.method()==='GET');
await page.evaluate(()=>{window.__mmStaleRead=ttSystemVolume.read()});await staleRead;
await page.locator('#ttMediaVolume').fill('68');
await page.evaluate(()=>window.__mmStaleRead);
delayVolumeRead=false;
assert.equal(await page.evaluate(()=>ttSystemVolume.get().level),68);
assert.equal(await page.locator('.spk-vol').getAttribute('aria-valuenow'),'68');
assert.equal(volume.level,68);await page.evaluate(()=>ttSystemVolume.read());assert.equal(await page.evaluate(()=>ttSystemVolume.get().level),68);
await page.locator('#ttMediaDialog').getByRole('button',{name:'애국가 2절',exact:true}).click();
await page.locator('#ttMediaDialog').getByText('조작하지 마세요. 자동으로 진행됩니다.',{exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!!document.querySelector('#ttMediaDialog iframe'));await checkCaptions();
await page.waitForFunction(()=>document.querySelector('#ttMediaHeading').textContent.includes('교가 포함'));
assert.equal(await page.locator('#ttMediaActions button').count(),1);
await page.locator('#ttMediaDialog').getByRole('button',{name:'교가 재생',exact:true}).click();
await page.locator('#ttMediaDialog').getByText('조작하지 마세요. 자동으로 진행됩니다.',{exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!!document.querySelector('#ttMediaDialog iframe'));await checkCaptions();
await page.waitForFunction(()=>document.querySelector('#ttMediaHeading').textContent.includes('폐회사'));
assert.equal(await page.locator('#ttMediaActions button').count(),1);
await page.locator('#ttMediaDialog').getByRole('button',{name:'회의 종료',exact:true}).click();
assert.equal(await page.locator('#ttMediaDialog').evaluate(el=>el.open),false);
assert.equal(direct,3);console.log('PASS custom anthem subset, saved settings after reload, school song route, automatic notice, shared volume state and close');


 // Integrated book slot: mock native process only, preserve actual HTML geometry and toolbar.
 await page.evaluate(()=>localStorage.setItem('tt-books-v1:mark:DAHbOpoUrrg',JSON.stringify({page:5,at:Date.now()})));
 let nativeCalls=[],session='a'.repeat(32),phase=0,failOpen=true,saved=5,ack=0,manual=false,layouts=[];
 await page.route('**/api/book-reader/**',async route=>{
  const u=new URL(route.request().url());nativeCalls.push(u.pathname);
  if(u.pathname.endsWith('/open')){
   const a=JSON.parse(Buffer.from(route.request().postData(),'base64').toString('utf8'));
   assert.equal(a.id,'DAHbOpoUrrg');assert.equal(a.start,5);assert.equal(a.saved,5);assert.equal(a.layout.visible,1);
   if(failOpen){failOpen=false;return route.fulfill({status:409,json:{error:'native unavailable'}})}
   return route.fulfill({json:{ok:true,session}});
  }
  assert.equal(u.searchParams.get('session'),session);
  if(u.pathname.endsWith('/close'))return route.fulfill({json:{ok:true}});
  const a=JSON.parse(Buffer.from(route.request().postData(),'base64').toString('utf8'));layouts.push(a.layout);
  if(a.command&&a.command.seq>ack){ack=a.command.seq;manual=a.command.kind==='manual';saved=manual?a.command.page:4}
  if(!manual&&phase===0)saved=4;
  return route.fulfill({json:{ok:true,ready:true,owned:true,visible:true,closed:phase===2,page:4,saved,manual,ack,status:'저장됨'}});
 });
 // Wait for the previous modal lifecycle, then identify the book tile by its stable key.
 // Check the visible label separately so platform emoji accessibility differences do not hide regressions.
 await dlg.waitFor({state:'hidden'});
 await page.evaluate(()=>ttMultimedia.open());
 await dlg.getByRole('heading',{name:'멀티미디어',exact:true}).waitFor();
 const bookTile=dlg.locator('button[data-media-tool="books"]');
 try{
  await bookTile.waitFor({state:'visible'});
  assert.match((await bookTile.textContent()).trim(),/^(?:📖\s*)?책 읽어주기$/u);
  await bookTile.click();
  await dlg.getByRole('heading',{name:'책 읽어주기',exact:true}).waitFor();
 }catch(error){
  console.error('Book entry diagnostics',await dlg.evaluate(d=>({open:d.open,heading:d.querySelector('h2')?.textContent,tiles:[...d.querySelectorAll('[data-media-tool]')].map(x=>({key:x.dataset.mediaTool,text:x.textContent,hidden:x.hidden,inert:x.inert}))})));
  throw error;
 }
 await dlg.getByRole('button',{name:'5쪽 이어 읽기',exact:true}).click();await dlg.getByRole('button',{name:'다시 시도',exact:true}).waitFor();
 assert.equal(await dlg.locator('iframe').count(),0);assert.equal(await dlg.getByText('기존 재생기',{exact:true}).count(),0);
 await dlg.getByRole('button',{name:'다시 시도',exact:true}).click();
 await dlg.getByText('4 / 5쪽 · 저장됨',{exact:true}).waitFor();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tt-books-v1:mark:DAHbOpoUrrg')).page===4);
 assert.equal(await dlg.getByRole('button',{name:'수동 저장',exact:true}).count(),0);
 const slot=await dlg.locator('.mm-book-slot').boundingBox(),foot=await dlg.locator('.mm-foot').boundingBox();assert.ok(slot.width>=1100&&slot.y+slot.height<=foot.y+1);
 await dlg.getByRole('button',{name:'전체화면',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ttMediaDialog').classList.contains('mm-full'));
 assert.equal(await dlg.locator('.mm-foot').isVisible(),false);
 await new Promise(r=>setTimeout(r,800));assert.ok(layouts.some(x=>x.immersive===1&&x.x<=1&&x.y<=1&&x.w>=x.vw-2&&x.h>=x.vh-2));
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('#ttMediaDialog').classList.contains('mm-full'));
 await dlg.getByRole('button',{name:'전체화면',exact:true}).waitFor();
 assert.equal(await dlg.locator('.mm-foot').isVisible(),true);
 await page.setViewportSize({width:1600,height:900});await new Promise(r=>setTimeout(r,900));assert.ok(layouts.some(x=>x.vw===1600&&x.w>1100));
 await page.setViewportSize({width:1280,height:720});phase=2;await dlg.getByRole('button',{name:'4쪽 이어 읽기',exact:true}).waitFor();
 await dlg.getByRole('button',{name:'+ 책 추가',exact:true}).click();await dlg.getByLabel('책 제목',{exact:true}).fill('다른 책');
 await dlg.getByLabel('캔바 보기용 주소',{exact:true}).fill('https://www.canva.com/design/TEST_SECOND/ABC/view?embed');
 await dlg.getByLabel('전체 페이지 수',{exact:true}).fill('12');await dlg.getByRole('button',{name:'추가',exact:true}).click();
 assert.equal(await dlg.locator('[data-book-id]').count(),2);
 await dlg.getByRole('button',{name:'닫기 ✕',exact:true}).click();await page.unroute('**/api/book-reader/**');
 await page.reload();await page.waitForFunction(()=>!!window.ttMultimedia);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('tt-books-v1:mark:DAHbOpoUrrg')).page),4);
 console.log('PASS single HTML toolbar, native slot layout and resize, retry without legacy, automatic bookmark, immersive toolbar hiding and exit, separate books and reload');

// Timetable: the rendered one-day table uses all available space, preserving lunch and inner gaps.
// Exercise the real renderer, including the compact layout, and restore the weekly view.
const timetable=await page.evaluate(()=>{
 const saved={...layout.items.week},mode=layout.weekView;
 try{
  const c=seoulClock(),ref=new Date(c.date+'T00:00:00Z');const dow=ref.getUTCDay();ref.setUTCDate(ref.getUTCDate()+(dow===0?1:dow===6?2:0));
  const idx=ref.getUTCDay()-1,dates=Array.from({length:5},(_,i)=>{const d=new Date(ref);d.setUTCDate(d.getUTCDate()+i-idx);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()});
  const out=[];layout.items.week.h=10;layout.items.week.w=24;layout.weekView='today';
  function run(n,gap=false,compact=false,weekly=false){
   layout.items.week.h=compact?5:10;layout.weekView=weekly?'week':'today';
   const rows=Array.from({length:7},(_,i)=>({label:(i+1)+'교시',cells:Array.from({length:5},(_,j)=>j===idx?(i<n&&!(gap&&i===4)?'수학':''):i<6?'국어':'')}));
   renderWeek({title:'시험 시간표',referenceDate:ref.toISOString().slice(0,10),dates,rows,events:[]});applyWeekView();
   return [...document.querySelectorAll('#week .schedule tbody tr:not([hidden])')].map(r=>r.classList.contains('lunch-row')?'점심':r.cells[0].textContent.match(/^\d+/)?.[0]);
  }
  out.push(run(4),run(5),run(6),run(6,true),run(4,false,true),run(4,false,false,true));
  return out;
 }finally{Object.assign(layout.items.week,saved);layout.weekView=mode;applyWeekView()}
});
assert.deepEqual(timetable,[['1','2','3','4','점심'],['1','2','3','4','점심','5'],['1','2','3','4','점심','5','6'],['1','2','3','4','점심','5','6'],['1','2','3','4','점심'],['1','2','3','4','점심','5','6','7']]);
console.log('PASS one-day timetable trailing periods, lunch, internal gaps, compact and weekly restoration');

// Full-week modal must restore every weekday without creating phantom columns.
// Exercise the production modal from full, one-day, and compact widget layouts.
for(const mode of ['week','today','compact']){
 const geometry=await page.evaluate(async mode=>{
  const saved={...layout.items.week},savedMode=layout.weekView;
  try{
   layout.items.week.w=24;layout.items.week.h=mode==='compact'?5:10;layout.weekView=mode==='week'?'week':'today';
   applyWeekView();
   const source=document.querySelector('#week .schedule');
   const originalLunch=[...source.querySelector('.lunch-row').cells].map(c=>c.textContent);
   window.openWidgetZoom('week');
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const table=document.querySelector('#zoomBody .schedule'),head=[...table.tHead.rows[0].cells],rows=[...table.rows],rect=table.getBoundingClientRect();
   const widths=head.slice(1).map(c=>c.getBoundingClientRect().width);
   return {rowColumns:rows.map(r=>[...r.cells].reduce((sum,c)=>sum+c.colSpan,0)),visible:head.every(c=>!c.hidden&&c.getBoundingClientRect().width>0),headerVisible:!table.tHead.hidden,allPeriodsVisible:[...table.tBodies[0].rows].filter(r=>!r.classList.contains('lunch-row')).every(r=>!r.hidden),widthSpread:Math.max(...widths)-Math.min(...widths),rightGap:Math.abs(rect.right-head[5].getBoundingClientRect().right),lunch:[...table.querySelector('.lunch-row').cells].map(c=>c.textContent),originalLunch,today:head.filter(c=>c.classList.contains('today')).length,sourceToday:source.tHead.querySelectorAll('.today').length};
  }finally{Object.assign(layout.items.week,saved);layout.weekView=savedMode;applyWeekView()}
 },mode);
 assert.ok(geometry.rowColumns.every(n=>n===6),mode+' '+JSON.stringify(geometry));
 assert.ok(geometry.visible&&geometry.headerVisible&&geometry.allPeriodsVisible,mode+' modal hidden columns or rows');
 assert.ok(geometry.widthSpread<=2&&geometry.rightGap<=2,mode+' '+JSON.stringify(geometry));
 assert.deepEqual(geometry.lunch,geometry.originalLunch);
 assert.equal(geometry.today,geometry.sourceToday);
 await page.locator('#zoomClose').click();await page.waitForFunction(()=>!document.querySelector('#widgetZoom').open&&!document.querySelector('#zoomBody').children.length);
}
console.log('PASS full-week modal six-column geometry, weekday lunch cells and compact/today restoration');


// Date-specific lunch edit: preserve subject overrides, hide selected day, restore lunch only.
const lunchDate=await page.evaluate(()=>{
 const c=seoulClock(),ref=new Date(c.date+'T00:00:00Z'),dow=ref.getUTCDay();ref.setUTCDate(ref.getUTCDate()+(dow===0?1:dow===6?2:0));const idx=ref.getUTCDay()-1;
 const dates=Array.from({length:5},(_,i)=>{const d=new Date(ref);d.setUTCDate(d.getUTCDate()+i-idx);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()});
 layout.weekView='today';layout.items.week.h=10;layout.items.week.w=24;
 renderWeek({title:'점심 시험',referenceDate:ref.toISOString().slice(0,10),dates,rows:Array.from({length:7},(_,i)=>({label:(i+1)+'교시',cells:Array(5).fill(i<4?'수학':'')})),events:[]});applyWeekView();return ref.toISOString().slice(0,10)
});
assert.equal(await page.evaluate(date=>ttClasskit.editLunch(date),lunchDate),true);
await page.locator('#ckLunchStart').fill('12:15');await page.locator('#ckLunchEnd').fill('12:55');
await page.locator('#ckScheduleRows [data-period="0"]').fill('국어');await page.locator('#ckScheduleSave').click();
await page.waitForFunction(()=>document.querySelector('#ckScheduleStatus').textContent.includes('저장했습니다'));
assert.equal(await page.evaluate(date=>JSON.parse(localStorage.getItem('class-today-schedule')).byDate[date].lunch.start,lunchDate),'12:15');
assert.equal(await page.locator('#week .lunch-row td:not([hidden]) .lunch-pill').textContent(),'12:15~12:55');
await page.locator('#ckLunchHide').check();await page.locator('#ckScheduleSave').click();
assert.equal(await page.locator('#week .lunch-row').evaluate(r=>r.hidden),true);
assert.equal(await page.evaluate(date=>JSON.parse(localStorage.getItem('class-today-schedule')).byDate[date].subjects['1교시'],lunchDate),'국어');
await page.locator('#ckLunchDefault').click();await page.locator('#ckScheduleSave').click();
assert.equal(await page.locator('#week .lunch-row').evaluate(r=>r.hidden),false);
assert.equal(await page.evaluate(date=>!!JSON.parse(localStorage.getItem('class-today-schedule')).byDate[date].lunch,lunchDate),false);
assert.equal(await page.evaluate(date=>JSON.parse(localStorage.getItem('class-today-schedule')).byDate[date].subjects['1교시'],lunchDate),'국어');
await page.locator('#ckScheduleReset').click();await page.locator('#ckClose').click();
console.log('PASS temporary lunch time edit, hide, subject coexistence and independent restore');

}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
