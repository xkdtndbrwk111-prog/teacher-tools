// Real Chrome regression: Hanja roster is read-only and uses the same IDs/order as Classroom Manager.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const PORT=4296,BASE='http://127.0.0.1:'+PORT;
const rosterKey='tt.classroom.active-roster';
const dataKey='teacher-tools.hanja.data.v1';
const participationKey='teacher-tools.hanja.participation.v1';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(PORT)],{stdio:'ignore'});
 let browser,ctx;
 const errors=[];
 const pass=name=>console.log('PASS '+name);
 try{
  await wait(700);
  browser=await chromium.launch({channel:'chrome',headless:true});
  ctx=await browser.newContext({viewport:{width:1366,height:900}});
  await ctx.route('**/*',route=>{
   const url=route.request().url();
   return url.startsWith(BASE)||url.startsWith('data:')||url.startsWith('blob:')?route.continue():route.abort();
  });
  const page=await ctx.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(BASE+'/hanja/');
  await page.locator('#studentCards .hanja-roster-empty').waitFor();
  assert.equal(await page.locator('#start').isDisabled(),true);
  pass('No students: clear empty roster, without fabricating students');
  const roster={
   className:'6학년 1반',
   students:[
    {id:'student-A',name:'가온',gender:'female',visual:{character:'girl',hair:'brown',outfit:'green',glasses:'none'}},
    {id:'student-B',name:'나래',gender:'male',visual:{character:'boy1',hair:'black',outfit:'blue',glasses:'none'}}
   ]
  };
  const original=JSON.stringify(roster);
  await page.evaluate(([key,raw])=>localStorage.setItem(key,raw),[rosterKey,original]);
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('#studentCards .hanja-student').length===2);
  assert.deepEqual(await page.locator('#studentCards .shared-student-number').allTextContents(),['1','2']);
  assert.deepEqual(await page.locator('#studentCards .shared-student-name').allTextContents(),['가온','나래']);
  assert.equal(await page.locator('#studentCards .hanja-student').first().getAttribute('data-student-id'),'student-A');
  assert.equal(await page.locator('#studentCards .hanja-student[draggable]').count(),0);
  assert.equal(await page.locator('#studentCards .seat-unpin').count(),0);
  pass('Shared roster: read-only numbers, IDs, names and visual cards, no seat controls');
  await page.locator('.hanja-student').first().locator('.shared-student-status').click();
  assert.equal(await page.locator('.hanja-student').first().getAttribute('aria-pressed'),'false');
  const keys=await page.evaluate(([r,p])=>({roster:localStorage.getItem(r),participation:JSON.parse(localStorage.getItem(p))}),[rosterKey,participationKey]);
  assert.equal(keys.roster,original,'Hanja must not write Classroom Manager canonical roster');
  assert.deepEqual(keys.participation,['student-A']);
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('.hanja-student').length===2);
  assert.equal(await page.locator('.hanja-student').first().getAttribute('aria-pressed'),'false');
  pass('Per-lesson participation persists separately without mutating shared student data');

  await page.locator('#hanzi').fill('山');
  await page.locator('#meaning').fill('뫼');
  await page.locator('#reading').fill('산');
  await page.locator('#weight').evaluate(el=>{el.value='100';el.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.locator('#entryForm button[type=submit]').click();
  assert.equal(await page.locator('#weight').inputValue(),'100','new registration must inherit last saved weight');
  assert.match(await page.locator('#weightLabel').textContent(),/100/);
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),dataKey);
  assert.equal(stored.lastEntryWeight,100);
  assert.equal(stored.entries.find(e=>e.text==='山').weight,100);
  await page.reload();
  assert.equal(await page.locator('#weight').inputValue(),'100','browser reload should preserve last saved frequency');
  await page.locator('#hanzi').fill('水');
  await page.locator('#meaning').fill('물');
  await page.locator('#reading').fill('수');
  await page.locator('#entryForm button[type=submit]').click();
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),dataKey);
  assert.equal(after.entries.find(e=>e.text==='水').weight,100);
  await page.locator('#weight').evaluate(el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.locator('#newEntry').click();
  assert.equal(await page.locator('#weight').inputValue(),'100','unsaved slider changes must not alter next entry default');
  pass('Frequency 100: next item, browser reload and another save; unsaved changes ignored');

  const second=await ctx.newPage();
  await second.goto(BASE+'/hanja/');
  const reordered=JSON.stringify({className:roster.className,students:[
   {...roster.students[1],name:'나래(수정)'},roster.students[0]
  ]});
  await second.evaluate(([key,raw])=>localStorage.setItem(key,raw),[rosterKey,reordered]);
  await page.waitForFunction(()=>document.querySelector('#studentCards .hanja-student')?.dataset.studentId==='student-B');
  assert.deepEqual(await page.locator('#studentCards .shared-student-number').allTextContents(),['1','2']);
  assert.deepEqual(await page.locator('#studentCards .shared-student-name').allTextContents(),['나래(수정)','가온']);
  assert.equal(await page.locator('.hanja-student[data-student-id="student-A"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),rosterKey),reordered);
  pass('Cross-tab active roster update preserves ID-based Hanja participation and order');

  await page.evaluate(()=>{
   document.querySelector('#studentCards').style.width='150px';
   document.querySelector('#studentScrollTrack').style.width='150px';
   window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>!document.querySelector('#studentScrollTrack').hidden);
  await page.locator('#studentScrollTrack').focus();
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('#studentCards').scrollLeft>0);
  pass('Dedicated visible scrollbar works with keyboard and preserves card row');
  assert.deepEqual(errors,[],'No application page errors');
  await second.close();
 }catch(error){console.error('FAIL Hanja browser regression:',error.stack||error);process.exitCode=1}
 finally{await ctx?.close().catch(()=>{});await browser?.close().catch(()=>{});server.kill()}
})();
