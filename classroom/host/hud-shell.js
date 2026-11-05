/* Teacher Tools common top HUD. UI only: no data or cloud-store mutations. */
(()=>{
 'use strict';
 const header=document.querySelector('#teacherScreen>.studio-topbar');
 const brand=header?.querySelector(':scope>.brand-block');
 const modes=header?.querySelector(':scope>.prototype-mode-switch');
 const actions=header?.querySelector(':scope>.top-actions');
 const controls=brand?.querySelector('.tt-class-controls');
 if(!header||!brand||!modes||!actions||!controls){console.warn('[TT HUD] Required header elements unavailable.');return}
 if(header.classList.contains('tt-hud-unified'))return;

 const right=document.createElement('div');right.className='tt-hud-right';right.id='tt-hud-right';
 const cloudSlot=document.createElement('div');cloudSlot.className='tt-hud-cloud';
 const overflow=document.createElement('div');overflow.className='tt-hud-overflow';
 const trigger=document.createElement('button');trigger.type='button';trigger.id='tt-hud-more-trigger';trigger.className='tt-hud-more-trigger';trigger.textContent='☰ 더보기';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','tt-hud-more-menu');
 const menu=document.createElement('div');menu.className='tt-hud-menu';menu.id='tt-hud-more-menu';menu.hidden=true;
 menu.setAttribute('role','group');menu.setAttribute('aria-label','추가 도구');
 const menuCaption=document.createElement('strong');menuCaption.className='tt-hud-menu-label';menuCaption.textContent='도구 · 설정';menu.append(menuCaption);
 overflow.append(trigger,menu);
 right.append(actions,cloudSlot,overflow);
 header.append(right);

 // Moving real nodes preserves original event handlers and their IDs.
 // This script runs after all feature modules in class-bootstrap.js.
 const cloud=document.getElementById('tt-cloud-chip');
 if(cloud){cloudSlot.append(cloud);cloud.classList.add('tt-hud-cloud-chip')}
 const move=selector=>{const node=header.querySelector(selector);if(node)menu.append(node);return node};
 move('.hub-home-link');
 move('.undo-actions');
 move('.tt-stage04-actions');
 move('#tt-lock-now');
 move('#tt-lock-open-settings');
 move('#tt-coin-open');
 move('#tt-send-board');

 const primaryIds=['generateAssignment','confirmAssignment','openPlayback'];
 const primaryGroup=document.createElement('div');primaryGroup.className='tt-hud-small-actions';
 const primaryTitle=document.createElement('strong');primaryTitle.className='tt-hud-menu-label';primaryTitle.textContent='현재 메뉴 작업';primaryGroup.append(primaryTitle);
 const proxies=[];
 for(const id of primaryIds){
  const original=document.getElementById(id);if(!original)continue;
  const proxy=document.createElement('button');proxy.type='button';proxy.className='tt-hud-action-proxy';proxy.dataset.for=id;
  proxy.addEventListener('click',()=>{if(original.disabled)return;closeMenu();original.click()});
  primaryGroup.append(proxy);proxies.push({original,proxy});
 }
 menu.append(primaryGroup);
 function refreshProxies(){for(const {original,proxy} of proxies){proxy.textContent=original.textContent.trim();proxy.disabled=original.disabled}}
 const primaryObserver=new MutationObserver(refreshProxies);
 for(const {original} of proxies)primaryObserver.observe(original,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 refreshProxies();

 function closeMenu(){menu.hidden=true;trigger.setAttribute('aria-expanded','false')}
 trigger.addEventListener('click',()=>{
  const next=menu.hidden;
  menu.hidden=!next;trigger.setAttribute('aria-expanded',String(next));
 });
 document.addEventListener('pointerdown',event=>{if(!overflow.contains(event.target))closeMenu()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){closeMenu();trigger.focus()}});
 menu.addEventListener('click',event=>{if(event.target.closest('button,a'))closeMenu()});

 // The cloud module still owns its real button, status, dialogs, and sync logic.
 // Only its visible label is shortened to avoid pushing other controls.
 if(cloud){
  function shortStatus(raw){
   if(/EASY/i.test(raw))return '💾 EASY';
   if(/자료 차이|충돌/.test(raw))return '☁ 확인 필요';
   if(/연결 필요|로그인/.test(raw))return '☁ 연결 필요';
   if(/저장 멈춤|저장 중단|오류/.test(raw))return '☁ 저장 중단';
   if(/저장 중/.test(raw))return '☁ 저장 중';
   if(/저장 대기/.test(raw))return '☁ 대기 중';
   if(/구글/.test(raw))return '☁ 저장됨';
   return raw.slice(0,10)||'☁ 저장 상태';
  }
  let processing=false;
  function updateChip(){
   if(processing)return;
   const raw=(cloud.textContent||'').trim();
   // Ignore the mutation caused by our own short label, preserving full text.
   if(raw===cloud.dataset.ttHudShort)return;
   const short=shortStatus(raw);
   processing=true;
   cloud.dataset.ttHudShort=short;
   cloud.dataset.ttHudFull=raw;
   cloud.title=raw+' · 클릭하여 저장 설정 열기';
   cloud.setAttribute('aria-label',raw+' · 저장 설정 열기');
   if(raw!==short)cloud.textContent=short;
   processing=false;
  }
  new MutationObserver(updateChip).observe(cloud,{childList:true,characterData:true,subtree:true});
  updateChip();
 }

 // The iframe's own header stays hidden; there is exactly one host HUD.
 header.classList.add('tt-hud-unified');
 window.__TT_HUD={version:'HUD-01',refresh:refreshProxies,closeMenu};
})();
