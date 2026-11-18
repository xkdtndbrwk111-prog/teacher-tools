/* Classroom Manager UI2: navigation chrome only. Existing action nodes own all data writes. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const root=$('teacherScreen'),bar=root?.querySelector('.prototype-mode-switch'),brand=root?.querySelector('.brand-block');
 const seat=$('modeClassroom'),grade=$('tt-grade-tab'),life=$('tt-life-tab'),send=$('tt-send-board'),status=$('tt-board-connection-status');
 if(!root||!bar||!brand||!seat||!grade||!life||!send||!status)throw Error('교실매니저 메뉴 구성 누락');
 const paths={
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  seat:'<rect x="5" y="3" width="14" height="9" rx="2"/><path d="M5 12v9m14-9v9M5 16h14M3 12h18"/>',
  grade:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2m-7 6h8m-8 4h8m-8 4h5"/>',
  life:'<circle cx="9" cy="7" r="3"/><path d="M2 20v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m0 4a5 5 0 0 1 6 5v1"/>',
  board:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4m-3-11 3-3 3 3m-3-3v7"/>'
 };
 const icon=name=>'<svg class="tt-ui2-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
 const tabs=[['seat','자리배치','학급 자리 · 체육 모둠',seat],['grade','성적관리','교과 평가 · 학생별 기록',grade],['life','학급생활','설문 · 관찰 기록 · 분석',life]];
 const board=document.createElement('button');board.type='button';board.id='tt-board-tab';board.setAttribute('aria-pressed','false');bar.append(board);tabs.push(['board','호자보드','학생 명단 · 전자칠판 연동',board]);
 // The home logo remains outside the mode switch, but its route is inside:
 // the original life exit listener and grade flush gate can therefore still run.
 const homeRoute=document.createElement('button');homeRoute.type='button';homeRoute.id='tt-home-route';homeRoute.hidden=true;homeRoute.textContent='홈';bar.append(homeRoute);
 const homeButton=document.createElement('button');homeButton.id='tt-manager-home-button';homeButton.type='button';homeButton.title='교실매니저 홈';homeButton.setAttribute('aria-label','교실매니저 홈');homeButton.innerHTML=icon('home')+'<span>교실매니저</span>';
 brand.querySelector('#topClassTitle')?.before(homeButton);
 // Preserve the original title node for feature code; the real home button is separate.
 const home=document.createElement('section');home.id='tt-manager-home';home.className='tt-ui2-page';home.hidden=true;
 home.innerHTML='<div class="tt-ui2-home-content"><h1>교실매니저</h1><p>원하는 메뉴를 선택하세요.</p><div class="tt-ui2-grid">'+tabs.map(([key,label,description])=>'<button type="button" data-tt-ui2-open="'+key+'" class="tt-ui2-tile">'+icon(key)+'<strong>'+(key==='board'?'호자보드 연동':label)+'</strong><span>'+description+'</span></button>').join('')+'</div></div>';
 const link=document.createElement('section');link.id='tt-manager-board';link.className='tt-ui2-page';link.hidden=true;
 link.innerHTML='<div class="tt-ui2-board-content"><h1>호자보드 연동</h1><p>현재 학급의 학생 명단과 확정 자리·모둠을 전자칠판에 전달합니다.</p><div class="tt-ui2-card"><h2>연결 상태</h2><p id="tt-ui2-board-status" role="status">연결 확인 중…</p><p>이미 설치했다면 호자보드를 배경화면 모드로 실행한 뒤 다시 확인하세요.</p><div class="tt-ui2-actions"><button type="button" id="tt-ui2-recheck">연결 다시 확인</button><a href="../">호자보드 다운로드 안내 · 도구 홈</a></div><small>연결되지 않았다는 사실만으로 설치 여부를 판단할 수 없습니다. 공식 설치판 공개 여부는 도구 홈에서 확인하세요.</small></div><div class="tt-ui2-card"><h2>학생 명단 및 자리·모둠 보내기</h2><p>학생 명단만 보내거나, 확정된 자리·모둠까지 함께 보낼 수 있습니다. 명단만 보내면 같은 학급의 유효한 확정 자리는 유지됩니다.</p><div class="tt-ui2-actions"><button class="tt-ui2-primary" type="button" id="tt-ui2-send-roster">학생 명단만 보내기</button><button type="button" id="tt-ui2-send">자리·모둠까지 보내기</button><button type="button" id="tt-ui2-open-seating">자리배치 열기</button></div><p id="tt-ui2-send-result" role="status"></p></div><div class="tt-ui2-card"><h2>학생 발표 화면</h2><p>자리배치·체육 모둠·학급생활 QR 발표는 각 메뉴의 학생 화면에서 실행할 수 있습니다.</p><button type="button" id="tt-ui2-board-settings">전자칠판 설정 열기</button></div></div>';
 root.append(home,link);
 let current='seat';
 function show(next){
  current=next;
  const special=next==='home'||next==='board';
  home.hidden=next!=='home';link.hidden=next!=='board';document.body.classList.toggle('tt-manager-special',special);
  root.dataset.ttUi2Page=next;
  if(special){
   for(const [, , ,tab] of tabs){tab.classList.toggle('on',tab===board&&next==='board');tab.setAttribute('aria-pressed',String(tab===board&&next==='board'))}
  }
  homeButton.setAttribute('aria-current',next==='home'?'page':'false');
 }
 // Existing authenticated life tab may stop propagation; do not dismiss the home
 // unless the legacy handler actually opened its module.
 for(const [key,label,,tab] of tabs){
  if(key==='board')continue;
  tab.addEventListener('click',()=>{
   if(key==='life'&&!document.body.classList.contains('tt-life-active'))return;
   if(key==='grade'&&!document.body.classList.contains('tt-grade-active'))return;
   show(key);
  });
 }
 for(const [button,key] of [[homeRoute,'home'],[board,'board']]){
  button.addEventListener('click',event=>{
   if(document.body.classList.contains('tt-grade-active')){
    event.preventDefault();event.stopImmediatePropagation();
    void window.__TT_STAGE031_LEAVE_GRADE(button);
   }
  },true);
  button.addEventListener('click',()=>show(key));
 }
 // Some legacy modules set textContent after auth changes. Rebuild the icon
 // only when the label has changed, without replacing the button or its listeners.
 for(const [key,label,,tab] of tabs){
  const decorate=()=>{
   if(tab.querySelector('svg'))return;
   const locked=key==='life'&&tab.getAttribute('aria-disabled')==='true';
   tab.replaceChildren();
   tab.insertAdjacentHTML('afterbegin',icon(key));
   const span=document.createElement('span');span.textContent=label;
   tab.append(span);
   if(locked)tab.setAttribute('title','NORMAL 모드에서 Google 통합 로그인이 필요합니다.');
  };
  new MutationObserver(decorate).observe(tab,{childList:true});
  decorate();
 }
 homeButton.addEventListener('click',()=>homeRoute.click());
 home.addEventListener('click',event=>{const tile=event.target.closest('[data-tt-ui2-open]');if(tile)tabs.find(t=>t[0]===tile.dataset.ttUi2Open)?.[3].click()});
 $('tt-ui2-open-seating').onclick=()=>seat.click();
 $('tt-ui2-board-settings').onclick=()=>window.__TT_SETTINGS?.open('board');
 $('tt-ui2-recheck').onclick=()=>void window.__TT_BOARD_CONNECTION?.check();
 $('tt-ui2-send').onclick=()=>send.click();
 $('tt-ui2-send-roster').onclick=()=>window.__TT_SEND_ROSTER?.();
 function reflect(){
  $('tt-ui2-board-status').textContent=status.textContent.trim()||'연결 확인 중…';
  $('tt-ui2-send').disabled=send.disabled;
  $('tt-ui2-send').title=send.title;
  const roster=$('tt-ui2-send-roster');roster.disabled=!window.__TT_BOARD_CONNECTION?.rosterReady();roster.title=roster.disabled?'호자보드 V1.66.20 이상 연결 필요':'확정 배치 없이 학생 명단 전송';
 }
 new MutationObserver(reflect).observe(status,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-roster-ready']});
 new MutationObserver(reflect).observe(send,{attributes:true,attributeFilter:['disabled','title']});
 const save=$('saveStatus');
 if(save)new MutationObserver(()=>{if(current==='board')$('tt-ui2-send-result').textContent=save.textContent}).observe(save,{childList:true,subtree:true,characterData:true});
 reflect();
 const initial=new URLSearchParams(location.search).get('section');
 // Explicit seating URL is a deep link and a regression-test entry point.
 // Existing grade-resume (class switch) takes precedence.
 if(document.body.classList.contains('tt-grade-active'))show('grade');
 else if(document.body.classList.contains('tt-life-active'))show('life');
 else if(initial==='seating')show('seat');
 else show('home');
 window.__TT_MANAGER_HOME={page:()=>current};
})();
