const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve('runtime-src/system');
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1:17438');if(u.pathname.startsWith('/api/')||u.pathname==='/health'){res.setHeader('Content-Type','application/json');return res.end('{}')}
const f=path.resolve(root,'.'+(u.pathname==='/'?'/dashboard.html':u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end()}
res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>server.listen(17438,'127.0.0.1',r));let browser;try{
browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});
await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:17438/')?r.continue():r.abort());
await page.goto('http://127.0.0.1:17438/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>!!window.ttWidgetShadow&&!!window.ttWeatherIcons&&!!window.ttSkyLook?.light);
const result=await page.evaluate(async()=>{
const b=document.body,api=window.ttWeatherIcons,assert=(ok,name)=>{if(!ok)throw Error(name)},results=[];
const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const sample=document.createElement('div');sample.className='grid';sample.innerHTML='<div class="card" id="testPlain">plain</div><div class="card" data-widget="checklist-test"><div class="tt-check-track"><i></i></div><p class="tt-check-title">check</p></div><div class="card podo-card"><div class="podo-overview"><b class="podo-overview-tiny-title">title</b><b class="podo-overview-tiny">0/30</b><b class="podo-overview-count">0/30</b></div></div><div class="card photo-card" data-photo-frame="pola"><div class="photo-frame"></div></div>';
b.append(sample);
const base=sample.querySelector('#testPlain'),check=sample.querySelector('[data-widget]'),podo=sample.querySelector('.podo-card'),track=check.querySelector('.tt-check-track'),ink=el=>getComputedStyle(el).color;
for(const t of ['dark','sky','pink','green','black']){b.dataset.theme=t;for(const glass of [false,true]){
b.classList.toggle('tt-scene-glass',glass);await wait();
for(const el of [check,podo]){assert(getComputedStyle(el).backgroundColor===getComputedStyle(base).backgroundColor,'card background '+t+' '+glass);assert(ink(el)===ink(base),'card ink '+t+' '+glass)}
assert(getComputedStyle(track).backgroundColor==='rgba(0, 0, 0, 0)','track transparent');assert(ink(podo.querySelector('.podo-overview'))===ink(base),'podo ink');results.push('theme '+t+' '+glass);
}}
for(const f of ['serif','monospace']){document.documentElement.style.setProperty('--tt-font',f);await wait();for(const e of podo.querySelectorAll('b'))assert(getComputedStyle(e).fontFamily===f,'podo font '+f);
assert(getComputedStyle(sample.querySelector('.photo-frame'),'::after').fontFamily===f,'photo font '+f);
results.push('font '+f)}
const shadow=window.ttWidgetShadow,lit=(az,alt)=>({sun:{az,alt},weather:'clear',illum:1});
assert(shadow(lit(90,20)).x>0&&shadow(lit(270,20)).x<0,'opposite directions');
assert(shadow(lit(180,80)).y<shadow(lit(180,10)).y,'high sun shorter');
const cloudy=shadow({...lit(90,20),weather:'cloudy'}),rain=shadow({...lit(90,20),weather:'rain'}),storm=shadow({...lit(90,20),weather:'thunder'});
assert(!cloudy.x&&!rain.x&&!storm.x&&storm.alpha<rain.alpha&&rain.alpha<cloudy.alpha,'diffuse storm');
assert(shadow({sun:{alt:-10},moon:{alt:40,az:270},illum:.8,weather:'clear'}).x<0,'moon direction');assert(shadow({weather:'unknown'}).x===0,'unknown diffuse');
assert(Math.abs(shadow({...lit(90,20),weather:'partly'}).x)<Math.abs(shadow(lit(90,20)).x),'partial cloud softens direction');
results.push('natural shadow');
const cv=document.createElement('canvas');cv.width=cv.height=34;const ctx=cv.getContext('2d');
for(const name of ['drizzle','light_rain','heavy_rain','light_snow','heavy_snow','sleet','thunderstorm','thunder_rain','clear_day']){
 const o=api.prep(name);for(let j=0;j<100&&!o.ready;j++)await new Promise(r=>setTimeout(r,20));assert(o.ready,'image ready '+name);
 const frames=new Set(),tops=new Set();
 if(name==='heavy_rain')assert(o.band===20&&o.speed===2,'heavy rain explicit motion band');
 if(name==='drizzle')assert(o.band===24&&o.speed===.5,'drizzle slow whole streaks');
 for(let f=0;f<24;f++){cv.dataset.ic=name;api.draw(cv,f);const arr=ctx.getImageData(0,0,34,34).data;frames.add(Array.from(arr).join(','));tops.add(Array.from(arr.slice(0,34*4*18)).join(','))}
 if(name==='clear_day')assert(frames.size===1,'static sun');
 else{assert(frames.size>2,'motion '+name+' '+frames.size);if(!name.startsWith('thunder'))assert(tops.size===1,'stationary cloud '+name)}
 results.push(name+': '+frames.size+' distinct frames, band='+o.band)
}
sample.remove();return results;
});
console.log('PASS:',result.join('\n'));
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
