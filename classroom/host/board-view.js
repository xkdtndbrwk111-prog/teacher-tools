// Student-only seating screen shown inside the dashboard. The dashboard hands over what the manager sent; nothing is stored here.
(()=>{
 'use strict';
 const DASHBOARD='http://127.0.0.1:17439';
 const tell=type=>window.parent.postMessage({type},DASHBOARD);
 const back=document.createElement('button');back.type='button';back.id='tt-board-back';back.textContent='돌아가기';
 back.onclick=()=>tell('tt-seating-close');
 const empty=document.createElement('div');empty.id='tt-board-empty';empty.hidden=true;
 const text=document.createElement('p'),emptyBack=back.cloneNode(true);emptyBack.removeAttribute('id');emptyBack.onclick=back.onclick;
 empty.append(text,emptyBack);
 document.body.append(empty);
 function showEmpty(message){text.textContent=message;empty.hidden=false}
 const practiceMode=new URLSearchParams(location.search).get('mode')==='practice';
 // Practice: a fresh random seating every time, keeping only the boy and girl seats. It is never saved.
 function practiceSeating(data){
  const genders=data.practice?.genders||{},useGender=Boolean(data.practice?.genderSeats);
  classState.students=data.students.map(s=>({id:s.id,name:s.name,gender:genders[s.id]||'none',balanceLevel:'none',apartFrom:[],fixedSeatId:null,assignmentExcluded:false,visual:s.visual}));
  classState.layout=data.layout;classState.groups=[];classState.history=[];classState.assignments=[];
  classState.rules={...classState.rules,completeRandom:!useGender,genderSeats:useGender,fixedSeats:false,apartStudents:false,groupBalance:false,backRowNoRepeat:false,recentGroupmatesAvoid:false};
  for(let i=0;i<50;i++){
   const candidate=buildAssignmentCandidate([]);
   if(!candidate.valid)continue;
   classState.assignments=candidate.assignments;
   return{...data,assignments:candidate.assignments,groups:[],pairReactions:buildPublicPairReactions(),historyTransition:false,previousAssignments:[],previousRound:null};
  }
  return null;
 }
 function reshuffle(data){
  const seating=practiceSeating(data);
  if(!seating){showEmpty('연습 자리를 만들 수 없습니다. 교실 매니저에서 좌석 수를 확인해 주세요.');return}
  playbackToken++;playbackRunning=false;resetPlaybackDialogue();
  document.querySelectorAll('.play-btn').forEach(b=>{b.disabled=false});
  showPlayback(seating);
 }
 function show(data){
  try{
   if(practiceMode){
    reshuffle(data);
    if(!empty.hidden)return;
    const again=document.createElement('button');again.type='button';again.id='tt-board-again';again.textContent='다시 섞기';again.onclick=()=>reshuffle(data);
    document.querySelector('.playback-head-actions').append(again);
    const badge=document.createElement('div');badge.id='tt-board-practice';badge.textContent='연습입니다 · 실제 자리가 아닙니다';
    document.body.append(badge);
   }else showPlayback(data);
   document.querySelector('.playback-head-actions').append(back);
   const title=document.querySelector('#gameView .playback-head h1');
   if(title)title.textContent=practiceMode?'연습 자리배치':(data.className?data.className+' 자리배치':title.textContent);
  }catch(error){
   console.error(error);
   showEmpty('자리표를 보여 줄 수 없습니다. 교실 매니저에서 배치를 다시 확정해 주세요.');
  }
 }
 window.addEventListener('message',event=>{
  if(event.origin!==DASHBOARD||event.source!==window.parent||event.data?.type!=='tt-seating-data')return;
  if(event.data.seating)show(event.data.seating);
  else showEmpty('아직 보낸 자리배치가 없습니다. 교실 매니저에서 배치를 확정해 주세요.');
 });
 tell('tt-seating-ready');
})();
