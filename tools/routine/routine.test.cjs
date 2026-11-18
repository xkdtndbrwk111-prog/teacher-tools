'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const C=require('../../runtime-src/system/coins.js');
const now=(h,m=0,d=18)=>new Date(2026,10,d,h,m);
const cls='class-a',at=now(8).toISOString();
const student=(id,groupId=null)=>({id,name:id,number:Number(id.slice(1)),groupId});
const people=[student('s1','g1'),student('s2','g1'),student('s3','g2'),student('s4','g2')];
const tasks=[{id:'morning',name:'아침 준비',start:480,end:490,days:[3]},{id:'afternoon',name:'하교 준비',start:780,end:790,days:[3]}];
const ledger=(students=people)=>{const e=[{cls,at,type:'setting',enabled:true,weeklyOn:true,cap:40,weeklyAmount:10},{cls,at,type:'routine-config',tasks}];e.push(...C.routineOpen(e,{cls,students},now(8)));return e;};
const day=e=>C.routineDay(e,cls,'2026-11-18');
function check(e,ids,task,t){for(const id of ids)e.push(...C.routineMark(day(e),{task,student:id,done:true,now:t}));}
test('legacy ledger doubled exactly once, including historic payments and settings; roundtrip durable',()=>{
 const raw=[{cls,at,type:'setting',enabled:true,cap:20,weeklyAmount:5},{cls,at,type:'grant',id:'s1',amount:3.5},{cls,at,type:'spend',id:'s1',amount:-.5,charge:'x'}].map(JSON.stringify).join('\n');
 const e=C.parse(raw),s=C.stateOf(e,cls);a.equal(s.balances.s1,6);a.equal(s.settings.cap,40);a.equal(s.settings.weeklyAmount,10);
 a.deepEqual(C.parse(e.map(x=>JSON.stringify(C.encodeEvent(x))).join('\n')),e);
 a.equal(C.DEFAULTS.weeklyAmount,10);a.equal(C.FLOOR,-6);
 a.throws(()=>C.encodeEvent({amount:.5}));a.throws(()=>C.grant(s,{cls,students:[people[0]],amount:.5,at}));
});
test('single/multiplayer costs, old debit refund and no duplicate refund',()=>{
 const e=C.parse(JSON.stringify({cls,at,type:'spend',id:'s1',name:'s1',amount:-.5,charge:'old'}));
 const s=C.stateOf(e,cls);
 a.equal(C.priceFor(1),2);a.equal(C.priceFor(4),1);
 a.equal(C.spend(s,{cls,players:[people[0]],game:'solo',charge:'new',at}).events[0].amount,-2);
 a.equal(C.spend(s,{cls,players:people,game:'multi',charge:'new',at}).events[0].amount,-1);
 const refund=C.refund(e,{cls,charge:'old',at});a.equal(refund[0].amount,1);a.equal(C.refund([...e,...refund],{cls,charge:'old',at}).length,0);
 a.deepEqual(C.HOF_PRIZE,{1:2,2:1,3:1});
});
test('weekday validation and overlapping time rejection',()=>{
 a.throws(()=>C.routineTasks([...tasks,{id:'x',name:'x',start:489,end:500,days:[3]}]));
 a.equal(C.routineTasks([...tasks,{id:'x',name:'x',start:489,end:500,days:[4]}]).length,3);
 a.equal(C.routineOpen([{cls,type:'routine-config',tasks}],{cls,students:people},now(7)).length,0);
});
test('schedule, check validity, day snapshot and automatic payout once',()=>{
 const e=ledger();a.equal(C.routineActive(day(e),now(8)).id,'morning');
 a.equal(C.routineMark(day(e),{task:'afternoon',student:'s1',done:true,now:now(8)}).length,0);
 check(e,['s1','s2','s3'],'morning',now(8));check(e,['s1','s2','s3'],'afternoon',now(13));
 a.equal(C.routineActive(day(e),now(8,10)),null);
 a.deepEqual(C.routineAmounts(day(e)).map(x=>x.amount),[2,2,1,0]);
 a.equal(C.routineSettle(e,day(e),now(13,9)).length,0);
 const payout=C.routineSettle(e,day(e),now(13,10));a.equal(payout.at(-1).type,'routine-settle');a.equal(payout.filter(x=>x.type==='routine-grant').length,3);
 e.push(...payout);a.equal(C.routineSettle(e,day(e),now(14)).length,0);
 const roundtrip=C.parse(e.map(x=>JSON.stringify(C.encodeEvent(x))).join('\n'));
 a.equal(C.routineSettle(roundtrip,day(roundtrip),now(14)).length,0);a.equal(C.stateOf(roundtrip,cls).balances.s1,2);
});
test('full class, standalone, partial group, excluded and cancelled',()=>{
 for(const [students,expected] of [[people,3],[people.map(s=>({...s,groupId:null})),2],[people.map((s,i)=>({...s,groupId:i===0?null:s.groupId})),2]]){
  const e=ledger(students);check(e,students.map(s=>s.id),'morning',now(8));check(e,students.map(s=>s.id),'afternoon',now(13));a.ok(C.routineAmounts(day(e)).every(x=>x.amount===expected));
 }
 const e=ledger();e.push({cls,at,date:'2026-11-18',type:'routine-exclude',student:'s4',excluded:true},{cls,at,date:'2026-11-18',type:'routine-cancel',task:'afternoon',cancelled:true});
 check(e,['s1','s2','s3'],'morning',now(8));a.deepEqual(C.routineAmounts(day(e)).map(x=>x.amount),[3,3,3]);
 e.push({cls,at,date:'2026-11-18',type:'routine-cancel',task:'morning',cancelled:true});a.equal(C.routineAmounts(day(e)).length,0);
});
test('groups derived from confirmed seats, older no-group roster remains supported',()=>{
 const roster=people.map(({groupId,...s})=>s),data={classId:cls,roster,groups:[{id:'g1',name:'1모둠',seatIds:['a','b']}],assignments:[{studentId:'s1',seatId:'a'},{studentId:'s2',seatId:'b'}]};
 a.deepEqual(C.rosterOf(data).students.map(s=>s.groupId),['g1','g1',null,null]);
 a.ok(C.rosterOf({classId:cls,roster}).students.every(s=>s.groupId===null));
});
test('coin disabled and cap respected, no duplicate after restart',()=>{
 const e=ledger();check(e,people.map(s=>s.id),'morning',now(8));check(e,people.map(s=>s.id),'afternoon',now(13));
 e.push({cls,at,type:'grant',id:'s1',amount:39});const paid=C.routineSettle(e,day(e),now(13,10));a.equal(paid.find(x=>x.id==='s1').amount,1);
 const disabled=[...e,{cls,at,type:'setting',enabled:false}];const out=C.routineSettle(disabled,day(disabled),now(13,10));a.equal(out.length,1);a.equal(out[0].coinEnabled,false);
});
