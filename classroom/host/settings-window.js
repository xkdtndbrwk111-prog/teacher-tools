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
  '<h2 id="tt-settings-title">교실매니저 설정</h2><p>자리배치 · 체육모둠 · 성적 관리 · 학급생활 공통 설정</p></div>',
  '<button id="tt-settings-close" type="button" aria-label="설정창 닫기">✕</button></header>',
  '<div class="tt-settings-content">',
  '<nav class="tt-settings-nav" role="tablist" aria-label="설정 분류">',
  '<button type="button" role="tab" data-tt-section="general">⚙  일반</button>',
  '<button type="button" role="tab" data-tt-section="cloud">☁  구글 연동</button>',
  '<button type="button" role="tab" data-tt-section="backup">▣  백업 · 복원</button>',
  '<button type="button" role="tab" data-tt-section="security">♙  잠금 · 보안</button>',
  '<button type="button" role="tab" data-tt-section="privacy">개인정보 · 데이터</button>',
  '<button type="button" role="tab" data-tt-section="tools">☷  도구</button>',
  '</nav><div class="tt-settings-main">',
  '<article class="tt-settings-panel" data-tt-panel="general"><h3>일반</h3>',
  '<p class="tt-settings-lead">모든 작업 메뉴에서 같은 학급과 학생 명단을 사용합니다.</p>',
  '<div class="tt-settings-card"><strong>학급 관리</strong><p>반 추가·이름 변경·반 전환은 기존 관리 기능을 그대로 사용합니다.</p>',
  '<button type="button" id="tt-settings-class-open">반 관리 열기</button></div>',
  '<div class="tt-settings-card"><strong>공통 화면</strong><p>자리배치, 체육모둠, 성적 관리의 설정을 이 창에서 모아 관리할 수 있습니다.</p></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="cloud" hidden><h3>구글 연동</h3>',
  '<p class="tt-settings-lead">EASY는 로그인 없이 기본 학급 관리만 이용합니다. 학급생활은 잠깁니다. NORMAL은 Google 통합 로그인 한 번으로 구글 시트 저장과 학급생활을 이용합니다.</p>',
  '<div class="tt-settings-card"><strong>저장 방식</strong><p>저장 방식을 설정하고 NORMAL Google 통합 로그인을 관리합니다. 저장 충돌 확인 기능은 유지됩니다.</p>',
  '<button type="button" id="tt-settings-cloud-open">저장 방식 설정 열기</button></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="backup" hidden><h3>백업 · 복원</h3>',
  '<p class="tt-settings-lead">전체 학급·자리·체육 능력치·성적을 하나의 파일로 관리합니다.</p>',
  '<div class="tt-settings-card"><strong>전체 백업 및 복원</strong><p>복원 전 검사, 암호 보호, 주의 안내는 기존 절차를 유지합니다.</p>',
  '<div id="tt-settings-backup-actions" class="tt-settings-actions"></div></div></article>',
  '<article class="tt-settings-panel" data-tt-panel="security" hidden><h3>잠금 · 보안</h3>',
  '<p class="tt-settings-lead">학생들에게 교사용 화면을 가리고 PIN 번호와 자동 잠금을 설정합니다.</p>',
  '<div class="tt-settings-card"><strong>교사 화면 보호</strong><p>잠금은 화면을 가리는 기능이며 저장 자료의 암호화 기능은 아닙니다.</p>',
  '<div id="tt-settings-security-actions" class="tt-settings-actions"></div></div></article>',
  "<article class=\"tt-settings-panel\" data-tt-panel=\"privacy\" hidden><h3>개인정보 · 데이터</h3>",
  "<p class=\"tt-settings-lead\">교실매니저의 기능별 개인정보 처리 안내입니다. 학교의 개인정보 보호 지침과 승인 범위 내에서 사용해 주세요.</p>",
  "<div class=\"tt-settings-card\"><strong>1. 처리 목적과 항목</strong><p>학급 관리, 자리배치 및 체육 모둠 편성, 성적 관리, 학급생활 설문·관찰·분석을 위해 입력한 학급명, 학생 이름·번호·ID, 성별·아바타, 편성 이력·능력치 및 평가 자료 등을 처리합니다. 학급생활 이용 시 설문 응답, 친구 평가, 제출 상태, 관찰 기록도 처리합니다. 업무에 필요하지 않은 개인정보나 민감정보는 입력하지 마세요.</p></div>",
  "<div class=\"tt-settings-card\"><strong>2. EASY · 이 브라우저 저장</strong><p>학급·자리·체육·성적 자료는 브라우저의 IndexedDB 및 일부 임시·설정 저장소에 남습니다. EASY에서는 Google 학급 자료 저장 및 학급생활 온라인 기능을 사용하지 않습니다. 브라우저 데이터 삭제, 다른 프로필 사용, 기기 변경 시 자료가 사라지거나 보이지 않을 수 있습니다. 백업을 안전하게 보관하세요.</p></div>",
  "<div class=\"tt-settings-card\"><strong>3. NORMAL · Google 연동</strong><p>Google 통합 로그인은 계정 식별 정보(이메일·프로필·계정 ID)와 앱이 만들었거나 사용 권한을 받은 파일에 대한 drive.file 권한을 사용합니다. 학년도별 교실매니저 Google 스프레드시트에 학급·자리·체육·성적 등 동기화 자료가 저장되며, 별도 디자인 JSON에는 테마·글꼴·자동 연동 설정만 저장됩니다. 교실매니저가 학급 자료를 별도로 암호화하여 Sheets에 기록하는 것은 아닙니다. Google 파일을 공유하면 타인이 볼 수 있으므로 공유 설정을 확인하세요.</p><p>로그인 토큰은 만료 전 탭 세션 저장소에 유지될 수 있습니다. 교실매니저는 Google 비밀번호를 직접 받지 않습니다. 공용 PC에서 사용 후 EASY 전환 또는 로그아웃을 하고, 필요하면 Google 계정에서 연결 앱 권한을 철회하세요. 연결 해제만으로 기존 파일이 삭제되지는 않습니다.</p><p><a href=\"https://policies.google.com/privacy?hl=ko\" target=\"_blank\" rel=\"noopener noreferrer\">Google 개인정보처리방침</a> · <a href=\"https://myaccount.google.com/connections\" target=\"_blank\" rel=\"noopener noreferrer\">Google 연결 앱 관리</a></p></div>",
  "<div class=\"tt-settings-card\"><strong>4. 학급생활 · 온라인 설문 및 기록</strong><p>NORMAL에서 학급 명단을 연결하면 교사 계정·학급·학년도 식별자, 학생 ID·이름·번호가 학급생활 서버(Google Cloud Run 및 Firebase/Cloud Firestore)로 전송됩니다. 설문 개설 상태, 학생 코드 검증 정보, 설문 원문·제출 시각, 관찰 기록과 분석에 필요한 자료를 해당 서비스가 처리합니다. 학생 코드는 해시 및 보호된 코드 저장소로 관리하며, 재발급 시 이전 인증 세션이 무효화됩니다. 학생 화면에는 다른 학생의 설문 응답이나 교사용 성적·관찰 기록이 공개되지 않도록 권한을 분리합니다. 코드는 개인에게만 전달하세요.</p><p>학급생활 자료는 교사 Google 스프레드시트와 별도의 서버 저장 자료입니다. 로컬 백업·삭제나 Google 연결 해제만으로 온라인 설문 자료가 모두 삭제되는 것은 아닙니다.</p></div>",
  "<div class=\"tt-settings-card\"><strong>5. 호자보드 및 기타 인터넷 통신</strong><p>호자보드 연결 및 전송 시 이 PC의 로컬 서비스(127.0.0.1)로 학생 명단·확정 자리·모둠이나 학생 발표 자료를 보냅니다. 호자보드 테마 연동은 디자인 정보만 읽습니다. 공개 발표창 또는 학급생활 QR은 학생에게 보여도 되는 내용만 사용하세요.</p><p>공개 웹사이트는 페이지 제공을 위한 GitHub Pages 및 외부 서비스 통신을 사용합니다. 실행 횟수 집계는 Supabase에 도구 식별값을 보내며, 해당 집계 요청에는 학생 이름·성적·설문 자료를 넣지 않습니다. 접속 과정의 IP 등 기술적 통신 정보는 각 서비스에서 처리할 수 있습니다.</p></div>",
  "<div class=\"tt-settings-card\"><strong>6. 보관·삭제·보안과 문의</strong><p>이 브라우저 자료는 삭제하기 전까지 남을 수 있으며 Google 파일·학급생활 자료는 각각 별도로 관리됩니다. 모든 자료를 일괄 자동 삭제하는 기능이나 일률적인 서버 보존 기간을 보장하지 않습니다. 학급 종료·전출·보관 기간 만료 시 학교 지침에 따라 불필요한 자료를 정리하고, 로컬 브라우저·백업 파일·Google 파일·호자보드·학급생활 서버 자료를 각각 확인하세요. 학급생활의 학생 명단 연결 해제나 비활성화는 기록의 완전 삭제와 다릅니다.</p><p>PIN 잠금은 화면 접근 보호이며 저장 자료 암호화가 아닙니다. 전체 백업에서 암호 보호를 선택할 수 있습니다. 백업 및 학생 코드 출력물은 안전하게 관리하세요. 학생·보호자의 열람, 정정, 삭제 등 요청은 학교 개인정보 담당자와 먼저 협의하고, 온라인 자료 삭제 및 프로그램 관련 문의는 아래 연락처를 이용하세요.</p><p>개발·프로그램 문의: <a href=\"mailto:xkdtndbrwk111@gmail.com\">xkdtndbrwk111@gmail.com</a></p><button type=\"button\" id=\"tt-privacy-backup\">백업 · 복원 열기</button> <button type=\"button\" id=\"tt-privacy-google\">구글 연동 열기</button></div></article>",
  '<article class="tt-settings-panel" data-tt-panel="tools" hidden><h3>도구</h3>',
  '<p class="tt-settings-lead">도구 홈과 실행 취소 등 기존 보조 기능입니다.</p>',
  '<div id="tt-settings-tools" class="tt-settings-tool-actions"></div></article>',
  '</div></div></section>'
 ].join('');
 document.body.append(overlay);
 // Preserve the real status/send nodes and monitor placement controls until
 // manager-home mounts and moves placement into its board center.
 const transit=document.createElement('div');transit.hidden=true;transit.innerHTML='<div id="tt-settings-board-status"></div><div id="tt-settings-board-actions"></div><div id="tt-settings-placement"></div>';document.body.append(transit);

 const query=s=>overlay.querySelector(s);
 const place=(selector,target)=>{
  const node=oldMenu.querySelector(selector);
  if(node){const dest=document.querySelector(target);if(dest){dest.append(node);return node}}
  return null;
 };
 place('.tt-stage04-actions','#tt-settings-backup-actions');
 place('#tt-lock-now','#tt-settings-security-actions');
 place('#tt-lock-open-settings','#tt-settings-security-actions');
 place('#tt-board-connection-status','#tt-settings-board-status');
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
 query('#tt-privacy-backup').onclick=()=>choose('backup');
 query('#tt-privacy-google').onclick=()=>choose('cloud');
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
  if(['tt-full-backup','tt-lock-now','tt-lock-open-settings','tt-send-board'].includes(button.id)||
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