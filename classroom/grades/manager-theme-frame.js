/* Theme messages accepted only from the embedding same-origin manager. */
(()=>{
 'use strict';
 if(window.parent===window)return;
 const T=window.TTHojaTheme;
 if(!T)return;
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='TT_MANAGER_THEME_V1')return;
  const v=T.normalize(event.data.theme);if(v)T.apply(document,v);
 });
 window.parent.postMessage({type:'TT_MANAGER_THEME_READY'},location.origin);
})();
