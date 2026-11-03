// ③ 평가 관리 → 수행평가 불러오기 in a real browser. The 학교알리미 relay is faked: the first relay is down,
// the second answers; the plan file is a small .hwpx built here. Virtual data only.
// node classroom/tests/browser-plan-import.cjs   (NODE_PATH may point to an existing Playwright installation; SHOTS=<folder> saves screenshots)
const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const path=require('path');
const repo=path.resolve(__dirname,'../..');
const PORT=4193,BASE=`http://127.0.0.1:${PORT}`,SHOTS=process.env.SHOTS;
const RELAY_A='https://aolfbqfchzipyevtdhdy.supabase.co/functions/v1/schoolinfo-plan',RELAY_B='https://tgraujarnbaxyvcbabdo.supabase.co/functions/v1/schoolinfo-plan';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
async function step(name,fn){try{await fn();results.push(true);console.log('PASS',name)}catch(e){results.push(false);console.log('FAIL',name,'\n ',String(e.message).slice(0,600))}}
// A stored (uncompressed) zip holding one OWPML section with a plan table like a school's.
function crc32(b){let c,crc=0xffffffff;for(const x of b){c=(crc^x)&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;}
function zip(files){
 const parts=[],central=[];let off=0;
 for(const [name,data] of files){const n=Buffer.from(name),d=Buffer.from(data),crc=crc32(d);
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(d.length,18);lh.writeUInt32LE(d.length,22);lh.writeUInt16LE(n.length,26);
  parts.push(lh,n,d);
  const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt32LE(crc,16);ch.writeUInt32LE(d.length,20);ch.writeUInt32LE(d.length,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(off,42);
  central.push(ch,n);off+=30+n.length+d.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([...parts,cd,end]);
}
function planHwpx(){
 const cell=(c,r,t,rs=1)=>`<hp:tc><hp:subList><hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="${rs}"/></hp:tc>`;
 const head=['시기','성취기준','단원명','평가 영역','평가 요소','평가 방법','성취 수준',''];
 const rows=[[0,head.map((t,c)=>cell(c,0,t)).join('')]];
 const items=[['10월','[6국04-04] 문장 성분을 이해하고 호응 관계가 올바른 문장을 구성한다.','2. 올바른 문장으로 글을 써요','문법','경험한 일을 호응이 맞는 문장으로 쓰기','⇒(서술·논술형 평가)'],
  ['11월','[6국01-06] 토의에 협력적으로 참여하며 서로의 의견을 비교하고 조정한다.','4. 의견을 조정해요','듣기·말하기','다양한 의견을 조정하며 토의하기','⇒(관찰 평가)']];
 items.forEach((it,k)=>{const r0=1+k*3;
  ['상','중','하'].forEach((lv,j)=>rows.push([r0+j,(j===0?it.map((t,c)=>cell(c,r0,t,3)).join(''):'')+cell(6,r0+j,lv)+cell(7,r0+j,`${it[4]} 설명 ${lv}`)]));});
 const xml=`<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p><hp:run><hp:tbl>${rows.map(([,cells])=>`<hp:tr>${cells}</hp:tr>`).join('')}</hp:tbl></hp:run></hp:p></hs:sec>`;
 return zip([['mimetype','application/hwp+zip'],['Contents/section0.xml',xml]]);
}
const hwpx=planHwpx();
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(PORT)],{stdio:'ignore'});
 await wait(500);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[],relayCalls=[];
 async function open(viewport){
  const ctx=await browser.newContext({viewport});
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE});
  await ctx.route(u=>!String(u).startsWith(BASE)&&!/^(data|blob):/.test(String(u))&&!String(u).startsWith(RELAY_A)&&!String(u).startsWith(RELAY_B),r=>r.abort());
  await ctx.route(RELAY_A+'*',r=>{relayCalls.push('A');r.fulfill({status:502,contentType:'application/json',headers:{'Access-Control-Allow-Origin':BASE},body:'{"error":"RELAY_FAILED"}'});});
  await ctx.route(RELAY_B+'*',r=>{relayCalls.push('B');const u=new URL(r.request().url()),a=u.searchParams.get('action'),hdr={'Access-Control-Allow-Origin':BASE,'Access-Control-Expose-Headers':'X-File-Name'};
   if(a==='schools')return r.fulfill({status:503,contentType:'application/json',headers:hdr,body:'{"error":"NO_KEY"}'});
   if(a==='plans')return r.fulfill({status:200,contentType:'application/json',headers:hdr,body:JSON.stringify({school:'시험초등학교',year:'2026',files:[{seq:0,name:'2026학년도 학업성적관리규정.hwp(80 KB)'},{seq:1,name:'2026학년도 5학년 2학기 평가계획.hwpx(10 KB)'},{seq:2,name:'2026학년도 3학년 2학기 평가계획.hwp(90 KB)'}]})});
   if(a==='file')return r.fulfill({status:200,contentType:'application/octet-stream',headers:{...hdr,'X-File-Name':encodeURIComponent('2026학년도 5학년 2학기 평가계획.hwpx')},body:hwpx});
   r.fulfill({status:400,headers:hdr,body:'{}'});});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(BASE+'/seating/');
  await p.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-lock-now'));
  await p.click('#tt-grade-tab');
  await p.waitForFunction(()=>/공통 명단 연결/.test(document.getElementById('tt-stage03-status')?.textContent||''));
  const f=p.frameLocator('.tt-grade-iframe');
  await f.locator('.nav[data-page="assessments"]').click();
  await f.locator('[data-assess-mode="plan"]').click();
  return{ctx,p,f};
 }
 try{
  const {ctx,p,f}=await open({width:1600,height:1000});
  await step('평가 관리에 "수행평가 불러오기"가 새 평가 만들기와 따로 있다',async()=>{
   assert.equal(await f.locator('#plan-import-panel').isVisible(),true);
   assert.equal(await f.locator('#new-assessment-panel').isVisible(),false);
   await f.locator('[data-assess-mode="new"]').click();assert.equal(await f.locator('#new-assessment-panel').isVisible(),true);
   await f.locator('[data-assess-mode="plan"]').click();
  });
  await step('학교 이름으로 찾으면 목록에서 고르고, 목록에 없으면 학교알리미 주소 붙여넣기로 안내한다',async()=>{
   await f.locator('#pi-q').fill('없는학교이름');await f.locator('[data-pi="search"]').click();
   await f.locator('.pi-error').waitFor();assert.match(await f.locator('.pi-error').textContent(),/주소를 붙여 넣어/);
   assert.equal(await f.locator('details.pi-url[open]').count(),1);
   await f.locator('#pi-q').fill('개원초');await f.locator('[data-pi="search"]').click();
   await f.locator('.pi-found button').first().waitFor();
   const names=await f.locator('.pi-found button strong').allTextContents();
   assert.ok(names.includes('서울개원초등학교'),names.join(','));
   await f.locator('.pi-found button',{hasText:'서울개원초등학교'}).click();
   assert.equal(await f.locator('.pi-school strong').textContent(),'서울개원초등학교');
   assert.match(await f.locator('.pi-school small').textContent(),/강남구/);
   await f.locator('[data-pi="files"]').click();
   await f.locator('.pi-file').first().waitFor();
   assert.equal(await f.locator('input[name="pi-file"]:checked').evaluate(e=>e.value),'1','5학년 2학기 파일을 골라 둠');
   assert.ok(relayCalls.includes('A')&&relayCalls.includes('B'),'첫 중계 실패 후 두 번째 중계 사용');
  });
  await step('학교알리미 주소를 붙여 넣어도 학교가 정해진다',async()=>{
   await f.locator('[data-pi="change"]').click();
   await f.locator('#pi-url').evaluate(e=>e.closest('details').open=true);
   await f.locator('#pi-url').fill('https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?HG_CD=B100001234');
   await f.locator('[data-pi="url"]').click();
   await f.locator('.pi-file').first().waitFor();
   assert.equal(await f.locator('.pi-school strong').textContent(),'시험초등학교');
  });
  await step('파일을 받아 읽으면 교과별 평가와 학교 단계(상·중·하) 설명이 미리보기로 나온다',async()=>{
   await f.locator('[data-pi="read"]').click();
   await f.locator('.pi-result').waitFor();
   assert.match(await f.locator('.pi-result-head strong').textContent(),/평가 2개 찾음 · 바로 쓸 수 있는 평가 2개/);
   assert.equal(await f.locator('.pi-item input:checked').count(),2);
   assert.match(await f.locator('.pi-item').first().textContent(),/2\. 올바른 문장으로 글을 써요.*10월.*\[6국04-04\].*상.*설명 상/s);
   if(SHOTS)await p.screenshot({path:path.join(SHOTS,'plan-import-pc.png')});
  });
  await step('선택한 수행평가를 만들면 평가 목록에 학교 단계 이름으로 들어간다',async()=>{
   await f.locator('[data-pi="create"]').click();await wait(200);
   assert.match(await f.locator('#toast').textContent(),/수행평가 2개를 만들었습니다/);
   const tags=await f.locator('#assessment-list .type-tag').allTextContents();
   assert.equal(tags.filter(t=>t==='상·중·하').length,2);
   await f.locator('[data-pi="read"]').click();await f.locator('.pi-result').waitFor();
   assert.equal(await f.locator('.pi-dup').count(),2,'다시 읽으면 이미 있음 표시');
   assert.equal(await f.locator('.pi-item input:checked').count(),0);
  });
  await step('성적 입력: 상·중·하로 입력하고, 칸을 고르면 단계 설명이 옆에 보인다',async()=>{
   await f.locator('.nav[data-page="grades"]').click();
   await f.locator('#grade-subject').selectOption('국어');await wait(200);
   const sel=f.locator('select.grade-input').first();
   assert.deepEqual(await sel.locator('option').allTextContents(),['— 미입력 —','상','중','하']);
   await sel.focus();
   await f.locator('#grade-level-notes:not(.hidden)').waitFor();
   assert.match(await f.locator('#grade-level-notes').textContent(),/상.*설명 상.*중.*하/s);
   await sel.selectOption('상');await wait(150);
   assert.equal(await sel.inputValue(),'상');
   if(SHOTS)await p.screenshot({path:path.join(SHOTS,'plan-grade-pc.png')});
  });
  await step('PDF를 올리면 이유를 알리고, 내 AI 답을 붙여 넣어 평가를 만든다',async()=>{
   await f.locator('.nav[data-page="assessments"]').click();
   await f.locator('#pi-upload').setInputFiles({name:'평가계획.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\n%test')});
   await f.locator('.pi-reason').waitFor();assert.match(await f.locator('.pi-reason').textContent(),/PDF/);
   assert.equal(await f.locator('details.pi-ai[open]').count(),1);
   await f.locator('[data-pi="copy"]').click();await wait(150);
   assert.match(await p.evaluate(()=>navigator.clipboard.readText()),/tt\.plan\.v1/);
   await f.locator('#pi-ai-answer').fill('결과:\n{"format":"tt.plan.v1","items":[{"subject":"수학","period":"11월","code":"[6수03-02]","unit":"3. 합동과 대칭","element":"대칭 도형 그리기","method":["지필 평가"],"levels":[{"name":"◎","note":"정확히"},{"name":"○","note":"대체로"},{"name":"△","note":"도움 받아"}]}]}');
   await f.locator('[data-pi="ai"]').click();
   assert.match(await f.locator('.pi-result-head strong').textContent(),/평가 1개 찾음/);
   await f.locator('[data-pi="create"]').click();await wait(200);
   assert.ok((await f.locator('#assessment-list .type-tag').allTextContents()).includes('◎·○·△'));
  });
  await step('학교알리미에 연결하지 못하면 파일 직접 올리기와 학교 페이지 링크를 안내한다',async()=>{
   await ctx.unroute(RELAY_B+'*');await ctx.route(RELAY_B+'*',r=>r.fulfill({status:502,headers:{'Access-Control-Allow-Origin':BASE},contentType:'application/json',body:'{"error":"RELAY_FAILED"}'}));
   await f.locator('[data-pi="files"]').click();await f.locator('.pi-error').waitFor();
   assert.match(await f.locator('.pi-error').textContent(),/직접 올려/);
   assert.match(await f.locator('.pi-manual a').getAttribute('href'),/HG_CD=B100001234/);
  });
  await ctx.close();
  await step('태블릿: 수행평가 불러오기 화면이 옆으로 넘치지 않는다',async()=>{
   const {ctx,p,f}=await open({width:1024,height:768});
   await f.locator('#pi-url').evaluate(e=>e.closest('details').open=true);
   const over=await f.locator('#plan-import-panel').evaluate(e=>e.scrollWidth>e.clientWidth+1);
   assert.equal(over,false);
   if(SHOTS)await p.screenshot({path:path.join(SHOTS,'plan-import-tablet.png')});
   await ctx.close();
  });
  await step('페이지 오류가 없다',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();server.kill()}
 const failed=results.filter(x=>!x).length;
 console.log(`\n${results.length-failed} PASS / ${failed} FAIL`);process.exit(failed?1:0);
})();
