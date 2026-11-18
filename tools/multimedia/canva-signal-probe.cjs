// Research only; no production code or credentials.
const http=require('node:http');
const {chromium}=require('playwright');
const {PNG}=require('pngjs');
const url='https://www.canva.com/design/DAHbOpoUrrg/d0A5Phk1p8VRXhaj5raOWg/view?embed';
const origin='https://www.canva.com';
function crc(p){let c=0;for(const b of [p>>8,p&255]){c^=b;for(let j=0;j<8;j++)c=((c<<1)^((c&128)?7:0))&255}return c}
function marker(buf){
 const {data,width:w,height:h}=PNG.sync.read(buf),found=new Set();
 // The iframe is 16:9. Try its full width and centered letterbox variants.
 for(let span=Math.floor(w*.65);span<=w;span+=Math.max(1,Math.floor(w/200))){
  const x0=(w-span)/2;
  for(let y=Math.floor(h*.85);y<h;y++){
   let bits='';for(let i=0;i<32;i++){const vals=[.35,.5,.65].map(f=>{const k=(y*w+Math.min(w-1,Math.floor(x0+(i+f)*span/32)))*4;return (data[k]*54+data[k+1]*183+data[k+2]*19)/256}).sort((a,b)=>a-b);bits+=vals[1]<65?'0':vals[1]>190?'1':'?'}
   if(!/^[01]{32}$/.test(bits)||!bits.startsWith('10110010')||!bits.endsWith('0101'))continue;
   const p=parseInt(bits.slice(8,20),2);if(p>=1&&p<=5&&crc(p)===parseInt(bits.slice(20,28),2))found.add(p);
  }
 }
 return found.size===1?[...found][0]:null;
}
(async()=>{
 const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.end('<!doctype html><style>html,body{margin:0}iframe{border:0;width:1152px;height:648px}</style><iframe id="book" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; fullscreen"></iframe>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(({url,origin})=>{
   const f=document.querySelector('#book');window.samples=[];window.stage='initial';
   addEventListener('message',e=>{
    if(e.origin!==origin||e.source!==f.contentWindow||window.samples.length>=300)return;
    let d=e.data;if(typeof d==='string'&&d.length<=10000){try{d=JSON.parse(d)}catch{}}
    const nums=[],keys=[];
    function walk(x,p='',depth=0){if(!x||typeof x!=='object'||depth>3)return;for(const [k,v] of Object.entries(x).slice(0,50)){
      if(!/^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(k))continue;
      const key=p?p+'.'+k:k;keys.push(key);
      if(/page|slide|index|position|current/i.test(k)&&Number.isInteger(v)&&v>=0&&v<=4095)nums.push([key,v]);
      if(v&&typeof v==='object')walk(v,key,depth+1);
    }}
    walk(d);window.samples.push({stage:window.stage,kind:typeof d,keys:keys.slice(0,60),nums:nums.slice(0,20)});
   });f.src=url;
  },{url,origin});
  const f=page.locator('#book');const frame=page.frameLocator('#book');
  const snapshots=[];
  const sample=async label=>{await page.waitForTimeout(2200);let p=marker(await f.screenshot({timeout:10000}));snapshots.push({label,page:p});};
  await page.waitForTimeout(10000);await sample('initial');
  const nav=async (direction,label)=>{
    await page.evaluate(l=>window.stage=l,label);
    const re=direction==='next'?/next (page|slide)|다음 (페이지|슬라이드)|^next$/i:/previous (page|slide)|이전 (페이지|슬라이드)|^previous$/i;
    const btn=frame.getByRole('button',{name:re}).first();
    if(await btn.isVisible().catch(()=>false))await btn.click({timeout:4000});
    else {await f.click({position:{x:576,y:324},timeout:4000});await page.keyboard.press(direction==='next'?'ArrowRight':'ArrowLeft')}
    await sample(label);
  };
  await nav('next','next1');await nav('next','next2');await nav('previous','back1');
  const messages=await page.evaluate(()=>window.samples);
  console.log(JSON.stringify({snapshots,messageCount:messages.length,messages},null,2));
  const observed=snapshots.map(x=>x.page);
  if(JSON.stringify(observed)!=='[1,2,3,2]')console.log('INCONCLUSIVE: independent marker sequence not verified. Do not infer an absent page signal.');
  else{
   console.log('LIVE MARKER SEQUENCE VERIFIED: 1,2,3,2.');
   const matches=messages.filter(x=>x.nums.length);
   console.log(matches.length?'CANDIDATE NUMERIC EVENTS: manual correlation and repeat required before production.':'NO NUMERIC PAGE EVENTS in this bounded run; not proof of universal absence.');
  }
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error('RESEARCH ERROR:',e.name);process.exitCode=1});
