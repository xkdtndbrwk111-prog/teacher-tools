import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconcileGradeClasses} from '../host/class-management-grade.mjs';
import {fresh,addClass,addStudent,addAssessment,setGrade,validateWorkspace} from '../grades/model.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=f=>readFile(join(root,f),'utf8');
function makeFixture(){
 const w=fresh(2026);w.stage03Bridge={installId:'installation',format:'stage031-multiclass-projection.v1'};
 const a=addClass(w,'6학년 1반'),b=addClass(w,'6학년 2반');a.stage03SourceId='installation-A';b.stage03SourceId='installation-B';
 const sa=addStudent(w,a.id,'김하늘'),sb=addStudent(w,b.id,'김하늘');
 const one=addAssessment(w,{title:'공통 평가',subject:'국어',criterion:'점수',maxScore:100,classIds:[a.id,b.id]});
 const two=addAssessment(w,{title:'A 전용',subject:'수학',criterion:'점수',maxScore:100,classIds:[a.id]});
 setGrade(w,one.id,sa.id,'79');setGrade(w,one.id,sb.id,'84');setGrade(w,two.id,sa.id,'91');
 validateWorkspace(w);return {w,a,b,sa,sb,one,two};
}
test('반 A 삭제: A 학생/성적/전용평가 제거, B 학생·성적과 공통평가 유지',()=>{
 const f=makeFixture(),out=reconcileGradeClasses(f.w,'installation',[{id:'B',name:'6학년 2반'}],['A']);
 assert.equal(out.changed,true);assert.equal(out.removedGradeValues,2);assert.equal(out.removedMemberships,1);
 assert.equal(out.workspace.classes.length,1);assert.equal(out.workspace.classes[0].id,f.b.id);
 assert.equal(out.workspace.memberships.length,1);assert.equal(out.workspace.memberships[0].id,f.sb.id);
 assert.equal(out.workspace.students.length,1);
 assert.deepEqual(out.workspace.assessments.map(a=>a.id),[f.one.id]);
 assert.deepEqual(out.workspace.assessments[0].classIds,[f.b.id]);
 assert.equal(out.workspace.criteria.length,1);assert.equal(out.workspace.gradeValues.length,1);
 assert.equal(out.workspace.gradeValues[0].membershipId,f.sb.id);
 assert.equal(out.workspace.gradeValues[0].value,84);
 assert.equal(f.w.gradeValues.length,3,'원본은 그대로 보존');
});
test('반 B 이름 변경은 대응된 성적 학급명만 갱신하고 점수·ID를 보존',()=>{
 const f=makeFixture(),res=reconcileGradeClasses(f.w,'installation',[{id:'A',name:'6학년 1반'},{id:'B',name:'6학년 새반'}],[]);
 assert.equal(res.workspace.classes.find(c=>c.id===f.b.id).name,'6학년 새반');
 assert.deepEqual(res.workspace.gradeValues,f.w.gradeValues);
 assert.deepEqual(res.workspace.memberships,f.w.memberships);
});
test('다른 설치 원본이면 자료 변경 없이 거절',()=>{
 const f=makeFixture();assert.throws(()=>reconcileGradeClasses(f.w,'someone-else',[],['A']),/설치 ID/);
 assert.equal(f.w.memberships.length,2);
});
test('성적 작업공간 미생성 상태는 삭제·생성 반영을 부작용 없이 생략',()=>{
 const res=reconcileGradeClasses(null,'installation',[{id:'B',name:'6학년 2반'}],['A']);assert.equal(res.changed,false);assert.equal(res.workspace,null);
});
test('반 관리 UI는 기존 등록 반의 편집·삭제/취소를 표시하고 HUD 이름 버튼 제거',async()=>{
 const js=await read('host/class-ui.js');
 assert.match(js,/tt-class-existing/);assert.match(js,/draftClasses=read\(\)\.classes\.map/);
 assert.match(js,/c\.deleted=!c\.deleted/);assert.match(js,/삭제 취소/);assert.match(js,/변경사항 저장/);
 assert.match(js,/반 관리/);assert.doesNotMatch(js,/tt-class-rename/);
});
test('삭제는 저장 클릭 이후 강한 경고 + 삭제 입력 확인이 필수',async()=>{
 const js=await read('host/class-ui.js');
 assert.match(js,/반 삭제를 눌렀습니다/);assert.match(js,/기존 학생 정보등이 같이 삭제 됩니다/);
 assert.match(js,/confirmInput\.value\.trim\(\)!=='삭제'/);
 assert.match(js,/if\(p\.deleted\.length\)\{\s*danger\.hidden=false/);
 assert.match(js,/TT_DELETED_/);
});
test('삭제는 성적의 평가/소속 정보를 먼저 보존·정리하고 등록 목록 커밋 후 좌석키 정리',async()=>{
 const js=await read('host/class-ui.js');
 assert.match(js,/reconcileGradeClasses\(await gradeStore\.loadDraft/);
 assert.match(js,/put\.set\(gradeKey,gradePlan\.workspace\)/);
 assert.match(js,/await classStore\.commit\(\{put,del\}\)/);
});
