// Sends a confirmed seating and coin grants to the classroom dashboard on this PC, through a small window on the dashboard's own address.
// A web page cannot call the local server directly, so that window does the saving and closes itself.
// Sent: what the student screen shows, plus names, attendance numbers and gender. No grades, PE traits or other seating rules.
(()=>{
 'use strict';
 const DASHBOARD='http://127.0.0.1:17439',LINKED='tt.classroom.board-linked',WAIT_MS=4000;
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
  const numbers=new Map((draft?.memberships||[]).filter(m=>m.active&&m.stage03SeatingId).map(m=>[m.stage03SeatingId,m.number]));
  let next=Math.max(0,...numbers.values());
  return classState.students.map(s=>({id:s.id,name:s.name,gender:s.gender,excluded:Boolean(s.assignmentExcluded),number:numbers.get(s.id)??++next}));
 }
 let sending=false;
 // Must start directly inside a click, or the browser blocks the window.
 function viaInbox(makeMessage,onReply,onFail){
  if(sending)return;
  const popup=window.open(`${DASHBOARD}/seating-inbox`,'tt-board-send','width=360,height=160,left=40,top=40');
  if(!popup){onFail('브라우저가 작은 창을 막았습니다. 이 사이트의 팝업을 허용해 주세요.');return}
  sending=true;
  const done=()=>{sending=false;clearTimeout(timer);window.removeEventListener('message',onMessage)};
  const timer=setTimeout(()=>{
   try{popup.close()}catch{}
   done();onFail('대시보드에 연결되지 않습니다. 이 PC에 대시보드가 켜져 있는지 확인해 주세요.');
  },WAIT_MS);
  async function onMessage(event){
   if(event.origin!==DASHBOARD||event.source!==popup||!event.data)return;
   if(event.data.type==='tt-inbox-ready'){
    try{popup.postMessage(await makeMessage(),DASHBOARD)}catch(error){console.error(error);try{popup.close()}catch{}done();onFail('보낼 자료를 만들지 못했습니다.')}
   }else if(event.data.type==='tt-inbox-failed'){done();onFail('보내지 못했습니다. 다시 눌러 주세요.')}
   else if(event.data.type==='tt-inbox-saved'||event.data.type==='tt-inbox-coins'){done();onReply(event.data)}
  }
  window.addEventListener('message',onMessage);
 }
 function sendToBoard(){
  if(!classState.assignments.length){setSaveStatus('확정한 배치가 없어 칠판으로 보내지 못했습니다.','warning');return}
  viaInbox(async()=>{
   const roster=await rosterNow();
   const practice={genderSeats:!classState.rules.completeRandom&&Boolean(classState.rules.genderSeats),genders:Object.fromEntries(roster.map(s=>[s.id,s.gender]))};
   return{type:'tt-seating-send',body:encode(JSON.stringify({...buildPlaybackInput(),classId:cfg.activeId,roster,practice}))};
  },()=>{
   try{localStorage.setItem(LINKED,'1')}catch{}
   setSaveStatus(`칠판으로 보냄 · ${classState.className}`);
  },text=>setSaveStatus(text,'error'));
 }
 send.addEventListener('click',sendToBoard);
 // After the first successful send, confirming a seating sends it too.
 // The app's own handler has already run by the time this listener fires.
 confirmButton.addEventListener('click',()=>{
  let linked=false;try{linked=localStorage.getItem(LINKED)==='1'}catch{}
  if(linked&&!historyView&&classState.assignments.length&&confirmedRevision===previewRevision)sendToBoard();
 });

 // Coin grants: the ledger lives on the dashboard PC, so the results come back from there.
 const dialog=document.createElement('div');dialog.className='tt-lock-settings';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','tt-coin-title');
 dialog.innerHTML=`<div class="tt-lock-settings-card tt-coin-card">
  <h2 id="tt-coin-title">🪙 코인 지급</h2>
  <p>이 PC의 대시보드로 보냅니다. 잔액과 히스토리, 상한과 주급 설정은 대시보드의 코인 앱에서 봅니다.</p>
  <label class="tt-coin-all"><input type="checkbox" id="tt-coin-all"> 전체 선택</label>
  <div id="tt-coin-list" class="tt-coin-list"></div>
  <label>코인 (빼려면 음수, 0.5 단위)<input type="number" id="tt-coin-amount" step="0.5" value="1"></label>
  <p id="tt-coin-result" role="status"></p>
  <div class="tt-lock-settings-actions"><span></span><button type="button" id="tt-coin-close">닫기</button><button type="button" id="tt-coin-send">지급</button></div>
 </div>`;
 document.body.append(dialog);
 const $=id=>document.getElementById(id);
 const boxes=()=>[...dialog.querySelectorAll('[data-coin-student]')];
 coins.addEventListener('click',()=>{
  $('tt-coin-result').textContent='';$('tt-coin-all').checked=false;
  $('tt-coin-list').replaceChildren(...classState.students.map(s=>{
   const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.dataset.coinStudent=s.id;
   label.append(box,document.createTextNode(' '+s.name));return label;
  }));
  dialog.hidden=false;
 });
 $('tt-coin-all').addEventListener('change',event=>{boxes().forEach(b=>{b.checked=event.target.checked})});
 $('tt-coin-close').addEventListener('click',()=>{dialog.hidden=true});
 $('tt-coin-send').addEventListener('click',()=>{
  const amount=Number($('tt-coin-amount').value),result=$('tt-coin-result');
  const ids=boxes().filter(b=>b.checked).map(b=>b.dataset.coinStudent);
  if(!ids.length){result.textContent='학생을 고르세요.';return}
  if(!amount||amount%0.5){result.textContent='코인은 0.5 단위로 입력하세요.';return}
  const students=classState.students.filter(s=>ids.includes(s.id)).map(s=>({id:s.id,name:s.name}));
  viaInbox(()=>({type:'tt-coins-grant',cls:cfg.activeId,students,amount}),reply=>{
   result.textContent=reply.results.map(r=>`${r.name} ${r.given>0?'+':''}${r.given} → ${r.balance}${r.capped?' (상한)':''}`).join(' · ');
  },text=>{result.textContent=text});
 });
})();
