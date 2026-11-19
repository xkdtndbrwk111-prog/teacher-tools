// Sends confirmed seating and the current class roster to the classroom dashboard.
// A web page cannot call the local server directly, so that window does the saving and closes itself.
// Sent: what the student screen shows, plus names, attendance numbers and gender. No grades, PE traits or other seating rules.
(()=>{
 'use strict';
 const DASHBOARD='http://127.0.0.1:17439',LINKED='tt.classroom.board-linked',WAIT_MS=4000;
 const cfg=window.__TT_STAGE031_CLASS,store=window.__TT_STORE;
 const actions=document.querySelector('.top-actions'),confirmButton=document.getElementById('confirmAssignment');
 if(!actions||!confirmButton)return;
 const send=document.createElement('button');send.type='button';send.id='tt-send-board';send.className='ghost';send.textContent='칠판으로 보내기';
 actions.append(send);
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
   }else if(event.data.type==='tt-inbox-failed'){done();onFail(event.data.message||'보내지 못했습니다. 다시 눌러 주세요.')}
   else if(event.data.type==='tt-inbox-saved'){done();onReply(event.data)}
  }
  window.addEventListener('message',onMessage);
 }
 const markLinked=()=>{try{localStorage.setItem(LINKED,'1')}catch{}};
 function sendToBoard(){
  if(send.disabled){setSaveStatus('호자보드에 연결되지 않았습니다.','warning');return}
  if(!classState.assignments.length){setSaveStatus('확정한 배치가 없어 칠판으로 보내지 못했습니다.','warning');return}
  viaInbox(async()=>{
   const roster=await rosterNow(),playback=buildPlaybackInput();
   const bySeat=new Map();for(const g of playback.groups||[])for(const id of g.seatIds||[])bySeat.set(id,g);
   const byStudent=new Map((playback.assignments||[]).map(a=>[a.studentId,bySeat.get(a.seatId)]));
   for(const s of roster){const g=byStudent.get(s.id);s.groupId=g?.id||null;s.groupName=g?.name||null;}
   const practice={genderSeats:!classState.rules.completeRandom&&Boolean(classState.rules.genderSeats),genders:Object.fromEntries(roster.map(s=>[s.id,s.gender]))};
   return{type:'tt-seating-send',body:encode(JSON.stringify({...playback,classId:cfg.activeId,roster,practice,groupProtocol:1}))};
  },()=>{
   markLinked();
   setSaveStatus(`칠판으로 보냄 · ${classState.className}`);
  },text=>setSaveStatus(text,'error'));
 }
 send.addEventListener('click',sendToBoard);
 // Do not mark a roster-only transfer as confirmed seating auto-send.
 function sendRoster(){
  if(!window.__TT_BOARD_CONNECTION?.rosterReady()){setSaveStatus('호자보드 연결 및 업데이트를 확인해 주세요.','warning');return}
  if(!classState.students.length){setSaveStatus('보낼 학생 명단이 없습니다.','warning');return}
  viaInbox(async()=>({type:'tt-roster-send',body:encode(JSON.stringify({rosterProtocol:1,classId:cfg.activeId,className:classState.className,roster:await rosterNow()}))}),
   ()=>setSaveStatus('학생 명단 보냄 · '+classState.className),text=>setSaveStatus(text,'error'));
 }
 window.__TT_SEND_ROSTER=sendRoster;
 // After the first successful send, confirming a seating sends it too.
 // The app's own handler has already run by the time this listener fires.
 confirmButton.addEventListener('click',()=>{
  let linked=false;try{linked=localStorage.getItem(LINKED)==='1'}catch{}
  if(linked&&!send.disabled&&!historyView&&classState.assignments.length&&confirmedRevision===previewRevision)sendToBoard();
 });
})();
