// Mini games live on the web; an obsolete cached page must never reach the V3 coin ledger.
 const miniOrigin='https://xkdtndbrwk111-prog.github.io',miniUrl=miniOrigin+'/hoja-minigames/?mode=board&embed=dashboard&coin=3';
 const miniDialog=$('#miniGames'),miniFrame=$('#miniFrame'),miniNotice=$('#miniNotice');
 const miniSessionValid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
 let miniTimer=0,miniTookFullscreen=false,miniRetryCount=0,miniLoadSerial=0;
 function miniLoad(retry=false){
  clearTimeout(miniTimer);if(!retry)miniRetryCount=0;
  miniNotice.hidden=false;$('#miniNoticeText').textContent='최신 미니게임을 불러오는 중입니다.';$('#miniRetry').hidden=true;
  miniFrame.src=miniUrl+'&fresh='+Date.now()+'-'+(++miniLoadSerial);
  miniTimer=setTimeout(()=>{$('#miniNoticeText').textContent='미니게임을 불러오지 못했습니다. 다시 시도해 주세요.';$('#miniRetry').hidden=false},30000)
 }
 function miniOpen(){if(miniDialog.open)return;miniDialog.showModal();miniLoad();if(!document.fullscreenElement){document.documentElement.requestFullscreen().then(()=>{miniTookFullscreen=true;try{navigator.keyboard?.lock?.(['Escape']).catch(()=>{})}catch{}}).catch(()=>{})}}
 function miniClose(){clearTimeout(miniTimer);miniFrame.removeAttribute('src');if(miniDialog.open)miniDialog.close();if(miniTookFullscreen){miniTookFullscreen=false;try{navigator.keyboard?.unlock?.()}catch{}if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}}
 $('#openMiniGames').onclick=miniOpen;$('#miniBack').onclick=miniClose;$('#miniRetry').onclick=()=>miniLoad();
 miniDialog.addEventListener('cancel',e=>e.preventDefault());
 window.addEventListener('message',e=>{
  if(e.origin!==miniOrigin||e.source!==miniFrame.contentWindow||!miniDialog.open)return;
  const type=e.data&&e.data.type;
  if(type==='hoja-ready'){
   if(!miniSessionValid(e.data.sessionId)){
    if(miniRetryCount++===0){miniLoad(true);return}
    clearTimeout(miniTimer);miniNotice.hidden=false;$('#miniNoticeText').textContent='이전 버전의 미니게임입니다. 최신 버전으로 다시 불러와 주세요.';$('#miniRetry').hidden=false;return
   }
   clearTimeout(miniTimer);miniNotice.hidden=true;miniFrame.focus()
  }else if(type==='hoja-close')miniClose()
 });
