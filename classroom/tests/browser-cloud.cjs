// EASY/NORMAL against an in-memory stand-in for Google. Nothing here reaches a real Google account.
// node classroom/tests/browser-cloud.cjs   (NODE_PATH may point to an existing Playwright installation)
const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const path=require('path');
const repo=path.resolve(__dirname,'../..');
const PORT=4197,BASE=`http://127.0.0.1:${PORT}`,CLIENT='123456-faketestclient.apps.googleusercontent.com';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
async function step(name,fn){
 try{await fn();results.push(true);console.log('PASS',name)}
 catch(e){results.push(false);console.log('FAIL',name,'\n ',String(e.message).slice(0,700))}
}
// ---- Fake Google ----
const google={files:new Map(),nextId:1,failNext:0,writes:0,reads:0,tokenSeconds:3599};
const USER={sub:'fake-sub',email:'teacher@example.com',email_verified:true};
function fakeResponse(route,status,body){return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})}
const GIS=`window.google={accounts:{oauth2:{initTokenClient(cfg){return{requestAccessToken(){window.__gisCalls=(window.__gisCalls||0)+1;setTimeout(()=>cfg.callback({access_token:'faketoken'+Date.now(),expires_in:window.__tokenSeconds||3599,scope:'openid email profile https://www.googleapis.com/auth/drive.file'}),10)}}}}}};`;
async function googleRoute(route){
 const req=route.request(),url=new URL(req.url()),method=req.method();
 if(url.host==='accounts.google.com')return route.fulfill({status:200,contentType:'text/javascript',body:GIS});
 if(url.host==='openidconnect.googleapis.com')return fakeResponse(route,200,USER);
 const auth=req.headers().authorization||'';
 if(auth==='Bearer expired')return fakeResponse(route,401,{error:'invalid_token'});
 if(google.failNext>0){google.failNext--;return fakeResponse(route,429,{error:'rate'})}
 if(url.host==='www.googleapis.com'){
  const id=url.pathname.split('/').pop();
  if(id==='files')return fakeResponse(route,200,{files:[...google.files.values()].map(f=>({id:f.id,name:f.name,mimeType:'application/vnd.google-apps.spreadsheet',trashed:false,ownedByMe:true,owners:[{emailAddress:USER.email}],createdTime:f.created}))});
  const f=google.files.get(id);
  return f?fakeResponse(route,200,{id:f.id,name:f.name,mimeType:'application/vnd.google-apps.spreadsheet',trashed:false,ownedByMe:true,owners:[{emailAddress:USER.email}]}):fakeResponse(route,404,{});
 }
 if(url.host==='sheets.googleapis.com'){
  const m=/spreadsheets(?:\/([^/:]+))?(?::batchUpdate|\/values:batchGet)?$/.exec(url.pathname);
  if(method==='POST'&&!url.pathname.includes(':batchUpdate')){
   const body=req.postDataJSON();const id='fakefile'+String(google.nextId++).padStart(6,'0');
   const tabs=new Map(body.sheets.map((s,i)=>[s.properties.title,{id:i+1,rows:s.properties.gridProperties.rowCount,values:[]}]));
   google.files.set(id,{id,name:body.properties.title,tabs,created:new Date().toISOString()});
   return fakeResponse(route,200,{spreadsheetId:id});
  }
  const file=google.files.get(decodeURIComponent(m[1]));
  if(!file)return fakeResponse(route,404,{});
  if(url.pathname.endsWith('/values:batchGet')){
   google.reads++;
   return fakeResponse(route,200,{valueRanges:url.searchParams.getAll('ranges').map(r=>{const t=/^'([^']+)'/.exec(r)[1];const v=file.tabs.get(t).values;return{range:r,values:v}})});
  }
  if(url.pathname.endsWith(':batchUpdate')){
   google.writes++;
   const byId=new Map([...file.tabs.values()].map(t=>[t.id,t]));
   const next=new Map([...byId].map(([k,t])=>[k,{...t,values:t.values.map(r=>[...r])}]));
   for(const r of req.postDataJSON().requests){
    if(r.updateSheetProperties){next.get(r.updateSheetProperties.properties.sheetId).rows=r.updateSheetProperties.properties.gridProperties.rowCount;continue}
    const u=r.updateCells,t=next.get(u.range.sheetId);
    if(u.range.endRowIndex>t.rows)return fakeResponse(route,400,{error:'beyond grid'});
    for(const row of u.rows)for(const cell of row.values){const s=cell.userEnteredValue?.stringValue;if(typeof s==='string'&&s.length>50000)return fakeResponse(route,400,{error:'cell too long'})}
    t.values=u.rows.map(row=>row.values.map(c=>c.userEnteredValue.numberValue??c.userEnteredValue.stringValue));
   }
   for(const [k,t] of next){byId.get(k).values=t.values;byId.get(k).rows=t.rows}
   return fakeResponse(route,200,{});
  }
  return fakeResponse(route,200,{sheets:[...file.tabs].map(([title,t])=>({properties:{sheetId:t.id,title,gridProperties:{rowCount:t.rows}}}))});
 }
 return route.abort();
}
const started=p=>p.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-cloud-chip')?.textContent);
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(PORT)],{stdio:'ignore'});
 await wait(500);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 const newPC=async({withClient=true,clock=false}={})=>{
  const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
  ctx.externals=[];
  ctx.on('request',r=>{const u=r.url();if(!u.startsWith(BASE)&&!/^(data|blob):/.test(u))ctx.externals.push(u)});
  await ctx.route(u=>!String(u).startsWith(BASE)&&!/^(data|blob):/.test(String(u)),googleRoute);
  await ctx.route('**/classroom/grades/google-config.mjs',r=>r.fulfill({contentType:'text/javascript',body:`export const GOOGLE_CLIENT_ID='${withClient?CLIENT:''}';`}));
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  if(clock)await p.clock.install();
  await p.goto(BASE+'/seating/');await started(p);
  return{ctx,p};
 };
 const chip=p=>p.locator('#tt-cloud-chip');
 const chipIs=(p,re)=>p.waitForFunction(s=>new RegExp(s).test(document.getElementById('tt-cloud-chip').textContent),re.source,{timeout:15000});
 const setRoster=async(p,names)=>{
  await p.evaluate(v=>{const t=document.getElementById('studentInput');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('applyStudents').click()},names.join('\n'));
  await wait(150);
  if(await p.locator('#rosterChangeDialog:not(.hidden)').count())await p.click('#rosterChangeApply');
  await wait(150);
 };
 const connect=async p=>{
  await chip(p).click();
  await p.check('input[name="tt-cloud-mode"][value="normal"]');
  await p.locator('#tt-cloud-connect:not([hidden])').waitFor();
  await p.waitForFunction(()=>window.google?.accounts?.oauth2);
  await p.click('#tt-cloud-connect');
 };
 const closeSettings=async p=>{if(await p.locator('#tt-cloud-close').isVisible())await p.click('#tt-cloud-close')};
 const names=p=>p.evaluate(()=>classState.students.map(s=>s.name));
 const fileValues=(tab)=>[...google.files.values()][0].tabs.get(tab).values;
 try{
  await step('EASY: 처음에는 구글에 연결하지 않고 Google 값이 없으면 NORMAL을 고를 수 없다',async()=>{
   const {ctx,p}=await newPC({withClient:false});
   assert.match(await chip(p).textContent(),/EASY/);
   await chip(p).click();
   assert.equal(await p.locator('input[value="normal"]').isDisabled(),true);
   if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/mode.png'});
   assert.match(await p.locator('#tt-cloud-note').textContent(),/Google 연결값/);
   assert.deepEqual(ctx.externals,[]);
   await ctx.close();
  });
  let pc1;
  await step('NORMAL: 연결하면 전체 자료가 시트에 저장되고 칸 제한을 넘지 않는다',async()=>{
   pc1=await newPC();const {p}=pc1;
   await setRoster(p,['가온','나래','다온']);
   await p.evaluate(()=>{for(let i=0;i<1500;i++)classState.history.push({round:i+1,note:'가'.repeat(60),assignments:[],studentsSnapshot:[],layoutSnapshot:null});classState.history=[];const c=window.__TT_STAGE031_CLASS;const pe=JSON.parse(window.__TT_STORE.getItem(c.peKey)||'{}');pe[classState.students[0].id]={traits:{leadership:4,intelligence:3,stamina:2,charm:1,initiative:4},fixedTeam:0};window.__TT_STORE.setItem(c.peKey,JSON.stringify(pe));persistStateOnly()});
   await connect(p);
   await chipIs(p,/구글 \d/);
   await closeSettings(p);
   assert.equal(google.files.size,1);
   assert.match([...google.files.values()][0].name,/^교실 매니저 \d{4}학년도$/);
   const data=fileValues('TT_DATA').slice(1).map(r=>r[1]).join('');
   const saved=JSON.parse(data);
   assert.deepEqual(saved.classes[0].seating.students.map(s=>s.name),['가온','나래','다온']);
   assert.equal(Object.values(saved.classes[0].pe).find(x=>x?.traits)?.traits.leadership,4);
  });
  await step('브라우저 저장은 바로, 구글 저장은 마지막 변경 5분 뒤에 된다',async()=>{
   google.files.clear();
   const {ctx,p}=await newPC({clock:true});
   await connect(p);await chipIs(p,/구글 \d/);await closeSettings(p);
   const before=google.writes;
   await p.evaluate(()=>{classState.className='5분시험반';persistStateOnly()});
   await chipIs(p,/저장 대기/);
   assert.equal(await p.evaluate(()=>JSON.parse(window.__TT_STORE.getItem(window.__TT_STAGE031_CLASS.seatingKey)).className),'5분시험반');
   await p.clock.fastForward('04:30');await wait(300);
   assert.equal(google.writes,before,'4분 30초에는 아직 저장하지 않음');
   await p.clock.fastForward('00:50');
   await chipIs(p,/구글 \d/);
   assert.equal(google.writes,before+1);
   await p.clock.fastForward('10:00');await wait(300);
   assert.equal(google.writes,before+1,'바뀐 것이 없으면 다시 저장하지 않음');
   await p.evaluate(()=>{classState.className='계속입력반';persistStateOnly()});
   for(let i=0;i<5;i++){await p.clock.fastForward('04:30');await p.evaluate(n=>{classState.className='계속입력반'+n;persistStateOnly()},i);await wait(50)}
   await chipIs(p,/구글 \d/);
   assert.equal(google.writes,before+2,'계속 입력해도 20분을 넘기지 않음');
   await ctx.close();
   google.files.clear();
  });
  await step('중요한 작업(배치 확정)은 곧바로 저장한다',async()=>{
   google.files.clear();
   const {ctx,p}=await newPC({clock:true});
   await connect(p);await chipIs(p,/구글 \d/);await closeSettings(p);
   const before=google.writes;
   await p.click('#generateAssignment');await p.clock.fastForward(200);
   if(await p.locator('#seatCountProceed:not(.hidden)').count())await p.click('#seatCountProceed');
   await p.clock.fastForward(200);await p.click('#confirmAssignment');
   await p.clock.fastForward('00:20');
   await chipIs(p,/구글 \d/);
   assert.ok(google.writes>before);
   await ctx.close();
   google.files.clear();
  });
  await step('새 PC는 구글 자료를 불러오고 지난 학년도 성적도 함께 받는다',async()=>{
   google.files.clear();
   const a=await newPC();
   await setRoster(a.p,['이전PC학생']);
   const year=await a.p.evaluate(async()=>(await import('/classroom/grades/model.mjs')).schoolYear());
   // A past-year file made by this app, as it would exist from last year.
   await a.p.evaluate(async y=>{
    const {fresh,addAssessment,setGrade}=await import('/classroom/grades/model.mjs');
    const {projectRoster}=await import('/classroom/grades/roster-projection.mjs');
    const c=window.__TT_STAGE031_CLASS;
    const w=projectRoster(fresh(y-1),{installId:c.installId,sourceInstanceId:c.installId+'-'+c.activeId,className:'작년반',students:[{id:'old-1',name:'작년학생',gender:'none'}]}).workspace;
    const t=addAssessment(w,{title:'작년평가',subject:'수학',criterion:'점수',maxScore:100,classIds:[w.classes[0].id]});
    setGrade(w,t.id,w.memberships[0].id,'66');
    await window.__TT_STORE.commit({put:new Map([[`TT_STAGE03_${c.installId}_${y-1}`,w]]),quiet:true});
   },year);
   await connect(a.p);await chipIs(a.p,/구글 \d/);await closeSettings(a.p);
   // Copy last year's grades into their own file through the app's own writer.
   await a.p.evaluate(async y=>{
    const {ClassroomCloud}=await import('/classroom/host/cloud-store.mjs');
    const cloud=new ClassroomCloud('123456-faketestclient.apps.googleusercontent.com');cloud.restoreSession();
    const c=window.__TT_STAGE031_CLASS;
    const w=await window.__TT_STORE.read(`TT_STAGE03_${c.installId}_${y-1}`);
    const id=await cloud.createFile(y-1);
    const reg=JSON.parse(window.__TT_STORE.getItem(c.registryKey));
    await cloud.write(id,{format:'tt.seating-host.multiclass-backup',version:1,sourceInstallId:c.installId,registry:{activeId:reg.activeId,classes:reg.classes},classes:reg.classes.map(k=>({id:k.id,name:k.name,seating:JSON.parse(window.__TT_STORE.getItem(c.seatingKey)),pe:{}})),gradeYears:[{year:y-1,workspace:w}]},{year:y-1,workspace:w,baseRevision:null,device:'이전PC',counts:{classes:1,students:1,grades:1}});
   },year);
   await a.ctx.close();
   const b=await newPC();
   await connect(b.p);
   await b.p.locator('#tt-diff-pull').waitFor({state:'visible',timeout:15000});
   assert.match(await b.p.locator('#tt-diff-text').textContent(),/불러올까요/);
   assert.match(await b.p.locator('#tt-diff-remote').textContent(),/학생 1명/);
   const nav=b.p.waitForNavigation();await b.p.click('#tt-diff-pull');await nav;await started(b.p);
   assert.deepEqual(await names(b.p),['이전PC학생']);
   await chipIs(b.p,/구글 \d/);
   const past=await b.p.evaluate(async y=>{const c=window.__TT_STAGE031_CLASS,w=await window.__TT_STORE.read(`TT_STAGE03_${c.installId}_${y-1}`);return w?.gradeValues?.[0]?.value},year);
   assert.equal(past,66);
   const installDiffers=await b.p.evaluate(async y=>{const c=window.__TT_STAGE031_CLASS,w=await window.__TT_STORE.read(`TT_STAGE03_${c.installId}_${y-1}`);return w.stage03Bridge.installId===c.installId},year);
   assert.equal(installDiffers,true,'다른 PC 자료도 이 설치에 맞게 연결');
   await closeSettings(b.p);
   pc1=b;
  });
  await step('다른 PC에서만 바뀌면 알리고, 불러오면 되돌릴 수 있다',async()=>{
   const {p}=pc1;
   // Another PC with the same account saves through the same file.
   const other=await newPC();
   await connect(other.p);
   await other.p.locator('#tt-diff-pull').waitFor({state:'visible',timeout:15000});
   let nav=other.p.waitForNavigation();await other.p.click('#tt-diff-pull');await nav;await started(other.p);
   await chipIs(other.p,/구글 \d/);await closeSettings(other.p);
   await setRoster(other.p,['다른PC변경']);
   await other.p.click('#tt-cloud-chip');await other.p.click('#tt-cloud-save');await chipIs(other.p,/구글 \d/);await closeSettings(other.p);
   await other.ctx.close();
   await wait(100);
   await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
   const before=await names(p);
   // The head check runs at most once a minute.
   await p.evaluate(()=>{});
   await p.click('#tt-cloud-chip');await p.click('#tt-cloud-save');
   await p.locator('#tt-diff-pull').waitFor({state:'visible',timeout:15000});
   assert.match(await p.locator('#tt-diff-text').textContent(),/다른 PC/);
   assert.match(await p.locator('#tt-diff-classes').textContent(),/내용이 다른 반/);
   assert.deepEqual(await names(p),before,'고르기 전에는 바뀌지 않음');
   nav=p.waitForNavigation();await p.click('#tt-diff-pull');await nav;await started(p);
   assert.deepEqual(await names(p),['다른PC변경']);
   await chipIs(p,/구글 \d/);await closeSettings(p);
   await p.click('#tt-full-backup');
   await p.locator('#tt-backup-undo-box:not([hidden])').waitFor();
   await p.click('#tt-backup-close');
  });
  await step('양쪽 다 바뀌면 저장을 멈추고 묻고, 이 브라우저를 고르면 구글 자료는 되돌리기로 남는다',async()=>{
   const {p}=pc1;
   const fileId=[...google.files.values()].find(f=>f.tabs.get('TT_SYNC').values.length)?.id;
   const other=await newPC();
   await connect(other.p);
   await other.p.locator('#tt-diff-pull').waitFor({state:'visible',timeout:15000});
   const nav=other.p.waitForNavigation();await other.p.click('#tt-diff-pull');await nav;await started(other.p);
   await chipIs(other.p,/구글 \d/);await closeSettings(other.p);
   await setRoster(other.p,['구글쪽변경']);
   await other.p.click('#tt-cloud-chip');await other.p.click('#tt-cloud-save');await chipIs(other.p,/구글 \d/);await closeSettings(other.p);
   await other.ctx.close();
   await setRoster(p,['브라우저쪽변경']);
   const writes=google.writes;
   await p.click('#tt-cloud-chip');await p.click('#tt-cloud-save');
   await p.locator('#tt-diff-push').waitFor({state:'visible',timeout:15000});
   assert.match(await p.locator('#tt-diff-text').textContent(),/각각 바뀌었습니다/);
   if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/diff.png'});
   assert.equal(google.writes,writes,'고르기 전에는 시트를 덮어쓰지 않음');
   await p.click('#tt-diff-later');
   assert.match(await chip(p).textContent(),/자료 차이/);
   await p.click('#tt-cloud-chip');
   await p.locator('#tt-diff-push').waitFor({state:'visible'});
   await p.click('#tt-diff-push');
   await chipIs(p,/구글 \d/);
   const saved=JSON.parse(fileValues('TT_DATA').slice(1).map(r=>r[1]).join(''));
   assert.equal(saved.classes[0].seating.students[0].name,'브라우저쪽변경');
   const point=await p.evaluate(async()=>{const c=window.__TT_STAGE031_CLASS;return(await window.__TT_STORE.read('TT_RESTORE_POINT_'+c.installId)).payload.classes[0].seating.students[0].name});
   assert.equal(point,'구글쪽변경');
   assert.ok(fileId);
  });
  await step('학생 화면이 열려 있으면 자료 차이 창을 띄우지 않는다',async()=>{
   const {p}=pc1;
   const other=await newPC();
   await connect(other.p);
   await other.p.locator('#tt-diff-pull').waitFor({state:'visible',timeout:15000});
   const nav=other.p.waitForNavigation();await other.p.click('#tt-diff-pull');await nav;await started(other.p);
   await chipIs(other.p,/구글 \d/);await closeSettings(other.p);
   await setRoster(other.p,['칠판중변경']);
   await other.p.click('#tt-cloud-chip');await other.p.click('#tt-cloud-save');await chipIs(other.p,/구글 \d/);
   await other.ctx.close();
   await p.click('#generateAssignment');await wait(100);
   if(await p.locator('#seatCountProceed:not(.hidden)').count())await p.click('#seatCountProceed');
   await wait(100);await p.click('#confirmAssignment');await wait(100);await p.click('#openPlayback');
   await wait(4000);
   await p.evaluate(()=>{});
   await p.waitForFunction(()=>/자료 차이/.test(document.getElementById('tt-cloud-chip').textContent),{},{timeout:20000}).catch(()=>{});
   assert.equal(await p.locator('#tt-diff-text').isVisible(),false);
   await p.click('#backToTeacher');await wait(200);
  });
  await step('구글 오류면 브라우저 저장은 계속되고 다시 시도한다',async()=>{
   google.files.clear();
   const {ctx,p}=await newPC({clock:true});
   await connect(p);await chipIs(p,/구글 \d/);await closeSettings(p);
   google.failNext=4;
   await p.evaluate(()=>{classState.className='오류중입력';persistStateOnly()});
   await p.clock.fastForward('05:20');
   await chipIs(p,/멈춤/);
   assert.equal(await p.evaluate(()=>JSON.parse(window.__TT_STORE.getItem(window.__TT_STAGE031_CLASS.seatingKey)).className),'오류중입력');
   google.failNext=0;
   await p.clock.fastForward('02:20');
   await chipIs(p,/구글 \d/);
   const saved=JSON.parse(fileValues('TT_DATA').slice(1).map(r=>r[1]).join(''));
   assert.equal(saved.classes[0].seating.className,'오류중입력');
   await ctx.close();
  });
  await step('로그인이 끝나면 알리고, 다시 연결하면 밀린 자료를 저장한다. 반을 바꿔도 로그인이 유지된다',async()=>{
   google.files.clear();
   const {ctx,p}=await newPC({clock:true});
   await connect(p);await chipIs(p,/구글 \d/);await closeSettings(p);
   await p.click('#tt-class-add');await p.fill('#tt-class-names','둘째반');
   let nav=p.waitForNavigation();await p.click('#tt-class-create');await nav;await started(p);
   await chipIs(p,/구글 \d/);
   const calls=await p.evaluate(()=>window.__gisCalls||0);
   assert.equal(calls,0,'다시 열어도 로그인을 묻지 않음');
   await p.evaluate(()=>{classState.className='우리 반 수정';persistStateOnly()});
   await p.evaluate(()=>{const raw=JSON.parse(sessionStorage.getItem('tt.classroom.google.session'));raw.token='expired';sessionStorage.setItem('tt.classroom.google.session',JSON.stringify(raw))});
   await p.reload();await started(p);
   await chipIs(p,/연결 필요/);
   assert.equal(await p.evaluate(()=>JSON.parse(window.__TT_STORE.getItem(window.__TT_STAGE031_CLASS.seatingKey)).className),'우리 반 수정');
   await chip(p).click();
   await chipIs(p,/구글 \d/);
   const saved=JSON.parse(fileValues('TT_DATA').slice(1).map(r=>r[1]).join(''));
   assert.ok(saved.classes.some(c=>c.seating.className==='우리 반 수정'));
   await ctx.close();
  });
  await step('EASY로 돌아가면 구글 연결을 끊고 브라우저 자료와 시트는 남는다',async()=>{
   google.files.clear();
   const {ctx,p}=await newPC();
   await setRoster(p,['남는학생']);
   await connect(p);await chipIs(p,/구글 \d/);
   await p.check('input[name="tt-cloud-mode"][value="easy"]');await wait(200);
   await closeSettings(p);
   assert.match(await chip(p).textContent(),/EASY/);
   assert.deepEqual(await names(p),['남는학생']);
   assert.equal(google.files.size,1);
   assert.equal(await p.evaluate(()=>sessionStorage.getItem('tt.classroom.google.session')),null);
   await p.reload();await started(p);
   assert.match(await chip(p).textContent(),/EASY/);
   await ctx.close();
  });
  await step('삭제한 반은 30일이 지나면 자동으로 지워지고 그 전에는 남는다',async()=>{
   const {ctx,p}=await newPC({withClient:false});
   const ids=await p.evaluate(async()=>{
    const c=window.__TT_STAGE031_CLASS,day=86400000,mk=d=>({classId:'x'+d,name:d+'일전',deletedAt:new Date(Date.now()-d*day).toISOString(),year:2026,seating:null,pe:null,grade:null,studentCount:0});
    await window.__TT_STORE.commit({put:new Map([[`TT_DELETED_${c.installId}_new`,mk(29)],[`TT_DELETED_${c.installId}_old`,mk(31)]])});
    return c.installId;
   });
   await p.reload();await started(p);await wait(300);
   const left=await p.evaluate(async i=>(await window.__TT_STORE.list(`TT_DELETED_${i}_`)).map(r=>r.value.name),ids);
   assert.deepEqual(left,['29일전']);
   await p.click('#tt-class-add');
   await p.locator('.tt-class-recovery-row').waitFor();
   assert.match(await p.locator('.tt-class-recovery-row').textContent(),/1일 뒤 자동 삭제/);
   await ctx.close();
  });
  await step('페이지 오류가 없다',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();server.kill()}
 const failed=results.filter(r=>!r).length;
 console.log(`\n${results.length-failed} PASS / ${failed} FAIL`);
 process.exit(failed?1:0);
})();
