import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MONTHS,parseQuestions} from '../survey/core.mjs';
const secret='test-only-very-long-teacher-secret-12345';
test('225 synthetic submissions survive server restart and enforce access, duplication and reissue', {timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'survey-test-')),db=join(dir,'test.sqlite'),port=19000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;let child;
 const start=()=>new Promise((resolve,reject)=>{child=spawn(process.execPath,['classroom/survey/test-server.mjs'],{env:{...process.env,SURVEY_DB:db,SURVEY_TEACHER_SECRET:secret,PORT:String(port)}});let err='';child.stderr.on('data',x=>err+=x);child.stdout.once('data',resolve);child.once('exit',code=>reject(Error(`server exited ${code} ${err}`)))});
 const stop=()=>new Promise(resolve=>{child.once('exit',resolve);child.kill()});
 const api=async(path,{token,method='GET',data}={})=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{...{}}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return [r.status,await r.json()]};
 try{await start();const q=parseQuestions(await readFile(new URL('../survey/v0.2.md',import.meta.url),'utf8'));const ids=Array.from({length:25},(_,i)=>`mock-${String(i+1).padStart(2,'0')}`),tokens=[];
 for(const id of ids){const [s,x]=await api('/api/teacher/students',{token:secret,method:'POST',data:{id}});assert.equal(s,201);const [l,y]=await api('/api/login',{method:'POST',data:{id,code:x.code}});assert.equal(l,200);tokens.push(y.token)}
 assert.equal((await api('/api/teacher/responses',{token:tokens[0]}))[0],403);
 for(const month of MONTHS){assert.equal((await api('/api/teacher/open',{token:secret,method:'POST',data:{month,open:true}}))[0],200);for(let i=0;i<25;i++){const option=n=>q[month][n-1].body.match(/^- (.+)$/m)[1];const other=ids[(i+1+(month%5))%25];const answers={1:option(1),2:option(2),3:`가상 응답 ${i} ${month}`,4:[{studentId:other,behavior:option(4)}],5:[{studentId:other,behavior:option(5)}],8:`가상 기록 ${month}`};if([3,9].includes(month)){answers[6]={kind:'unknown'};answers[7]={kind:'selected',choices:[{studentId:other}]}}else{answers[6]=option(6);answers[7]=option(7)}const [status,result]=await api('/api/student/submit',{token:tokens[i],method:'POST',data:{month,answers}});assert.equal(status,201,JSON.stringify(result));if(i===0)assert.equal((await api('/api/student/submit',{token:tokens[i],method:'POST',data:{month,answers}}))[0],409)}}
 await stop();await start();const [status,records]=await api('/api/teacher/responses',{token:secret});assert.equal(status,200);assert.equal(records.responses.length,225);assert.equal((await api('/api/student/surveys',{token:tokens[0]}))[0],200);const [p,preview]=await api('/api/teacher/preview?scale=8',{token:secret});assert.equal(p,200);assert.equal(preview.status,'preview');assert.equal(preview.levels.length,25);
 const [renew,code]=await api('/api/teacher/reissue',{token:secret,method:'POST',data:{id:ids[0]}});assert.equal(renew,200);assert.equal((await api('/api/student/surveys',{token:tokens[0]}))[0],401);assert.equal((await api('/api/login',{method:'POST',data:{id:ids[0],code:code.code}}))[0],200);
 await api('/api/teacher/status',{token:secret,method:'POST',data:{id:ids[1],active:false}});assert.equal((await api('/api/student/surveys',{token:tokens[1]}))[0],401);assert.equal((await api('/api/teacher/responses',{token:secret}))[1].responses.length,225);assert.equal((await api('/api/teacher/preview?scale=4',{token:secret}))[0],200);
 await api('/api/teacher/status',{token:secret,method:'POST',data:{id:ids[1],active:true}});assert.equal((await api('/api/student/surveys',{token:tokens[1]}))[0],401);assert.equal((await api('/api/teacher/preview?scale=4',{token:secret}))[1].levels.length,25);
 const [,newStudent]=await api('/api/teacher/students',{token:secret,method:'POST',data:{id:'mock-26'}});const [,newSession]=await api('/api/login',{method:'POST',data:{id:'mock-26',code:newStudent.code}});assert.equal((await api('/api/student/submit',{token:newSession.token,method:'POST',data:{month:3,answers:{4:[{studentId:'mock-26',behavior:q[3][3].body.match(/^- (.+)$/m)[1]}]}}}))[0],400);assert.equal((await api('/api/student/submit',{token:newSession.token,method:'POST',data:{month:3,answers:{}}}))[0],201);const missing=(await api('/api/teacher/responses',{token:secret}))[1].responses.find(r=>r.student_id==='mock-26');assert.deepEqual(missing.body,{});
 assert.equal((await api('/api/student/logout',{token:newSession.token,method:'POST'}))[0],200);assert.equal((await api('/api/student/surveys',{token:newSession.token}))[0],401);
 for(let i=0;i<8;i++)assert.equal((await api('/api/login',{method:'POST',data:{id:'mock-26',code:'wrong'}}))[0],401);
 assert.equal((await api('/api/login',{method:'POST',data:{id:'mock-26',code:newStudent.code}}))[0],429);
 }finally{if(child?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true})}
});
