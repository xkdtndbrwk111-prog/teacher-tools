(()=>{
 'use strict';
 const blocked=['cloud-login','cloud-save','cloud-create','cloud-find','cloud-picker','cloud-reload','cloud-recover','cloud-logout','connect-seating-same-origin','connect-seating-backup','import-json','load-sample','reset'];
 function guard(){for(const id of blocked){const x=document.getElementById(id);if(x){x.disabled=true;x.setAttribute('aria-disabled','true')}}}
 document.addEventListener('DOMContentLoaded',guard);
})();
