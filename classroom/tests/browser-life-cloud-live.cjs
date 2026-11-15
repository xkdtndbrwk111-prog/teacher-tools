// STEP 10 live integration check. Uses only synthetic data and TEST Firebase custom tokens.
const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const path=require('path');

const repo=path.resolve(__dirname,'../..'),port=4188,base=`http://127.0.0.1:${port}`;
const teacherA=process.env.TT_TEACHER_A_CUSTOM_TOKEN,teacherB=process.env.TT_TEACHER_B_CUSTOM_TOKEN;
if(!teacherA||!teacherB)throw Error('Synthetic teacher custom tokens are required');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const results=[];
async function step(name,fn){try{await fn();results.push([name,'PASS']);console.log('PASS',name)}catch(error){results.push([name,'FAIL']);console.error('FAIL',name,'\n ',error.stack||error.message);throw error}}
const started=page=>page.waitForFunction(()=>typeof classState!=='undefined'&&document.getElementById('tt-life-tab'));
async function setRoster(page,names){await page.locator('#studentInput').fill(names.join('\n'));await page.click('#applyStudents');if(await page.locator('#rosterChangeDialog:not(.hidden)').count())await page.click('#rosterChangeApply');await page.waitForTimeout(150)}
async function signIn(page,token,email){await page.evaluate(async value=>{const module=await import('/classroom/host/life-cloud.mjs');await module.createLifeCloudClient().connectWithCustomToken(value)},token);await page.locator('#life-cloud-state').filter({hasText:email}).waitFor({timeout:20000})}
async function prepareTeacher(browser,{token,email,names}){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await page.goto(`${base}/seating/`);await started(page);await setRoster(page,names);await page.click('#tt-life-tab');await page.click('[data-life-page="surveys"]');await signIn(page,token,email);
 await page.click('#life-register');await page.locator('#life-status').filter({hasText:'학생 명단을 온라인에 연결했습니다'}).waitFor({timeout:20000});
 const scope=await page.evaluate(()=>({classId:window.__TT_STAGE031_CLASS.activeId,year:Number(document.getElementById('life-year').value),students:classState.students.map(student=>({id:String(student.id),name:student.name}))}));
 assert.equal(scope.students.length,2);assert.equal(errors.length,0,errors.join('\n'));
 return{context,page,scope};
}
async function codeFor(page,studentId){await page.selectOption('#life-reissue-student',studentId);await page.click('#life-code-show');const text=await page.locator('#life-codes').textContent(),match=text.match(/개인 코드\s+(\S+)/);assert.ok(match,`code not shown: ${text}`);return match[1]}

