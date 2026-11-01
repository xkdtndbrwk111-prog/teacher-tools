// Student-only seating screen shown inside the dashboard. The dashboard hands over what the manager sent; nothing is stored here.
(()=>{
 'use strict';
 const DASHBOARD='http://127.0.0.1:17439';
 const tell=type=>window.parent.postMessage({type},DASHBOARD);
 const button=(text,id,onclick)=>{const b=document.createElement('button');b.type='button';if(id)b.id=id;b.textContent=text;b.onclick=onclick;return b};
 const leave=()=>tell('tt-seating-close');
 const screen=id=>{const d=document.createElement('div');d.id=id;d.className='tt-board-screen';d.hidden=true;document.body.append(d);return d};
 const empty=screen('tt-board-empty'),emptyText=document.createElement('p');
 empty.append(emptyText,button('돌아가기',null,leave));
 const menu=screen('tt-board-menu'),menuTitle=document.createElement('h1'),menuButtons=document.createElement('div');
 menuButtons.className='tt-board-choices';
 menu.append(menuTitle,menuButtons,button('돌아가기',null,leave));
 const warning=screen('tt-board-warning');
 const again=button('다시 섞기','tt-board-again',()=>reshuffle()),change=button('연습·실전 고르기','tt-board-change',()=>openMenu()),back=button('돌아가기','tt-board-back',leave);
 const badge=document.createElement('div');badge.id='tt-board-practice';badge.textContent='연습입니다 · 실제 자리가 아닙니다';badge.hidden=true;document.body.append(badge);
 let data=null;
 function showEmpty(message){emptyText.textContent=message;menu.hidden=true;warning.hidden=true;empty.hidden=false;badge.hidden=true}
 function stopPlayback(){
  playbackToken++;playbackRunning=false;resetPlaybackDialogue();
  document.querySelectorAll('.play-btn').forEach(b=>{b.disabled=false});
 }
 // Practice: a fresh random seating every time, keeping only the boy and girl seats. It is never saved.
 function practiceSeating(){
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
 function reshuffle(){
  const seating=practiceSeating();
  if(!seating){showEmpty('연습 자리를 만들 수 없습니다. 교실 매니저에서 좌석 수를 확인해 주세요.');return false}
  stopPlayback();
  showPlayback(seating);
  return true;
 }
 function play(mode){
  menu.hidden=true;warning.hidden=true;
  try{
   if(mode==='practice'){if(!reshuffle())return}
   else{stopPlayback();showPlayback(data)}
   const actions=document.querySelector('.playback-head-actions');
   if(mode==='practice')actions.append(again);else again.remove();
   actions.append(change,back);
   badge.hidden=mode!=='practice';
   document.querySelector('#gameView .playback-head h1').textContent=mode==='practice'?'연습 자리배치':(data.className?data.className+' 자리배치':'오늘의 자리배치');
  }catch(error){
   console.error(error);
   showEmpty('자리표를 보여 줄 수 없습니다. 교실 매니저에서 배치를 다시 확정해 주세요.');
  }
 }
 function openMenu(){stopPlayback();badge.hidden=true;warning.hidden=true;menu.hidden=false}
 function askReal(){
  const title=document.createElement('h1');title.textContent='실전 자리배치입니다';
  const text=document.createElement('p');text.innerHTML='실전 배치는 선생님께 해 달라고 하세요.<br>여러 번 눌러도 첫 번째 결과만 반복되며, 되돌릴 수 없습니다.';
  const row=document.createElement('div');row.className='tt-board-choices';
  row.append(button('취소','tt-real-cancel',()=>{warning.hidden=true;menu.hidden=false}),button('시작','tt-real-start',()=>play('real')));
  warning.replaceChildren(title,text,row);
  menu.hidden=true;warning.hidden=false;
 }
 menuButtons.append(button('🎲 연습','tt-choose-practice',()=>play('practice')),button('🪑 실전','tt-choose-real',askReal));
 window.addEventListener('message',event=>{
  if(event.origin!==DASHBOARD||event.source!==window.parent||event.data?.type!=='tt-seating-data')return;
  data=event.data.seating;
  if(!data)return showEmpty('아직 보낸 자리배치가 없습니다. 교실 매니저에서 배치를 확정해 주세요.');
  menuTitle.textContent=data.className?data.className+' 자리배치':'자리배치';
  // V1.11 dashboards choose the mode themselves.
  const asked=new URLSearchParams(location.search).get('mode');
  if(asked==='practice'||asked==='real')play(asked);else openMenu();
 });
 tell('tt-seating-ready');
})();
