/* Teacher Tools: launch a separate, read-only student display window.
   Reads neither grades nor IndexedDB. All student-visible data is sent via a
   one-use, randomized BroadcastChannel. Runs only in manager mode. */
(()=>{
  'use strict';
  const control=document.getElementById('openPlayback');
  if(!control||!('BroadcastChannel' in window))return;
  let autoTarget=true,windowDetails=null,latestDashboard=null,lastNotice='';
  try{autoTarget=localStorage.getItem('tt.student-window.auto-target')!=='0'}catch{}
  const pending=new Map();
  const announce=(message)=>{
    lastNotice=message;
    const node=document.getElementById('tt-student-window-status');
    if(node)node.textContent=message;
  };
  const placementEnabled=()=>autoTarget;
  const area=s=>({left:Number(s.availLeft??s.left),top:Number(s.availTop??s.top),width:Number(s.availWidth??s.width),height:Number(s.availHeight??s.height)});
  const overlap=(a,b)=>{
    const x=Math.max(0,Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left));
    const y=Math.max(0,Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top));
    return x*y;
  };
  const center=s=>({x:s.left+s.width/2,y:s.top+s.height/2});
  const distance=(a,b)=>{
    const x=center(a).x-center(b).x,y=center(a).y-center(b).y;
    return Math.hypot(x,y);
  };
  function chooseTarget(details,dashboard){
    const screens=Array.from(details?.screens||[]);
    if(!screens.length)return null;
    const current=details.currentScreen||screens.find(s=>{
      const a=area(s);return a.left<=window.screenX&&a.left+a.width>window.screenX;
    })||screens[0];
    // Wallpaper placement is preferred when V1.34+ supplies its screen bounds.
    // Match by overlap, not DISPLAY1/DISPLAY2 names (names vary by OS/browser).
    const target=dashboard?.wallpaper===true&&dashboard.screen;
    if(target){
      const b={left:Number(target.left),top:Number(target.top),width:Number(target.width),height:Number(target.height)};
      if(Object.values(b).every(Number.isFinite)&&b.width>0&&b.height>0){
        const order=screens.map(s=>({screen:s,intersect:overlap(area(s),b),distance:distance(area(s),b)}))
          .sort((a,b)=>b.intersect-a.intersect||a.distance-b.distance);
        // Do not guess an unrelated monitor from invalid/mixed-DPI coordinates.
        if(order[0]?.intersect>0)return order[0].screen;
      }
    }
    return screens.find(s=>s!==current)||current;
  }
  async function getScreens(requestPermission){
    if(!window.getScreenDetails)return null;
    try{
      if(!requestPermission){
        const p=await navigator.permissions?.query?.({name:'window-management'});
        if(p&&p.state!=='granted')return null;
      }
      windowDetails=await window.getScreenDetails();
      return windowDetails;
    }catch{return null}
  }
  async function getDashboard(){
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1300);
      try{
        const res=await fetch('http://127.0.0.1:17439/api/board-status',
          {method:'GET',mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal});
        if(!res.ok)return null;
        const obj=await res.json();
        latestDashboard=obj?.service==='teacher-tools-local'?obj:null;
        return latestDashboard;
      }finally{clearTimeout(timer)}
    }catch{return null}
  }
  async function place(popup){
    if(!autoTarget)return;
    const [screens,dashboard]=await Promise.all([getScreens(false),getDashboard()]);
    if(!popup||popup.closed)return;
    if(!screens){announce('학생 창 열림 · 자동 배치하려면 더보기에서 모니터 권한을 먼저 허용해 주세요.');return}
    const target=chooseTarget(screens,dashboard);
    if(!target)return;
    const loc=area(target);
    try{
      popup.moveTo(Math.round(loc.left),Math.round(loc.top));
      popup.resizeTo(Math.max(560,Math.round(loc.width)),Math.max(420,Math.round(loc.height)));
      popup.focus();
      announce('학생 창 열림 · '+(dashboard?.wallpaper&&dashboard.screen?'대시보드 화면':'다른 모니터')+' 자동 배치 요청 완료');
    }catch{
      announce('학생 창 열림 · 브라우저가 위치 변경을 제한해 수동 이동이 필요합니다.');
    }
  }
  const randomSession=()=>Array.from(crypto.getRandomValues(new Uint8Array(20)),n=>n.toString(16).padStart(2,'0')).join('');
  // The preview is not public until the CURRENT version has been confirmed.
  function seatingApproved(){
    return Boolean(classState.assignments.length&&previewRevision!==null&&confirmedRevision===previewRevision&&!historyView);
  }
  function peApproved(data){
    if(!data||!Array.isArray(data.teams))return false;
    const people=data.teams.flat();
    const roster=new Set(classState.students.map(item=>item.id));
    const ids=people.map(item=>item.id);
    return roster.size>0&&ids.length===roster.size&&new Set(ids).size===ids.length&&ids.every(id=>roster.has(id));
  }
  function presentationReady(){
    if(document.body.classList.contains('tt-grade-active'))return false;
    try{
      if(document.body.classList.contains('pe-mode'))return peApproved(window.__TT_PE_PUBLIC_VIEW?.snapshot?.());
      return seatingApproved();
    }catch{return false}
  }
  function refreshPresentationButton(){
    const ready=presentationReady();
    const pe=document.body.classList.contains('pe-mode');
    const label=pe?'팀 발표 ▶':'학생 발표 ▶';
    if(control.textContent!==label)control.textContent=label;
    control.disabled=!ready;
    control.classList.toggle('tt-student-ready',ready);
    control.classList.toggle('tt-student-unready',!ready);
    control.setAttribute('aria-label',label+(ready?' · 클릭하여 학생용 창 열기':' · 확정 후 이용 가능'));
    control.title=ready?'확정된 자료를 학생 화면으로 발표':'먼저 '+(pe?'팀을':'자리배치를')+' 확정해 주세요';
  }
  function snapshot(){
    if(document.body.classList.contains('tt-grade-active'))throw Error('성적 관리 화면에서는 학생 창을 열 수 없습니다.');
    if(document.body.classList.contains('pe-mode')){
      const data=window.__TT_PE_PUBLIC_VIEW?.snapshot?.();
      if(!peApproved(data))throw Error('먼저 새 팀 편성 후 팀을 확정해 주세요.');
      return {kind:'pe',payload:data};
    }
    if(!seatingApproved())throw Error('먼저 현재 자리배치를 확정해 주세요.');
    return {kind:'seating',payload:buildPlaybackInput()};
  }
  function show(){
    let data;try{data=snapshot()}catch(error){alert(error.message);return}
    const session=randomSession();
    // Open synchronously during the button click to avoid popup-blocking.
    const url=new URL(location.href);url.search='?view=student';url.hash='#'+session;
    const popup=window.open(url.href,'_blank','popup=yes,width=1100,height=720,left=60,top=60');
    if(!popup){alert('학생 화면이 차단됐습니다. 이 사이트에서 팝업을 허용해 주세요.');return}
    try{popup.opener=null}catch{}
    const channel=new BroadcastChannel('tt-public-'+session);
    const key={popup,channel};pending.set(session,key);
    const done=()=>{channel.close();pending.delete(session)};
    const timeout=setTimeout(()=>{done();announce('학생 창의 시작 응답이 없습니다. 학생 창을 확인해 주세요.')},18000);
    channel.onmessage=event=>{
      if(event.data?.type==='ready'){
        channel.postMessage({type:'student-data',data});
        announce('학생 공개 창으로 자료 전달 중…');
      }else if(event.data?.type==='received'){
        clearTimeout(timeout);done();announce('학생 공개 창에 자료 전달 완료');
      }else if(event.data?.type==='error'){
        clearTimeout(timeout);done();announce('학생 창 오류: '+String(event.data.message||'자료 표시 실패'));
      }
    };
    void place(popup);
  }
  // A direct gesture is needed for the first Chrome window-management permission prompt.
  const menu=document.getElementById('tt-hud-more-menu');
  if(menu){
    const box=document.createElement('div');box.className='tt-student-placement-settings';
    const label=document.createElement('label');
    label.style.cssText='display:flex;align-items:center;gap:8px;margin:8px 0;color:#fff;font:12px system-ui';
    const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=autoTarget;
    label.append(toggle,document.createTextNode('학생 화면 자동 모니터 배치'));
    const grant=document.createElement('button');grant.type='button';
    grant.textContent='🖥 모니터 배치 권한 허용';
    grant.addEventListener('click',async()=>{
      const details=await getScreens(true);
      announce(details?'모니터 '+details.screens.length+'개 확인 · 자동 배치 가능':'브라우저에서 모니터 권한을 사용할 수 없습니다.');
    });
    toggle.addEventListener('change',()=>window.__TT_STUDENT_POPUP.setAutoTarget(toggle.checked));
    const status=document.createElement('p');status.id='tt-student-window-status';
    status.style.cssText='font-size:11px;color:#bdd3ed;line-height:1.4;margin:4px 0';
    box.append(label,grant,status);menu.append(box);
  }
  control.addEventListener('click',event=>{event.stopImmediatePropagation();event.preventDefault();show()},{capture:true});
  // Status, mode and history updates arrive from the existing editor modules.
  // Periodic reconciliation also covers in-memory undo/class changes with no DOM notice.
  const readinessObserver=new MutationObserver(refreshPresentationButton);
  const statusNode=document.getElementById('assignmentStatus');
  if(statusNode)readinessObserver.observe(statusNode,{childList:true,characterData:true,subtree:true});
  readinessObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  readinessObserver.observe(control,{childList:true,characterData:true,subtree:true});
  for(const id of ['generateAssignment','confirmAssignment','undoButton','redoButton']){
    document.getElementById(id)?.addEventListener('click',()=>queueMicrotask(refreshPresentationButton));
  }
  const readinessTimer=setInterval(refreshPresentationButton,1250);
  window.addEventListener('pagehide',()=>{clearInterval(readinessTimer);readinessObserver.disconnect()},{once:true});
  refreshPresentationButton();
  window.__TT_STUDENT_POPUP={
    chooseTarget,requestPermission:()=>getScreens(true),
    setAutoTarget(v){autoTarget=Boolean(v);try{localStorage.setItem('tt.student-window.auto-target',autoTarget?'1':'0')}catch{}announce(autoTarget?'학생 창 자동 모니터 배치 켜짐':'학생 창 자동 모니터 배치 꺼짐')},
    getAutoTarget:placementEnabled,getStatus:()=>lastNotice,
    checkDashboard:getDashboard
  };
})();