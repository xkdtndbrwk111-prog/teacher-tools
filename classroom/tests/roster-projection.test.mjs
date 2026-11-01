import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,addAssessment,setGrade,getGrade,validateWorkspace,roster} from '../grades/model.mjs';
import {projectRoster,validateHostRoster} from '../grades/roster-projection.mjs';
const install='tt-stage031-fixed-install';
const source=install+'-class-A';
const make=(students=[{id:'s1',name:'김가온'},{id:'s2',name:'김가온'}])=>({installId:install,sourceInstanceId:source,className:'6-2',students});
test('동명이인은 ID로 따로 생성하고 정상 유효성 검증',()=>{const r=projectRoster(fresh(2026),make());assert.equal(r.stats.added,2);assert.equal(r.stats.active,2);assert.equal(new Set(r.workspace.memberships.map(x=>x.id)).size,2);assert.equal(r.workspace.students[0].name,r.workspace.students[1].name);assert.ok(validateWorkspace(r.workspace))});
test('재전달은 학생을 중복 생성하지 않는다',()=>{const r1=projectRoster(fresh(2026),make()),r2=projectRoster(r1.workspace,make());assert.equal(r2.changed,false);assert.equal(r2.workspace.memberships.length,2)});
test('이름 변경해도 membership, 성적, 신원 관계가 보존된다',()=>{let w=projectRoster(fresh(2026),make()).workspace;const classId=w.classes[0].id;const oldId=w.memberships[0].id,oldStId=w.memberships[0].studentId;const a=addAssessment(w,{title:'단원',subject:'수학',criterion:'점수',maxScore:100,classIds:[classId]});setGrade(w,a.id,oldId,'87');const n=projectRoster(w,make([{id:'s1',name:'김하늘'},{id:'s2',name:'김가온'}]));assert.equal(n.stats.renamed,1);assert.equal(n.workspace.memberships[0].id,oldId);assert.equal(n.workspace.memberships[0].studentId,oldStId);assert.equal(getGrade(n.workspace,a.id,oldId),87)});
test('삭제된 자리배치 ID는 비활성화하여 기존 성적 유지',()=>{let w=projectRoster(fresh(2026),make()).workspace;const c=w.classes[0];const x=w.memberships[1];const a=addAssessment(w,{title:'단원',subject:'국어',criterion:'점수',maxScore:100,classIds:[c.id]});setGrade(w,a.id,x.id,'91');const n=projectRoster(w,make([{id:'s1',name:'김가온'}]));assert.equal(n.stats.deactivated,1);assert.equal(n.workspace.memberships[1].active,false);assert.equal(getGrade(n.workspace,a.id,x.id),91);assert.equal(roster(n.workspace,c.id).length,1);const back=projectRoster(n.workspace,make());assert.equal(back.workspace.memberships[1].active,true);assert.equal(back.workspace.memberships.length,2);assert.equal(getGrade(back.workspace,a.id,x.id),91)});
test('같은 이름 새 ID는 이전 학생 성적에 자동 연결하지 않는다',()=>{let w=projectRoster(fresh(2026),make([{id:'s1',name:'김가온'}])).workspace;const oldMem=w.memberships[0].id;const a=addAssessment(w,{title:'기록',subject:'체육',criterion:'점수',maxScore:100,classIds:[w.classes[0].id]});setGrade(w,a.id,oldMem,'55');const n=projectRoster(w,make([{id:'s99',name:'김가온'}]));assert.equal(n.stats.added,1);assert.equal(n.stats.deactivated,1);assert.notEqual(n.workspace.memberships.at(-1).id,oldMem);assert.equal(getGrade(n.workspace,a.id,oldMem),55);assert.equal(getGrade(n.workspace,a.id,n.workspace.memberships.at(-1).id),null)});
test('다른 설치/중복 ID/기존 미확인 성적은 자동 병합 차단',()=>{let w=projectRoster(fresh(2026),make()).workspace;assert.throws(()=>projectRoster(w,{...make(),installId:'different-source-123',sourceInstanceId:'different-source-123-classX'}),/다른 설치/);assert.throws(()=>validateHostRoster(make([{id:'dup',name:'A'},{id:'dup',name:'B'}])),/중복/);const foreign=fresh(2026);foreign.students.push({id:'old',name:'가상'});assert.throws(()=>projectRoster(foreign,make()),/출처를 알 수 없는/)});
test('아바타는 유효한 자산만 가져오고 데이터 오염은 거절',()=>{const a=make([{id:'s1',name:'김가온',visual:{character:'boy1',hair:'black',outfit:'red',glasses:'none'},gender:'male'}]);const w=projectRoster(fresh(2026),a).workspace;assert.equal(w.students[0].seatingLink.visual.outfit,'red');const invalid=make([{id:'s1',name:'김가온',visual:{character:'bad'}}]);const clean=projectRoster(w,invalid).workspace;assert.ok(!clean.students[0].seatingLink);assert.ok(validateWorkspace(clean))});

test('두 학급은 원본 ID가 같아도 서로 다른 학생·소속으로 남고 성적도 보존된다',()=>{
 let w=projectRoster(fresh(2026),make([{id:'s1',name:'홍길동'}])).workspace;
 const cA=w.classes[0].id,memA=w.memberships[0].id;
 const a=addAssessment(w,{title:'읽기',subject:'국어',criterion:'점수',maxScore:100,classIds:[cA]});
 setGrade(w,a.id,memA,'98');
 const second={installId:install,sourceInstanceId:install+'-class-B',className:'6-3',students:[{id:'s1',name:'홍길동'},{id:'s2',name:'다른 학생'}]};
 w=projectRoster(w,second).workspace;
 assert.equal(w.classes.length,2);assert.equal(w.memberships.length,3);
 assert.notEqual(w.memberships[0].id,w.memberships[1].id);
 assert.equal(getGrade(w,a.id,memA),98);
 const again=projectRoster(w,make([{id:'s1',name:'홍길동'}]));
 assert.equal(again.workspace.classes.length,2);
 assert.equal(again.workspace.memberships.length,3);
 assert.equal(getGrade(again.workspace,a.id,memA),98);
 assert.equal(again.workspace.memberships.filter(mem=>mem.classId===w.classes[1].id&&mem.active).length,2);
});
test('같은 설치의 다른 학급 이름 변경은 기존 학급과 연결을 잃지 않는다',()=>{
 let w=projectRoster(fresh(2026),make([{id:'s1',name:'A'}])).workspace;
 const second={installId:install,sourceInstanceId:install+'-class-B',className:'6-3',students:[{id:'s1',name:'B'}]};
 w=projectRoster(w,second).workspace;
 const cId=w.classes[1].id;
 w=projectRoster(w,{...second,className:'6학년 3반'}).workspace;
 assert.equal(w.classes[1].id,cId);assert.equal(w.classes[1].name,'6학년 3반');
});
