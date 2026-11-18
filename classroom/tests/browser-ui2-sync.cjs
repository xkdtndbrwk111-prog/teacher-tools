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
  console.log('PASS local board theme contract, auto refresh, offline cache, opt-out, invalid payload');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
