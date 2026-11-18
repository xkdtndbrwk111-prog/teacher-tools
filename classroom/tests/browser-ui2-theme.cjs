const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..'),port=18140,origin='http://127.0.0.1:'+port;
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(port)],{stdio:'ignore'});let browser;
 try{
  await new Promise(r=>setTimeout(r,600));browser=await chromium.launch({channel:'chrome',headless:true});
  const p=await browser.newPage({viewport:{width:1400,height:900}});
  await p.goto(origin+'/seating/');await p.waitForFunction(()=>window.__TT_MANAGER_HOME?.page()==='home'&&!document.documentElement.classList.contains('tt-manager-starting'));
  await p.evaluate(()=>window.__TT_SETTINGS.open('general'));
  await p.locator('#tt-ui2-theme-select').selectOption('green');await p.locator('#tt-ui2-theme-apply').click();await p.locator('#tt-settings-close').click();
  assert.equal(await p.locator('#tt-manager-home').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(233, 243, 236)');
  await p.locator('#tt-grade-tab').click();
  const frame=p.frameLocator('.tt-grade-iframe');await frame.locator('html[data-cm-theme="green"]').waitFor({state:'attached'});
  const custom={version:1,theme:'custom',font:'맑은 고딕',custom:{bg:'#283945',panel:'#445566',text:'#ffffff',accent:'#80b0a0',modal:'#223344'}};
  assert.equal(await p.evaluate(v=>window.__TT_MANAGER_THEME.set(v),custom),true);
  await frame.locator('html[data-cm-theme="custom"]').waitFor({state:'attached'});
  assert.equal(await frame.locator('html').evaluate(el=>el.style.getPropertyValue('--cm-panel')),'#445566');
  await p.reload();await p.waitForFunction(()=>window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting'));
  assert.equal(await p.locator('html').getAttribute('data-cm-theme'),'custom');
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.get().custom.modal),'#223344');
  console.log('PASS exact preset, custom theme, grade iframe, browser persistence');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
