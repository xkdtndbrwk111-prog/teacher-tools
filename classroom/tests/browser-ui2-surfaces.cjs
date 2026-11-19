const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..'),port=18143,origin='http://127.0.0.1:'+port;
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(port)],{stdio:'ignore'});let browser;
 try{
  await new Promise(r=>setTimeout(r,600));browser=await chromium.launch({channel:'chrome',headless:true});
  const p=await browser.newPage({viewport:{width:1600,height:1000}});await p.route('http://127.0.0.1:17439/**',r=>r.abort());
  await p.goto(origin+'/seating/');await p.waitForFunction(()=>window.__TT_MANAGER_ICONS&&!document.documentElement.classList.contains('tt-manager-starting'));
  await p.locator('[data-tt-ui2-open="seat"]').click();
  const rgb=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
  for(const theme of ['dark','sky','pink','green','black']){
   const result=await p.evaluate(theme=>{window.__TT_MANAGER_THEME.set({version:1,theme,font:''});const t=window.TTHojaTheme.tokens(window.__TT_MANAGER_THEME.get());return{panel:t['--cm-panel'],work:t['--cm-work-bg'],text:t['--cm-panel-ink'],accent:t['--cm-accent'],action:t['--cm-action-fill'],control:t['--cm-control'],panelEmphasis:t['--cm-panel-emphasis']}},theme);
   assert.equal(await p.locator('#teacherScreen .tool-dock').evaluate(e=>getComputedStyle(e).backgroundColor),rgb(result.panel));
   assert.equal(await p.locator('#teacherScreen .workspace').evaluate(e=>getComputedStyle(e).backgroundColor),rgb(result.work));
   assert.equal(await p.locator('#teacherScreen .student-strip').evaluate(e=>getComputedStyle(e).color),rgb(result.text));
   const roster=await p.locator('#teacherScreen .student-strip .student-cards').evaluate(e=>getComputedStyle(e).scrollbarColor);
   assert.equal(roster,theme==='pink'?rgb(result.action)+' '+rgb(result.control):rgb(result.panelEmphasis)+' '+rgb(result.panel));
   if(theme==='pink'){
    const expected=rgb(result.action)+' '+rgb(result.control);
    assert.equal(await p.locator('html').evaluate(e=>getComputedStyle(e).scrollbarColor),expected);
    assert.equal(await p.locator('#teacherScreen .tool-dock').evaluate(e=>getComputedStyle(e).scrollbarColor),expected);
    assert.notEqual(rgb(result.action),'rgb(0, 0, 0)');
   }
  }
  await p.locator('#modePE').click();assert.equal(await p.locator('#modePE svg').count(),1);
  await p.locator('#tt-seat-subtab').click();
  await p.locator('#tt-grade-tab').click();
  const frame=p.frameLocator('.tt-grade-iframe');await frame.locator('html[data-cm-theme="black"]').waitFor({state:'attached'});
  assert.equal(await frame.locator('[data-page="grades"] svg').count(),1);
  const bg=await frame.locator('#content-workspace').evaluate(e=>getComputedStyle(e).backgroundColor);assert.equal(bg,rgb(await p.evaluate(()=>window.TTHojaTheme.tokens(window.__TT_MANAGER_THEME.get())['--cm-work-bg'])));
  await p.evaluate(()=>window.__TT_MANAGER_THEME.set({version:1,theme:'pink',font:''}));
  await frame.locator('html[data-cm-theme="pink"]').waitFor({state:'attached'});
  const expected=await p.evaluate(()=>{const t=window.TTHojaTheme.tokens(window.__TT_MANAGER_THEME.get());return [t['--cm-action-fill'],t['--cm-control']]});
  assert.equal(await frame.locator('#content-workspace').evaluate(e=>getComputedStyle(e).scrollbarColor),expected.map(rgb).join(' '));
  await p.evaluate(()=>window.__TT_MANAGER_THEME.set({version:1,theme:'black',font:''}));
  await frame.locator('html[data-cm-theme="black"]').waitFor({state:'attached'});
  await p.locator('#tt-manager-home-button').click();await p.waitForFunction(()=>window.__TT_MANAGER_HOME.page()==='home');
  await p.evaluate(()=>window.__TT_SETTINGS.open('general'));assert.equal(await p.locator('[data-tt-section="general"] svg').count(),1);
  const h=await p.locator('#tt-settings-overlay .tt-settings-heading h2').evaluate(e=>getComputedStyle(e).color);
  assert.equal(h,rgb(await p.evaluate(()=>window.TTHojaTheme.tokens(window.__TT_MANAGER_THEME.get())['--cm-surface-ink'])));
  console.log('PASS themed seating, PE navigation, five palettes, grade workspace and settings icons');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
