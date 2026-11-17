const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve('runtime-src/system');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1:17439');if(u.pathname.startsWith('/api/')||u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{}')}
const f=path.resolve(root,'.'+(u.pathname==='/'?'/dashboard.html':u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(17439,'127.0.0.1',r));let browser;try{
browser=await chromium.launch({headless:true});
for(const [width,height] of [[1920,1080],[1280,720],[1024,768],[2560,1440]]){
 const page=await browser.newPage({viewport:{width,height}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:17439/')?r.continue():r.abort());
 const errors=[];page.on('pageerror',e=>{if(/ttNaturalShadow|wxPrep|wxPaint|ttTextRoles|compute|refresh/.test(e.stack||''))errors.push(e.message)});
 await page.goto('http://127.0.0.1:17439/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ttNaturalShadow&&window.ttSkyLook?.light&&document.querySelector('.podo-card .podo-overview-tiny-title'));
 const report=await page.evaluate(async()=>{
  const b=document.body,wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),cs=x=>getComputedStyle(x);
  const check=(x,msg)=>{if(!x)throw Error(msg)},podo=document.querySelector('.grid>.card.podo-card'),checklist=document.createElement('article'),ordinary=document.createElement('article');
  const grid=document.querySelector('.grid');checklist.className='card';checklist.dataset.widget='checklist-audit';checklist.innerHTML='<div class="tt-check-track"><i></i></div><div class="tt-dash-body"><span class="tt-check-title">테스트</span><span class="tt-check-count">3/6</span></div>';ordinary.className='card';grid.append(checklist,ordinary);
  const font='"Courier New", monospace';document.documentElement.style.setProperty('--tt-font',font);await wait();
  const photo=document.querySelector('.photo-card');check(photo,'photo card');photo.dataset.photoFrame='pola';const fr=photo.querySelector('.photo-frame');fr.dataset.photoCaption='TEST';
  const all=[podo,podo.querySelector('.podo-overview-tiny-title'),podo.querySelector('.podo-overview-tiny'),podo.querySelector('.podo-overview-count'),checklist.querySelector('.tt-check-count')];
  for(const n of all)check(n&&cs(n).fontFamily===cs(b).fontFamily,'font mismatch '+n?.className+' '+cs(n).fontFamily);
  check(getComputedStyle(fr,'::after').fontFamily===cs(b).fontFamily,'polaroid font mismatch');
  for(const theme of ['dark','sky','pink','green','black']){
   b.dataset.theme=theme;
   for(const glass of [false,true]){
    b.classList.toggle('tt-scene-glass',glass);await wait();await wait();
    for(const prop of ['backgroundColor','borderTopColor','color','boxShadow'])check(cs(podo)[prop]===cs(ordinary)[prop],theme+' podo '+prop+': '+cs(podo)[prop]+' vs '+cs(ordinary)[prop]);
    check(cs(checklist.querySelector('.tt-check-track')).backgroundColor==='rgba(0, 0, 0, 0)','checklist track opaque');
    check(cs(checklist).backgroundColor===cs(ordinary).backgroundColor,'checklist bg');
   }
  }
  const fn=window.ttNaturalShadow.compute;
  const sample=(az,alt,weather='clear',moon={az:260,alt:30},illum=.8)=>fn({sun:{az,alt},moon,illum,weather});
  const morning=sample(90,15),noon=sample(180,75),evening=sample(270,15);
  check(morning.x>0&&evening.x<0&&Math.abs(noon.x)<1&&noon.y<morning.y,'shadow sun direction/elevation');
  check(sample(90,15,'rain').x===0&&sample(90,15,'thunder').alpha<sample(90,15,'rain').alpha,'weather diffuse');
  const moon=sample(90,-20);check(moon.source==='moon'&&moon.x<0&&moon.alpha<morning.alpha,'moon shadow');
  check(sample(90,-20,'clear',{az:260,alt:-8}).source==='diffuse','moon below horizon');
  check(fn(null).source==='diffuse','missing light');
  const names=['drizzle_rain','light_rain','heavy_rain','light_snow','normal_snow','heavy_snow','sleet','thunderstorm','thunder_rain','clear_day'];
  await Promise.all(names.map(async name=>{const o=window.ttWeatherIcons.prep(name);for(let i=0;i<120&&!o.ready;i++)await new Promise(r=>setTimeout(r,20));check(o.ready,'icon failed '+name)}));
  const out={};
  for(const name of names){
   const o=window.ttWeatherIcons.prep(name),cv=document.createElement('canvas');cv.width=cv.height=34;cv.dataset.ic=name;
   const g=cv.getContext('2d'),h=[];let top;
   for(let i=0;i<30;i++){
    window.ttWeatherIcons.draw(cv,i);const d=g.getImageData(0,0,34,34).data;
    h.push(Array.from(d).join(','));
    if(o.kind==='rain'||o.kind==='snow'){
     const t=Array.from(g.getImageData(0,0,34,o.band+1).data).join(',');if(top===undefined)top=t;else check(t===top,'cloud shifts '+name)
    }
   }
   const unique=new Set(h).size;check(name==='clear_day'?unique===1:unique>1,name+' static unexpectedly');out[name]={band:o.band,frames:unique}
  }
  checklist.remove();ordinary.remove();return out;
 });
 assert.deepEqual(errors,[]);console.log('PASS',width,height,JSON.stringify(report));await page.close();
}
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
