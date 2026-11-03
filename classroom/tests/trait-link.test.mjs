import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,addClass,addStudent,addAssessment,setGrade,roster} from '../grades/model.mjs';
import {rankTraitLevels,classSubjects} from '../grades/trait-link.mjs';

function workspace(scores){
 const m=fresh(2026),c=addClass(m,'우리 반');
 scores.forEach((_,i)=>addStudent(m,c.id,'학생'+(i+1)));
 const a=addAssessment(m,{title:'1단원',subject:'수학',criterion:'점수',maxScore:100,classIds:[c.id]});
 const people=roster(m,c.id);scores.forEach((v,i)=>{if(v!==null)setGrade(m,a.id,people[i].id,String(v))});
 return {m,c,people,a};
}
test('반 안 순위를 단계 수만큼 고르게 나누고, 같은 점수는 같은 단계',()=>{
 const {m,c,people}=workspace([100,90,80,70,60,50,40,30]);
 const four=rankTraitLevels(m,c.id,['수학'],4).levels;
 assert.deepEqual(people.map(p=>four.get(p.id)),[4,4,3,3,2,2,1,1]);
 const eight=rankTraitLevels(m,c.id,['수학'],8).levels;
 assert.deepEqual(people.map(p=>eight.get(p.id)),[8,7,6,5,4,3,2,1]);
 const tie=workspace([90,90,80,70,60,50,40,30]);
 const t=rankTraitLevels(tie.m,tie.c.id,['수학'],4).levels;
 assert.equal(t.get(tie.people[0].id),t.get(tie.people[1].id));
});
test('여러 교과는 표준점수 평균, 성적 없는 학생은 빠지고, 5명 미만 평가는 제외',()=>{
 const {m,c,people}=workspace([100,90,80,70,60,null]);
 const k=addAssessment(m,{title:'읽기',subject:'국어',criterion:'점수',maxScore:100,classIds:[c.id]});
 [10,20,30,40,50].forEach((v,i)=>setGrade(m,k.id,people[i].id,String(v)));
 const r=rankTraitLevels(m,c.id,['수학','국어'],4);
 assert.equal(r.used,2);assert.equal(r.levels.has(people[5].id),false);
 // Opposite orders cancel out: everyone ties.
 assert.equal(new Set(people.slice(0,5).map(p=>r.levels.get(p.id))).size,1);
 const few=workspace([100,90,80,null,null,null]);
 const s=rankTraitLevels(few.m,few.c.id,['수학'],4);
 assert.equal(s.used,0);assert.equal(s.skipped.length,1);assert.equal(s.levels.size,0);
 assert.deepEqual(classSubjects(m,c.id).sort(),['국어','수학']);
});
