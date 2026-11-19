const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..'),port=18141,origin='http://127.0.0.1:'+port;
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(port)],{stdio:'ignore'});let browser;
 try{
  await new Promise(r=>setTimeout(r,600));browser=await chromium.launch({channel:'chrome',headless:true});
  const p=await browser.newPage({viewport:{width:1400,height:900}});
  const custom={version:1,theme:'custom',font:'맑은 고딕',custom:{bg:'#283945',panel:'#445566',text:'#ffffff',accent:'#80b0a0',modal:'#223344'}};
  let response=custom,online=true,reads=0;
  await p.route('http://127.0.0.1:17439/api/theme',async r=>{reads++;if(!online)return r.abort();await r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify(response)})});
  await p.goto(origin+'/seating/');await p.waitForFunction(()=>window.__TT_MANAGER_THEME?.get().theme==='custom'&&!document.documentElement.classList.contains('tt-manager-starting'));
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.get().custom.modal),'#223344');
  response={version:1,theme:'pink',font:''};
  await p.waitForFunction(()=>window.__TT_MANAGER_THEME.get().theme==='pink',{},{timeout:10000});
  online=false;await p.evaluate(()=>window.__TT_MANAGER_THEME.checkBoard());await p.reload();await p.waitForFunction(()=>window.__TT_MANAGER_HOME);
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.get().theme),'pink');
  online=true;response={version:1,theme:'green',font:''};await p.evaluate(()=>window.__TT_MANAGER_THEME.setAutomatic(false));
  await p.evaluate(()=>window.__TT_MANAGER_THEME.checkBoard());assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.get().theme),'pink');
  await p.evaluate(()=>window.__TT_MANAGER_THEME.setAutomatic(true));await p.waitForFunction(()=>window.__TT_MANAGER_THEME.get().theme==='green');
  response={version:1,theme:'custom',font:'bad; CSS',custom:custom.custom};await p.evaluate(()=>window.__TT_MANAGER_THEME.checkBoard());
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.get().theme),'green');assert.ok(reads>=3);
  // Set a real PIN, then deliberately delay a different board theme on reload.
  await p.evaluate(()=>document.getElementById('tt-lock-now').click());
  await p.fill('#tt-lock-new','4826');await p.fill('#tt-lock-new2','4826');await p.click('#tt-lock-save');
  await p.locator('#tt-lock-code-box:not([hidden])').waitFor();await p.click('#tt-lock-cancel');
  response={version:1,theme:'pink',font:''};
  await p.unroute('http://127.0.0.1:17439/api/theme');
  await p.route('http://127.0.0.1:17439/api/theme',async r=>{await new Promise(resolve=>setTimeout(resolve,1200));await r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify(response)})});
  await p.addInitScript(()=>{
   window.__lockPaints=[];let last='';
   function frame(){const n=document.querySelector('.tt-lock-card'),cover=n?.parentElement;if(n&&cover&&!cover.hidden&&getComputedStyle(n).visibility==='visible'){const k=document.documentElement.dataset.cmTheme;if(k!==last){window.__lockPaints.push(k);last=k}}requestAnimationFrame(frame)}requestAnimationFrame(frame);
  });
  await p.reload();await p.locator('.tt-lock-card').waitFor({state:'visible'});
  assert.equal(await p.locator('html').getAttribute('data-cm-theme'),'pink');
  await p.waitForFunction(()=>window.__lockPaints.length>0);
  assert.deepEqual(await p.evaluate(()=>window.__lockPaints),['pink']);
  assert.equal(await p.locator('#teacherScreen').evaluate(el=>el.inert),true);
  const pos=await p.locator('.tt-lock-card').evaluate(el=>{const r=el.getBoundingClientRect();return [r.x+r.width/2-innerWidth/2,r.y+r.height/2-innerHeight/2]});
  assert.ok(pos.every(n=>Math.abs(n)<2),JSON.stringify(pos));
  await p.fill('#tt-lock-pin','4826');await p.locator('.tt-lock-keys button[type=submit]').click();
  await p.locator('.tt-lock').waitFor({state:'hidden'});
  console.log('PASS local board theme contract, auto refresh, offline cache, opt-out, invalid payload, first lock paint and center');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
