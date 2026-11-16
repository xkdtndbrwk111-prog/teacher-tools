// Coin app on the dashboard, the weekly allowance, and the link to the mini games.
(()=>{
 'use strict';
 const C=window.TTCoins,GAME_ORIGIN='https://xkdtndbrwk111-prog.github.io';
 const $=id=>document.getElementById(id);
 const SOURCE={dashboard:'대시보드 지급',manager:'교실 매니저',weekly:'주급',game:'게임',refund:'환불',hofweek:'명예의 전당 주간 결산',year:'학년도 초기화',settings:'설정 변경'};
 const WEEKDAYS=['일','월','화','수','목','금','토'];
 const coin=n=>(Number.isInteger(n)?String(n):n.toFixed(1));
 const signed=n=>(n>0?'+':'')+coin(n);
 let events=[],roster={cls:'',className:'',students:[]},selected=new Set(),panel='grant';
 const state=()=>C.stateOf(events,roster.cls);
 let snap=null,queue=Promise.resolve();
 function serial(fn){const next=queue.then(fn);queue=next.catch(()=>{});return next;}
 async function load(){snap=await C.snapshot(true);events=snap.events;if(roster.cls!==snap.roster.cls)selected.clear();roster=snap.roster;}
 async function append(list){await C.commit(snap,list);}
 // Only one page writes at a time here, and the server handles requests one by one.
 async function housekeepingNow(){
  try{
   await load();
   if(!roster.cls)return true;
   const now=new Date();
   await append(C.yearReset(events,{cls:roster.cls,now}));
   await append(C.weekly(events,state(),{cls:roster.cls,students:roster.students,now}));
   if(!dialog.hidden&&dialog.open)render();
   return true;
  }catch(error){console.warn('코인 정리 실패',error);return false;}
 }

 const housekeeping=()=>serial(housekeepingNow);
 const style=document.createElement('style');
 style.textContent=`#coinApp:modal{width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#13233d;color:#edf4fc;overflow:hidden}
#coinBody{box-sizing:border-box;display:flex;flex-direction:column;height:100%;padding:18px clamp(14px,2vw,32px);gap:12px}
#coinTop{flex:0 0 30vh;min-height:0;overflow:hidden}
#coinTop h2{margin:0 0 6px;font-size:clamp(22px,2vw,34px)}
#coinNote{min-height:1.4em;font-size:clamp(15px,1.2vw,20px);color:#fde68a;font-weight:700}
#coinRecent{margin:8px 0 0;padding:0;list-style:none;font-size:clamp(13px,1vw,17px);line-height:1.6;color:#cfe0f5}
#coinMain{flex:1 1 auto;min-height:0;overflow:auto}
#coinGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(clamp(110px,10vw,170px),1fr));gap:8px}
#coinGrid button{min-height:68px;padding:6px;border:2px solid #34507a;border-radius:12px;background:#1d3355;color:#edf4fc;font-size:clamp(15px,1.2vw,20px);font-weight:700}
#coinGrid button b{display:block;font-size:clamp(18px,1.5vw,26px);color:#fde68a}
#coinGrid button.minus b{color:#fca5a5}
#coinGrid button.on{border-color:#fde68a;background:#2f5597}
#coinActions,#coinNav{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
#coinApp button.act{min-height:64px;min-width:72px;padding:8px 16px;border:0;border-radius:12px;background:#3b82f6;color:#fff;font-size:clamp(17px,1.4vw,24px);font-weight:800}
#coinApp button.act.neg{background:#7f1d1d}
#coinApp button.nav{min-height:56px;padding:8px 18px;border:0;border-radius:12px;background:#334763;color:#fff;font-size:clamp(15px,1.2vw,20px);font-weight:700}
#coinApp button.nav.on{background:#fde68a;color:#172033}
#coinHistory{width:100%;border-collapse:collapse;font-size:clamp(14px,1.1vw,18px)}
#coinHistory td{padding:6px 8px;border-bottom:1px solid #34507a;text-align:left}
#coinFilter{min-height:48px;margin-bottom:8px;font-size:18px}
#coinSettings{display:grid;gap:14px;max-width:560px;margin:0 auto;font-size:clamp(16px,1.3vw,22px)}
#coinSettings label{display:flex;align-items:center;justify-content:space-between;gap:12px}
#coinSettings input[type=number],#coinSettings select{width:120px;min-height:52px;font-size:20px;text-align:center}
#coinSettings input[type=checkbox]{width:32px;height:32px}`;
 document.head.append(style);
 const dialog=document.createElement('dialog');dialog.id='coinApp';dialog.setAttribute('aria-labelledby','coinTitle');
 dialog.innerHTML=`<div id="coinBody"><div id="coinTop"><h2 id="coinTitle">🪙 코인</h2><div id="coinNote" role="status"></div><ul id="coinRecent"></ul></div><div id="coinMain"></div><div id="coinActions"></div><div id="coinNav"></div></div>`;
 document.body.append(dialog);
 const main=()=>$('coinMain');
 const button=(text,cls,onclick)=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.onclick=onclick;return b};
 const say=text=>{$('coinNote').textContent=text};
 const historyLine=e=>{
  const when=new Date(e.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  if(e.type==='setting'){return[when,'설정',`상한 ${e.cap} · 주급 ${e.weeklyOn?WEEKDAYS[e.weeklyDay]+'요일 '+e.weeklyAmount:'끔'} · 코인 ${e.enabled?'사용':'끔'}`,SOURCE.settings]}
  if(e.type==='reset')return[when,'전체','잔액 초기화',SOURCE.year];
  if(e.amount===undefined)return null;
  return[when,e.name||'',`${signed(e.amount)}${e.game?' · '+e.game:Array.isArray(e.games)?' · '+e.games.join(', '):''}`,SOURCE[e.source]||e.source||''];
 };
 const mine=()=>events.filter(e=>e.cls===roster.cls);
 function render(){
  const st=state();
  $('coinTitle').textContent=`🪙 코인 · ${roster.className||'명단 없음'}${st.settings.enabled?'':' (사용 안 함)'}`;
  const recent=mine().map(historyLine).filter(Boolean).slice(-4).reverse();
  $('coinRecent').replaceChildren(...recent.map(r=>{const li=document.createElement('li');li.textContent=r.join(' · ');return li}));
  const nav=$('coinNav');
  nav.replaceChildren(
   ...[['grant','지급'],['history','히스토리'],['settings','설정']].map(([id,label])=>{const b=button(label,'nav'+(panel===id?' on':''),()=>{panel=id;render()});return b}),
   button('닫기','nav',()=>dialog.close())
  );
  const actions=$('coinActions');actions.replaceChildren();
  if(panel==='grant'&&!st.settings.enabled){
   const note=document.createElement('p');note.textContent='코인이 꺼져 있습니다. 아래 버튼을 누르면 이 반의 미니게임에서 코인을 씁니다.';
   main().replaceChildren(note);
   if(roster.cls)actions.append(button('코인 켜기','act',()=>{const cls=roster.cls;return serial(async()=>{
    try{await load();if(roster.cls!==cls)throw Error('학급이 변경됐어요.');await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',...state().settings,enabled:true,source:'settings'}]);say('코인을 켰습니다.');render()}catch(error){say(error.message)}
   })}));
   return}
  if(!roster.students.length){main().textContent='아직 학생 명단이 없습니다. 교실 매니저에서 칠판으로 보내 주세요.';return}
  if(panel==='grant')renderGrant(st,actions);
  else if(panel==='history')renderHistory();
  else renderSettings(st);
 }
 function renderGrant(st,actions){
  const grid=document.createElement('div');grid.id='coinGrid';
  for(const s of roster.students){
   const bal=C.balanceOf(st,s.id);
   const b=button('','');if(selected.has(s.id))b.classList.add('on');if(bal<0)b.classList.add('minus');
   b.dataset.student=s.id;
   const name=document.createElement('span');name.textContent=s.name;const value=document.createElement('b');value.textContent=coin(bal);
   b.append(name,value);
   b.onclick=()=>{if(selected.has(s.id))selected.delete(s.id);else selected.add(s.id);render()};
   grid.append(b);
  }
  main().replaceChildren(grid);
  actions.append(button(selected.size===roster.students.length?'선택 해제':'전체 선택','nav',()=>{if(selected.size===roster.students.length)selected.clear();else roster.students.forEach(s=>selected.add(s.id));render()}));
  for(const n of [0.5,1,2,5])actions.append(button('+'+n,'act',()=>give(n)));
  for(const n of [-0.5,-1])actions.append(button(String(n),'act neg',()=>give(n)));
 }
 function give(amount){const cls=roster.cls,ids=new Set(selected);return serial(()=>giveNow(amount,cls,ids));}
 async function giveNow(amount,cls,ids){
  try{await load();if(roster.cls!==cls||!state().settings.enabled)throw Error('학급 또는 코인 설정이 변경됐어요.');}catch(error){say(error.message);return}
  const students=roster.students.filter(s=>ids.has(s.id));
  if(!students.length){say('학생을 먼저 고르세요.');return}
  try{
   const {events:list,results}=C.grant(state(),{cls:roster.cls,students,amount,source:'dashboard',at:new Date().toISOString()});
   await append(list);
   const capped=results.filter(r=>r.capped);
   say(capped.length?`상한 때문에 덜 받은 학생: ${capped.map(r=>r.name+' '+signed(r.given)).join(', ')}`:`${students.length}명 ${signed(amount)}`);
   render();
  }catch(error){say(error.message)}
 }
 function renderHistory(){
  const keep=$('coinFilter')?.value||'';
  const filter=document.createElement('select');filter.id='coinFilter';filter.setAttribute('aria-label','경로');
  filter.add(new Option('전체',''));
  for(const [k,v] of Object.entries(SOURCE))filter.add(new Option(v,k));
  filter.value=keep;filter.onchange=render;
  const table=document.createElement('table');table.id='coinHistory';
  const list=mine().filter(e=>!keep||(e.type==='setting'?keep==='settings':e.source===keep)).map(historyLine).filter(Boolean).reverse().slice(0,300);
  for(const row of list){const tr=table.insertRow();row.forEach(v=>{tr.insertCell().textContent=v})}
  main().replaceChildren(filter,table);
 }
 function renderSettings(st){
  const s=st.settings,form=document.createElement('div');form.id='coinSettings';
  const row=(label,input)=>{const l=document.createElement('label');l.textContent=label;l.append(input);form.append(l);return input};
  const num=(id,value,min,max)=>{const i=document.createElement('input');i.type='number';i.id=id;i.value=value;i.min=min;i.max=max;i.step=0.5;return i};
  const on=document.createElement('input');on.type='checkbox';on.id='coinEnabled';on.checked=s.enabled;row('미니게임에 코인 사용',on);
  row('보유 상한',num('coinCap',s.cap,1,999));
  const weekly=document.createElement('input');weekly.type='checkbox';weekly.id='coinWeeklyOn';weekly.checked=s.weeklyOn;row('주급 사용',weekly);
  row('주급',num('coinWeekly',s.weeklyAmount,0,999));
  const day=document.createElement('select');day.id='coinDay';WEEKDAYS.forEach((d,i)=>day.add(new Option(d+'요일',String(i))));day.value=String(s.weeklyDay);row('주급 요일',day);
  form.append(button('저장','act',()=>{const cls=roster.cls;return serial(async()=>{
   const cap=Number($('coinCap').value),amount=Number($('coinWeekly').value);
   if(!(cap>=1)||!(amount>=0)||cap%0.5||amount%0.5){say('상한과 주급은 0.5 단위 숫자로 입력하세요.');return}
   try{
    await load();if(roster.cls!==cls)throw Error('학급이 변경됐어요.');
    await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',enabled:on.checked,cap,weeklyOn:weekly.checked,weeklyAmount:amount,weeklyDay:Number(day.value),source:'settings'}]);
    say('설정을 저장했습니다.');render();
   }catch(error){say(error.message)}
  })}));
  main().replaceChildren(form);
 }
 async function open(){
  panel='grant';selected.clear();say('');
  dialog.showModal();
  await housekeeping();
  render();
 }
 $('openCoins').onclick=()=>void open();

 const MAX_SEATS=40;
 const cleanHof=h=>h&&typeof h.code==='string'?{code:h.code.slice(0,32),teacher:typeof h.teacher==='string'?h.teacher:null,pin:typeof h.pin==='string'?h.pin:null,seats:h.seats&&typeof h.seats==='object'?h.seats:{},keep:h.keep&&typeof h.keep==='object'?h.keep:{}}:null;
 async function sendRoster(reply,readyReq=null){
  let st=state();
  if(st.hof){
   const {seats,changed}=C.assignSeats(st.hof,roster.students,MAX_SEATS);
   if(changed){await append([{at:new Date().toISOString(),cls:roster.cls,type:'hof',hof:{...st.hof,seats},source:'settings'}]);st=state()}
  }
  const hof=st.hof,person=s=>({id:s.id,name:s.name,number:hof?hof.seats[s.id]||null:s.number});
  reply({type:'hoja-roster',readyReq,version:3,classId:roster.cls,enabled:st.settings.enabled,chosen:st.chosen,className:roster.className,floor:C.FLOOR,hofWeeks:C.hofWeeksPaid(events,roster.cls),
   hof:hof&&{code:hof.code,teacher:hof.teacher,pin:hof.pin},names:hof?C.seatNames(hof,roster.students,MAX_SEATS):null,
   everyone:roster.students.map(person),
   students:roster.students.filter(s=>!s.excluded).map(s=>({...person(s),balance:C.balanceOf(st,s.id)}))});
 }
 // Mini games: the page lives on the web, so this window answers for the ledger on this PC.
 window.addEventListener('message',event=>{
  const frame=$('miniFrame');
  if(event.origin!==GAME_ORIGIN||!frame||event.source!==frame.contentWindow||!event.data)return;
  const source=event.source,sessionId=event.data.sessionId;const reply=data=>{if(frame.contentWindow===source)source.postMessage({...data,sessionId},GAME_ORIGIN);};
  const {type}=event.data;
  void serial(async()=>{
  try{
   if(type==='hoja-ready'){
    if(await housekeepingNow())await sendRoster(reply,event.data.readyReq??null);
   }else if(type==='hoja-setup'){
    await load();
    if(!roster.cls||event.data.classId!==roster.cls)return;
    const at=new Date().toISOString(),list=[];
    if(typeof event.data.enabled==='boolean')list.push({at,cls:roster.cls,type:'setting',...state().settings,enabled:event.data.enabled,source:'settings'});
    if('hof' in event.data)list.push({at,cls:roster.cls,type:'hof',hof:cleanHof(event.data.hof),source:'settings'});
    await append(list);
    if(await housekeepingNow())await sendRoster(reply);
   }else if(type==='hoja-coin-spend'){
    await load();
    const {ids,game,txId:charge,classId:cls}=event.data;
    const result=C.checkedSpend(events,roster,{cls,ids,game,charge,at:new Date().toISOString()});
    if(!result.ok){reply({type:'hoja-coin-result',req:event.data.req,ok:false,message:result.message});await sendRoster(reply);return;}
    if(result.duplicate&&roster.cls!==cls){const res=C.originalRefund(events,charge,new Date().toISOString());if(res.ok)await append(res.events);return reply({type:'hoja-coin-result',req:event.data.req,ok:false,message:'학급이 바뀌어 이전 결제를 취소했어요.'});}
    await append(result.events);
    const st=state();
    reply({type:'hoja-coin-result',req:event.data.req,ok:true,classId:cls,charge,price:result.price,balances:Object.fromEntries(ids.map(id=>[id,C.balanceOf(st,id)]))});
   }else if(type==='hoja-hof-week'){
    // Hall of fame weekly settlement from the mini games: amounts are fixed here, and each week is paid once.
    await load();
    if(!roster.cls||event.data.classId!==roster.cls)return reply({type:'hoja-hof-week-result',req:event.data.req,ok:false,message:'학급 명단이 없어요.'});
    const st0=state();
    if(!st0.settings.enabled)return reply({type:'hoja-hof-week-result',req:event.data.req,ok:false,message:'코인이 꺼져 있어요.'});
    const res=C.hofWeek(events,st0,{cls:roster.cls,students:roster.students,week:String(event.data.week||''),awards:event.data.awards,now:new Date()});
    if(!res.ok)return reply({type:'hoja-hof-week-result',req:event.data.req,ok:false,message:res.message});
    await append(res.events);
    const st=state();
    reply({type:'hoja-hof-week-result',req:event.data.req,ok:true,already:res.already,given:res.given,hofWeeks:C.hofWeeksPaid(events,roster.cls),
     balances:Object.fromEntries(roster.students.map(s=>[s.id,C.balanceOf(st,s.id)]))});
    await sendRoster(reply);
   }else if(type==='hoja-coin-refund'){
    await load();
    const res=C.cancelOrRefund(events,{cls:event.data.classId,charge:event.data.charge,at:new Date().toISOString()});
    if(res.ok)await append(res.events);
    const st=C.stateOf(events,res.cls);reply({type:'hoja-refund-result',charge:event.data.charge,ok:res.ok,classId:res.cls,balances:res.ok?st.balances:{}});
   }
  }catch(error){
   console.error(error);
   if(type==='hoja-coin-spend')reply({type:'hoja-coin-result',req:event.data.req,ok:false,retryable:true,message:'코인 처리 결과를 확인하지 못했어요. 다시 확인해 주세요.'});
   if(type==='hoja-coin-refund')reply({type:'hoja-refund-result',charge:event.data.charge,ok:false,retryable:true});
   if(type==='hoja-hof-week')reply({type:'hoja-hof-week-result',req:event.data.req,ok:false,message:'결산 결과를 확인하지 못했어요. 다시 확인해 주세요.'});
  }
  });
 });
 void housekeeping();
 setInterval(housekeeping,10*60000);
})();