(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(port)],{stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',data=>process.stdout.write(`[local] ${data}`));server.stderr.on('data',data=>process.stderr.write(`[local-error] ${data}`));
 let browser,a,b,studentPage;
 try{
  await wait(700);browser=await chromium.launch({channel:'chrome',headless:true});
  await step('교실매니저 학급 선택과 Firebase 교사 A 연결',async()=>{a=await prepareTeacher(browser,{token:teacherA,email:'tt.virtual.teacher.a@gmail.com',names:['STEP10 가상학생 A1','STEP10 가상학생 A2']})});
  let studentCode,studentUrl;
  await step('현재 명단 ID를 유지한 온라인 코드와 설문 링크 생성',async()=>{studentCode=await codeFor(a.page,a.scope.students[0].id);studentUrl=await a.page.locator('#life-student-link').getAttribute('href');const url=new URL(studentUrl);assert.equal(url.searchParams.get('class'),a.scope.classId);assert.equal(url.searchParams.get('year'),String(a.scope.year));assert.equal(url.searchParams.get('month'),'5');assert.ok(url.searchParams.get('owner'));assert.ok(!studentUrl.includes(studentCode));await a.page.click('#life-open');await a.page.locator('#life-status').filter({hasText:'5월 설문을 개설했습니다'}).waitFor({timeout:20000})});
  await step('학생 링크에서 8문항 제출',async()=>{studentPage=await a.context.newPage();await studentPage.goto(studentUrl);assert.equal(await studentPage.locator('[name="classId"]').inputValue(),a.scope.classId);await studentPage.fill('[name="id"]',a.scope.students[0].id);await studentPage.fill('[name="code"]',studentCode);await studentPage.click('#login button');await studentPage.locator('#form fieldset').first().waitFor({timeout:20000});for(const number of [1,2,6,7])await studentPage.locator(`input[name="${number}"]`).first().check();await studentPage.fill('textarea[name="3"]','STEP10 온라인 고유 응답');await studentPage.fill('textarea[name="8"]','STEP10 온라인 후속 응답');for(const number of [4,5]){await studentPage.selectOption(`select[name="peer-${number}-0"]`,a.scope.students[1].id);const value=await studentPage.locator(`select[name="behavior-${number}-0"] option`).nth(1).getAttribute('value');await studentPage.selectOption(`select[name="behavior-${number}-0"]`,value)}await studentPage.click('#form button[type="submit"]');await studentPage.getByRole('button',{name:'확인하고 제출'}).click();await studentPage.getByText('제출을 완료했어요').waitFor({timeout:20000})});
  await step('담당 교사 조회와 기존 분석 화면 반영',async()=>{await a.page.click('#life-refresh');await a.page.locator('#life-status').filter({hasText:'5월 제출 1명'}).waitFor({timeout:20000});await a.page.locator('#life-roster-status button',{hasText:'STEP10 가상학생 A1 · 제출'}).click();const response=await a.page.locator('#life-responses').textContent();assert.match(response,/STEP10 온라인 고유 응답/);assert.doesNotMatch(response,/studentId|\{"/);await a.page.click('[data-life-page="analysis"]');await a.page.click('#life-analysis-load');await a.page.locator('#life-analysis-output').filter({hasText:'5월 · 제출 1/2명'}).waitFor({timeout:20000})});
  await step('중복 제출 화면 차단',async()=>{await studentPage.reload();await studentPage.fill('[name="id"]',a.scope.students[0].id);await studentPage.fill('[name="code"]',studentCode);await studentPage.click('#login button');await studentPage.locator('#status').filter({hasText:'이미 제출했습니다'}).waitFor({timeout:20000});assert.equal(await studentPage.locator('#form fieldset').count(),0)});
  await step('교사 B 연결과 다른 교사 학급 접근 차단',async()=>{b=await prepareTeacher(browser,{token:teacherB,email:'tt.virtual.teacher.b@gmail.com',names:['STEP10 가상학생 B1','STEP10 가상학생 B2']});const blocked=await b.page.evaluate(async ({classId,year})=>{const module=await import('/classroom/host/life-cloud.mjs'),client=module.createLifeCloudClient();try{await client.request(`/api/v2/teacher/status?year=${year}&classId=${encodeURIComponent(classId)}&month=5`);return{status:200}}catch(error){return{status:error.status,message:error.message}}},{classId:a.scope.classId,year:a.scope.year});assert.equal(blocked.status,403);assert.match(blocked.message,/다른 교사/)});
  await step('학급·학생 혼선 방지와 온라인 기능 단독 비활성화',async()=>{await b.page.click('#life-refresh');await b.page.locator('#life-status').filter({hasText:'5월 제출 0명'}).waitFor({timeout:20000});const labels=await b.page.locator('#life-roster-status button').allTextContents();assert.ok(labels.every(label=>label.includes('STEP10 가상학생 B')));await b.page.click('#life-cloud-disable');await b.page.locator('#life-online-mode').filter({hasText:'클라우드 꺼짐'}).waitFor();assert.equal(await b.page.locator('#life-refresh').isDisabled(),true);await b.page.locator('.prototype-mode-switch button',{hasText:'학급 자리배치'}).click();assert.equal(await b.page.locator('#applyStudents').isVisible(),true)});
 }finally{await studentPage?.close().catch(()=>{});await a?.context.close().catch(()=>{});await b?.context.close().catch(()=>{});await browser?.close().catch(()=>{});server.kill('SIGTERM')}
 console.log(JSON.stringify({results},null,2));if(results.some(([,status])=>status!=='PASS'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1});
