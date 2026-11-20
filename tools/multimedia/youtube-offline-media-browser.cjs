// Real Chromium/Chrome decode of the generated H.264/AAC fixture, via the
// separate Windows media server. No YouTube or external network is involved.
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs');
const {chromium}=require('playwright');
const [port,token,file]=process.argv.slice(2);
const fixture=fs.readFileSync(file);
assert.ok(/^\d+$/.test(port)&&/^[a-f0-9]{32}$/.test(token));
const source='http://127.0.0.1:'+port+'/'+token+'/video.mp4';
let pings=0;
const server=http.createServer((req,res)=>{
 if(req.url==='/ping'){pings++;res.end('ok');return}
 if(req.url==='/control.mp4'){
  let start=0,end=fixture.length-1;const range=req.headers.range;
  if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match){res.writeHead(416,{'Content-Range':'bytes */'+fixture.length});res.end();return}start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));if(start>end){res.writeHead(416,{'Content-Range':'bytes */'+fixture.length});res.end();return}}
  const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1};if(range)headers['Content-Range']='bytes '+start+'-'+end+'/'+fixture.length;
  res.writeHead(range?206:200,headers);res.end(req.method==='HEAD'?undefined:fixture.subarray(start,end+1));return;
 }
 if(req.url!=='/'){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'strict-origin-when-cross-origin'});
 res.end('<!doctype html><video id="video" controls muted playsinline preload="auto" src="/control.mp4"></video>');
});
(async()=>{
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(17439,'127.0.0.1',resolve)});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  const requests=[],network=[];
  // Do not intercept media requests: Chromium must handle native ranges and cache behavior.
  page.on('request',async r=>{if(r.url()!==source)return;const h=await r.allHeaders();network.push({request:r.method(),range:h.range,referer:h.referer,origin:h.origin,site:h['sec-fetch-site'],mode:h['sec-fetch-mode']})});
  page.on('response',async r=>{if(r.url()!==source)return;requests.push(r.status());const h=await r.allHeaders();network.push({status:r.status(),type:h['content-type'],length:h['content-length'],range:h['content-range'],corp:h['cross-origin-resource-policy']})});
  page.on('requestfailed',r=>{if(r.url()===source)network.push({failure:r.failure()?.errorText})});
  await page.goto('http://127.0.0.1:17439/');
  const read=async()=>{await page.waitForFunction(()=>{const v=document.querySelector('video');return v.readyState>=2||v.error},{},{timeout:12000});return page.evaluate(()=>{const v=document.querySelector('video');return {error:v.error?.message||'',code:v.error?.code||0,width:v.videoWidth,height:v.videoHeight,duration:v.duration,codec:v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')}})};
  const control=await read();
  console.log('Same-origin identical MP4 control',JSON.stringify(control));
  await page.evaluate(src=>{const v=document.querySelector('video');v.crossOrigin='anonymous';v.src=src;v.load()},source);
  let metadata;
  try{metadata=await read()}finally{console.log('Dedicated media HTTP diagnostics',JSON.stringify(network))}
  console.log('Dedicated media metadata',JSON.stringify(metadata));
  assert.equal(control.error,'','same-origin positive codec control failed');
  assert.equal(control.width,640);assert.equal(control.height,360);
  assert.equal(metadata.error,'','dedicated media decode failed');assert.equal(metadata.width,640);assert.equal(metadata.height,360);assert.ok(metadata.duration>=0.9);
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
