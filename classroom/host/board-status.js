// Read-only connection check for the Windows Teacher Tools dashboard, V1.33+.
// Disabled by default: only the background/wallpaper launcher enables board actions.
(()=>{
 'use strict';
 const coin=document.getElementById('tt-coin-open'),send=document.getElementById('tt-send-board');
 if(!coin||!send)return;
 const target='http://127.0.0.1:17439/api/board-status';
 const note=document.createElement('p');
 note.id='tt-board-connection-status';
 note.setAttribute('role','status');
 note.style.cssText='margin:8px 0 0;padding:8px;border:1px solid #405775;border-radius:8px;color:#b9d3ef;font-size:11px;line-height:1.4';
 const menu=document.getElementById('tt-hud-more-menu');
 if(menu)menu.append(note);
 let connected=false,pending=false,lastResult='';
 const connectedTitle='Windows 대시보드 배경화면과 연결됨';
 const disconnectedTitle='Windows 대시보드 V1.33 이상을 배경화면 모드로 실행해야 사용할 수 있습니다.';
 const status=()=>connected;
 function show(ok,reason=''){
  connected=Boolean(ok);
  coin.disabled=!connected;
  send.disabled=!connected;
  const title=connected?connectedTitle:disconnectedTitle;
  coin.title=title;send.title=title;
  coin.setAttribute('aria-description',title);
  send.setAttribute('aria-description',title);
  const message=connected?'🟢 칠판 연결됨 · 코인·전송 사용 가능':
   reason==='old'?'⚠ 대시보드를 V1.33 이상으로 업데이트해 주세요.':
   reason==='window'?'⚪ 대시보드 실행 중 · 배경화면 모드가 아닙니다.':
   '⚪ 칠판 연결 안 됨 · 배경화면 실행 필요';
  if(lastResult!==message){note.textContent=message;lastResult=message}
 }
 async function check(){
  if(pending)return connected;
  pending=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500);
  try{
   const response=await fetch(target,{
    method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
    signal:controller.signal,redirect:'error'
   });
   if(!response.ok)throw Error('unavailable');
   const data=await response.json();
   if(data?.service!=='teacher-tools-local')throw Error('unrecognized');
   if(!Number.isInteger(data.version)||data.version<33){show(false,'old');return false}
   show(data.wallpaper===true,data.wallpaper===true?'':'window');
   return connected;
  }catch{
   show(false,'offline');return false;
  }finally{clearTimeout(timer);pending=false}
 }
 show(false);
 void check();
 const interval=setInterval(()=>{if(!document.hidden)void check()},15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()});
 window.addEventListener('focus',()=>void check());
 window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
 window.__TT_BOARD_CONNECTION={check,isConnected:status};
})();