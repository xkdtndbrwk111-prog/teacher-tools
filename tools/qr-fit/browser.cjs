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
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:17439/')?r.continue():r.abort());
 await page.addInitScript(()=>{
  if(localStorage.getItem('class-qr-widgets'))return;
  localStorage.setItem('class-grid-density','2');
  localStorage.setItem('class-grid-model','square48-v1');
  localStorage.setItem('class-qr-widgets',JSON.stringify([{id:'qr-fit',title:'패들렛',url:'https://example.org/qr-fit'}]));
  localStorage.setItem('class-layout',JSON.stringify({items:{'qr-fit':{x:0,y:0,w:22,h:18,off:false,z:999}}}));
 });
 await page.goto('http://127.0.0.1:17439/',{waitUntil:'domcontentloaded'});
 const plate=page.locator('[data-widget="qr-fit"] .tt-qr-plate');
 await plate.waitFor({state:'visible'});
 // The 300px-ish timetable header must fit the shortened title, sheet link and alert master on one line.
 await page.evaluate(()=>{
  const card=widgetCard('week');layout.items.week.w=9;layout.items.week.h=20;layoutApply();window.weekViewApply?.();
  const links=card.querySelector('.tt-week-links');links.hidden=false;document.getElementById('ttWeekSheet').hidden=false;
 });
 await page.waitForFunction(()=>document.getElementById('weekTitle').textContent.includes('시간표'));
 const header=await page.evaluate(()=>{
  const title=document.getElementById('weekTitle'),sheet=document.getElementById('ttWeekSheet'),toggle=document.querySelector('.tt-week-alert-switch'),row=title.parentElement;
  const a=title.getBoundingClientRect(),b=sheet.getBoundingClientRect(),c=toggle.getBoundingClientRect(),d=row.getBoundingClientRect();
  return {title:title.textContent,row:getComputedStyle(row).flexWrap,centerDelta:Math.max(Math.abs((a.top+a.bottom-b.top-b.bottom)/2),Math.abs((a.top+a.bottom-c.top-c.bottom)/2)),right:c.right,bound:d.right};
 });
 assert.equal(header.title,'📚 시간표');assert.equal(header.row,'nowrap');assert.ok(header.centerDelta<4&&header.right<=header.bound+1,JSON.stringify(header));
 const measure=()=>page.evaluate(()=>{
  const card=widgetCard('qr-fit'),plate=card.querySelector('.tt-qr-plate'),cv=plate.querySelector('canvas'),label=plate.querySelector('strong'),r=layout.items['qr-fit'];
  const p=plate.getBoundingClientRect(),c=cv.getBoundingClientRect(),l=label.getBoundingClientRect(),ctx=cv.getContext('2d'),m=window.TTQR('https://example.org/qr-fit').length,unit=cv.width/(m+8);
  const pix=ctx.getImageData(0,0,cv.width,cv.height).data;
  let white=true;for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++)if(x<4*unit||y<4*unit||x>=cv.width-4*unit||y>=cv.height-4*unit){const i=(y*cv.width+x)*4;if(pix[i]!==255||pix[i+1]!==255||pix[i+2]!==255)white=false}
  return {w:r.w,h:r.h,plate:p.width,plateH:p.height,code:c.width,codeH:c.height,inside:l.top>=c.bottom-.5&&l.bottom<=p.bottom+.5&&l.left>=p.left-.5&&l.right<=p.right+.5,unit,modules:m,white,title:label.textContent,band:l.height,canvasActual:cv.width};
 });
 await page.waitForFunction(()=>document.querySelector('[data-widget="qr-fit"] .tt-qr-extra-canvas')?.width>300);
 let big=await measure();assert.equal(big.w,18);assert.equal(big.h,18);assert.ok(big.code>300&&big.inside&&big.white);assert.equal(big.title,'패들렛');assert.ok(Math.abs(big.plate-big.plateH)<1&&Math.abs(big.code-big.codeH)<1);assert.equal(big.unit,Math.floor(big.unit));assert.ok(Math.abs(big.code-big.canvasActual)<1);assert.ok(big.code+big.band+big.modules+8>big.plate);
 await page.evaluate(()=>{layout.items['qr-fit'].w=9;layout.items['qr-fit'].h=9;layoutApply()});
 await page.waitForFunction(n=>document.querySelector('[data-widget="qr-fit"] canvas').width<n,big.canvasActual);
 const small=await measure();assert.ok(small.code<big.code&&small.inside&&small.white);assert.equal(small.w,small.h);
 await page.evaluate(()=>{layoutEnter()});
 const handle=page.locator('[data-widget="qr-fit"] .w-h[data-dx="1"][data-dy="1"]');const box=await handle.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+box.height/2+10,{steps:7});await page.mouse.up();
 const edited=await page.evaluate(()=>({...layout.items['qr-fit']}));assert.equal(edited.w,edited.h);assert.ok(edited.w>9);
 await page.evaluate(()=>document.getElementById('layoutDone').click());
 await page.reload({waitUntil:'domcontentloaded'});await plate.waitFor({state:'visible'});
 const persisted=await page.evaluate(()=>layout.items['qr-fit']);assert.equal(persisted.w,edited.w);assert.equal(persisted.h,edited.h);
 console.log('PASS QR grows, integer modules, four-module quiet zone, label inside plate, equal grid spans, actual asymmetric drag, reload');
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
