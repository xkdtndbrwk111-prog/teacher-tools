const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../../runtime-src/system/coins.js');
const roster={cls:'A',students:Array.from({length:8},(_,i)=>({id:'s'+i,name:'학생 '+i}))},at='2026-11-18T04:00:00Z',charge='12345678-1234-4234-8234-123456789012';
const ids=roster.students.map(x=>x.id),events=[{cls:'A',type:'setting',enabled:true}];
const spend=(game,list=ids,base=events)=>C.checkedSpend(base,roster,{cls:'A',ids:list,game,charge,at});
test('eight tournament entrants atomic charge and idempotent refund',()=>{const r=spend('토너먼트 · 에어하키');assert(r.ok);assert.equal(r.events.length,8);assert(r.events.every(x=>x.amount===-.5));const ledger=[...events,...r.events];assert.equal(spend('토너먼트 · 에어하키',ids,ledger).events.length,0);const f=C.cancelOrRefund(ledger,{cls:'A',charge,at});assert.equal(f.events.length,8);assert(f.events.every(x=>x.amount===.5));assert.equal(C.cancelOrRefund([...ledger,...f.events],{cls:'A',charge,at}).events.length,0);});
test('ordinary limit and exact tournament size',()=>{assert(!spend('에어하키').ok);assert(!spend('토너먼트 · 에어하키',ids.slice(0,6)).ok);assert(spend('토너먼트 · 에어하키',ids.slice(0,4)).ok);});
test('one low balance rejects whole tournament',()=>{const e=[...events,{cls:'A',id:'s7',amount:-3,type:'grant'}];const r=spend('토너먼트 · 에어하키',ids,e);assert(!r.ok);assert.equal(r.events,undefined);});
test('auth must use configured host PIN, class and frame validation',()=>{const s=fs.readFileSync('runtime-src/system/coins-ui.js','utf8');assert(s.includes('!auth?.hasTeacherPin?.()'));assert(s.includes('await auth.requestCoinAccess()'));assert(s.includes('roster.cls!==cls||!valid?.()'));assert(s.includes('tournamentV1:true'));});
