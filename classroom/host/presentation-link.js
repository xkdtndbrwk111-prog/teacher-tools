// Capability-gated local bridge. R6 and disconnected PCs retain the popup.
(()=>{
 'use strict';
 const base='http://127.0.0.1:17439/api/presentation',id=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 let serial=0,active=null,fallbackButton=null;
 const canSend=()=>window.__TT_BOARD_CONNECTION?.presentationReady?.()===true;
 const report=(data,announce,message)=>{announce?.(message);window.dispatchEvent(new CustomEvent('tt-board-presentation-status',{detail:{kind:data.kind,url:data.payload?.url,message}}))};
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function request(route,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
  try{const res=await fetch(base+route,{mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,...options});if(!res.ok)throw Error('HTTP '+res.status);return await res.json()}finally{clearTimeout(timer)}
 }
 function removeFallback(){fallbackButton?.remove();fallbackButton=null}
 function offerFallback(fallback){
  removeFallback();const parent=document.body,button=document.createElement('button');button.type='button';button.textContent='별도 학생 화면 열기';button.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100050;min-height:44px;padding:10px 18px;border:1px solid #94a3b8;border-radius:12px;background:#16243a;color:white;font-weight:800';button.onclick=()=>{removeFallback();fallback()};parent.append(button);fallbackButton=button;setTimeout(()=>{if(fallbackButton===button)removeFallback()},20000);
 }
 async function send(data,announce,fallback,seq){
  const requestId=id();let accepted=false;
  try{
   const {normalizePresentation,encodePresentation}=await import('./presentation-protocol.mjs?v=20261116-board-present');
   const clean=normalizePresentation(data,location.href);
   if(seq!==serial)return;
   report(data,announce,'호자보드에 발표 자료 전달 중…');
   active={id:requestId,kind:data.kind,url:data.payload?.url,seq};
   const result=await request('/send',{method:'POST',headers:{'Content-Type':'text/plain'},body:encodePresentation({id:requestId,...clean})});accepted=result?.id===requestId;
   if(!accepted)throw Error('접수 확인 실패');
   for(let n=0;n<25&&seq===serial;n++){
    await wait(600);
    const receipt=await request('/receipt?id='+requestId);
    if(receipt.state==='displayed'){report(data,announce,'호자보드 학생 발표 화면 표시 완료');return}
    if(['failed','expired','superseded','closed'].includes(receipt.state))throw Error('표시가 취소되었거나 실패했습니다.');
   }
   if(seq!==serial)return;
   throw Error('표시 확인 시간 초과');
  }catch(error){
   if(seq!==serial)return;
   // An uncertain delivery is never silently duplicated into another window.
   report(data,announce,'호자보드 표시 확인 실패 · 필요하면 별도 학생 화면을 열어 주세요.');
   if(active?.id===requestId){try{await request('/close',{method:'POST',headers:{'Content-Type':'text/plain'},body:requestId})}catch{}if(active?.id===requestId)active=null}
   offerFallback(fallback);
  }
 }
 window.__TT_BOARD_PRESENTATION={
  sendIfReady(data,announce,fallback){if(!canSend())return false;removeFallback();const seq=++serial;void send(data,announce,fallback,seq);return true},
  closeQr(url){if(active?.kind!=='life-qr'||active.url!==url)return;const target=active.id;active=null;++serial;removeFallback();void request('/close',{method:'POST',headers:{'Content-Type':'text/plain'},body:target}).catch(()=>{})}
 };
})();
