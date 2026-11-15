import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendCharm} from '../survey/charm-recommendation.mjs';
test('설문 추천은 결측을 보류하고 친밀도를 제외하며 4·8단계에서 재현된다',()=>{
 const roster=Array.from({length:25},(_,i)=>({id:`s${i}`}));
 const sparse=recommendCharm(roster,[],4);assert.ok(sparse.rows.every(r=>r.status==='INSUFFICIENT'));
 const responses=roster.slice(1,16).flatMap((s,i)=>[{student_id:s.id,month:3,body:{4:[{studentId:'s0'}],5:[{studentId:'s0'}],6:{kind:'selected',choices:[{studentId:'s1'}]},7:{kind:'selected',choices:[{studentId:'s0'}]}}},{student_id:s.id,month:5,body:{4:[{studentId:'s0'}],5:[{studentId:'s0'}]}}]);
 const four=recommendCharm(roster,responses,4),eight=recommendCharm(roster,responses,8);assert.equal(four.rows[0].level,4);assert.equal(eight.rows[0].level,8);assert.equal(four.counts.cooperation,15);assert.equal(four.counts.popularity,15);assert.deepEqual(four,recommendCharm(roster,responses,4));
 const changed=structuredClone(responses);for(const r of changed)if(r.body[6])r.body[6]={kind:'unknown'};assert.deepEqual(four,recommendCharm(roster,changed,4));
});
test('긍정적 선택이 없으면 추천을 보류하고, 한 항목의 한 표도 기존 가중치로 계산한다',()=>{
 const roster=Array.from({length:25},(_,i)=>({id:`s${i}`}));
 const responses=roster.slice(1,11).map((student,i)=>({student_id:student.id,month:3,body:{4:[{studentId:i===0?'s0':'s12'}],5:[{studentId:'s12'}],7:{kind:'selected',choices:[{studentId:'s12'}]}}}));
 const before=structuredClone(responses);
 for(const scale of [4,8]){
  const result=recommendCharm(roster,responses,scale);
  const none=result.rows.find(row=>row.studentId==='s13');
  assert.equal(none.status,'NO_EVIDENCE');assert.equal(none.level,undefined);
  const one=result.rows.find(row=>row.studentId==='s0');
  assert.equal(one.status,'READY');assert.equal(one.ratios.cooperation,.1);assert.equal(one.ratios.care,0);assert.equal(one.ratios.popularity,0);assert.equal(one.score,.4*.1);
  assert.equal(one.level,1);
  assert.equal(result.rows.find(row=>row.studentId==='s1').status,'INSUFFICIENT');
 }
 assert.deepEqual(responses,before);
});
