const assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const C=require('./system/coins.js'); const now='2026-11-15T10:00:00Z',ids=['a','b'];
const roster={cls:'A',className:'A',students:[{id:'a',name:'가',number:1},{id:'b',name:'나',number:2},{id:'c',name:'다',excluded:true}]};
const setting=(cls,enabled=true)=>({cls,at:now,type:'setting',enabled,weeklyOn:false});
const grant=(cls,id,amount)=>({cls,id,amount,at:now,type:'grant'});
const req=(opts={})=>({cls:'A',ids:['a'],game:'게임',charge:crypto.randomUUID(),at:now,...opts});
let n=0;function pass(name){console.log('PASS',++n,name)}
let events=[setting('A'),setting('B'),grant('A','a',1),grant('B','a',10)];
let p=req();let r=C.checkedSpend(events,roster,p);assert(r.ok);assert.equal(r.price,1);events.push(...r.events);assert.equal(C.balanceOf(C.stateOf(events,'A'),'a'),0);assert.equal(C.balanceOf(C.stateOf(events,'B'),'a'),10);pass('1인 차감 및 학급 격리');
r=C.checkedSpend(events,roster,p);assert(r.ok&&r.duplicate&&!r.events.length);pass('동일 결제 재시도 멱등');
assert(!C.checkedSpend(events,roster,{...p,ids:['b']}).ok);pass('거래 ID 재사용 불일치 차단');
r=C.checkedSpend(events,roster,req({ids:['a','b']}));assert(r.ok&&r.price===.5&&r.events.length===2);pass('2인 각각 0.5');
assert(!C.checkedSpend(events,roster,req({ids:['a','a']})).ok);pass('중복 학생 차단');
assert(!C.checkedSpend(events,roster,req({ids:['c']})).ok);pass('제외 학생 차단');
assert(!C.checkedSpend(events,roster,req({ids:[]})).ok);pass('빈 명단 차단');
assert(!C.checkedSpend([...events,setting('A',false)],roster,req()).ok);pass('코인 OFF 차단');
assert(!C.checkedSpend(events,{...roster,cls:'B'},req()).ok);pass('다른 학급 신규 차감 차단');
assert(!C.checkedSpend([...events,grant('A','a',-3)],roster,req()).ok);pass('하한 -3');
r=C.originalRefund(events,p.charge,now);assert(r.ok&&r.cls==='A'&&r.events.length===1);events.push(...r.events);assert.equal(C.balanceOf(C.stateOf(events,'A'),'a'),1);pass('원래 학급 환불');
assert.equal(C.originalRefund(events,p.charge,now).events.length,0);pass('중복 환불 무효');
assert(!C.checkedSpend(events,roster,p).ok);pass('환불된 거래 재사용 금지');
assert(!C.originalRefund(events,'bad',now).ok);pass('잘못된 환불 ID 거부');
let p2=req();events.push(...C.checkedSpend(events,roster,p2).events);assert(!C.originalRefund([...events,{cls:'A',type:'reset',at:now}],p2.charge,now).ok);pass('학년도 초기화 이전 환불 거부');
// In-memory emulation of the server CAS; real PowerShell transport is NOT tested here.
let ledger=[setting('A'),grant('A','a',-2)],seat={classId:'A',className:'A',roster:roster.students};
const rev=x=>crypto.createHash('sha256').update(x).digest('hex');const log=()=>ledger.map(JSON.stringify).join('\n')+'\n';const seatText=()=>JSON.stringify(seat);const response=(body,status,headers)=>new Response(body,{status,headers});
global.fetch=async(url,opt={})=>{if(url==='/api/seating')return response(seatText(),200,{'X-TT-Seating-Revision':rev(seatText())});if(opt.method!=='POST')return response(log(),200,{'X-TT-Coin-Revision':rev(log())});const h=opt.headers;if(h['X-TT-Coin-Revision']!==rev(log())||(h['X-TT-Seating-Revision']&&h['X-TT-Seating-Revision']!==rev(seatText())))return response('{}',409,{});ledger.push(...Buffer.from(opt.body,'base64').toString('utf8').split('\n').map(JSON.parse));return response('{}',200,{'X-TT-Coin-Revision':rev(log())});};
(async()=>{let [a,b]=await Promise.all([C.snapshot(true),C.snapshot(true)]);const q1=req(),q2=req();let c=await Promise.allSettled([C.commit(a,C.checkedSpend(a.events,a.roster,q1).events),C.commit(b,C.checkedSpend(b.events,b.roster,q2).events)]);assert.equal(c.filter(x=>x.status==='fulfilled').length,1);assert.equal(C.balanceOf(C.stateOf(ledger,'A'),'a'),-3);pass('동시 차감 CAS 충돌 및 하한 보존');
let d=await C.snapshot(true);assert(!C.checkedSpend(d.events,d.roster,q2).ok);pass('충돌 뒤 최신 원장 재검증');
[a,b]=await Promise.all([C.snapshot(true),C.snapshot(true)]);c=await Promise.allSettled([C.commit(a,C.originalRefund(a.events,q1.charge,now).events),C.commit(b,C.originalRefund(b.events,q1.charge,now).events)]);assert.equal(c.filter(x=>x.status==='fulfilled').length,1);assert.equal(C.balanceOf(C.stateOf(ledger,'A'),'a'),-2);pass('동시 환불 CAS 충돌');
d=await C.snapshot(true);seat={...seat,classId:'B'};await assert.rejects(C.commit(d,[grant('A','a',1)]));pass('학급 명단 변경 시 이전 스냅샷 거절');
let mgr=await C.snapshot();await C.commit(mgr,[grant('A','a',1)]);assert.equal(C.balanceOf(C.stateOf(ledger,'A'),'a'),-1);pass('교실매니저 기존 메시지 경로와 독립 원장 커밋');
// JS syntax all inline scripts, no execution of actual dashboard HTML.
for(const f of ['dashboard.html','seating-inbox.html']){const src=fs.readFileSync(path.join(__dirname,'system',f),'utf8');let count=0;for(const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/src\s*=|type\s*=\s*['"](?:application\/json|module)/i.test(m[1])||!m[2].trim())continue;new vm.Script(m[2],{filename:f+':'+(++count)})}console.log('JS syntax',f,count);}
console.log('TOTAL',n,'PASS; PowerShell and live browsers NOT RUN');})().catch(e=>{console.error(e);process.exitCode=1});