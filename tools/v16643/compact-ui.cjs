const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve('runtime-src/system');
const school={office:'B10',code:'1234567',name:'가상초등학교',kind:'초등학교',address:'서울특별시 노원구',grade:'6',cls:'1'};
let existing=null;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:17439');
 if(u.pathname.startsWith('/api/')||u.pathname==='/health'){
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'&&u.pathname==='/api/school'){let body='';req.on('data',x=>body+=x);req.on('end',()=>{existing=JSON.parse(Buffer.from(body,'base64').toString('utf8'));res.end('{}')});return}
  return res.end(JSON.stringify(u.pathname==='/api/school'?{school:existing}:u.pathname==='/api/school/search'?{rows:[school],total:1}:{}));
 }
 const f=path.resolve(root,'.'+(u.pathname==='/'?'/dashboard.html':u.pathname));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f));
});
(async()=>{await new Promise(r=>server.listen(17439,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:17439/')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:17439/',{waitUntil:'domcontentloaded'});
 await page.locator('#schoolSetup[open]').waitFor();
 const initial=await page.locator('#schoolSetup .school-card').boundingBox();
 assert(initial.height<380,'initial school card compact '+JSON.stringify(initial));
 await page.locator('#schoolQuery').fill('가상초');
 await page.locator('#schoolSearch').click();
 await page.locator('#schoolResults button').click();
 await page.locator('#schoolCls').fill('1');
 await Promise.all([page.waitForNavigation(),page.locator('#schoolSave').click()]);
 assert.equal(existing.cls,'1');
 await page.waitForFunction(()=>document.getElementById('ttWeatherMetConsent')&&typeof layoutApply==='function');
 for(const viewport of [{width:1920,height:1080},{width:1280,height:720},{width:1024,height:768}]){
  await page.setViewportSize(viewport);
  const result=await page.evaluate(async()=>{
   const check=(x,m)=>{if(!x)throw Error(m)};
   layout.toolsDirection='horizontal';
   Object.assign(layout.items.tools,{x:0,y:20,w:48,h:2,off:false});
   layoutApply();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   check(WIDGETS.tools.min[1]===2,'minimum height');
   check(layout.items.tools.h===2,'two rows retained');
   const card=widgetCard('tools'),sp=card.querySelector('.spk-split>button');
   check(sp&&getComputedStyle(sp).flexDirection==='row','speaker horizontal');
   const label=sp.querySelector(':scope>span:not(.tool-icon)'),icon=sp.querySelector(':scope>svg,:scope>.tool-icon');
   check(label&&icon&&icon.getBoundingClientRect().right<=label.getBoundingClientRect().left+1,'speaker icon left');
   check(card.querySelector('.spk-vol').getBoundingClientRect().height>0,'volume visible');
   const saved=layout.toolsDirection;layout.toolsDirection='vertical';Object.assign(layout.items.tools,{w:3,h:18});layoutApply();
   check(getComputedStyle(sp).flexDirection==='row','vertical speaker row');
   layout.toolsDirection=saved;
   return {height:card.getBoundingClientRect().height};
  });
  console.log('PASS 2-row tools',viewport,result);
 }
 await page.evaluate(()=>{
  const c=document.getElementById('ttWeatherMetConsent'),p=document.getElementById('ttPrivacySection');
  if(!c.closest('[data-pane="weather"]')||p.contains(c)||!p.textContent.includes('날씨 정보 출처 및 외부 통신')||!p.textContent.includes('Open-Meteo'))throw Error('weather consent/source placement');
  let n=0;window.ttRefreshWeather=()=>{n++};c.checked=true;c.dispatchEvent(new Event('change'));if(localStorage.getItem('tt-weather-met-consent-v1')!=='yes'||n!==1)throw Error('consent save');
 });
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.getElementById('ttWeatherMetConsent')?.checked===true);
 await page.evaluate(()=>{const c=document.getElementById('ttWeatherMetConsent');c.checked=false;c.dispatchEvent(new Event('change'));if(localStorage.getItem('tt-weather-met-consent-v1')!==null)throw Error('consent revoke')});
 console.log('PASS: school setup/search/save; two-row tools; speaker; weather placement and persistence');
 // Lunch edit: no storage mutations until Save, retain earlier lessons and manual override.
 await page.evaluate(()=>{
  const check=(v,m)=>{if(!v)throw Error(m)};
  const get=()=>readPeriodEditor();
  const before=JSON.stringify(get().periods.slice(0,4)),old=localStorage.getItem('class-periods');
  const end=document.getElementById('lunchEnd');
  const edit=v=>{end.value=v;end.dispatchEvent(new Event('change'))};
  edit('12:50');
  check(JSON.stringify(get().periods.slice(0,4))===before,'morning unchanged');
  check(JSON.stringify(get().periods.slice(4))===JSON.stringify([['12:50','13:30'],['13:40','14:20'],['14:30','15:10']]),'recomputed afternoon');
  check(localStorage.getItem('class-periods')===old,'preview not saved');
  const draft=JSON.stringify(get().periods);
  edit('00:50');check(JSON.stringify(get().periods)===draft,'AM input must not overwrite');
  edit('22:30');check(JSON.stringify(get().periods)===draft,'midnight overflow must not overwrite');
  edit('12:50');
  document.getElementById('saveLessonPeriods').click();
  check(JSON.parse(localStorage.getItem('class-lunch-settings')).end==='12:50','saved lunch');
  check(JSON.parse(localStorage.getItem('class-periods'))[4][0]==='12:50','saved period');
  edit('12:40');
  document.getElementById('settings').dispatchEvent(new Event('close'));
  check(get().lunch.end==='12:50'&&get().periods[4][0]==='12:50','cancel preview restores saved');
  // Later direct period edits still work without forced regeneration on Save.
  document.querySelector('[data-period-end="4"]').value='13:25';
  document.getElementById('saveLessonPeriods').click();
  check(JSON.parse(localStorage.getItem('class-periods'))[4][1]==='13:25','manual override');
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('[data-period-start="4"]')?.value==='12:50');
 await page.evaluate(()=>{if(document.querySelector('[data-period-end="4"]').value!=='13:25'||document.getElementById('lunchEnd').value!=='12:50')throw Error('saved schedule reload')});
 console.log('PASS: lunch edit, morning unchanged, 40/10, invalid input, save/cancel/manual override/reload');

}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
