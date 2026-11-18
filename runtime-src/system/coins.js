// Coin rules. The ledger is an append-only list of events on this PC; balances are worked out from it.
(function(root){
 'use strict';
 const COIN_UNIT=2;
 const FLOOR=-6;
 const DEFAULTS=Object.freeze({enabled:false,cap:40,weeklyOn:true,weeklyAmount:10,weeklyDay:1});
 const REFUND_MS=10000;
 // Keep the append-only disk ledger in the legacy denomination. All public domain
 // values are integer new coins. Reprojection is deterministic, including after rollback.
 function scaleEvent(e,factor){
  const copy={...e};
  for(const k of ['amount','cap','weeklyAmount'])if(typeof copy[k]==='number')copy[k]*=factor;
  if(Array.isArray(copy.results))copy.results=copy.results.map(r=>({...r,...Object.fromEntries(['given','balance'].filter(k=>typeof r[k]==='number').map(k=>[k,r[k]*factor]))}));
  return copy;
 }
 const decodeEvent=e=>scaleEvent(e,COIN_UNIT);
 function encodeEvent(e){
  for(const k of ['amount','cap','weeklyAmount'])if(k in e&&!Number.isSafeInteger(e[k]))throw Error('정수 코인만 사용할 수 있어요.');
  return scaleEvent(e,1/COIN_UNIT);
 }
 function parse(text){
  const out=[];
  for(const line of String(text||'').split('\n')){
   if(!line.trim())continue;
   try{out.push(decodeEvent(JSON.parse(line)))}catch(error){console.warn('코인 기록 한 줄을 읽지 못했습니다.',error)}
  }
  return out;
 }
 const newState=()=>({settings:{...DEFAULTS},balances:{},hof:null,chosen:false});
 function stateOf(events,cls){
  const st=newState();
  let active=false;
  for(const e of events){
   if(e.cls!==cls)continue;
   if(e.type==='setting'){st.chosen=true;for(const k of Object.keys(DEFAULTS))if(e[k]!==undefined)st.settings[k]=e[k]}
   else if(e.type==='reset'){st.balances={};st.hof=null;st.chosen=false;active=false}
   else if(e.type==='hof'){st.chosen=true;st.hof=e.hof||null}
   else if(e.id!==undefined&&typeof e.amount==='number'){active=true;st.balances[e.id]=(st.balances[e.id]||0)+e.amount}
  }
  // A class that was already using coins before they became opt-in stays on.
  if(active&&!st.chosen){st.chosen=true;st.settings.enabled=true}
  return st;
 }
 const balanceOf=(st,id)=>st.balances[id]||0;
 // A grant stops at the upper limit; removing coins is the teacher's correction, so it has no floor.
 function grant(st,{cls,students,amount,source,at}){
  if(!Number.isSafeInteger(amount))throw Error('정수 코인만 사용할 수 있어요.');
  const events=[],results=[];
  for(const s of students){
   const before=balanceOf(st,s.id);
   const given=amount>0?Math.min(amount,Math.max(0,st.settings.cap-before)):amount;
   results.push({id:s.id,name:s.name,given,balance:before+given,capped:given!==amount});
   if(given!==0)events.push({at,cls,type:'grant',id:s.id,name:s.name,amount:given,source});
  }
  return{events,results};
 }
 const priceFor=count=>count>1?1:2;
 function spend(st,{cls,players,game,charge,at}){
  const price=priceFor(players.length);
  const short=players.filter(p=>balanceOf(st,p.id)-price<FLOOR);
  if(short.length)return{ok:false,short,price};
  return{ok:true,price,events:players.map(p=>({at,cls,type:'spend',id:p.id,name:p.name,amount:-price,source:'game',game,charge}))};
 }
 function refund(events,{cls,charge,at}){
  if(events.some(e=>e.type==='refund'&&e.charge===charge&&e.cls===cls))return[];
  return events.filter(e=>e.type==='spend'&&e.charge===charge&&e.cls===cls).map(e=>({at,cls,type:'refund',id:e.id,name:e.name,amount:-e.amount,source:'refund',game:e.game,charge}));
 }
 const dayText=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 // The most recent pay day on or before now. Weeks the PC was off are not paid again.
 // Hall of fame weekly settlement: 1st 1 coin, 2nd and 3rd 0.5, for each game of one finished week.
 // The amounts are set here, not by the request, and a week is paid only once for a class.
 const HOF_PRIZE={1:2,2:1,3:1};
 const isMonday=key=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;const [y,m,d]=key.split('-').map(Number);const t=new Date(y,m-1,d);return t.getDay()===1&&t.getDate()===d;};
 function hofWeeksPaid(events,cls){return [...new Set(events.filter(e=>e.cls===cls&&e.type==='hofweek').map(e=>e.week))];}
 function hofWeek(events,st,{cls,students,week,awards,now}){
  if(!isMonday(week))return{ok:false,message:'결산할 주가 올바르지 않아요.'};
  const [y,m,d]=week.split('-').map(Number),end=new Date(y,m-1,d+7);
  if(end>now)return{ok:false,message:'아직 끝나지 않은 주예요.'};
  if(events.some(e=>e.cls===cls&&e.type==='hofweek'&&e.week===week))return{ok:true,already:true,events:[],given:[]};
  // 21 ranked modes, including 2/4-player team results. Never silently truncate a settlement.
  if(!Array.isArray(awards)||awards.length>128)return{ok:false,message:'결산 항목 수가 올바르지 않아요.'};
  const allowed=new Set(['stairs_solo','stairs_race','jump_solo','jump_duel','shop_solo','shop_vs2','shop_co2','shop_co4','flash_solo','flash_r8','flash_r12','dance_solo','dance_duo','hockey','volley','bubble','othello','gomoku','ttt','germ','rally']);
  const total=new Map(),games=new Map(),seen=new Set();
  for(const a of awards){
   if(!a||!allowed.has(a.game)||![1,2,3].includes(a.place)||typeof a.id!=='string')return{ok:false,message:'결산 항목이 올바르지 않아요.'};
   const s=students.find(x=>x.id===a.id&&!x.excluded),prize=HOF_PRIZE[a.place];
   if(!s)continue;
   const key=JSON.stringify([s.id,a.game,a.place]);if(seen.has(key))continue;seen.add(key);
   total.set(s.id,(total.get(s.id)||0)+prize);
   games.set(s.id,[...(games.get(s.id)||[]),a.game+':'+a.place]);
  }
  const at=now.toISOString(),out=[],given=[];
  for(const [id,amount] of total){
   const s=students.find(x=>x.id===id);
   const {events:paid,results}=grant(st,{cls,students:[s],amount,source:'hofweek',at});
   out.push(...paid.map(e=>({...e,type:'hofweek',week,games:games.get(id)})));
   given.push(...results);
  }
  // Even a week with nobody to pay is marked, so the button does not come back.
  if(!out.length)out.push({at,cls,type:'hofweek',week});
  return{ok:true,already:false,events:out,given};
 }
 function payDay(now,weekday){
  const date=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  date.setDate(date.getDate()-((date.getDay()-weekday+7)%7));
  return dayText(date);
 }
 function weekly(events,st,{cls,students,now}){
  const s=st.settings;
  if(!s.enabled||!s.weeklyOn||!(s.weeklyAmount>0)||!students.length)return[];
  const key=payDay(now,s.weeklyDay);
  if(events.some(e=>e.cls===cls&&e.type==='weekly'&&e.week===key))return[];
  const at=now.toISOString();
  const {events:paid}=grant(st,{cls,students,amount:s.weeklyAmount,source:'weekly',at});
  const out=paid.map(e=>({...e,type:'weekly',week:key}));
  // Students at the limit still mark the week as paid.
  if(!out.length)out.push({at,cls,type:'weekly',week:key});
  return out;
 }
 const schoolYear=date=>date.getMonth()<2?date.getFullYear()-1:date.getFullYear();
 function yearReset(events,{cls,now}){
  const mine=events.filter(e=>e.cls===cls);
  if(!mine.length)return[];
  const last=new Date(mine[mine.length-1].at);
  if(Number.isNaN(+last)||schoolYear(last)>=schoolYear(now))return[];
  return[{at:now.toISOString(),cls,type:'reset',year:schoolYear(now),source:'year'}];
 }
 // The seating file may come from an older manager without a full roster.
 function rosterOf(seating){
  if(!seating)return{cls:'',students:[]};
  const cls=seating.classId||seating.className||'우리 반';
  const genders=seating.practice?.genders||{};
  const list=Array.isArray(seating.roster)?seating.roster:(seating.students||[]).map((s,i)=>({id:s.id,name:s.name,gender:genders[s.id]||'none',number:i+1}));
  const seatGroup=new Map(),groups=new Map();
  for(const g of Array.isArray(seating.groups)?seating.groups:[]){if(typeof g.id!=='string'||!g.id||!Array.isArray(g.seatIds))continue;groups.set(g.id,String(g.name||g.id));for(const seat of g.seatIds)seatGroup.set(seat,seatGroup.has(seat)?null:g.id);}
  const byStudent=new Map();for(const a of Array.isArray(seating.assignments)?seating.assignments:[])if(a&&typeof a.studentId==='string')byStudent.set(a.studentId,seatGroup.get(a.seatId)||null);
  const students=list.map(s=>{const groupId=byStudent.get(s.id)||null;return{...s,groupId,groupName:groups.get(groupId)||null}});
  return{cls,className:seating.className||'우리 반',students,groups:[...groups].map(([id,name])=>({id,name}))};
 }
 // Hall of fame records go by seat, so a student keeps one seat however the list changes.
 function assignSeats(hof,students,max){
  const seats={...hof.seats},used=new Set([...Object.values(seats).map(Number),...Object.keys(hof.keep||{}).map(Number)]);
  let changed=false;
  for(const s of students){
   if(seats[s.id])continue;
   let seat=s.number>=1&&s.number<=max&&!used.has(s.number)?s.number:0;
   for(let n=1;!seat&&n<=max;n++)if(!used.has(n))seat=n;
   if(!seat)continue;
   seats[s.id]=seat;used.add(seat);changed=true;
  }
  return{seats,changed};
 }
 function seatNames(hof,students,max){
  const names=Array(max).fill('');
  for(const [seat,name] of Object.entries(hof.keep||{}))if(seat>=1&&seat<=max)names[seat-1]=String(name).slice(0,12);
  for(const s of students){const seat=hof.seats[s.id];if(seat>=1&&seat<=max)names[seat-1]=String(s.name).slice(0,12)}
  return names;
 }
 // All writers use a revision from the exact ledger read. Conflicts never overwrite a newer transaction.
 async function snapshot(withSeat=false){
  const [log,seat]=await Promise.all([fetch('/api/coins',{cache:'no-store'}),withSeat?fetch('/api/seating',{cache:'no-store'}):null]);
  if(!log.ok)throw Error('코인 기록을 읽지 못했어요.');
  const revision=log.headers.get('X-TT-Coin-Revision');
  if(!/^[a-f0-9]{64}$/.test(revision||''))throw Error('R7 코인 서버가 필요해요.');
  const seatRevision=seat?.headers.get('X-TT-Seating-Revision');
  if(withSeat&&(!/^[a-f0-9]{64}$/.test(seatRevision||'')||(!seat.ok&&seat.status!==404)))throw Error('학급 정보를 읽지 못했어요.');
  return {events:parse(await log.text()),revision,seatRevision,roster:withSeat?rosterOf(seat.ok?await seat.json():null):null};
 }
 async function commit(s,list){
  if(!list.length)return;
  const bytes=new TextEncoder().encode(list.map(e=>JSON.stringify(encodeEvent(e))).join('\n'));let b='';for(let i=0;i<bytes.length;i+=32768)b+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const headers={'Content-Type':'text/plain','X-TT-Coin-Revision':s.revision};if(s.seatRevision)headers['X-TT-Seating-Revision']=s.seatRevision;
  const r=await fetch('/api/coins',{method:'POST',headers,body:btoa(b)});
  if(r.status===409)throw Error('다른 코인 작업 또는 학급 변경이 있었어요. 다시 확인해 주세요.');
  if(!r.ok)throw Error('코인 기록을 저장하지 못했어요.');
  const rev=r.headers.get('X-TT-Coin-Revision');if(!/^[a-f0-9]{64}$/.test(rev||''))throw Error('코인 저장 결과를 확인할 수 없어요.');
  s.revision=rev;s.events.push(...list);
 }
 const validCharge=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
 function managerMutation(s,{type,cls,requestId,students,amount,settings},at){
  const fail=message=>({ok:false,message});
  if(!cls||cls!==s.roster?.cls)return fail('호자보드의 학급이 다릅니다. 현재 반을 칠판으로 보내 주세요.');
  if(!validCharge(requestId))return fail('교실매니저를 최신 버전으로 새로고침해 주세요.');
  if(type==='tt-coins-grant')return fail('코인 지급·차감은 호자보드에서만 할 수 있습니다.');
  if(type==='tt-coins-setting')return fail('코인 설정은 호자보드에서만 변경할 수 있습니다.');
  return fail('지원하지 않는 요청입니다.');
 }

 function checkedSpend(events,roster,{cls,ids,game,charge,at}){
  if(!cls||typeof cls!=='string')return {ok:false,message:'학급 정보가 없어요.'};
  if(!validCharge(charge)||!Array.isArray(ids)||ids.length<1||(typeof game==='string'&&game.startsWith('토너먼트 · ')?![4,8].includes(ids.length):ids.length>6)||new Set(ids).size!==ids.length||typeof game!=='string'||!game||game.length>80)return {ok:false,message:'잘못된 코인 요청이에요.'};
  if(events.some(e=>e.type==='coin-cancel'&&e.charge===charge))return {ok:false,message:'이미 취소된 거래예요.'};
  const old=events.filter(e=>e.type==='spend'&&e.charge===charge);
  const st=stateOf(events,cls);
  if(old.length){const reset=events.findLastIndex(e=>e.cls===cls&&e.type==='reset');if(reset>=0&&events.indexOf(old[0])<reset)return {ok:false,message:'이미 초기화된 거래예요.'};if(old.length!==ids.length||old.some(e=>e.cls!==cls||e.game!==game||!ids.includes(e.id))||events.some(e=>e.type==='refund'&&e.charge===charge))return {ok:false,message:'이미 종료되었거나 다른 거래예요.'};return {ok:true,price:-old[0].amount,events:[],duplicate:true};}
  if(roster.cls!==cls)return {ok:false,message:'학급이 변경됐어요. 게임을 다시 열어 주세요.'};
  if(!st.settings.enabled)return {ok:false,message:'코인이 꺼져 있어요.'};
  const players=ids.map(id=>roster.students.find(p=>p.id===id&&!p.excluded));if(players.some(p=>!p))return {ok:false,message:'학생 명단이 변경됐어요.'};
  const r=spend(st,{cls,players,game,charge,at});return r.ok?r:{...r,message:'코인이 모자라요: '+r.short.map(p=>p.name).join(', ')};
 }
 function originalRefund(events,charge,at){
  if(!validCharge(charge))return {ok:false,events:[]};
  const old=events.filter(e=>e.type==='spend'&&e.charge===charge);if(!old.length||old.some(e=>e.cls!==old[0].cls))return {ok:false,events:[]};
  const cls=old[0].cls;const lastReset=events.findLastIndex(e=>e.cls===cls&&e.type==='reset');
  if(lastReset>=0&&events.indexOf(old[0])<lastReset)return {ok:false,events:[]};
  return {ok:true,cls,events:refund(events,{cls,charge,at})};
 }
 function cancelOrRefund(events,{cls,charge,at}){
  if(typeof cls!=='string'||!cls||cls.length>160||!validCharge(charge))return {ok:false,events:[]};
  const old=events.find(e=>e.charge===charge&&['spend','coin-cancel'].includes(e.type));
  if(old&&old.cls!==cls)return {ok:false,events:[]};
  if(old?.type==='coin-cancel')return {ok:true,cls,events:[]};
  if(old)return originalRefund(events,charge,at);
  return {ok:true,cls,events:[{at,cls,type:'coin-cancel',charge}]};
 }

 // Daily routine events share the existing revision-checked append-only ledger.
 // Freeze the tasks, students, and seat groups for each date. No retrospective day fabrication.
 const minuteOf=now=>now.getHours()*60+now.getMinutes();
 function routineTasks(value){
  if(!Array.isArray(value)||value.length>16)throw Error('루틴은 최대 16개까지 설정할 수 있어요.');
  const ids=new Set();
  const tasks=value.map(t=>{
   if(!t||typeof t.id!=='string'||!t.id||ids.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>60||!Number.isInteger(t.start)||!Number.isInteger(t.end)||t.start<0||t.end>1440||t.start>=t.end||!Array.isArray(t.days)||!t.days.length||t.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('루틴 이름, 시간, 요일을 확인해 주세요.');
   ids.add(t.id);return{id:t.id,name:t.name.trim(),start:t.start,end:t.end,days:[...new Set(t.days)]};
  }).sort((a,b)=>a.start-b.start);
  for(let i=0;i<tasks.length;i++)for(let j=i+1;j<tasks.length;j++)if(tasks[i].end>tasks[j].start&&tasks[i].days.some(d=>tasks[j].days.includes(d)))throw Error('같은 요일의 루틴 시간이 겹쳐요.');
  return tasks;
 }
 function routineConfig(events,cls){return events.findLast(e=>e.cls===cls&&e.type==='routine-config')?.tasks||[];}
 function routineDay(events,cls,date){
  const e=events.find(x=>x.cls===cls&&x.type==='routine-open'&&x.date===date);
  if(!e)return null;
  const checks=new Map(),excluded=new Set(e.students.filter(s=>s.excluded).map(s=>s.id)),cancelled=new Set();
  let settled=null;
  for(const r of events){
   if(r.cls!==cls||r.date!==date)continue;
   if(r.type==='routine-check')checks.set(JSON.stringify([r.task,r.student]),r.done===true);
   if(r.type==='routine-exclude'){if(r.excluded)excluded.add(r.student);else excluded.delete(r.student);}
   if(r.type==='routine-cancel'){if(r.cancelled)cancelled.add(r.task);else cancelled.delete(r.task);}
   if(r.type==='routine-settle')settled=r;
  }
  return{...e,checks,excluded,cancelled,settled};
 }
 function routineOpen(events,roster,now){
  if(!roster.cls||!roster.students.length||routineDay(events,roster.cls,dayText(now)))return [];
  const tasks=routineTasks(routineConfig(events,roster.cls)).filter(t=>t.days.includes(now.getDay()));
  const min=minuteOf(now);
  if(!tasks.length||min<tasks[0].start||min>=tasks.at(-1).end)return [];
  const students=roster.students.map(s=>({id:s.id,name:s.name,number:s.number,groupId:s.groupId||null,groupName:s.groupName||null,excluded:Boolean(s.excluded)}));
  if(new Set(students.map(s=>s.id)).size!==students.length)return [];
  return[{at:now.toISOString(),cls:roster.cls,type:'routine-open',date:dayText(now),tasks,students}];
 }
 function routineActive(day,now){
  if(!day||day.date!==dayText(now)||day.settled)return null;
  const min=minuteOf(now);return day.tasks.find(t=>!day.cancelled.has(t.id)&&t.start<=min&&min<t.end)||null;
 }
 const routineDone=(day,task,student)=>day.checks.get(JSON.stringify([task,student]))===true;
 function routineMark(day,{task,student,done,now,teacher=false}){
  if(!day||day.settled||day.date!==dayText(now)||!day.students.some(s=>s.id===student)||!day.tasks.some(t=>t.id===task)||day.excluded.has(student)||day.cancelled.has(task))return [];
  if(!teacher&&routineActive(day,now)?.id!==task)return [];
  if(routineDone(day,task,student)===Boolean(done))return [];
  return[{at:now.toISOString(),cls:day.cls,date:day.date,type:'routine-check',task,student,done:Boolean(done)}];
 }
 function routineAmounts(day){
  const tasks=day.tasks.filter(t=>!day.cancelled.has(t.id)),people=day.students.filter(s=>!day.excluded.has(s.id));
  if(!tasks.length||!people.length)return[];
  const complete=new Set(people.filter(s=>tasks.every(t=>routineDone(day,t.id,s.id))).map(s=>s.id));
  // A partial mapping must not make an incomplete group falsely eligible.
  const hasGroups=people.every(s=>typeof s.groupId==='string'&&s.groupId);
  const classDone=people.every(s=>complete.has(s.id));
  return people.map(s=>{
   const individual=complete.has(s.id)?1:0;
   const group=hasGroups&&people.filter(p=>p.groupId===s.groupId).every(p=>complete.has(p.id))?1:0;
   return{id:s.id,name:s.name,individual,group,classroom:classDone?1:0,amount:individual+group+(classDone?1:0)};
  });
 }
 function routineSettle(events,day,now){
  if(!day||day.settled||day.date>dayText(now)||!day.tasks.length||day.date===dayText(now)&&minuteOf(now)<Math.max(...day.tasks.map(t=>t.end)))return [];
  // Keep the same upper-limit rule as other coin rewards; no debt or repeated payment.
  const st=stateOf(events,day.cls),awards=routineAmounts(day),out=[],results=[];
  if(st.settings.enabled)for(const a of awards){
   const s=day.students.find(s=>s.id===a.id);const g=grant(st,{cls:day.cls,students:[s],amount:a.amount,source:'routine',at:now.toISOString()});
   out.push(...g.events.map(e=>({...e,type:'routine-grant',date:day.date,individual:a.individual,group:a.group,classroom:a.classroom})));
   results.push({...a,paid:g.results[0].given});
  }
  out.push({at:now.toISOString(),cls:day.cls,type:'routine-settle',date:day.date,coinEnabled:st.settings.enabled,results:results.map(({id,individual,group,classroom,paid})=>({id,individual,group,classroom,paid}))});
  return out;
 }
 const api={routineTasks,routineConfig,routineDay,routineOpen,routineActive,routineDone,routineMark,routineAmounts,routineSettle,dayText,minuteOf,COIN_UNIT,encodeEvent,decodeEvent,snapshot,commit,managerMutation,cancelOrRefund,checkedSpend,originalRefund,validCharge,assignSeats,seatNames,FLOOR,DEFAULTS,REFUND_MS,parse,stateOf,balanceOf,grant,priceFor,spend,refund,payDay,weekly,yearReset,rosterOf,schoolYear,HOF_PRIZE,hofWeek,hofWeeksPaid};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.TTCoins=api;
})(typeof window!=='undefined'?window:globalThis);
