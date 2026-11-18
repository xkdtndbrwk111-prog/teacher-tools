/* Static teacher navigation icons. Keep existing IDs/buttons and event handlers.
   Never decorate student/public board views or use a global emoji replacement. */
(()=>{
 const icons={
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  seats:'<rect x="5" y="3" width="14" height="9" rx="2"/><path d="M5 12v9m14-9v9M5 16h14M3 12h18"/>',
  group:'<circle cx="9" cy="7" r="3"/><path d="M2 20v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m0 4a5 5 0 0 1 6 5v1"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/><circle cx="12" cy="12" r="8"/>',
  cloud:'<path d="M6 18a4 4 0 0 1-.5-8A6 6 0 0 1 17 8a5 5 0 0 1 1 10z"/>',
  backup:'<path d="M3 5h18v15H3zM3 8h18M10 12h4m-2 0v5m-2-2 2 2 2-2"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
  board:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  tools:'<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="19" r="2"/>',
  form:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8m-8 5h8m-8 5h5"/>',
  chart:'<path d="M3 3v18h18M7 17v-5m5 5V7m5 10v-8"/>',
  grid:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12m6-12v12"/>',
  link:'<path d="m10 13 4-4m-7 6-2 2a4 4 0 0 0 6 6l4-4m-6-10 4-4a4 4 0 0 1 6 6l-2 2"/>'
 };
 const specs={
  '#tt-seat-subtab':['seats','학급 자리'],'#modePE':['group','체육 모둠'],
  '[data-tt-section="general"]':['settings','일반'],'[data-tt-section="cloud"]':['cloud','구글 연동'],
  '[data-tt-section="backup"]':['backup','백업 · 복원'],'[data-tt-section="security"]':['lock','잠금 · 보안'],
  '[data-tt-section="privacy"]':['lock','개인정보 · 데이터'],'[data-tt-section="tools"]':['tools','도구'],
  '.life-nav[data-life-page="surveys"]':['form','설문 운영'],'.life-nav[data-life-page="records"]':['group','학생 기록'],'.life-nav[data-life-page="analysis"]':['chart','설문 통계'],
  '#app .nav[data-page="overview"]':['home','대시보드'],'#app .nav[data-page="classes"]':['group','학급 · 학생'],
  '#app .nav[data-page="assessments"]':['form','평가 관리'],'#app .nav[data-page="grades"]':['grid','성적 입력'],'#app .nav[data-page="traits"]':['link','능력치 연동']
 };
 window.__TT_MANAGER_ICONS=()=>{
  for(const [sel,[key,label]] of Object.entries(specs)){
   const button=document.querySelector(sel);if(!button||button.classList.contains('tt-ui2-vector'))continue;
   button.classList.add('tt-ui2-vector');button.replaceChildren();
   button.insertAdjacentHTML('afterbegin','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[key]+'</svg>');
   const span=document.createElement('span');span.textContent=label;button.append(span);
  }
 };
})();
