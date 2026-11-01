import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {schoolYear,fresh,addAssessment,setGrade,getGrade,validateWorkspace,setMemberNumbers,roster} from '../grades/model.mjs';
import {encryptBundle,decryptBundle,isEncrypted} from '../host/backup-crypto.mjs';
import {decideSync,splitChunks,CHUNK,summarize,changedClasses} from '../host/cloud-store.mjs';
import {projectRoster,inactiveMembers,relinkInactiveMembership} from '../grades/roster-projection.mjs';
import {isStudentStorageKey,readStudents} from '../../shared/student-registry.js';
import {reconcileGradeClasses,restoreDeletedClass} from '../host/class-management-grade.mjs';
const repo=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const INSTALL='fixture-install';
const host=(names)=>({installId:INSTALL,sourceInstanceId:INSTALL+'-class-1',className:'6-1',students:names.map(([id,name])=>({id,name,gender:'none'}))});
function graded(){
 let m=projectRoster(fresh(2026),host([['a','가온'],['b','나래']])).workspace;
 const a=addAssessment(m,{title:'1단원',subject:'수학',criterion:'점수',maxScore:100,classIds:[m.classes[0].id]});
 const memberOf=seat=>m.memberships.find(x=>x.stage03SeatingId===seat);
 setGrade(m,a.id,memberOf('b').id,'92');
 m=projectRoster(m,host([['a','가온'],['c','나래2'],['d','전학생']])).workspace;
 return {m,a,find:seat=>m.memberships.find(x=>x.stage03SeatingId===seat)};
}
test('학년도는 3월에 바뀌고 1~2월은 전년도 학년도',()=>{
 assert.equal(schoolYear(new Date(2027,0,15)),2026);
 assert.equal(schoolYear(new Date(2027,1,28)),2026);
 assert.equal(schoolYear(new Date(2027,2,1)),2027);
 assert.equal(schoolYear(new Date(2026,11,31)),2026);
});
test('제외 학생을 현재 학생과 다시 연결하면 성적과 ID가 이어진다',()=>{
 const {m,a,find}=graded();
 const old=inactiveMembers(m,m.classes[0].id);
 assert.deepEqual(old.map(x=>[x.name,x.gradeCount]),[['나래',1]]);
 const out=relinkInactiveMembership(m,old[0].id,find('c').id);
 validateWorkspace(out);
 const linked=out.memberships.find(x=>x.stage03SeatingId==='c');
 assert.equal(linked.id,old[0].id);assert.equal(linked.active,true);
 assert.equal(getGrade(out,a.id,linked.id)?.value??getGrade(out,a.id,linked.id),92);
 assert.equal(inactiveMembers(out,out.classes[0].id).length,0);
 assert.equal(out.students.find(s=>s.id===linked.studentId).name,'나래2');
 const again=projectRoster(out,host([['a','가온'],['c','나래2'],['d','전학생']]));
 assert.equal(again.stats.added,0);assert.equal(again.stats.deactivated,0);
});
test('두 학생 모두 성적이 있는 평가는 연결을 거부하고 원본을 바꾸지 않는다',()=>{
 const {m,a,find}=graded();
 setGrade(m,a.id,find('c').id,'70');
 const before=JSON.stringify(m);
 assert.throws(()=>relinkInactiveMembership(m,inactiveMembers(m,m.classes[0].id)[0].id,find('c').id),/두 학생 모두/);
 assert.equal(JSON.stringify(m),before);
});
test('다른 반 학생과는 다시 연결할 수 없다',()=>{
 const {m,find}=graded();
 const other=structuredClone(m);other.classes.push({id:'class-2',name:'6-2'});
 find;const target=other.memberships.find(x=>x.stage03SeatingId==='c');target.classId='class-2';
 assert.throws(()=>relinkInactiveMembership(other,inactiveMembers(other,other.classes[0].id)[0].id,target.id),/같은 반/);
});
function storage(map){return{getItem:k=>k in map?map[k]:null};}
test('공용 명단은 선택한 반을 읽고 설치 전 자료는 예전 위치를 읽는다',()=>{
 const seat=s=>JSON.stringify({students:[{id:s,name:s}]});
 const legacy={'teacher-tools.seating.state.v1':seat('예전')};
 assert.equal(readStudents(storage(legacy))[0].name,'예전');
 const multi={...legacy,'tt.classroom.active-roster':seat('둘째반')};
 assert.equal(readStudents(storage(multi))[0].name,'둘째반');
 assert.equal(isStudentStorageKey('tt.classroom.active-roster'),true);
 assert.equal(isStudentStorageKey('other'),false);
});
test('자리배치 코드에 반별 저장 위치를 우회하는 고정 키가 없다',async()=>{
 for(const f of ['seating/app.js','seating/pe-v1.js','seating/classroom-trait-balance-v1.js','seating/backup-unified-v2.js']){
  const s=await readFile(join(repo,f),'utf8');
  assert.doesNotMatch(s,/(KEY\s*=\s*)["'`]teacher-tools\.seating\.(state\.v1|pe-prototype\.v2)/,f);
 }
});
test('사용 횟수는 공개 주소에서만 집계한다',async()=>{
 const s=await readFile(join(repo,'usage-stats.js'),'utf8');
 assert.match(s,/location\.hostname !== "xkdtndbrwk111-prog\.github\.io"\) return;/);
});
test('삭제한 반의 성적은 공유 평가까지 포함해 그대로 복구된다',()=>{
 let w=fresh(2026);
 const roster=(id,names)=>({installId:INSTALL,sourceInstanceId:INSTALL+'-'+id,className:id,students:names.map(n=>({id:id+n,name:n,gender:'none'}))});
 w=projectRoster(w,roster('A',['가','나'])).workspace;
 w=projectRoster(w,roster('B',['다'])).workspace;
 const shared=addAssessment(w,{title:'공유',subject:'수학',criterion:'점수',maxScore:100,classIds:w.classes.map(c=>c.id)});
 const only=addAssessment(w,{title:'B만',subject:'과학',criterion:'점수',maxScore:100,classIds:[w.classes[1].id]});
 for(const m of w.memberships)setGrade(w,shared.id,m.id,'80');
 setGrade(w,only.id,w.memberships.find(m=>m.stage03SeatingId==='B다').id,'70');
 const before=structuredClone(w);
 const plan=reconcileGradeClasses(w,INSTALL,[{id:'A',name:'A'}],['B']);
 assert.equal(plan.workspace.assessments.find(a=>a.id===only.id),undefined);
 assert.equal(plan.workspace.students.length,2);
 const back=restoreDeletedClass(plan.workspace,plan.removedByClass.B,{year:2026,installId:INSTALL,name:'B'});
 validateWorkspace(back);
 const sort=x=>[...x].sort((p,q)=>JSON.stringify(p).localeCompare(JSON.stringify(q)));
 for(const k of ['classes','students','memberships','gradeValues','criteria'])assert.deepEqual(sort(back[k]),sort(before[k]),k);
 assert.deepEqual(back.assessments.find(a=>a.id===shared.id).classIds.length,2);
 assert.throws(()=>restoreDeletedClass(back,plan.removedByClass.B,{year:2026,installId:INSTALL,name:'B'}),/이미/);
});
test('이미 사라진 학년도 작업공간에도 복구할 수 있다',()=>{
 let w=projectRoster(fresh(2026),host([['a','가온']])).workspace;
 const plan=reconcileGradeClasses(w,INSTALL,[],['class-1']);
 const back=restoreDeletedClass(null,plan.removedByClass['class-1'],{year:2026,installId:INSTALL,name:'6-1'});
 assert.equal(back.year,2026);assert.equal(back.stage03Bridge.installId,INSTALL);assert.equal(back.memberships.length,1);
});
test('번호는 명단 순서를 따르지 않고 새 학생은 맨 뒤로 들어간다',()=>{
 let w=projectRoster(fresh(2026),host([['a','가온'],['b','나래']])).workspace;
 const of=seat=>w.memberships.find(x=>x.stage03SeatingId===seat);
 setMemberNumbers(w,w.classes[0].id,{[of('a').id]:7,[of('b').id]:3});
 w=projectRoster(w,host([['b','나래'],['a','가온'],['c','다온']])).workspace;
 assert.deepEqual(['a','b','c'].map(x=>of(x).number),[7,3,8]);
 assert.deepEqual(roster(w,w.classes[0].id).map(r=>r.name),['나래','가온','다온']);
 assert.throws(()=>setMemberNumbers(w,w.classes[0].id,{[of('a').id]:3}),/같은 번호/);
 assert.throws(()=>setMemberNumbers(w,w.classes[0].id,{[of('a').id]:0}),/1~999/);
 assert.equal(of('a').number,7);
});
test('제외했다 돌아온 학생의 번호가 겹치면 맨 뒤로 간다',()=>{
 let w=projectRoster(fresh(2026),host([['a','가온'],['b','나래']])).workspace;
 const of=seat=>w.memberships.find(x=>x.stage03SeatingId===seat);
 w=projectRoster(w,host([['a','가온']])).workspace;
 w=projectRoster(w,host([['a','가온'],['c','다온']])).workspace;
 assert.equal(of('c').number,2);
 w=projectRoster(w,host([['a','가온'],['c','다온'],['b','나래']])).workspace;
 assert.equal(of('b').number,3);assert.equal(of('b').active,true);
});
test('백업 암호: 맞는 암호만 열리고 파일에 내용이 그대로 보이지 않는다',async()=>{
 const bundle={header:'x',payload:{name:'가상학생이름',big:'가'.repeat(200000)}};
 const file=await encryptBundle(bundle,'password1');
 assert.equal(isEncrypted(file),true);assert.equal(isEncrypted(bundle),false);
 assert.doesNotMatch(JSON.stringify(file),/가상학생이름/);
 assert.deepEqual(await decryptBundle(file,'password1'),bundle);
 await assert.rejects(()=>decryptBundle(file,'password2'),/암호가 맞지 않거나/);
 const altered=structuredClone(file);altered.data=(altered.data[0]==='A'?'B':'A')+altered.data.slice(1);
 await assert.rejects(()=>decryptBundle(altered,'password1'),/손상/);
});
test('자료 차이 판단: 양쪽이 바뀌면 묻고, 한쪽만 바뀌면 그 방향으로 간다',()=>{
 const d=(o)=>decideSync({localHash:'L',baseHash:'L',remoteRevision:'R',baseRevision:'R',localEmpty:false,...o});
 assert.equal(d({}),'none');
 assert.equal(d({localHash:'L2'}),'push');
 assert.equal(d({remoteRevision:'R2'}),'ask-pull');
 assert.equal(d({localHash:'L2',remoteRevision:'R2'}),'conflict');
 assert.equal(d({remoteRevision:null,baseRevision:null}),'push');
 assert.equal(d({baseRevision:null,baseHash:null}),'conflict');
 assert.equal(d({baseRevision:null,baseHash:null,localEmpty:true}),'ask-pull');
});
test('긴 자료는 시트 칸 제한보다 작게 나뉘고 그대로 합쳐진다',()=>{
 const text='가a'.repeat(100000);
 const parts=splitChunks(text);
 assert.ok(parts.every(p=>p.length<=CHUNK&&p.length<50000));
 assert.equal(parts.join(''),text);
 assert.deepEqual(splitChunks(''),['']);
});
test('요약과 달라진 반 이름',()=>{
 const a={classes:[{id:'1',name:'가',seating:{students:[{},{}]},pe:{}},{id:'2',name:'나',seating:{students:[{}]},pe:{}}],gradeYears:[{workspace:{gradeValues:[{value:1},{value:null}]}}]};
 const b=structuredClone(a);b.classes[1].pe={x:1};
 assert.deepEqual(summarize(a),{classes:2,students:3,grades:1});
 assert.deepEqual(changedClasses(a,b),['나']);
});
