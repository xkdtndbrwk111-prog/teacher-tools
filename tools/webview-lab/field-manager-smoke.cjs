// Actual packaged manager, isolated Chrome context, no cloud or operational board.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const manager='http://127.0.0.1:4188',board='http://127.0.0.1:17451';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const ctx=await browser.newContext(),errors=[],operational=[],localErrors=[];
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.origin===manager||u.origin===board)return route.continue();
   if(u.port==='17439')operational.push(u.href);
   return route.abort();
  });
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===manager)localErrors.push(r.status()+' '+new URL(r.url()).pathname)});
  await page.goto(manager+'/seating/');
  await page.waitForFunction(()=>!!window.__TT_BOARD_CONNECTION&&!!window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting')||!!document.querySelector('.tt-start-blocked'),null,{timeout:25000});
  const failure=await page.locator('.tt-start-blocked').count();
  if(failure)throw Error(await page.locator('.tt-start-blocked').innerText()+' missing='+localErrors.join(',')+' errors='+errors.join(','));
  await page.waitForFunction(()=>window.__TT_BOARD_CONNECTION?.rosterReady()&&window.__TT_BOARD_CONNECTION?.presentationReady(),null,{timeout:12000});
  assert.equal(await page.locator('#tt-send-board').count(),1);
  assert.equal(await page.evaluate(()=>typeof window.__TT_SEND_ROSTER),'function');
  assert.deepEqual(operational,[]);
  assert.deepEqual(errors,[]);
  console.log('PASS actual packaged manager bootstrap, roster/presentation capability and no operational origin requests');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
