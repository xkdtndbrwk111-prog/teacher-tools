import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fresh,addClass,addStudent,addAssessment,setGrade,validateWorkspace} from '../grades/model.mjs';
import {capturePayload,validatePayload,remapInstall,sealPayload,verifyBundle} from '../host/workspace-bundle.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const testId='installA';
function setup(){
 const seats=[{id:'C1',name:'6학년 1반',seating:{version:10,className:'6학년 1반',students:[{id:'s-a',name:'김민수'}]},pe:{'s-a':{traits:{intelligence:3}}}},{id:'C2',name:'6학년 2반',seating:{version:10,className:'6학년 2반',students:[{id:'s-b',name:'김민수'}]},pe:{'s-b':{traits:{intelligence:2}}}}];
 const w=fresh(2026);w.stage03Bridge={installId:testId,format:'stage031-multiclass-projection.v1'};
 const a=addClass(w,'6학년 1반');a.stage03SourceId=`${testId}-C1`;
 const b=addClass(w,'6학년 2반');b.stage03SourceId=`${testId}-C2`;
 const m1=addStudent(w,a.id,'김민수'),m2=addStudent(w,b.id,'김민수');
 m1.stage03SeatingId='s-a';m2.stage03SeatingId='s-b';
 const eval1=addAssessment(w,{title:'평가',subject:'국어',criterion:'점수',maxScore:100,classIds:[a.id,b.id]});
 setGrade(w,eval1.id,m1.id,'85');setGrade(w,eval1.id,m2.id,'77');
 validateWorkspace(w);
 return capturePayload({installId:testId,registry:{activeId:'C1',classes:seats.map(x=>({id:x.id,name:x.name}))},seatAndPe:seats,gradeYears:[{year:2026,workspace:w}],validateSeating:()=>true});
}
const validateSeating=()=>true;
test('학급 2개/동명이인과 2명 성적이 백업 스냅샷에 모두 보존',()=>{
 const p=setup(),s=validatePayload(p,{validateSeating});assert.deepEqual([s.classCount,s.studentCount,s.gradeCount],[2,2,2]);
 assert.equal(p.gradeYears[0].workspace.memberships.length,2);
});
test('seal과 verify 후 원본 내용 일치',async()=>{
 const p=setup(),sealed=await sealPayload(p);assert.match(sealed.checksum,/^[0-9a-f]{64}$/);
 const n=await verifyBundle(sealed,{validateSeating});assert.equal(n.gradeCount,2);
});
test('성적 1점 무단변경 시 해시 검증 거절',async()=>{
 const sealed=await sealPayload(setup());sealed.payload.gradeYears[0].workspace.gradeValues[0].value=12;
 await assert.rejects(verifyBundle(sealed,{validateSeating}),/SHA-256/);
});
test('새 설치로 복원 시 학생/성적 ID를 바꾸지 않고 stage03 source prefix만 변경',()=>{
 const p=setup(),before=structuredClone(p.gradeYears[0].workspace);
 const r=remapInstall(p,'installB',{validateSeating});
 assert.equal(r.sourceInstallId,'installB');assert.equal(r.gradeYears[0].workspace.classes[0].stage03SourceId,'installB-C1');
 assert.deepEqual(r.gradeYears[0].workspace.memberships,before.memberships);assert.deepEqual(r.gradeYears[0].workspace.gradeValues,before.gradeValues);
 assert.equal(p.sourceInstallId,'installA','원본을 수정하지 않음');
});
test('학급 이름-좌석 데이터 불일치 차단',()=>{
 const p=setup();p.classes[0].seating.className='가짜 반';assert.throws(()=>validatePayload(p,{validateSeating}),/레지스트리/);
});
test('반 ID 중복, 학년도 중복, 원본 설치 불일치 거절',()=>{
 const p=setup();p.classes[1].id='C1';assert.throws(()=>validatePayload(p,{validateSeating}),/ID/);
 const q=setup();q.gradeYears.push(structuredClone(q.gradeYears[0]));assert.throws(()=>validatePayload(q,{validateSeating}),/중복/);
 const u=setup();u.gradeYears[0].workspace.stage03Bridge.installId='foreign';assert.throws(()=>validatePayload(u,{validateSeating}),/설치/);
});
test('저장되는 성적이 없는 다학급 백업 허용',()=>{
 const p=setup();p.gradeYears=[];assert.equal(validatePayload(p,{validateSeating}).gradeCount,0);
});
test('STAGE04 설치본은 기존 원본의 반/성적 메뉴와 로컬 Google 차단을 유지',async()=>{
 const build=await readFile(join(root,'../seating/index.html'),'utf8');
 const u=await readFile(join(root,'host/storage-ui.js'),'utf8');
 assert.match(await readFile(join(root,'host/class-bootstrap.js'),'utf8'),/storage-ui.js/);assert.match(build,/class-bootstrap.js/);assert.match(u,/Google 연결 없음/);assert.match(u,/tt-backup-restore/);
 assert.match(u,/await capture\(\)/);assert.match(u,/classStore\.commit\(\{put,del\}\)/);
 const guard=await readFile(join(root,'grades/mount-guard.js'),'utf8');assert.match(guard,/cloud-save/);
});

test('현재 반 목록에서 삭제된 과거 학년도 반의 성적을 백업에 그대로 보존',()=>{
 const p=setup();const past=structuredClone(p.gradeYears[0].workspace);past.year=2025;
 past.classes[0].stage03SourceId='installA-old-deleted-class';
 p.gradeYears.push({year:2025,workspace:past});
 assert.equal(validatePayload(p,{validateSeating}).gradeCount,4);
 const r=remapInstall(p,'newInstall',{validateSeating});
 assert.equal(r.gradeYears[1].workspace.classes[0].stage03SourceId,'newInstall-old-deleted-class');
});
