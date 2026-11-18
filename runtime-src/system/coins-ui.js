// Coin app on the dashboard, the weekly allowance, and the link to the mini games.
(()=>{
 'use strict';
 const C=window.TTCoins,GAME_ORIGIN='https://xkdtndbrwk111-prog.github.io';
 const $=id=>document.getElementById(id);
 const SOURCE={dashboard:'대시보드 지급',manager:'교실 매니저',weekly:'주급',game:'게임',refund:'환불',hofweek:'명예의 전당 주간 결산',year:'학년도 초기화',settings:'설정 변경',routine:'루틴 달성'};
 const WEEKDAYS=['일','월','화','수','목','금','토'];
 const coin=n=>String(n);
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
  for(const n of [1,2,4,10])actions.append(button('+'+n,'act',()=>give(n)));
  for(const n of [-1,-2])actions.append(button(String(n),'act neg',()=>give(n)));
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
  const num=(id,value,min,max)=>{const i=document.createElement('input');i.type='number';i.id=id;i.value=value;i.min=min;i.max=max;i.step=1;return i};
  const on=document.createElement('input');on.type='checkbox';on.id='coinEnabled';on.checked=s.enabled;row('미니게임에 코인 사용',on);
  row('보유 상한',num('coinCap',s.cap,1,1998));
  const weekly=document.createElement('input');weekly.type='checkbox';weekly.id='coinWeeklyOn';weekly.checked=s.weeklyOn;row('주급 사용',weekly);
  row('주급',num('coinWeekly',s.weeklyAmount,0,1998));
  const day=document.createElement('select');day.id='coinDay';WEEKDAYS.forEach((d,i)=>day.add(new Option(d+'요일',String(i))));day.value=String(s.weeklyDay);row('주급 요일',day);
  form.append(button('공통 인증번호 변경','nav',async()=>{if(!permit())return;const ok=await window.ttPodo?.changeTeacherPin?.();if(ok){epoch++;lock();say('공통 인증번호가 변경되었습니다. 다시 인증해 주세요.');if(dialog.open)render()}}));
  form.append(button('저장','act',()=>{if(!permit())return;const cls=roster.cls,session=epoch,cap=Number($('coinCap').value),amount=Number($('coinWeekly').value),enabled=on.checked,weeklyOn=weekly.checked,weeklyDay=Number(day.value);return serial(async()=>{
   if(!Number.isSafeInteger(cap)||cap<1||cap>1998||!Number.isSafeInteger(amount)||amount<0||amount>1998){say('상한과 주급은 정수로 입력하세요.');return}
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
  reply({type:'hoja-roster',readyReq,version:4,coinUnit:C.COIN_UNIT,classId:roster.cls,enabled:st.settings.enabled,chosen:st.chosen,className:roster.className,floor:C.FLOOR,hofWeeks:C.hofWeeksPaid(events,roster.cls),tournamentV1:true,teacherPinConfigured:Boolean(window.ttPodo?.hasTeacherPin?.()),
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
    if(event.data.coinProtocol!==4)return;
    if(await housekeepingNow())await sendRoster(reply,event.data.readyReq??null);
   }else if(type==='hoja-tournament-auth'){
    await load();
    const cls=roster.cls,auth=window.ttPodo;
    if(!cls||event.data.classId!==cls||!auth?.hasTeacherPin?.())return reply({type:'hoja-tournament-auth-result',req:event.data.req,ok:false,classId:cls,message:'교사 공통 인증번호를 먼저 설정해 주세요.'});
    const valid=await auth.requestCoinAccess();
    await load();
    if(frame.contentWindow!==source||roster.cls!==cls||!valid?.())return reply({type:'hoja-tournament-auth-result',req:event.data.req,ok:false,classId:roster.cls,message:'교사 인증이 취소되었거나 학급이 변경됐어요.'});
    reply({type:'hoja-tournament-auth-result',req:event.data.req,ok:true,classId:cls});
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
    if(event.data.coinUnit!==C.COIN_UNIT)return reply({type:'hoja-coin-result',req:event.data.req,ok:false,message:'미니게임 최신 버전이 필요합니다. 다시 열어 주세요.'});
    if(window.ttRoutine?.locked?.())return reply({type:'hoja-coin-result',req:event.data.req,ok:false,message:'루틴 시간에는 게임을 이용할 수 없어요.'});
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
    if(event.data.coinUnit!==C.COIN_UNIT)return reply({type:'hoja-hof-week-result',req:event.data.req,ok:false,message:'미니게임 최신 버전이 필요합니다.'});
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
   if(type==='hoja-tournament-auth')reply({type:'hoja-tournament-auth-result',req:event.data.req,ok:false,message:'교사 인증을 확인하지 못했어요.'});
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


 // Independent routine app. The coin ledger is only its durable transaction store.
 (()=>{
 'use strict';
 const C=window.TTCoins,$=id=>document.getElementById(id);
 if(!$('openCoins')||!C?.routineDay)return;
 const app=document.createElement('dialog');app.id='routineApp';app.setAttribute('aria-label','루틴');
 const style=document.createElement('style');style.textContent=`
 #routineApp:modal{width:96vw;height:91dvh;max-width:none;max-height:none;margin:auto;padding:0;border:1px solid var(--border);border-radius:16px;background:var(--tt-modal-panel,var(--panel));color:var(--text-primary);overflow:hidden}
 #routineApp::backdrop{background:#07182099}
 #routineApp *{box-sizing:border-box}
 #routineApp [hidden]{display:none!important}
 #routineApp .r-shell{height:100%;display:flex;flex-direction:column;min-height:0;padding:18px;gap:12px}
 #routineApp .r-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
 #routineApp h2{margin:0;flex:1;font-size:clamp(24px,2vw,36px)}
 #routineApp button,#routineApp input{font:inherit;color:var(--text-primary);background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px;min-height:42px}
 #routineApp button{font-weight:800;cursor:pointer}
 #routineApp button:disabled{cursor:default}
 #routineApp .r-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
 #routineApp table{border-collapse:separate;border-spacing:3px;width:100%;font-size:clamp(15px,1.15vw,21px)}
 #routineApp th,#routineApp td{min-width:56px;text-align:center}
 #routineApp thead th{position:sticky;top:0;background:var(--panel);z-index:2}
 #routineApp th:first-child{min-width:165px;max-width:210px;position:sticky;left:0;text-align:left;background:var(--panel);z-index:1;padding:6px}
 #routineApp thead th:first-child{z-index:3}
 #routineApp th small{display:block;font-size:.8em;font-weight:500}
 #routineApp td button{width:100%;height:54px;padding:2px;min-width:48px;color:var(--text-primary)}
 #routineApp td button.r-yes{background:#23784c;color:#fff}
 #routineApp td button.r-no{background:#af4346;color:#fff}
 #routineApp td button.r-wait{background:var(--surface)}
 #routineApp td button.r-off{background:var(--surface);opacity:.45}
 #routineApp tr.r-active>th,#routineApp tr.r-active>td{outline:2px solid #e9b64c;outline-offset:-1px}
 #routineApp tr.r-active>td button{height:72px}
 #routineApp .r-banner{font-weight:900;font-size:clamp(20px,1.7vw,29px);padding:9px 12px;background:var(--today);border-radius:10px}
 #routineApp .r-editor{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border-bottom:1px solid var(--border)}
 #routineApp .r-editor input[type=text]{min-width:130px;flex:1}
 #routineApp .r-editor label{display:flex;align-items:center;gap:2px}
 #routineApp .r-editor input[type=checkbox]{min-height:24px}
 #routineApp .r-note{font-size:16px;min-height:24px}
 `;document.head.append(style);
 app.innerHTML='<div class="r-shell"><div class="r-top"><h2>오늘의 루틴</h2><input type="date" id="routineDate" aria-label="조회 날짜"><button type="button" id="routineToday">오늘</button><button type="button" id="routineSettings">교사 설정</button><button type="button" id="routineClose">닫기</button></div><div class="r-banner" id="routineBanner"></div><div class="r-note" id="routineNote" role="status"></div><div class="r-scroll" id="routineContent"></div></div>';
 document.body.append(app);
 let launch=$('openRoutine');if(!launch){launch=document.createElement('button');launch.id='openRoutine';launch.dataset.app='routine';launch.textContent='✓ 루틴';$('openCoins').after(launch)}
 let snap=null,shown='',view='today',auth=null,editing=false,lastSignature='',timerBusy=false,queue=Promise.resolve(),stopSent='';
 let miniSession=null;
 window.addEventListener('message',e=>{const frame=$('miniFrame');if(e.origin==='https://xkdtndbrwk111-prog.github.io'&&e.source===frame?.contentWindow&&e.data?.type==='hoja-ready'&&C.validCharge(e.data.sessionId))miniSession=e.data.sessionId;});
 const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p};
 const note=s=>{$('routineNote').textContent=s};
 const now=()=>new Date(),today=()=>C.dayText(now()),clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const getDay=(date=today())=>snap?.roster?.cls?C.routineDay(snap.events,snap.roster.cls,date):null;
 const active=()=>C.routineActive(getDay(),now());
 function locked(){
  if(!snap?.roster?.cls)return false;
  const d=getDay();if(d)return Boolean(active());
  const min=C.minuteOf(now()),day=now().getDay();
  return C.routineConfig(snap.events,snap.roster.cls).some(t=>t.days.includes(day)&&t.start<=min&&min<t.end);
 }
 window.ttRoutine={locked,open:()=>open(),refresh:()=>tick()};
 const guard=e=>{if(!locked())return;const target=e.target.closest?.('#openMiniGames,[data-widget="house"]');if(target){e.preventDefault();e.stopImmediatePropagation();open();}};
 document.addEventListener('click',guard,true);
 function stopLeisure(key){
  if(window.ttHouse?.isOpen?.())window.ttHouse.close();
  const stopKey=key+':'+miniSession;
  if($('miniGames')?.open&&miniSession&&stopSent!==stopKey){
   stopSent=stopKey;$('miniFrame')?.contentWindow?.postMessage({type:'hoja-routine-stop',sessionId:miniSession},'https://xkdtndbrwk111-prog.github.io');
  }
 }
 const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x};
 const btn=(text,fn)=>{const x=el('button',text);x.type='button';x.onclick=fn;return x};
 const teacherValid=()=>Boolean(auth&&auth.cls===snap?.roster?.cls&&auth.valid());
 async function refresh(){const prev=snap?.roster?.cls;snap=await C.snapshot(true);if(prev&&prev!==snap.roster.cls){auth=null;editing=false;view='today';$('routineDate').value=today();lastSignature='';shown='';stopSent='';}}
 async function append(events){if(events.length)await C.commit(snap,events)}
 async function tick(){
  if(timerBusy)return;timerBusy=true;
  try{await serial(async()=>{
   await refresh();if(!snap.roster.cls)return;
   const t=now();await append(C.routineOpen(snap.events,snap.roster,t));
   // Retry unfinished days only within the same school year, using their frozen participants.
   const dates=[...new Set(snap.events.filter(e=>e.cls===snap.roster.cls&&e.type==='routine-open').map(e=>e.date))];
   for(const date of dates){const [y,m,d]=date.split('-').map(Number);if(C.schoolYear(new Date(y,m-1,d))!==C.schoolYear(t))continue;const day=getDay(date);await append(C.routineSettle(snap.events,day,t));}
   const task=active(),key=task?JSON.stringify([snap.roster.cls,today(),task.id]):'';
   if(task){stopLeisure(key);if(shown!==key){shown=key;editing=false;auth=null;view='today';$('routineDate').value=today();if(!app.open)app.showModal();lastSignature='';}}
   else{stopSent='';}
   const button=$('openMiniGames');if(button){button.disabled=locked();button.title=locked()?'루틴 진행 중':''}
   if(app.open&&!editing){const sig=JSON.stringify([snap.revision,snap.roster.cls,view,$('routineDate').value,key,C.minuteOf(t),teacherValid()]);if(sig!==lastSignature){lastSignature=sig;render();}}
  });}catch(e){if(app.open)note(e.message||'루틴 기록을 읽지 못했어요.');}finally{timerBusy=false;}
 }
 function open(){if(!app.open){editing=false;auth=null;view='today';$('routineDate').value=today();lastSignature='';app.showModal()}void tick();if(snap&&!editing)render()}
 launch.onclick=open;
 $('routineClose').onclick=()=>app.close();app.addEventListener('close',()=>{auth=null;editing=false;view='today';lastSignature=''});
 $('routineToday').onclick=()=>{editing=false;view='today';$('routineDate').value=today();render()};
 $('routineDate').onchange=()=>{editing=false;view=$('routineDate').value===today()?'today':'history';render()};
 function runWrite(fn){return serial(async()=>{try{await refresh();const out=fn();await append(out);lastSignature='';if(app.open&&!editing)render();return true;}catch(e){note(e.message||'저장 실패 · 다시 시도해 주세요.');return false;}})}
 function mark(taskId,id,dayDate,cls,teacher){
  return runWrite(()=>{if(snap.roster.cls!==cls||dayDate!==today())throw Error('학급 또는 날짜가 변경됐어요.');const d=getDay();return C.routineMark(d,{task:taskId,student:id,done:!C.routineDone(d,taskId,id),now:now(),teacher:teacher&&teacherValid()});});
 }
 function teacherEvent(type,fields,cls,date){
  return runWrite(()=>{const d=getDay();if(!teacherValid()||!d||d.settled||d.cls!==cls||d.date!==date)throw Error('교사 인증 또는 날짜를 확인해 주세요.');return[{at:now().toISOString(),cls,date,type,...fields}]});
 }
 function render(){
  if(editing)return;
  const content=$('routineContent'),banner=$('routineBanner'),date=$('routineDate').value||today(),d=getDay(date),t=now(),a=date===today()?active():null;
  $('routineDate').max=today();$('routineSettings').textContent=teacherValid()?'설정 / 수정':'교사 설정';
  content.replaceChildren();note('');
  if(!snap?.roster?.students?.length){banner.textContent='학급 명단이 필요해요.';return;}
  const tasks=d?.tasks||C.routineConfig(snap.events,snap.roster.cls).filter(x=>date===today()&&x.days.includes(t.getDay()));
  if(!tasks.length){banner.textContent='설정된 루틴이 없어요.';return;}
  const people=(d?.students||snap.roster.students).slice().sort((x,y)=>Number(x.number||0)-Number(y.number||0)||String(x.name).localeCompare(String(y.name),'ko'));
  const settled=d?.settled;
  banner.textContent=a?a.name+' · '+clock(a.start)+'~'+clock(a.end):settled?'오늘의 루틴 정산 완료':date===today()?'오늘의 루틴 일정':'지난 루틴 기록';
  if(a){const eligible=people.filter(s=>!d.excluded.has(s.id));note(eligible.filter(s=>C.routineDone(d,a.id,s.id)).length+' / '+eligible.length+'명 완료 · 루틴 중 미니게임과 호자의 집은 잠겨 있어요.');}
  const tbl=el('table'),head=tbl.createTHead().insertRow();head.append(el('th','과업 / 시간'));
  for(const s of people){const th=el('th',s.name);if(s.groupName)th.append(el('small',s.groupName));if(d&&date===today()&&teacherValid()&&!settled){th.append(btn(d.excluded.has(s.id)?'복귀':'제외',()=>teacherEvent('routine-exclude',{student:s.id,excluded:!d.excluded.has(s.id)},d.cls,d.date)))}head.append(th);}
  const tbody=tbl.createTBody();
  for(const task of tasks){const row=tbody.insertRow();if(a?.id===task.id)row.classList.add('r-active');const th=el('th',task.name);th.append(el('small',clock(task.start)+'~'+clock(task.end)));
   if(d&&date===today()&&teacherValid()&&!settled){th.append(btn(d.cancelled.has(task.id)?'복원':'취소',()=>teacherEvent('routine-cancel',{task:task.id,cancelled:!d.cancelled.has(task.id)},d.cls,d.date)));}
   row.append(th);
   for(const s of people){const td=row.insertCell(),off=d&&(d.excluded.has(s.id)||d.cancelled.has(task.id)),checked=d&&C.routineDone(d,task.id,s.id),ended=d&&(date<today()||C.minuteOf(t)>=task.end);
    const cell=btn(off?'—':checked?'✓':ended?'×':'·',()=>mark(task.id,s.id,d.date,d.cls,teacherValid()));cell.className=off?'r-off':checked?'r-yes':ended?'r-no':'r-wait';cell.disabled=!d||Boolean(off)||Boolean(settled)||date!==today()||(!teacherValid()&&a?.id!==task.id);cell.setAttribute('aria-label',s.name+' '+task.name+' '+(off?'제외':checked?'완료':ended?'미완료':'대기'));td.append(cell);}
  }content.append(tbl);
  if(settled){const paid=(settled.results||[]).reduce((sum,x)=>sum+x.paid,0);content.append(el('p',settled.coinEnabled?'지급 완료 · 합계 '+paid+'코인':'코인이 꺼져 있어 보상 없이 마감했습니다.'))}
  if(a&&a.id!==app.dataset.active){app.dataset.active=a.id;tbody.querySelector('.r-active')?.scrollIntoView({block:'nearest'});}
 }
 $('routineSettings').onclick=async()=>{
  if(!snap?.roster?.cls){note('학급 명단이 필요해요.');return}
  if(!teacherValid()){const cls=snap.roster.cls;const valid=await window.ttPodo?.requestCoinAccess?.();if(!valid||!app.open||snap.roster.cls!==cls)return;auth={cls,valid};}
  if(editing){editing=false;render();return;}
  editing=true;showEditor();
 };
 function showEditor(){
  const host=$('routineContent');host.replaceChildren();$('routineBanner').textContent='루틴 설정';note('오늘의 루틴이 이미 시작되었다면 변경은 다음 날부터 적용됩니다.');
  const rows=el('div'),weekday=['일','월','화','수','목','금','토'];
  function add(task={id:crypto.randomUUID(),name:'',start:510,end:520,days:[1,2,3,4,5]}){
   const row=el('div',undefined,'r-editor');row.dataset.id=task.id;
   const input=(type,value,label)=>{const i=el('input');i.type=type;i.value=value;i.setAttribute('aria-label',label);return i;};
   row.append(input('text',task.name,'과업 이름'),input('time',clock(task.start),'시작 시각'),input('time',clock(task.end),'종료 시각'));
   weekday.forEach((day,i)=>{const l=el('label',day),cb=input('checkbox','',day);cb.dataset.day=i;cb.checked=task.days.includes(i);l.prepend(cb);row.append(l)});
   row.append(btn('삭제',()=>row.remove()));rows.append(row);
  }
  for(const task of C.routineConfig(snap.events,snap.roster.cls))add(task);
  host.append(rows,btn('과업 추가',()=>add()),btn('저장',()=>{
   const cls=snap.roster.cls;
   const mins=s=>{if(!/^\d\d:\d\d$/.test(s))return NaN;const [h,m]=s.split(':').map(Number);return h*60+m;};
   try{const tasks=C.routineTasks([...rows.children].map(row=>{const [name,start,end]=row.querySelectorAll('input');return{id:row.dataset.id,name:name.value,start:mins(start.value),end:mins(end.value),days:[...row.querySelectorAll('input[type=checkbox]:checked')].map(c=>Number(c.dataset.day))}}));
    void runWrite(()=>{if(!teacherValid()||snap.roster.cls!==cls)throw Error('교사 인증 또는 학급이 변경됐어요.');return[{at:now().toISOString(),cls,type:'routine-config',tasks}]}).then(ok=>{if(ok&&app.open){editing=false;render();void tick()}});
   }catch(e){note(e.message)}
  }),btn('오늘 체크 수정',()=>{editing=false;view='today';$('routineDate').value=today();render()}));
 }
 setInterval(tick,3000);void tick();
 })();
