// Coin app on the dashboard, the weekly allowance, and the link to the mini games.
(()=>{
 'use strict';
 const C=window.TTCoins,GAME_ORIGIN='https://xkdtndbrwk111-prog.github.io';
 const $=id=>document.getElementById(id);
 const SOURCE={dashboard:'대시보드 지급',manager:'교실 매니저',weekly:'주급',game:'게임',refund:'환불',hofweek:'명예의 전당 주간 결산',year:'학년도 초기화',settings:'설정 변경'};
 const WEEKDAYS=['일','월','화','수','목','금','토'];
 const coin=n=>(Number.isInteger(n)?String(n):n.toFixed(1));
 const signed=n=>(n>0?'+':'')+coin(n);
 let events=[],roster={cls:'',className:'',students:[]},selected=new Set(),panel='view',access=null,epoch=0,authPending=false,filterValue='';
 const state=()=>C.stateOf(events,roster.cls);
 let snap=null,queue=Promise.resolve();
 function serial(fn){const next=queue.then(fn);queue=next.catch(()=>{});return next;}
 async function load(){snap=await C.snapshot(true);events=snap.events;if(roster.cls!==snap.roster.cls){lock();epoch++;}roster=snap.roster;}
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
 style.textContent=`#coinApp:modal{position:fixed!important;inset:0!important;margin:auto!important;transform:none!important;width:min(1240px,92vw);height:min(860px,90dvh);max-width:none;max-height:none;padding:0;border:1px solid var(--border);border-radius:18px;background:var(--tt-modal-panel,var(--panel));color:var(--text-primary);box-shadow:0 18px 60px #0008;overflow:hidden}
#coinApp::backdrop{background:#07182099}
#coinApp [hidden]{display:none!important}
#coinBody{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;gap:0}
#coinTop{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);flex:none}
#coinTitle{font-size:clamp(20px,1.6vw,30px);font-weight:900;margin:0}
#coinNav{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}
#coinNote{padding:7px 20px;min-height:32px;font-size:clamp(14px,1.1vw,19px);font-weight:750;color:var(--text-primary)}
#coinColumns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.18fr);gap:12px;flex:1;min-height:0;padding:0 14px 14px}
#coinHistoryPane,#coinRosterPane{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}
.coin-pane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);font-weight:900;font-size:clamp(17px,1.3vw,23px)}
#coinHistoryList,#coinMain{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:10px}
#coinGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(106px,1fr));gap:8px;align-content:start}
#coinGrid .coin-student{min-height:68px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:7px;border:1px solid var(--border);border-radius:10px;background:var(--panel);color:var(--text-primary);font-size:clamp(15px,1.1vw,20px);font-weight:750;min-width:0;overflow-wrap:anywhere}
#coinGrid .coin-student b{font-size:clamp(22px,1.7vw,30px);font-weight:900;color:var(--text-primary)}
#coinGrid .coin-student.minus b{color:var(--text-alert)}
body[data-theme=black] #coinGrid .coin-student.minus b{color:var(--text-alert)}
#coinGrid button.coin-student.on{outline:3px solid var(--accent);outline-offset:-3px;background:var(--today)}
#coinGrid button.coin-student:hover{filter:brightness(.95)}
#coinActions{display:flex;flex-wrap:wrap;gap:7px;padding:10px;border-top:1px solid var(--border);justify-content:center}
#coinActions:empty{display:none}
#coinApp button.nav,#coinApp button.act{min-height:44px;padding:8px 14px;font-weight:800;font-size:clamp(15px,1.15vw,20px);border:1px solid var(--border);border-radius:10px;background:var(--control);color:var(--text-on-fill)}
#coinApp button.act{min-width:56px;background:var(--accent);color:var(--text-on-fill)}
#coinApp button.act.neg{background:#98514f;color:var(--text-on-fill)}
#coinApp button.nav.on{background:var(--today);color:var(--text-primary);outline:2px solid var(--accent);outline-offset:-2px}
#coinFilter{max-width:58%;min-height:38px;padding:4px 6px;background:var(--panel);color:var(--text-primary);border:1px solid var(--border);border-radius:8px;font:inherit;font-size:15px}
#coinHistory{width:100%;border-collapse:collapse;table-layout:fixed;color:var(--text-primary);font-size:clamp(15px,1.15vw,20px);line-height:1.3}
#coinHistory td{padding:9px 4px;border-bottom:1px solid var(--border);text-align:left;color:var(--text-primary);overflow-wrap:anywhere;vertical-align:top}
#coinHistory td:first-child{width:29%;font-size:.88em;font-weight:600}
#coinHistory td:nth-child(2){width:20%;font-weight:850}
#coinHistory td:nth-child(3){width:51%;font-weight:800}
#coinHistory small{display:block;color:var(--text-primary);font-size:.82em;font-weight:500;opacity:.88;margin-top:2px}
#coinSettings{display:grid;gap:14px;font-size:clamp(16px,1.3vw,22px)}
#coinSettings label{display:flex;align-items:center;justify-content:space-between;gap:12px}
#coinSettings input[type=number],#coinSettings select{width:112px;min-height:46px;font-size:20px;text-align:center;background:var(--panel);color:var(--text-primary);border:1px solid var(--border);border-radius:8px}
#coinSettings input[type=checkbox]{width:28px;height:28px}
@media(max-width:760px){#coinApp:modal{width:96vw;height:94dvh}#coinTop{flex-wrap:wrap;padding:10px}#coinColumns{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:0 8px 8px;gap:6px}#coinGrid{grid-template-columns:repeat(auto-fill,minmax(74px,1fr))}#coinHistory td{padding:6px 2px;font-size:13px}#coinActions{padding:6px;gap:4px}}
`;
 document.head.append(style);
 const dialog=document.createElement('dialog');dialog.id='coinApp';dialog.setAttribute('aria-labelledby','coinTitle');
 dialog.innerHTML=`<div id="coinBody"><div id="coinTop"><h2 id="coinTitle">🪙 코인</h2><div id="coinNav"></div></div><div id="coinNote" role="status"></div><div id="coinColumns"><section id="coinHistoryPane" aria-label="히스토리"><div class="coin-pane-head">히스토리<select id="coinFilter" aria-label="기록 종류"></select></div><div id="coinHistoryList"></div></section><section id="coinRosterPane" aria-label="학생 코인"><div class="coin-pane-head" id="coinRosterTitle">학생 코인</div><div id="coinMain"></div><div id="coinActions"></div></section></div></div>`;
 document.body.append(dialog);
 const main=()=>$('coinMain');
 const button=(text,cls,onclick)=>{const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.onclick=onclick;return b};
 const filter=$('coinFilter');filter.add(new Option('전체',''));for(const [k,v] of Object.entries(SOURCE))filter.add(new Option(v,k));filter.onchange=()=>{filterValue=filter.value;renderHistory()};
 function lock(){access=null;panel='view';selected.clear()}
 function authorized(){return Boolean(dialog.open&&access&&access.cls===roster.cls&&access.epoch===epoch&&access.valid())}
 function permit(){if(authorized())return true;lock();say('교사 인증이 필요합니다.');if(dialog.open)render();return false}
 async function teacherPanel(next){
  if(!dialog.open||authPending)return;
  if(authorized()){panel=next;render();return}
  const auth=window.ttPodo;if(!auth?.requestCoinAccess){say('공통 교사 인증을 불러오지 못했습니다.');return}
  const session=epoch,cls=roster.cls;authPending=true;
  try{const valid=await auth.requestCoinAccess();if(!valid||!dialog.open||epoch!==session||roster.cls!==cls)return;access={valid,cls,epoch:session};panel=next;say('교사 모드 · 닫으면 자동으로 잠깁니다.');render()}finally{authPending=false}
 }
 dialog.addEventListener('close',()=>{epoch++;lock()});
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
  if(panel!=='view'&&!authorized())lock();
  const nav=$('coinNav');nav.replaceChildren(
   button('코인 지급','nav'+(panel==='grant'?' on':''),()=>teacherPanel('grant')),
   button('설정','nav'+(panel==='settings'?' on':''),()=>teacherPanel('settings')),
   ...(authorized()?[button('잠그기','nav',()=>{epoch++;lock();say('조회 전용');render()})]:[]),
   button('닫기','nav',()=>dialog.close()));
  renderHistory();
  $('coinRosterTitle').textContent=panel==='settings'?'코인 설정':panel==='grant'?'학생 선택 · 지급 및 회수':'학생 코인';
  const actions=$('coinActions');actions.replaceChildren();
  if(panel==='grant'&&!st.settings.enabled){
   const note=document.createElement('p');note.textContent='코인이 꺼져 있습니다. 아래 버튼을 누르면 이 반의 미니게임에서 코인을 씁니다.';
   main().replaceChildren(note);
   if(roster.cls)actions.append(button('코인 켜기','act',()=>{if(!permit())return;const cls=roster.cls,session=epoch;return serial(async()=>{
    try{await load();if(epoch!==session||!permit()||roster.cls!==cls)throw Error('교사 인증 또는 학급이 변경됐어요.');await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',...state().settings,enabled:true,source:'settings'}]);say('코인을 켰습니다.');render()}catch(error){say(error.message)}
   })}));
   return}
  if(!roster.students.length){main().textContent='아직 학생 명단이 없습니다. 교실 매니저에서 칠판으로 보내 주세요.';return}
  if(panel==='settings')renderSettings(st);else renderGrant(st,actions,panel==='grant'&&authorized());
 }
 function renderGrant(st,actions,editable){
  const grid=document.createElement('div');grid.id='coinGrid';
  for(const s of roster.students){
   const bal=C.balanceOf(st,s.id);
   const b=editable?button('','coin-student'):document.createElement('div');b.classList.add('coin-student');if(editable&&selected.has(s.id))b.classList.add('on');if(bal<0)b.classList.add('minus');
   b.dataset.student=s.id;
   const name=document.createElement('span');name.textContent=s.name;const value=document.createElement('b');value.textContent=coin(bal);
   b.append(name,value);
   if(editable)b.onclick=()=>{if(!permit())return;if(selected.has(s.id))selected.delete(s.id);else selected.add(s.id);render()};
   grid.append(b);
  }
  main().replaceChildren(grid);
  if(!editable)return;
  actions.append(button(selected.size===roster.students.length?'선택 해제':'전체 선택','nav',()=>{if(!permit())return;if(selected.size===roster.students.length)selected.clear();else roster.students.forEach(s=>selected.add(s.id));render()}));
  for(const n of [0.5,1,2,5])actions.append(button('+'+n,'act',()=>give(n)));
  for(const n of [-0.5,-1])actions.append(button(String(n),'act neg',()=>give(n)));
 }
 function give(amount){if(!permit())return;const cls=roster.cls,ids=new Set(selected),session=epoch;return serial(()=>giveNow(amount,cls,ids,session));}
 async function giveNow(amount,cls,ids,session){
  try{await load();if(epoch!==session||!permit()||roster.cls!==cls||!state().settings.enabled)throw Error('학급 또는 코인 설정이 변경됐어요.');}catch(error){say(error.message);return}
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
  const host=$('coinHistoryList'),top=host.scrollTop;
  const table=document.createElement('table');table.id='coinHistory';
  const list=mine().filter(e=>!filterValue||(e.type==='setting'?filterValue==='settings':e.source===filterValue)).map(historyLine).filter(Boolean).reverse().slice(0,300);
  for(const row of list){const tr=table.insertRow();tr.insertCell().textContent=row[0];tr.insertCell().textContent=row[1];const td=tr.insertCell();td.textContent=row[2];const source=document.createElement('small');source.textContent=row[3];td.append(source)}
  if(list.length)host.replaceChildren(table);else host.textContent='아직 기록이 없습니다.';
  host.scrollTop=top;
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
  form.append(button('공통 인증번호 변경','nav',async()=>{if(!permit())return;const ok=await window.ttPodo?.changeTeacherPin?.();if(ok){epoch++;lock();say('공통 인증번호가 변경되었습니다. 다시 인증해 주세요.');if(dialog.open)render()}}));
  form.append(button('저장','act',()=>{if(!permit())return;const cls=roster.cls,session=epoch,cap=Number($('coinCap').value),amount=Number($('coinWeekly').value),enabled=on.checked,weeklyOn=weekly.checked,weeklyDay=Number(day.value);return serial(async()=>{
   if(!(cap>=1)||!(amount>=0)||cap%0.5||amount%0.5){say('상한과 주급은 0.5 단위 숫자로 입력하세요.');return}
   try{
    await load();if(epoch!==session||!permit()||roster.cls!==cls)throw Error('교사 인증 또는 학급이 변경됐어요.');
    await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',enabled,cap,weeklyOn,weeklyAmount:amount,weeklyDay,source:'settings'}]);
    say('설정을 저장했습니다.');render();
   }catch(error){say(error.message)}
  })}));
  main().replaceChildren(form);
 }
 async function open(){
  if(dialog.open)return;epoch++;lock();filterValue='';filter.value='';say('조회 전용');
  dialog.showModal();
  await housekeeping();
  if(dialog.open)render();
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
  // A cached pre-V3 game lacks the session and must not reach the ledger.
  if(typeof event.data.sessionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.data.sessionId))return;
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
 setInterval(()=>{if(dialog.open)void serial(async()=>{try{const oldCls=roster.cls,rev=snap?.revision;await load();if(oldCls!==roster.cls||rev!==snap.revision||panel!=='view'&&!authorized())render()}catch(error){say(error.message)}})},5000);
})();
