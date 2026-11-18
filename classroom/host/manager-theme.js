/* Manager-only preference + validated same-origin iframe theme delivery. No Google/board network in stage B. */
(()=>{
 'use strict';
 const view=new URLSearchParams(location.search).get('view');
 if(view==='student'||view==='board')return;
 const T=window.TTHojaTheme,KEY='tt.classroom.ui2.theme.local.v1';
 if(!T)return;
 let value=T.DEFAULT;
 try{value=T.normalize(JSON.parse(localStorage.getItem(KEY)||'null'))||T.DEFAULT}catch{}
 function apply(){T.apply(document,value);window.dispatchEvent(new CustomEvent('tt-manager-theme-change',{detail:value}));sendFrame()}
 function sendFrame(){const frame=document.querySelector('.tt-grade-iframe');if(frame?.contentWindow)frame.contentWindow.postMessage({type:'TT_MANAGER_THEME_V1',theme:value},location.origin)}
 function set(next){
  const v=T.normalize(next);if(!v)return false;
  value=v;try{localStorage.setItem(KEY,JSON.stringify(v))}catch{}apply();return true;
 }
 apply();
 window.addEventListener('message',event=>{
  const frame=document.querySelector('.tt-grade-iframe');
  if(event.origin===location.origin&&frame&&event.source===frame.contentWindow&&['TT_MANAGER_THEME_READY','TT_STAGE03_READY'].includes(event.data?.type))sendFrame();
 });
 function mount(){
  const general=document.querySelector('#tt-settings-overlay [data-tt-panel="general"]');if(!general)return false;
  if(document.getElementById('tt-ui2-theme-settings'))return true;
  const card=document.createElement('div');card.id='tt-ui2-theme-settings';card.className='tt-settings-card';
  card.innerHTML='<strong>화면 테마</strong><p>호자보드 원본 색상을 사용합니다. 현재 후보에서는 브라우저에만 저장합니다.</p><label>테마 <select id="tt-ui2-theme-select"></select></label><div id="tt-ui2-custom" hidden></div><label>글꼴 이름 <input id="tt-ui2-font" maxlength="59" placeholder="기본 글꼴"></label><p id="tt-ui2-font-preview">교실매니저 · 가나다라 123</p><button type="button" id="tt-ui2-theme-apply">적용</button><p id="tt-ui2-theme-msg" role="status"></p>';
  general.append(card);
  const $=id=>document.getElementById(id),select=$('tt-ui2-theme-select'),custom=$('tt-ui2-custom'),font=$('tt-ui2-font');
  for(const [key,label] of Object.entries(T.NAMES))select.add(new Option(label,key));
  select.add(new Option('사용자 지정','custom'));
  const fields={bg:'배경',panel:'패널',text:'글자',accent:'강조',modal:'모달'};
  for(const [key,label] of Object.entries(fields)){const l=document.createElement('label');l.textContent=label+' ';const input=document.createElement('input');input.type='color';input.dataset.themeColor=key;l.append(input);custom.append(l)}
  function refresh(){select.value=value.theme;font.value=value.font;const p=T.resolve(value);for(const el of custom.querySelectorAll('input'))el.value=p[el.dataset.themeColor];custom.hidden=select.value!=='custom'}
  refresh();select.onchange=()=>{custom.hidden=select.value!=='custom';if(select.value!=='custom'){const p=T.resolve({version:1,theme:select.value,font:''});for(const el of custom.querySelectorAll('input'))el.value=p[el.dataset.themeColor]}};
  font.oninput=()=>{const v=T.normalize({version:1,theme:'dark',font:font.value});$('tt-ui2-font-preview').style.fontFamily=v?T.tokens(v)['--cm-font']:''};
  function save(){const next={version:1,theme:select.value,font:font.value.trim()};if(next.theme==='custom')next.custom=Object.fromEntries([...custom.querySelectorAll('input')].map(el=>[el.dataset.themeColor,el.value]));
   $('tt-ui2-theme-msg').textContent=set(next)?'테마 적용 · 현재 브라우저에 저장됨':'글꼴 또는 색상 값을 확인해 주세요.'}
  $('tt-ui2-theme-apply').onclick=save;
  return true;
 }
 window.__TT_MANAGER_THEME=Object.freeze({get:()=>value,set,mount,sendFrame});
})();
