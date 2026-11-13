import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {parseQuestions} from '../survey/core.mjs';

const enabled=Boolean(process.env.FIRESTORE_EMULATOR_HOST),integration=enabled?test:test.skip;
const host=process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8085';
const project='teacher-tools-local',port=4617,base=`http://127.0.0.1:${port}`;
const questions=parseQuestions(readFileSync(new URL('../survey/v0.2.md',import.meta.url),'utf8'));
let child,codes=new Map(),tokens=new Map();

async function request(path,{teacher,student,method='GET',data}={}){
 const headers={'Content-Type':'application/json'};
 if(teacher)headers.Authorization=`Bearer teacher:${teacher}`;
 if(student)headers.Authorization=`Bearer ${student}`;
 const response=await fetch(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
 let value;try{value=await response.json()}catch{value={}}return [response.status,value];
}
async function ready(){for(let i=0;i<100;i++){try{const response=await fetch(`${base}/healthz`);if(response.ok)return}catch{}await new Promise(resolve=>setTimeout(resolve,100))}throw Error('cloud test server did not start')}
const option=(month,n)=>questions[month][n-1].body.match(/^- (.+)$/m)[1];
const scope=(teacher,index)=>({ownerId:teacher,classId:`${teacher}-class-${String(index).padStart(2,'0')}`,year:2026});
const studentsFor=(teacher)=>Array.from({length:20},(_,index)=>({id:`${teacher}-student-${String(index+1).padStart(2,'0')}`,name:`${teacher} 가상학생 ${String(index+1).padStart(2,'0')}`}));
const answersFor=(student,next)=>({1:option(5,1),2:option(5,2),3:`${student.id} 가상 자기 성찰`,4:[{studentId:next.id,behavior:option(5,4)}],5:[{studentId:next.id,behavior:option(5,5)}],6:option(5,6),7:option(5,7),8:'가상 후속 기록'});

if(enabled)before(async()=>{
 const clear=await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'});assert.ok(clear.ok,'Firestore Emulator가 실행 중이어야 합니다.');
 child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../cloud/',import.meta.url),env:{...process.env,FIRESTORE_EMULATOR_HOST:host,GOOGLE_CLOUD_PROJECT:project,ALLOW_TEST_AUTH:'1',STUDENT_SESSION_SECRET:'step09c-test-student-session-secret-32-bytes',PORT:String(port),LOGIN_LIMIT:'6',LOGIN_WINDOW_MS:'60000',ALLOWED_ORIGINS:'http://127.0.0.1:4173'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',value=>process.stdout.write(`[cloud] ${value}`));child.stderr.on('data',value=>process.stderr.write(`[cloud] ${value}`));await ready();
});
if(enabled)after(()=>child?.kill('SIGTERM'));

integration('10 teachers register 200 isolated students and open one survey',async()=>{
 for(let index=1;index<=10;index++){
  const teacher=`teacher-${String(index).padStart(2,'0')}`,classScope=scope(teacher,index),students=studentsFor(teacher);
  const [status,result]=await request('/api/v2/teacher/register',{teacher,method:'POST',data:{...classScope,ownerId:'spoofed-owner',students}});assert.equal(status,201,JSON.stringify(result));
  for(const row of result.codes)codes.set(row.id,row.code);
  assert.equal((await request('/api/v2/teacher/open',{teacher,method:'POST',data:{...classScope,month:5,open:true}}))[0],200);
 }
 assert.equal(codes.size,200);
});

integration('teacher identity owns class scope and cannot be spoofed',async()=>{
 const classA=scope('teacher-01',1),classB=scope('teacher-02',2),classC=scope('teacher-03',3);
 assert.equal((await request(`/api/v2/teacher/status?year=2026&classId=${classA.classId}&month=5`,{teacher:'teacher-01'}))[0],200);
 assert.equal((await request(`/api/v2/teacher/status?year=2026&classId=${classB.classId}&month=5`,{teacher:'teacher-02'}))[0],200);
 assert.equal((await request(`/api/v2/teacher/status?year=2026&classId=${classC.classId}&month=5`,{teacher:'teacher-03'}))[0],200);
 assert.equal((await request(`/api/v2/teacher/status?year=2026&classId=${classA.classId}&month=5`,{teacher:'teacher-02'}))[0],403);
 assert.equal((await request(`/api/v2/teacher/status?year=2026&classId=${classA.classId}&month=5`,{teacher:'teacher-03'}))[0],403);
 const first=studentsFor('teacher-01')[0];
 assert.equal((await request('/api/v2/login',{method:'POST',data:{ownerId:'teacher-02',classId:classA.classId,year:2026,id:first.id,code:codes.get(first.id)}}))[0],401);
});

integration('roster sync preserves existing codes, updates names and suspends removed students',async()=>{
 const teacher='sync-teacher',classScope=scope(teacher,99),first=[{id:'sync-1',name:'가상 동기화 1'},{id:'sync-2',name:'가상 동기화 2'}];
 const [createdStatus,created]=await request('/api/v2/teacher/sync',{teacher,method:'POST',data:{...classScope,students:first}});assert.equal(createdStatus,200);assert.equal(created.codes.length,2);
 const code1=created.codes.find(row=>row.id==='sync-1').code,second=[{id:'sync-1',name:'가상 개명 1'},{id:'sync-3',name:'가상 동기화 3'}];
 const [syncStatus,synced]=await request('/api/v2/teacher/sync',{teacher,method:'POST',data:{...classScope,students:second}});assert.equal(syncStatus,200);assert.deepEqual(synced.codes.map(row=>row.id),['sync-3']);
 assert.equal((await request('/api/v2/login',{method:'POST',data:{...classScope,id:'sync-1',code:code1}}))[0],200,'기존 학생 코드를 유지');
 assert.equal((await request('/api/v2/login',{method:'POST',data:{...classScope,id:'sync-2',code:created.codes.find(row=>row.id==='sync-2').code}}))[0],401,'빠진 학생은 비활성');
 const [,status]=await request(`/api/v2/teacher/status?year=${classScope.year}&classId=${classScope.classId}&month=5`,{teacher});assert.deepEqual(status.students.map(row=>[row.id,row.name]),[['sync-1','가상 개명 1'],['sync-3','가상 동기화 3']]);
 assert.equal((await request(`/api/v2/teacher/status?year=${classScope.year}&classId=${classScope.classId}&month=5`,{teacher:'other-sync-teacher'}))[0],403);
});

integration('200 students log in and concentrated submissions create exactly 200 response documents',async()=>{
 await request('/__test/metrics/reset',{method:'POST'});
 for(let index=1;index<=10;index++){
  const teacher=`teacher-${String(index).padStart(2,'0')}`,classScope=scope(teacher,index),students=studentsFor(teacher);
  for(const student of students){const [status,result]=await request('/api/v2/login',{method:'POST',data:{...classScope,id:student.id,code:codes.get(student.id)}});assert.equal(status,200,JSON.stringify(result));tokens.set(student.id,result.token)}
 }
 const jobs=[];
 for(let index=1;index<=10;index++){
  const teacher=`teacher-${String(index).padStart(2,'0')}`,students=studentsFor(teacher);
  for(let position=0;position<students.length;position++){const student=students[position],next=students[(position+1)%students.length];jobs.push(request('/api/v2/student/submit',{student:tokens.get(student.id),method:'POST',data:{month:5,submissionId:`submit-${student.id}`,answers:answersFor(student,next)}}))}
 }
 const outcomes=await Promise.all(jobs);assert.deepEqual(new Set(outcomes.map(([status])=>status)),new Set([201]));
 const first=studentsFor('teacher-01')[0],next=studentsFor('teacher-01')[1],retry=await request('/api/v2/student/submit',{student:tokens.get(first.id),method:'POST',data:{month:5,submissionId:`submit-${first.id}`,answers:answersFor(first,next)}});assert.equal(retry[0],201);assert.equal(retry[1].idempotent,true);
 const conflict=await request('/api/v2/student/submit',{student:tokens.get(first.id),method:'POST',data:{month:5,submissionId:'conflicting-request',answers:{...answersFor(first,next),3:'서로 다른 가상 응답'}}});assert.equal(conflict[0],409);
 const malformed=await request('/api/v2/student/submit',{student:tokens.get(first.id),method:'POST',data:{month:5,submissionId:'invalid-peer-request',answers:{4:[{studentId:first.id,behavior:option(5,4)}]}}});assert.equal(malformed[0],400);assert.match(malformed[1].error,/친구 선택/);
 const [,metrics]=await request('/__test/metrics');assert.equal(metrics.responseWrites,200);assert.equal(metrics.authWrites,0);assert.equal(metrics.writes,200);
 let total=0,maxBytes=0;for(let index=1;index<=10;index++){const teacher=`teacher-${String(index).padStart(2,'0')}`,classScope=scope(teacher,index),[status,result]=await request(`/api/v2/teacher/status?year=2026&classId=${classScope.classId}&month=5`,{teacher});assert.equal(status,200);assert.equal(result.responses.length,20);total+=result.responses.length;for(const row of result.responses)maxBytes=Math.max(maxBytes,Buffer.byteLength(JSON.stringify(row)))}assert.equal(total,200);
 const [,stored]=await request('/__test/document-measure?ownerId=teacher-01&classId=teacher-01-class-01&year=2026&month=5&studentId=teacher-01-student-01');assert.ok(stored.fieldNames.includes('answers'));
 console.log(JSON.stringify({measurement:{students:200,responseWrites:metrics.responseWrites,logicalReads:metrics.reads,totalWrites:metrics.writes,maxResponsePayloadBytes:maxBytes,storedDocumentJsonBytes:stored.jsonBytes}}));
 await request('/__test/metrics/reset',{method:'POST'});const dashboardScope=scope('teacher-01',1);assert.equal((await request(`/api/v2/teacher/status?year=2026&classId=${dashboardScope.classId}&month=5`,{teacher:'teacher-01'}))[0],200);const [,dashboardMetrics]=await request('/__test/metrics');assert.equal(dashboardMetrics.reads,42);assert.equal(dashboardMetrics.writes,0);console.log(JSON.stringify({dashboardMeasurement:{classSize:20,logicalReads:dashboardMetrics.reads,writes:dashboardMetrics.writes}}));
});

integration('observations persist in teacher scope and support update and delete',async()=>{
 const teacher='teacher-01',classScope=scope(teacher,1),student=studentsFor(teacher)[0];
 const [createdStatus,created]=await request('/api/v2/teacher/observations',{teacher,method:'POST',data:{...classScope,studentId:student.id,date:'2026-05-01',category:'협력',fact:'가상 관찰',followup:'가상 후속'}});assert.equal(createdStatus,201);
 assert.equal((await request('/api/v2/teacher/observations',{teacher,method:'POST',data:{...classScope,studentId:student.id,id:created.id,date:'2026-05-02',category:'배려',fact:'수정 가상 관찰',followup:''}}))[0],200);
 const [readStatus,read]=await request(`/api/v2/teacher/observations?year=2026&classId=${classScope.classId}&studentId=${student.id}`,{teacher});assert.equal(readStatus,200);assert.equal(read.records[0].fact,'수정 가상 관찰');
 assert.equal((await request('/api/v2/teacher/observations/delete',{teacher,method:'POST',data:{...classScope,studentId:student.id,id:created.id}}))[0],200);
 assert.equal((await request(`/api/v2/teacher/observations?year=2026&classId=${classScope.classId}&studentId=${student.id}`,{teacher}))[1].records.length,0);
});

integration('code reissue invalidates the old session but preserves response',async()=>{
 const teacher='teacher-01',classScope=scope(teacher,1),student=studentsFor(teacher)[0],oldToken=tokens.get(student.id);
 const [status,result]=await request('/api/v2/teacher/reissue',{teacher,method:'POST',data:{...classScope,id:student.id}});assert.equal(status,200);
 assert.equal((await request('/api/v2/student/survey?month=5',{student:oldToken}))[0],401);
 assert.equal((await request('/api/v2/login',{method:'POST',data:{...classScope,id:student.id,code:codes.get(student.id)}}))[0],401);
 const [loginStatus,login]=await request('/api/v2/login',{method:'POST',data:{...classScope,id:student.id,code:result.code}});assert.equal(loginStatus,200);tokens.set(student.id,login.token);
 const [,saved]=await request(`/api/v2/teacher/status?year=2026&classId=${classScope.classId}&month=5`,{teacher});assert.equal(saved.responses.length,20);assert.ok(saved.responses.some(row=>row.student_id===student.id));
});

integration('failed login attempts are rate limited without exposing code validity',async()=>{
 const teacher='teacher-03',classScope=scope(teacher,3),student=studentsFor(teacher)[0],statuses=[];
 for(let attempt=0;attempt<7;attempt++)statuses.push((await request('/api/v2/login',{method:'POST',data:{...classScope,id:student.id,code:`wrong-code-${attempt}`}}))[0]);
 assert.deepEqual(statuses,[401,401,401,401,401,401,429]);
});

integration('teacher analysis reads only the owned class and retains monthly evidence',async()=>{
 const teacher='teacher-01',classScope=scope(teacher,1),[status,result]=await request(`/api/v2/teacher/analysis?year=2026&classId=${classScope.classId}`,{teacher});assert.equal(status,200);assert.equal(result.roster.length,20);assert.equal(result.responses.length,20);assert.equal(result.monthly.find(row=>row.month===5).categories.cooperation.votes.length,20);
});
