// Real Chromium/Chrome decode of the generated H.264/AAC fixture, via the
// separate Windows media server. No YouTube or external network is involved.
const assert=require('node:assert/strict');
const http=require('node:http');
const {chromium}=require('playwright');
const [port,token]=process.argv.slice(2);
assert.ok(/^\d+$/.test(port)&&/^[a-f0-9]{32}$/.test(token));
const source='http://127.0.0.1:'+port+'/'+token+'/video.mp4';
let pings=0;
const server=http.createServer((req,res)=>{
 if(req.url==='/ping'){pings++;res.end('ok');return}
 if(req.url!=='/'){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'strict-origin-when-cross-origin'});
 res.end('<!doctype html><video id="video" controls muted playsinline preload="auto" src="'+source+'"></video>');
});
(async()=>{
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17439,'127.0.0.1',resolve)});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  const requests=[];
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   return u.hostname==='127.0.0.1'&&['17439',port].includes(u.port)?route.continue():route.abort();
  });
  page.on('response',r=>{if(r.url()===source)requests.push(r.status())});
  await page.goto('http://127.0.0.1:17439/');
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v.readyState>=2||v.error},{},{timeout:12000});
  const metadata=await page.evaluate(()=>{const v=document.querySelector('video');return {error:v.error?.message||'',width:v.videoWidth,height:v.videoHeight,duration:v.duration}});
  assert.equal(metadata.error,'');assert.equal(metadata.width,640);assert.equal(metadata.height,360);assert.ok(metadata.duration>=0.9);
  await page.evaluate(()=>document.querySelector('video').play());
  await page.waitForFunction(()=>document.querySelector('video').currentTime>0.08,{},{timeout:5000});
  assert.equal(await page.evaluate(async()=>await (await fetch('/ping')).text()),'ok');
  await page.evaluate(async()=>{const v=document.querySelector('video');v.pause();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('seek timeout')),5000);v.addEventListener('seeked',()=>{clearTimeout(timeout);resolve()},{once:true});v.currentTime=0.5})});
  assert.ok(Math.abs(await page.evaluate(()=>document.querySelector('video').currentTime)-0.5)<0.15);
  await page.evaluate(()=>document.querySelector('video').play());
  await page.waitForFunction(()=>document.querySelector('video').ended,{},{timeout:5000});
  assert.ok(requests.some(s=>s===200||s===206));assert.equal(pings,1);
  console.log('PASS real Chrome H264/AAC metadata, playback, seek, end and independent board response');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
