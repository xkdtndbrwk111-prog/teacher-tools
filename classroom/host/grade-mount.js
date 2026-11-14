(()=>{
 'use strict';
 // Seating remains the single roster writer.
 const TEST_INSTALL_ID=window.__TT_STAGE031_CLASS.installId;
 const bar=document.querySelector('#teacherScreen .prototype-mode-switch');
 const teacher=document.getElementById('teacherScreen');
 if(!bar||!teacher?.querySelector(':scope > .studio')){console.error('[TT_STAGE03] 호스트 구조 불일치');return;}
 const tab=document.createElement('button');tab.id='tt-grade-tab';tab.type='button';tab.className='tt-grade-tab';tab.textContent='📊 성적 관리';tab.setAttribute('aria-pressed','false');bar.append(tab);
 const panel=document.createElement('section');panel.className='tt-grade-mount';panel.id='tt-grade-mount';panel.setAttribute('aria-label','성적 관리');
 panel.innerHTML='<div id="tt-stage03-status" class="tt-grade-mount-warning" role="status">자리배치 명단과 연결하는 중 · Google 저장 없음</div>';
 teacher.querySelector(':scope > .studio .student-strip').before(panel);
 let frame=null,bridgeReady=false,pendingFlush=null,allowLeave=false,pendingTraitOpen=false;
 const isActive=()=>document.body.classList.contains('tt-grade-active');
 function snapshot(){
  // Read live seating state first; only project strict ID-based view, never names as keys.
  const s=classState;
  if(!s||!Array.isArray(s.students))throw Error('자리배치 학생명단을 찾을 수 없습니다.');
  return {type:'TT_STAGE03_ROSTER',installId:TEST_INSTALL_ID,sourceInstanceId:TEST_INSTALL_ID+'-'+window.__TT_STAGE031_CLASS.activeId,className:s.className||'우리 반',students:s.students.map(x=>({id:x.id,name:x.name,gender:x.gender,visual:x.visual})),traits:window.__TT_PE_TRAITS?.snapshot()||null};
 }
 function sendRoster(){if(!frame||!bridgeReady)return;try{frame.contentWindow.postMessage(snapshot(),location.origin)}catch(e){setStatus('⚠ 명단 전달 실패: '+e.message,true)}}
 function setStatus(s,error=false){const el=document.getElementById('tt-stage03-status');if(el){el.textContent=s;el.classList.toggle('is-error',error)}}
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame?.contentWindow||!e.data)return;
  if(e.data.type!=='TT_STAGE03_READY'&&e.data.installId!==TEST_INSTALL_ID)return;
  if(e.data.type==='TT_STAGE03_READY'){bridgeReady=true;sendRoster();if(pendingTraitOpen)openTraitPage()}
  if(e.data.type==='TT_STAGE03_SYNC_RESULT')setStatus(e.data.message,Boolean(e.data.error));
  if(e.data.type==='TT_STAGE03_FLUSH_ACK'&&pendingFlush&&e.data.id===pendingFlush.id){const p=pendingFlush;pendingFlush=null;p.resolve(Boolean(e.data.ok));if(!e.data.ok)setStatus('⚠ 브라우저 성적 저장 실패: 화면 이동 보류',true)}
 });
 let sequence=0;
 function flushGrade(){if(!frame||!bridgeReady)return Promise.resolve(true);if(pendingFlush)return pendingFlush.promise;
  const id=++sequence;let resolve;const promise=new Promise(r=>{resolve=r});pendingFlush={id,resolve,promise};frame.contentWindow.postMessage({type:'TT_STAGE03_FLUSH',installId:TEST_INSTALL_ID,id},location.origin);
  // Only timeout is a failure; never claim saved on no response.
  setTimeout(()=>{if(pendingFlush?.id===id){pendingFlush=null;resolve(false);setStatus('⚠ 성적 저장 응답이 없습니다. 현재 화면을 유지합니다.',true)}},7000);
  return promise;
 }
 async function leaveGrade(button){if(!isActive())return;const ok=await flushGrade();if(!ok)return;
  document.body.classList.remove('tt-grade-active');tab.classList.remove('on');tab.setAttribute('aria-pressed','false');
  allowLeave=true;button.click();allowLeave=false;
 }
 // Capture old buttons before the PE listener to flush the grade draft first.
 [...bar.querySelectorAll('button:not(#tt-grade-tab)'),...teacher.querySelectorAll('.tt-seating-submodes button')].forEach(button=>button.addEventListener('click',e=>{
  if(!isActive()||allowLeave)return;e.stopImmediatePropagation();e.preventDefault();void leaveGrade(button);
 },true));
 const height=()=>{}; // Shared studio grid defines the same height in every module.
 tab.addEventListener('click',()=>{
  if(isActive())return;
  document.activeElement?.blur?.();
  document.body.classList.add('tt-grade-active');bar.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===tab));tab.setAttribute('aria-pressed','true');
  // The seating parent is inactive whenever grades owns the content.
  bar.querySelector('#modeClassroom')?.setAttribute('aria-pressed','false');
  if(!frame)ensureFrame();
  else sendRoster();height();
 });
 function ensureFrame(){frame=document.createElement('iframe');frame.className='tt-grade-iframe';frame.title='성적 관리';frame.src='../classroom/grades/index.html';frame.loading='eager';panel.append(frame)}
 window.__TT_STAGE031_SEND_ROSTER=sendRoster;
 // After the level count changes, the grade tab (loaded out of sight if needed) re-ranks linked axes.
 window.__TT_TRAIT_RERANK=()=>{if(!frame)ensureFrame();else if(bridgeReady)sendRoster()};
 // A load that finds an unfinished re-rank (the page closed in between) finishes it too.
 queueMicrotask(()=>{if(window.__TT_PE_TRAITS?.snapshot().rerankPending)window.__TT_TRAIT_RERANK()});
 // 성적 연결 in the student tab: open the grade tab on its trait link page.
 function openTraitPage(){pendingTraitOpen=false;frame.contentWindow.postMessage({type:'TT_TRAIT_LINK_OPEN',installId:TEST_INSTALL_ID},location.origin)}
 window.__TT_OPEN_TRAIT_LINK=()=>{pendingTraitOpen=true;if(!isActive())tab.click();if(frame&&bridgeReady){sendRoster();openTraitPage()}};
 // The grade tab may change only which axes are linked and the levels of linked axes, for the class shown now.
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame?.contentWindow||!e.data||e.data.installId!==TEST_INSTALL_ID)return;
  if(e.data.type!=='TT_TRAIT_LINK_SAVE'&&e.data.type!=='TT_TRAIT_LINK_APPLY')return;
  const reply=(ok,message,changed=0)=>frame.contentWindow.postMessage({type:'TT_TRAIT_LINK_RESULT',installId:TEST_INSTALL_ID,ok,message,changed,auto:e.data.auto===true},location.origin);
  if(e.data.sourceInstanceId!==TEST_INSTALL_ID+'-'+window.__TT_STAGE031_CLASS.activeId)return reply(false,'다른 반의 요청이라 반영하지 않았습니다.');
  const api=window.__TT_PE_TRAITS;if(!api)return reply(false,'자리배치 능력치를 찾지 못했습니다.');
  try{
   if(e.data.type==='TT_TRAIT_LINK_SAVE'){api.saveLink(e.data.config);reply(true,'연동 설정을 저장했습니다.');}
   else{const changed=api.applyLinked(e.data.values);reply(true,`능력치에 반영했습니다. 바뀐 칸 ${changed}개`,changed);}
  }catch(err){reply(false,'능력치 반영 실패: '+err.message)}
  sendRoster();
 });
 window.__TT_STAGE031_FLUSH_GRADE=()=>isActive()?flushGrade():Promise.resolve(true);
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.type!=='TT_STAGE031_SWITCH_CLASS'||e.data.installId!==TEST_INSTALL_ID)return;
  const id=e.data.sourceInstanceId?.slice((TEST_INSTALL_ID+'-').length);
  if(!e.data.sourceInstanceId?.startsWith(TEST_INSTALL_ID+'-')||!id)return;
  window.__TT_STAGE031_SWITCH_TO?.(id,'grade');
 });
 // The real Seating cards are the shared list. In Grade mode a card opens its grade dashboard.
 document.getElementById('studentCards')?.addEventListener('click',e=>{
  if(!isActive())return;const card=e.target.closest('.student-card');if(!card)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(frame&&bridgeReady)frame.contentWindow.postMessage({type:'TT_STAGE031_SELECT_STUDENT',installId:TEST_INSTALL_ID,seatingStudentId:card.dataset.studentId},location.origin);
 },true);
 window.addEventListener('resize',height);window.addEventListener('focus',()=>{if(isActive())sendRoster()});
 if(sessionStorage.getItem('tt.stage031.resume')==='grade'){
  sessionStorage.removeItem('tt.stage031.resume');
  queueMicrotask(()=>tab.click());
 }
})();
