const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve('runtime-src/system');
const school={office:'B10',code:'1234567',name:'가상학교',grade:'6',cls:'1',sheet:'TEST_SHEET_00000000000'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:17439');
 if(u.pathname.startsWith('/api/')||u.pathname==='/health'){
  if(req.method!=='GET'&&['/api/school','/api/week','/api/events'].includes(u.pathname)){res.writeHead(405);return res.end('{}')}
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(u.pathname==='/api/school'?{school}:{}));
 }
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/dashboard.html':u.pathname));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));
});
(async()=>{await new Promise(r=>server.listen(17439,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:17439/')?r.continue():r.abort());
 const boot=async()=>{await page.goto('http://127.0.0.1:17439/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof ttEventScope!=='undefined'&&ttEventScope?.code==='1234567');await page.evaluate(()=>{
  const now=new Date(),today=key(now.getFullYear(),now.getMonth(),now.getDate()),tomorrow=ttEventDay(today,1);
  window.weekDates=[textDate(today)];window.weekEvents=['중복 일정\n별도 주간활동'];
  renderEvents({rows:[{date:today,name:'중복 일정'},{date:today,name:'연속 일정'},{date:tomorrow,name:'연속 일정'}]});
  calendarDate=new Date(now.getFullYear(),now.getMonth(),1);renderCalendar();
 })};
 await boot();
 const result=await page.evaluate(()=>{
  const assert=(v,m)=>{if(!v)throw Error(m)},now=new Date(),today=key(now.getFullYear(),now.getMonth(),now.getDate());
  const list=()=>[...document.querySelectorAll('#events .event-item')],rows=()=>[...document.querySelectorAll('#dayExisting .tt-day-event')];
  assert(list().filter(e=>e.textContent.includes('중복 일정')).length===2,'separate duplicate');
  assert(list().some(e=>e.querySelector('[data-source=neis]'))&&list().some(e=>e.querySelector('[data-source=weekly]')),'badges');
  document.querySelector('#calendar [data-date="'+today+'"]').click();
  assert(document.querySelector('#dayEditor').open&&rows().length===4,'calendar shows external rows');
  assert(rows().filter(x=>x.textContent.includes('중복 일정')).length===2,'modal distinguishes duplicate');
  document.querySelector('#dayText').value='내 일정 예시';document.querySelector('#saveDay').click();
  list().find(e=>e.textContent.includes('중복 일정')&&e.querySelector('[data-source=neis]')).click();
  assert(document.querySelector('#dayEditor').open,'event click opens editor');
  rows().find(e=>e.textContent.includes('중복 일정')&&e.querySelector('[data-source=neis]')).querySelector('button').click();
  assert(list().filter(e=>e.textContent.includes('중복 일정')).length===1,'only selected source hidden');
  assert(allEvents().filter(r=>r.name==='중복 일정').length===2,'raw data unchanged');
  assert(rows().some(e=>e.classList.contains('tt-event-hidden')&&e.textContent.includes('복원')),'recoverable');
  assert(document.querySelector('#dayText').value==='내 일정 예시','manual text retained');
  document.querySelector('#closeDay').click();
  const id=ttEventId(allEvents().find(r=>r.source==='나이스'&&r.name==='중복 일정'));
  const prev=ttEventScope;ttEventScope={...prev,cls:'2'};
  assert(!ttEventIsHidden(allEvents().find(r=>r.source==='나이스'&&r.name==='중복 일정')),'class scope');
  ttEventScope=prev;assert(ttHiddenEventIds.has(id),'stored id');
  return 'badges, calendar, row click, local hide, source preservation, manual event, class scope';
 });
 console.log('PASS:',result);
 await boot();
 await page.evaluate(()=>{
  const assert=(v,m)=>{if(!v)throw Error(m)},now=new Date(),today=key(now.getFullYear(),now.getMonth(),now.getDate());
  assert(ttVisibleEvents().filter(r=>r.name==='중복 일정').length===1,'persisted reload');
  document.querySelector('#calendar [data-date="'+today+'"]').click();
  document.querySelector('#dayExisting .tt-event-hidden button').click();
  assert(ttVisibleEvents().filter(r=>r.name==='중복 일정').length===2,'restore');
  document.querySelector('#closeDay').click();
  [...document.querySelectorAll('#events .event-item')].find(e=>e.textContent.includes('연속 일정')).click();
  document.querySelector('#dayExisting .tt-day-group button').click();
  assert(!ttVisibleEvents().some(r=>r.name==='연속 일정'),'group hide both days');
  assert(allEvents().filter(r=>r.name==='연속 일정').length===2,'group raw preservation');
 });
 console.log('PASS: reload, restore, grouped date range');
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
