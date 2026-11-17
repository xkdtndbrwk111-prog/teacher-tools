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
await page.evaluate(()=>ttMultimedia.open());const dlg=page.locator('#ttMediaDialog');await dlg.getByRole('heading',{name:'멀티미디어',exact:true}).waitFor();const compact=await dlg.boundingBox();assert.ok(compact.width<=380&&compact.height<350,JSON.stringify(compact));const tile=dlg.locator('.mm-card');const before=await tile.boundingBox();await dlg.getByRole('button',{name:'학급어린이회의',exact:true}).click();await dlg.getByRole('button',{name:'실행하기',exact:true}).waitFor();assert.deepEqual(await tile.boundingBox(),before);assert.equal(await dlg.getByRole('button',{name:'앱 목록',exact:true}).count(),0);await dlg.getByRole('button',{name:'학급어린이회의 카드 되돌리기'}).click();await dlg.getByRole('button',{name:'학급어린이회의',exact:true}).click();await page.locator('#ttMediaDialog').getByRole('button',{name:'실행하기',exact:true}).click();await page.locator('#ttMediaActions').getByText('애국가 1절',{exact:true}).waitFor();assert.equal(await page.locator('#ttMediaActions button').count(),4);assert.equal(await page.locator('#ttMediaActions').getByText('교가 재생').count(),0);assert.equal(await page.locator('#ttMediaDialog').evaluate(el=>el.matches(':modal')),true);const rect=await page.locator('#ttMediaDialog').boundingBox();assert.ok(rect.width>=1250&&rect.height>=700);assert.equal(await page.locator('#ttMediaDialog .mm-head').isVisible(),false);await page.locator('#ttMediaFull').click();assert.equal(await page.locator('#ttMediaDialog').evaluate(el=>el.classList.contains('mm-full')),true);await page.locator('#ttMediaFull').click();assert.equal(await page.locator('#ttMediaDialog').evaluate(el=>el.classList.contains('mm-full')),false);await page.locator('#ttMediaActions').getByText('애국가 1절',{exact:true}).click();await page.locator('#ttMediaDialog').getByText('조작하지 마세요. 자동으로 진행됩니다.',{exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!!document.querySelector('#ttMediaDialog iframe'));await checkCaptions();assert.equal(await page.locator('#ttMediaActions button:visible').count(),0);await page.waitForFunction(()=>document.querySelector('#ttMediaHeading').textContent.includes('교가 제외'),{},{timeout:10000});assert.equal(await page.locator('#ttMediaActions button').count(),1);assert.equal(await page.locator('#ttMediaDialog iframe').count(),1);await page.locator('#ttMediaBottomClose').click();assert.equal(await page.locator('#ttMediaDialog iframe').count(),0);console.log('PASS multimedia default route, direct iframe simulated video end, teardown, native dialog and URL policy');
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

}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
