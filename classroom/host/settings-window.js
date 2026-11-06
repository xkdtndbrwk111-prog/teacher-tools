/* Teacher Tools unified settings shell. Reuses original controls; does not touch storage. */
(()=>{
 'use strict';
 const oldTrigger=document.getElementById('tt-hud-more-trigger');
 const oldMenu=document.getElementById('tt-hud-more-menu');
 if(!oldTrigger||!oldMenu||document.getElementById('tt-settings-overlay'))return;
 // Replace only the dropdown trigger. Existing feature buttons keep their handlers.
 const trigger=oldTrigger.cloneNode(true);
 trigger.textContent='⚙ 설정';
 trigger.title='교실매니저 설정';
 trigger.setAttribute('aria-label','교실매니저 설정 열기');
 trigger.setAttribute('aria-controls','tt-settings-overlay');
 trigger.setAttribute('aria-haspopup','dialog');
 trigger.setAttribute('aria-expanded','false');
 oldTrigger.replaceWith(trigger);
 oldMenu.hidden=true;

 const overlay=document.createElement('div');
 overlay.id='tt-settings-overlay';
 overlay.className='tt-settings-overlay';
 overlay.hidden=true;
 overlay.innerHTML=[
  '<section class="tt-settings-window" role="dialog" aria-modal="true" aria-labelledby="tt-settings-title">',
  '<header class="tt-settings-heading"><div><span class="tt-settings-kicker">TEACHER TOOLS</span>',
  '<h2 id="tt-settings-title">교실매니저 설정</h2><p>자리배치 · 체육모둠 · 성적 관리 공통 설정</p></div>',
  '<button id="tt-settings-close" type="button" aria-label="설정창 닫기">✕</button></header>',
  '<div class="tt-settings-content">',
  '<nav class="tt-settings-nav" role="tablist" aria-label="설정 분류">',
  '<button type="button" role="tab" data-tt-section="general">⚙  일반</button>',
  '<button type="button" role="tab" data-tt-section="cloud">☁  구글 연동</button>',
  '<button type="button" role="tab" data-tt-section="backup">▣  백업 · 복원</button>',
  '<button type="button" role="tab" data-tt-section="security">♙  잠금 · 보안</button>',
  '<button type="button" role="tab" data-tt-section="board">▣  전자칠판</button>',
  '<button type="button" role="tab" data-tt-section="tools">☷  도구</button>',
  '</nav><div class="tt-settings-main">',
  '<article class="tt-settings-panel" data-tt-panel="general"><h3>일반</h3>',
  '<p class="tt-settings-lead">모든 작업 메뉴에서 같은 학급과 학생 명단을 사용합니다.</p>',
  '<div class="tt-settings-card"><strong>학급 관리</strong><p>반 추가·이름 변경·반 전환은 기존 관리 기능을 그대로 사용합니다.</p>',
  '<button type="button" id="tt-settings-class-open">반 관리 열기</button></div>',
  '<div class="tt-settings-card"><strong>공통 화면</strong><p>자리배치, 체육모둠, 성적 관리의 설정을 이 창에서 모아 관리할 수 있습니다.</p></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="cloud" hidden><h3>구글 연동</h3>',
  '<p class="tt-settings-lead">EASY 브라우저 저장과 NORMAL 구글 시트 저장을 기존 방식대로 관리합니다.</p>',
  '<div class="tt-settings-card"><strong>저장 방식</strong><p>현재 상단 저장 표시를 눌렀을 때 열리는 설정창을 사용합니다. 저장 충돌 확인 기능도 유지됩니다.</p>',
  '<button type="button" id="tt-settings-cloud-open">저장 방식 설정 열기</button></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="backup" hidden><h3>백업 · 복원</h3>',
  '<p class="tt-settings-lead">전체 학급·자리·체육 능력치·성적을 하나의 파일로 관리합니다.</p>',
  '<div class="tt-settings-card"><strong>전체 백업 및 복원</strong><p>복원 전 검사, 암호 보호, 주의 안내는 기존 절차를 유지합니다.</p>',
  '<div id="tt-settings-backup-actions" class="tt-settings-actions"></div></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="security" hidden><h3>잠금 · 보안</h3>',
  '<p class="tt-settings-lead">학생들에게 교사용 화면을 가리고 PIN 번호와 자동 잠금을 설정합니다.</p>',
  '<div class="tt-settings-card"><strong>교사 화면 보호</strong><p>잠금은 화면을 가리는 기능이며 저장 자료의 암호화 기능은 아닙니다.</p>',
  '<div id="tt-settings-security-actions" class="tt-settings-actions"></div></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="board" hidden><h3>전자칠판</h3>',
  '<p class="tt-settings-lead">전자칠판 연결 상태를 확인하고 학생 공개 창의 자동 모니터 배치를 설정합니다.</p>',
  '<div class="tt-settings-card"><strong>칠판 연결과 전송</strong>',
  '<div id="tt-settings-board-status"></div><div id="tt-settings-board-actions" class="tt-settings-actions"></div></div>',
  '<div class="tt-settings-card"><strong>학생 발표 화면</strong><p>자리배치나 체육팀을 확정하면 학생 발표 버튼이 활성화됩니다. 공개 창은 교사용 편집 화면과 분리됩니다.</p>',
  '<div id="tt-settings-placement"></div></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="tools" hidden><h3>도구</h3>',
  '<p class="tt-settings-lead">도구 홈과 실행 취소 등 기존 보조 기능입니다.</p>',
  '<div id="tt-settings-tools" class="tt-settings-tool-actions"></div></article>',
  '</div></div></section>'
 ].join('');
 document.body.append(overlay);

 const query=s=>overlay.querySelector(s);
 const place=(selector,target)=>{
  const node=oldMenu.querySelector(selector);
  if(node){query(target).append(node);return node}
  return null;
 };
 place('.tt-stage04-actions','#tt-settings-backup-actions');
 place('#tt-lock-now','#tt-settings-security-actions');
 place('#tt-lock-open-settings','#tt-settings-security-actions');
 place('#tt-board-connection-status','#tt-settings-board-status');
 place('#tt-coin-open','#tt-settings-board-actions');
 place('#tt-send-board','#tt-settings-board-actions');
 place('.tt-student-placement-settings','#tt-settings-placement');
 const tools=query('#tt-settings-tools');
 for(const child of [...oldMenu.children]){
  if(child.classList.contains('tt-hud-menu-label'))child.remove();
  else tools.append(child);
 }
 // A later module can still append to the old compatibility slot.
 new MutationObserver(()=>{
  place('#tt-board-connection-status','#tt-settings-board-status');
  place('.tt-student-placement-settings','#tt-settings-placement');
  place('.tt-stage04-actions','#tt-settings-backup-actions');
  place('#tt-coin-open','#tt-settings-board-actions');
  place('#tt-send-board','#tt-settings-board-actions');
 }).observe(oldMenu,{childList:true});
 oldMenu.hidden=true;

 const tabs=[...overlay.querySelectorAll('[data-tt-section]')];
 const panels=[...overlay.querySelectorAll('[data-tt-panel]')];
 let lastFocus=null;
 function choose(section){
  const key=tabs.some(t=>t.dataset.ttSection===section)?section:'general';
  for(const tab of tabs){
   const active=tab.dataset.ttSection===key;
   tab.setAttribute('aria-selected',String(active));
   tab.tabIndex=active?0:-1;
   tab.classList.toggle('is-active',active);
  }
  for(const panel of panels)panel.hidden=panel.dataset.ttPanel!==key;
 }
 function close({focus=true}={}){
  if(overlay.hidden)return;
  overlay.hidden=true;
  trigger.setAttribute('aria-expanded','false');
  if(focus)(lastFocus?.isConnected?lastFocus:trigger).focus();
 }
 function open(section='general'){
  lastFocus=document.activeElement;
  choose(section);
  overlay.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  tabs.find(t=>t.classList.contains('is-active'))?.focus();
 }
 trigger.addEventListener('click',()=>overlay.hidden?open():close());
 query('#tt-settings-close').addEventListener('click',()=>close());
 overlay.addEventListener('pointerdown',event=>{if(event.target===overlay)close()});
 for(const tab of tabs){
  tab.addEventListener('click',()=>choose(tab.dataset.ttSection));
  tab.addEventListener('keydown',event=>{
   const i=tabs.indexOf(tab);
   const next=event.key==='ArrowDown'?i+1:event.key==='ArrowUp'?i-1:
      event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
   if(next<0)return;
   event.preventDefault();
   const other=tabs[(next+tabs.length)%tabs.length];
   choose(other.dataset.ttSection);other.focus();
  });
 }
 query('#tt-settings-class-open').addEventListener('click',()=>{
  close({focus:false});
  document.getElementById('tt-class-add')?.click();
 });
 query('#tt-settings-cloud-open').addEventListener('click',()=>{
  close({focus:false});
  document.getElementById('tt-cloud-chip')?.click();
 });
 // Original buttons open their existing specialized dialogs unchanged.
 overlay.addEventListener('click',event=>{
  const button=event.target.closest('button,a');
  if(!button)return;
  if(['tt-full-backup','tt-lock-now','tt-lock-open-settings','tt-send-board','tt-coin-open'].includes(button.id)||
    button.classList.contains('hub-home-link')||button.classList.contains('tt-hud-action-proxy')){
   close({focus:false});
  }
 });
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();return}
  if(event.key!=='Tab')return;
  const selectable=[...overlay.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled])')]
   .filter(node=>node.getClientRects().length>0&&node.tabIndex>=0);
  if(!selectable.length)return;
  const first=selectable[0],last=selectable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
 window.__TT_SETTINGS={open,close,choose};
})();