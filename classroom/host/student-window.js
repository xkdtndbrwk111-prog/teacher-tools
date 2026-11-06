/* One-use public student display. No manager storage and no access to opener. */
(()=>{
 'use strict';
 if(new URLSearchParams(location.search).get('view')!=='student')return;
 const key=location.hash.slice(1);
 if(!/^[0-9a-f]{40}$/.test(key)){
  document.body.textContent='유효하지 않은 학생 화면입니다.';
  return;
 }
 try{history.replaceState(null,'',location.pathname+'?view=student')}catch{}
 document.documentElement.classList.add('tt-student-only');
 const status=document.createElement('div');status.id='tt-student-wait';status.textContent='교실 매니저에서 학생 화면 자료를 받는 중…';
 status.style.cssText='position:fixed;inset:0;display:grid;place-items:center;background:#13223d;color:white;font:700 20px system-ui;z-index:100006';
 document.body.append(status);
 const channel=new BroadcastChannel('tt-public-'+key);
 let received=false;
 const onData=event=>{
  if(received||event.data?.type!=='student-data')return;
  received=true;
  try{
   const data=event.data.data;
   if(data?.kind==='seating'&&data.payload?.layout&&Array.isArray(data.payload?.students)){
     showPlayback(data.payload);
     document.querySelectorAll('#backToTeacher,#simpleBackToTeacher').forEach(el=>el.remove());
   }else if(data?.kind==='pe'&&Array.isArray(data.payload?.teams)){
     const api=window.__TT_PE_PUBLIC_VIEW;
     if(!api)throw Error('체육 공개 화면을 준비하지 못했습니다.');
     api.show(data.payload);
     document.getElementById('pePitchBack')?.remove();
   }else throw Error('잘못된 학생 화면 자료입니다.');
   status.remove();
   channel.postMessage({type:'received'});
  }catch(error){
   status.textContent='학생 공개 화면 오류: '+error.message;
   channel.postMessage({type:'error',message:error.message});
  }finally{setTimeout(()=>channel.close(),300)};
 };
 channel.addEventListener('message',onData);
 const hello=setInterval(()=>{if(!received)channel.postMessage({type:'ready'})},350);
 channel.postMessage({type:'ready'});
 setTimeout(()=>{clearInterval(hello);if(!received)status.textContent='매니저 연결이 끊어졌습니다. 학생 화면을 닫고 다시 열어 주세요.'},20000);
})();