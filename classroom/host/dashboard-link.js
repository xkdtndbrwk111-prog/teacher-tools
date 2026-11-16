// Sends confirmed seating to the classroom dashboard; coin balances/history/settings only. Direct coin adjustments are made on the board.
// A web page cannot call the local server directly, so that window does the saving and closes itself.
// Sent: what the student screen shows, plus names, attendance numbers and gender. No grades, PE traits or other seating rules.
(()=>{
 'use strict';
 const DASHBOARD='http://127.0.0.1:17439',LINKED='tt.classroom.board-linked',WAIT_MS=10000;
 const cfg=window.__TT_STAGE031_CLASS,store=window.__TT_STORE;
 const actions=document.querySelector('.top-actions'),confirmButton=document.getElementById('confirmAssignment');
 if(!actions||!confirmButton)return;
 const send=document.createElement('button');send.type='button';send.id='tt-send-board';send.className='ghost';send.textContent='칠판으로 보내기';
 const coins=document.createElement('button');coins.type='button';coins.id='tt-coin-open';coins.className='ghost';coins.textContent='🪙 코인';
 actions.append(coins,send);
 const encode=text=>{
  const bytes=new TextEncoder().encode(text);let out='';
  for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(out);
 };
 // Grade numbers belong to the teacher; students not yet in grades follow on after the highest one.
 async function rosterNow(){
  const {schoolYear}=await import(new URL('../classroom/grades/model.mjs',location.href).href);
  const draft=await store.read(`TT_STAGE03_${cfg.installId}_${schoolYear()}`);
  const ids=new Set(classState.students.map(s=>s.id));
  const numbers=new Map((draft?.memberships||[]).filter(m=>m.active&&ids.has(m.stage03SeatingId)&&Number.isInteger(m.number)&&m.number>0).map(m=>[m.stage03SeatingId,m.number]));
  const used=new Set();for(const [id,n] of numbers){if(used.has(n))numbers.delete(id);else used.add(n);}
  let next=1;return classState.students.map(s=>{let number=numbers.get(s.id);if(!number){while(used.has(next))next++;number=next++;used.add(number);}return{id:s.id,name:s.name,gender:s.gender,excluded:Boolean(s.assignmentExcluded),number};});
 }
 let sending=false;
 window.__TT_BOARD_TRANSACTION_BUSY=()=>sending;
 // Must start directly inside a click, or the browser blocks the window.
 function viaInbox(makeMessage,onReply,onFail){
  if(sending)return;
  const popup=window.open(`${DASHBOARD}/seating-inbox`,'tt-board-send','width=360,height=160,left=40,top=40');
  if(!popup){onFail('브라우저가 작은 창을 막았습니다. 이 사이트의 팝업을 허용해 주세요.');return}
  sending=true;let sent=false,finished=false;
  const done=()=>{if(finished)return;finished=true;sending=false;clearTimeout(timer);window.removeEventListener('message',onMessage)};
  const timer=setTimeout(()=>{
   try{popup.close()}catch{}
   done();onFail('대시보드에 연결되지 않습니다. 이 PC에 대시보드가 켜져 있는지 확인해 주세요.');
  },WAIT_MS);
  async function onMessage(event){
   if(event.origin!==DASHBOARD||event.source!==popup||!event.data)return;
   if(event.data.type==='tt-inbox-ready'){
    if(sent)return;sent=true;
    try{const msg=await makeMessage();if(!finished)popup.postMessage(msg,DASHBOARD)}catch(error){console.error(error);try{popup.close()}catch{}done();onFail('보낼 자료를 만들지 못했습니다.')}
   }else if(event.data.type==='tt-inbox-failed'){done();onFail(event.data.message||'보내지 못했습니다. 다시 눌러 주세요.',event.data)}
   else if(['tt-inbox-saved','tt-inbox-coins','tt-inbox-coin-state'].includes(event.data.type)){done();onReply(event.data)}
  }
  window.addEventListener('message',onMessage);
 }
 const markLinked=()=>{try{localStorage.setItem(LINKED,'1')}catch{}};
 function sendToBoard(){
  if(send.disabled){setSaveStatus('Windows 대시보드 배경화면에 연결되지 않았습니다.','warning');return}
  if(historyView||confirmedRevision!==previewRevision||!classState.assignments.length){setSaveStatus('확정한 배치가 없어 칠판으로 보내지 못했습니다.','warning');return}
  viaInbox(async()=>{
   const roster=await rosterNow();
   const practice={genderSeats:!classState.rules.completeRandom&&Boolean(classState.rules.genderSeats),genders:Object.fromEntries(roster.map(s=>[s.id,s.gender]))};
   return{type:'tt-seating-send',body:encode(JSON.stringify({...buildPlaybackInput(),classId:cfg.activeId,roster,practice}))};
  },()=>{
   markLinked();
   setSaveStatus(`칠판으로 보냄 · ${classState.className}`);
  },text=>setSaveStatus(text,'error'));
 }
 send.addEventListener('click',sendToBoard);
 // After the first successful send, confirming a seating sends it too.
 // The app's own handler has already run by the time this listener fires.
 confirmButton.addEventListener('click',()=>{
  let linked=false;try{linked=localStorage.getItem(LINKED)==='1'}catch{}
  if(linked&&!send.disabled&&!historyView&&classState.assignments.length&&confirmedRevision===previewRevision)sendToBoard();
 });

 // Coins: the ledger lives on the dashboard PC, so balances, history and settings come back from there.
 const SOURCE={dashboard:'대시보드 지급',manager:'교실 매니저',weekly:'주급',game:'게임',refund:'환불',hofweek:'명예의 전당 주간 결산',year:'학년도 초기화',settings:'설정 변경'};
 const WEEKDAYS=['일','월','화','수','목','금','토'];
 const coin=n=>(Number.isInteger(n)?String(n):n.toFixed(1));
 const signed=n=>(n>0?'+':'')+coin(n);
 const style=document.createElement('style');
 style.textContent=`.tt-coin-card{max-height:90vh;overflow:auto}
.tt-coin-nav{display:flex;gap:6px;margin:8px 0}
.tt-coin-nav button{min-height:40px;padding:6px 12px;border-radius:8px}
.tt-coin-nav button.on{font-weight:800;outline:2px solid currentColor}
.tt-coin-card .tt-coin-balance-row{display:flex;align-items:center;gap:8px;margin:0;min-height:36px}
.tt-coin-card #tt-coin-settings-panel input[type=checkbox]{flex:none;width:22px;height:22px;margin:0;padding:0}
.tt-coin-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px;margin:8px 0}
.tt-coin-list b{margin-left:auto}
.tt-coin-list b.minus{color:#b91c1c}
.tt-coin-scroll{max-height:45vh;overflow:auto;margin-top:8px}
#tt-coin-history-table{width:100%;border-collapse:collapse}
#tt-coin-history-table td{padding:4px 6px;border-bottom:1px solid #d6d3cb;text-align:left}
#tt-coin-history-table td:nth-child(1),#tt-coin-history-table td:nth-child(2),#tt-coin-history-table td:nth-child(4){white-space:nowrap}
.tt-coin-card #tt-coin-settings-panel label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0;white-space:nowrap}
.tt-coin-card #tt-coin-settings-panel input[type=number],.tt-coin-card #tt-coin-settings-panel select{flex:none;width:120px;margin:0}
#tt-coin-save{min-height:44px;width:100%;margin-top:4px}`;
 document.head.append(style);
 const dialog=document.createElement('div');dialog.className='tt-lock-settings';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','tt-coin-title');
 dialog.innerHTML=`<div class="tt-lock-settings-card tt-coin-card">
  <h2 id="tt-coin-title">🪙 코인</h2>
  <p id="tt-coin-board-context" role="status">호자보드 학급을 확인해 주세요.</p>
  <div class="tt-coin-nav"><button type="button" data-coin-panel="balance">잔액</button><button type="button" data-coin-panel="history">히스토리</button><button type="button" data-coin-panel="settings">설정</button><button type="button" id="tt-coin-refresh">불러오기</button><button type="button" id="tt-coin-retry" hidden>이전 작업 확인</button></div>
  <div id="tt-coin-balance-panel">
   <p>코인 지급·차감은 호자보드에서만 할 수 있습니다.</p>
   <div id="tt-coin-list" class="tt-coin-list"></div>
  </div>
  <div id="tt-coin-history-panel" hidden>
   <select id="tt-coin-filter" aria-label="경로"></select>
   <div class="tt-coin-scroll"><table id="tt-coin-history-table"></table></div>
  </div>
  <div id="tt-coin-settings-panel" hidden>
   <label>미니게임에 코인 사용<input type="checkbox" id="tt-coin-enabled"></label>
   <label>보유 상한<input type="number" id="tt-coin-cap" min="1" max="999" step="0.5"></label>
   <label>주급 사용<input type="checkbox" id="tt-coin-weekly-on"></label>
   <label>주급<input type="number" id="tt-coin-weekly" min="0" max="999" step="0.5"></label>
   <label>주급 요일<select id="tt-coin-day"></select></label>
   <button type="button" id="tt-coin-save">설정 저장</button>
  </div>
  <p id="tt-coin-result" role="status"></p>
  <div class="tt-lock-settings-actions"><span></span><button type="button" id="tt-coin-close">닫기</button></div>
 </div>`;
 document.body.append(dialog);
 const $=id=>document.getElementById(id);
 const say=text=>{$('tt-coin-result').textContent=text};
 let ledger=null,panel='balance';
 const pendingKey='tt.board.coin.pending.'+cfg.activeId;
 let pending=null;try{const p=JSON.parse(sessionStorage.getItem(pendingKey)||'null');if(p?.cls===cfg.activeId&&p.type==='tt-coins-setting'&&typeof p.requestId==='string')pending=p;else if(p?.cls===cfg.activeId&&p.type==='tt-coins-grant')sessionStorage.removeItem(pendingKey);}catch{}
 const persistPending=p=>{pending=p;try{if(p)sessionStorage.setItem(pendingKey,JSON.stringify(p));else sessionStorage.removeItem(pendingKey);}catch{}};
 const matched=()=>ledger?.protocol>=3&&ledger.boardCls===cfg.activeId;
 function syncActions(){
  const can=matched()&&!sending&&!pending;
  $('tt-coin-save').disabled=!can;
  $('tt-coin-retry').hidden=!pending;$('tt-coin-retry').disabled=sending||!matched();
  $('tt-coin-board-context').textContent=!ledger?'호자보드 학급을 확인해 주세요.':ledger.protocol<3?'R7 호자보드가 필요합니다. 잔액 조회만 가능합니다.':matched()?('연결됨 · '+(ledger.boardClassName||classState.className)):('호자보드: '+(ledger.boardClassName||'미연결')+' / 교실매니저: '+classState.className+' · 현재 반을 칠판으로 보내 주세요.');
 }
 const filter=$('tt-coin-filter');
 filter.add(new Option('전체',''));
 for(const [key,label] of Object.entries(SOURCE))filter.add(new Option(label,key));
 WEEKDAYS.forEach((day,i)=>$('tt-coin-day').add(new Option(day+'요일',String(i))));
 const historyRow=e=>{
  const when=new Date(e.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  if(e.type==='setting')return[when,'설정',`상한 ${e.cap} · 주급 ${e.weeklyOn?WEEKDAYS[e.weeklyDay]+'요일 '+e.weeklyAmount:'끔'} · 코인 ${e.enabled?'사용':'끔'}`,SOURCE.settings];
  if(e.type==='reset')return[when,'전체','잔액 초기화',SOURCE.year];
  if(e.amount===undefined)return null;
  return[when,e.name||'',`${signed(e.amount)}${e.game?' · '+e.game:Array.isArray(e.games)?' · '+e.games.join(', '):''}`,SOURCE[e.source]||e.source||''];
 };
 function renderList(){
  $('tt-coin-list').replaceChildren(...classState.students.map(s=>{
   const label=document.createElement('div');label.className='tt-coin-balance-row';label.append(document.createTextNode(s.name));
   if(ledger){const value=ledger.state.balances[s.id]||0,b=document.createElement('b');b.dataset.coinBalance=s.id;b.textContent=coin(value);b.classList.toggle('minus',value<0);label.append(b)}
   return label;
  }));
 }
 function renderHistory(){
  const table=$('tt-coin-history-table');table.replaceChildren();
  const keep=filter.value;
  const rows=(ledger?.events||[]).filter(e=>!keep||(e.type==='setting'?keep==='settings':e.source===keep)).map(historyRow).filter(Boolean).reverse();
  for(const row of rows){const tr=table.insertRow();row.forEach(v=>{tr.insertCell().textContent=v})}
  if(!rows.length){table.insertRow().insertCell().textContent=ledger?'기록이 없습니다.':'불러오기를 눌러 주세요.'}
 }
 function renderSettings(){
  const s=ledger?.state.settings;
  for(const id of ['tt-coin-enabled','tt-coin-cap','tt-coin-weekly-on','tt-coin-weekly','tt-coin-day','tt-coin-save'])$(id).disabled=!s;
  syncActions();if(!s)return;
  $('tt-coin-enabled').checked=s.enabled;$('tt-coin-cap').value=s.cap;$('tt-coin-weekly-on').checked=s.weeklyOn;$('tt-coin-weekly').value=s.weeklyAmount;$('tt-coin-day').value=String(s.weeklyDay);
 }
 function showPanel(next){
  panel=next;
  for(const id of ['balance','history','settings'])$(`tt-coin-${id}-panel`).hidden=id!==panel;
  dialog.querySelectorAll('[data-coin-panel]').forEach(b=>b.classList.toggle('on',b.dataset.coinPanel===panel));
 }
 const applyLedger=reply=>{if(reply.state){ledger={state:reply.state,events:reply.events||[],protocol:Number(reply.protocol)||0,boardCls:reply.boardCls,boardClassName:reply.boardClassName};markLinked();renderList();renderHistory();renderSettings()}};
 // One small window at a time, so the buttons wait for it.
 function exchange(message,onReply){
  if(sending){say('대시보드와 연결 중입니다. 잠시 후 다시 눌러 주세요.');return}
  if(!['tt-coins-read','tt-coins-setting'].includes(message.type)){say('지원하지 않는 코인 요청입니다.');return;}
  const write=message.type!=='tt-coins-read';
  if(write&&(!matched()||message.cls!==cfg.activeId)){say('현재 반을 칠판으로 보내고 다시 불러와 주세요.');return;}
  if(write&&pending&&message.requestId!==pending.requestId){say('이전 작업 확인을 먼저 눌러 주세요.');return;}
  if(write)persistPending(message);
  const busy=['tt-coin-refresh','tt-coin-save','tt-coin-retry'].map($);
  busy.forEach(b=>{b.disabled=true});
  const finish=()=>{$('tt-coin-refresh').disabled=false;renderSettings();syncActions()};
  viaInbox(()=>message,reply=>{
   if(write&&reply.requestId!==message.requestId){finish();say('이전 작업의 응답을 확인하지 못했습니다.');return;}
   if(write)persistPending(null);
   applyLedger(reply);finish();onReply(reply);
  },(text,reply)=>{
   if(write&&reply?.requestId===message.requestId&&reply.definitive)persistPending(null);
   if(reply?.state)applyLedger(reply);finish();say(text+(pending?' · 이전 작업 확인으로 같은 요청만 재시도하세요.':''));
  });
 }
 const writeRequest=(type,details,onReply)=>exchange({type,cls:cfg.activeId,requestId:crypto.randomUUID(),...details},onReply);
 const refresh=()=>exchange({type:'tt-coins-read',cls:cfg.activeId},()=>{say(pending?'이전 작업 확인을 눌러 처리 결과를 확인하세요.':matched()&&!ledger.state.settings.enabled?'코인이 꺼져 있습니다. 지급·차감은 호자보드에서 관리합니다.':'')});
 coins.addEventListener('click',()=>{
  say('');ledger=null;
  $('tt-coin-list').replaceChildren();renderList();renderHistory();renderSettings();showPanel('balance');
  dialog.hidden=false;
  let linked=false;try{linked=localStorage.getItem(LINKED)==='1'}catch{}
  if(linked)refresh();else say('잔액을 보려면 불러오기를 누르세요. 대시보드가 켜져 있어야 합니다.');
 });
 dialog.querySelectorAll('[data-coin-panel]').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.coinPanel)));
 filter.addEventListener('change',renderHistory);
 $('tt-coin-refresh').addEventListener('click',refresh);
 $('tt-coin-retry').addEventListener('click',()=>{if(pending)exchange(pending,()=>say('이전 코인 작업을 확인했습니다.'));});
 $('tt-coin-close').addEventListener('click',()=>{dialog.hidden=true});
 $('tt-coin-save').addEventListener('click',()=>{
  const cap=Number($('tt-coin-cap').value),weeklyAmount=Number($('tt-coin-weekly').value);
  if(!(cap>=1)||!(weeklyAmount>=0)||cap%0.5||weeklyAmount%0.5){say('상한과 주급은 0.5 단위 숫자로 입력하세요.');return}
  const settings={enabled:$('tt-coin-enabled').checked,cap,weeklyOn:$('tt-coin-weekly-on').checked,weeklyAmount,weeklyDay:Number($('tt-coin-day').value)};
  writeRequest('tt-coins-setting',{settings},()=>{say('설정을 저장했습니다.')});
 });
})();
