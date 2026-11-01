// Sends a confirmed seating to the classroom dashboard on this PC, through a small window on the dashboard's own address.
// A web page cannot call the local server directly, so that window does the saving and closes itself.
// Sent: what the student screen shows, plus gender for the practice mode's seat rule. No grades, PE traits or other seating rules.
(()=>{
 'use strict';
 const DASHBOARD='http://127.0.0.1:17439',LINKED='tt.classroom.board-linked',WAIT_MS=4000;
 const actions=document.querySelector('.top-actions'),confirmButton=document.getElementById('confirmAssignment');
 if(!actions||!confirmButton)return;
 const send=document.createElement('button');send.type='button';send.id='tt-send-board';send.className='ghost';send.textContent='칠판으로 보내기';
 actions.append(send);
 const encode=text=>{
  const bytes=new TextEncoder().encode(text);let out='';
  for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(out);
 };
 let sending=false;
 // Must run directly inside a click, or the browser blocks the window.
 function sendToBoard(){
  if(sending)return;
  if(!classState.assignments.length){setSaveStatus('확정한 배치가 없어 칠판으로 보내지 못했습니다.','warning');return}
  const practice={genderSeats:!classState.rules.completeRandom&&Boolean(classState.rules.genderSeats),genders:Object.fromEntries(classState.students.map(s=>[s.id,s.gender]))};
  const body=encode(JSON.stringify({...buildPlaybackInput(),practice}));
  const popup=window.open(`${DASHBOARD}/seating-inbox`,'tt-board-send','width=360,height=160,left=40,top=40');
  if(!popup){setSaveStatus('브라우저가 작은 창을 막았습니다. 이 사이트의 팝업을 허용해 주세요.','error');return}
  sending=true;
  const finish=(text,kind,linked)=>{
   sending=false;clearTimeout(timer);window.removeEventListener('message',onMessage);
   try{if(linked)localStorage.setItem(LINKED,'1')}catch{}
   setSaveStatus(text,kind);
  };
  const timer=setTimeout(()=>{
   try{popup.close()}catch{}
   finish('대시보드에 연결되지 않습니다. 이 PC에 대시보드가 켜져 있는지 확인해 주세요.','error',false);
  },WAIT_MS);
  function onMessage(event){
   if(event.origin!==DASHBOARD||event.source!==popup||!event.data)return;
   if(event.data.type==='tt-inbox-ready')popup.postMessage({type:'tt-seating-send',body},DASHBOARD);
   else if(event.data.type==='tt-inbox-saved')finish(`칠판으로 보냄 · ${classState.className}`,undefined,true);
   else if(event.data.type==='tt-inbox-failed')finish('칠판으로 보내지 못했습니다. 다시 눌러 주세요.','error',false);
  }
  window.addEventListener('message',onMessage);
 }
 send.addEventListener('click',sendToBoard);
 // After the first successful send, confirming a seating sends it too.
 // The app's own handler has already run by the time this listener fires.
 confirmButton.addEventListener('click',()=>{
  let linked=false;try{linked=localStorage.getItem(LINKED)==='1'}catch{}
  if(linked&&!historyView&&classState.assignments.length&&confirmedRevision===previewRevision)sendToBoard();
 });
})();
