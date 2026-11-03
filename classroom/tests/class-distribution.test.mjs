import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,addClass,addStudent,addAssessment,setGrade,roster} from '../grades/model.mjs';
import {buildClassDistribution,stackChips} from '../grades/class-distribution.mjs';

function workspace(){
 const m=fresh(2026),c=addClass(m,'우리 반');
 for(let i=0;i<7;i++)addStudent(m,c.id,'학생'+(i+1));
 const people=roster(m,c.id);
 const a=addAssessment(m,{title:'1단원',subject:'수학',criterion:'점수',maxScore:100,classIds:[c.id]});
 const b=addAssessment(m,{title:'2단원',subject:'수학',criterion:'점수',maxScore:100,classIds:[c.id]});
 [90,80,70,60,50,40,null].forEach((v,i)=>{if(v!==null)setGrade(m,a.id,people[i].id,String(v))});
 [90,80,70,60,50,null,null].forEach((v,i)=>{if(v!==null)setGrade(m,b.id,people[i].id,String(v))});
 return {m,c,people,a,b};
}
test('단원별: 입력한 학생은 순위와 표준점수, 미입력 학생은 계산 제외',()=>{
 const {m,c,a}=workspace();
 const d=buildClassDistribution(m,c.id,{subject:'수학',assessmentId:a.id});
 assert.equal(d.points.length,6);assert.equal(d.excluded.length,1);assert.equal(d.excluded[0].reason,'미입력');
 assert.deepEqual(d.points.map(p=>p.rank),[1,2,3,4,5,6]);assert.ok(d.points[0].z>0&&d.points[5].z<0);
 assert.equal(d.points[0].detail,'90점');
});
test('교과 전체: 개인 화면과 같은 값, 일부 미입력 학생은 제외',()=>{
 const {m,c}=workspace();
 const d=buildClassDistribution(m,c.id,{subject:'수학'});
 assert.equal(d.points.length,5);assert.equal(d.excluded.length,2);
 assert.ok(d.excluded.every(x=>x.reason==='평가 일부 미입력'));
});
test('이름표는 겹치지 않게 위로 쌓인다',()=>{
 const chips=stackChips([{z:0},{z:0},{z:0.01},{z:2}],z=>z*100,60);
 assert.deepEqual(chips.map(c=>c.row),[0,1,2,0]);
});
