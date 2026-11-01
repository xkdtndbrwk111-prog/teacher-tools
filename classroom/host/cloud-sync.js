// EASY keeps everything in this browser. NORMAL also saves to the teacher's Google Sheet:
// five minutes after the last change, after important actions, and on request.
// When the two sides differ, the teacher chooses; the side not chosen is kept as a restore point.
(()=>{
 'use strict';
 const KEY='meta.cloud',QUIET_MS=5*60000,LONGEST_WAIT_MS=20*60000,IMPORTANT_MS=3000,HEAD_CHECK_MS=60000,MAX_BACKOFF_MS=30*60000;
 const cfg=window.__TT_STAGE031_CLASS,store=window.__TT_STORE;
 const root=new URL('../',document.currentScript.src);
 const controls=document.querySelector('.tt-class-controls');
 if(!controls)return;
 let meta=null,cloud=null,clientId='',mods=null,state='easy',busy=false,firstDirtyAt=0,lastChangeAt=0,importantAt=0,retryAt=0,backoff=60000,lastHeadCheck=0,pendingDiff=null,lastSaved='',detail='';
 const chip=document.createElement('button');chip.type='button';chip.id='tt-cloud-chip';controls.append(chip);
 const settings=document.createElement('div');settings.className='tt-lock-settings';settings.hidden=true;settings.setAttribute('role','dialog');settings.setAttribute('aria-modal','true');settings.setAttribute('aria-labelledby','tt-cloud-title');
 settings.innerHTML=`<div class="tt-lock-settings-card tt-cloud-card">
  <h2 id="tt-cloud-title">저장 방식</h2>
  <label class="tt-cloud-mode"><input type="radio" name="tt-cloud-mode" value="easy"><span><strong>EASY</strong> 이 브라우저에만 저장합니다. 로그인이 필요 없습니다.</span></label>
  <label class="tt-cloud-mode"><input type="radio" name="tt-cloud-mode" value="normal"><span><strong>NORMAL</strong> 브라우저에 저장하고, 내 구글 시트에도 저장합니다. 다른 PC에서 이어 쓸 수 있습니다.</span></label>
  <p id="tt-cloud-note"></p>
  <p>학생 이름, 성적, 체육 능력치가 교사 본인의 구글 드라이브에 암호 없이 저장됩니다. 학교 개인정보 기준을 확인해 주세요. 시트에서 직접 고친 값은 프로그램에 반영되지 않습니다.</p>
  <p id="tt-cloud-state" role="status"></p>
  <p id="tt-cloud-error" class="tt-lock-error" role="alert"></p>
  <div class="tt-lock-settings-actions"><button type="button" id="tt-cloud-connect">구글 연결</button><button type="button" id="tt-cloud-save">지금 저장</button><span></span><button type="button" id="tt-cloud-close">닫기</button></div>
 </div>`;
 const diff=document.createElement('div');diff.className='tt-lock-settings';diff.hidden=true;diff.setAttribute('role','dialog');diff.setAttribute('aria-modal','true');diff.setAttribute('aria-labelledby','tt-diff-title');
 diff.innerHTML=`<div class="tt-lock-settings-card tt-diff-card">
  <h2 id="tt-diff-title">자료가 다릅니다</h2>
  <p id="tt-diff-text"></p>
  <div class="tt-diff-sides"><div><strong>이 브라우저</strong><span id="tt-diff-local"></span></div><div><strong>구글 시트</strong><span id="tt-diff-remote"></span></div></div>
  <p id="tt-diff-classes"></p>
  <p>고르지 않은 쪽은 지워지지 않습니다. 백업 창의 되돌리기로 돌아갈 수 있습니다.</p>
  <p id="tt-diff-error" class="tt-lock-error" role="alert"></p>
  <div class="tt-lock-settings-actions"><button type="button" id="tt-diff-later">나중에</button><span></span><button type="button" id="tt-diff-push">이 브라우저 자료 쓰기</button><button type="button" id="tt-diff-pull">구글 자료 불러오기</button></div>
 </div>`;
 document.body.append(settings,diff);
 const $=id=>document.getElementById(id);
 const time=iso=>{const d=new Date(iso);return Number.isNaN(+d)?'':d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})};
 const studentView=()=>{
  const seats=$('playbackScreen'),pitch=$('pePitchReveal');
  return(seats&&!seats.classList.contains('hidden'))||(pitch&&pitch.getAttribute('aria-hidden')==='false');
 };
 function setState(next,text=''){
  state=next;detail=text;
  const labels={easy:'💾 EASY',login:'☁ 구글 연결 필요',saving:'☁ 저장 중',saved:`☁ 구글 ${lastSaved}`,waiting:'☁ 저장 대기',paused:'☁ 구글 저장 멈춤',diff:'☁ 자료 차이 확인'};
  chip.textContent=labels[next]||'☁';
  chip.classList.toggle('is-alert',['login','paused','diff'].includes(next));
  const mode=document.querySelector('.tt-backup-mode span');
  if(mode)mode.textContent=next==='easy'?'Google 연결 없음':(meta?.email?`구글 저장 · ${meta.email}`:'구글 저장');
  if(!settings.hidden)renderSettings();
 }
 const needsLogin=()=>!cloud?.available();
 function friendly(error){
  const code=error?.message||'';
  if(/SESSION_EXPIRED|PERMISSION_401/.test(code))return'구글 로그인이 끝났습니다. 다시 연결해 주세요.';
  if(/POPUP_CLOSED|OAUTH_DENIED/.test(code))return'구글 연결을 마치지 못했습니다.';
  if(/SCOPE_INCOMPLETE/.test(code))return'구글 드라이브 권한을 허용해야 저장할 수 있습니다.';
  if(/SDK_LOADING/.test(code))return'구글 연결을 준비 중입니다. 잠시 후 다시 눌러 주세요.';
  if(/PERMISSION_403|API_429|API_5/.test(code))return'구글이 잠시 요청을 받지 않습니다. 곧 다시 시도합니다.';
  if(/Failed to fetch|NetworkError/.test(code))return'인터넷에 연결되어 있지 않습니다. 브라우저에는 계속 저장됩니다.';
  return code||'알 수 없는 오류';
 }
 async function loadModules(){
  if(!mods){
   const [c,b,cf,m]=await Promise.all([import(new URL('host/cloud-store.mjs',root).href),import(new URL('host/workspace-bundle.mjs',root).href),import(new URL('grades/google-config.mjs',root).href),import(new URL('grades/model.mjs',root).href)]);
   mods={...c,bundle:b,schoolYear:m.schoolYear};clientId=cf.GOOGLE_CLIENT_ID;
  }
  return mods;
 }
 function loadGoogleScript(){
  if(window.google?.accounts?.oauth2||document.querySelector('script[data-tt-gis]'))return;
  const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.dataset.ttGis='1';document.head.append(s);
 }
 async function ready(){
  const m=await loadModules();
  if(!cloud){cloud=new m.ClassroomCloud(clientId);cloud.restoreSession()}
  return m;
 }
 const saveMeta=async next=>{meta=next;await store.commit({put:new Map([[KEY,next]]),quiet:true})};
 const deviceName=()=>{
  if(!meta?.deviceId)return'';
  const platform=navigator.userAgentData?.platform||navigator.platform||'PC';
  return`${platform}-${meta.deviceId}`;
 };
 const gradeKey=year=>`TT_STAGE03_${cfg.installId}_${year}`;
 async function localPayload(year,{flush=false}={}){
  const m=await loadModules();
  if(flush&&window.__TT_STAGE031_FLUSH_GRADE&&!await window.__TT_STAGE031_FLUSH_GRADE())throw Error('성적 저장이 완료되지 않았습니다.');
  window.__TT_SAVE_CURRENT_CLASS();
  const registry=JSON.parse(store.getItem(cfg.registryKey));
  const seatAndPe=registry.classes.map(c=>{
   const seating=store.getItem(cfg.makeKey(c.id,'seating')),pe=store.getItem(cfg.makeKey(c.id,'pe'));
   if(!seating)throw Error('반의 자리배치 자료가 없습니다: '+c.name);
   return{id:c.id,seating:JSON.parse(seating),pe:pe?JSON.parse(pe):{}};
  });
  const workspace=await store.read(gradeKey(year));
  const payload=m.bundle.capturePayload({installId:cfg.installId,registry,seatAndPe,gradeYears:workspace?[{year,workspace}]:[],validateSeating:s=>validatePersistentState(s).ok});
  return{payload,workspace:workspace||null,hash:await m.bundle.digestString(JSON.stringify(payload))};
 }
 function isEmpty(payload){
  if((payload.gradeYears||[]).some(y=>y.workspace.gradeValues.some(g=>g.value!==null)||y.workspace.assessments.length))return false;
  return payload.classes.every(c=>!c.seating.history?.length&&!c.seating.assignments?.length&&(!c.seating.students.length||c.seating.students.map(s=>s.name).join()===DEFAULT_NAMES.join()));
 }
 async function push(m,fileId,year,local,baseRevision){
  setState('saving');
  const counts=m.summarize(local.payload);
  const head=await cloud.write(fileId,local.payload,{year,workspace:local.workspace,baseRevision,device:deviceName(),counts});
  lastSaved=time(head.savedAt);
  await saveMeta({...meta,fileId,year,baseRevision:head.revision,baseHash:local.hash,lastSavedAt:head.savedAt,rebase:false});
  firstDirtyAt=0;retryAt=0;backoff=60000;
  setState('saved');
 }
 function showDiff(info){
  pendingDiff=info;settings.hidden=true;setState('diff');
  if(!studentView())openDiff();
 }
 function openDiff(){
  const {kind,local,remoteHead,changed}=pendingDiff;
  const line=(c,when,device)=>`${c?`반 ${c.classes}개 · 학생 ${c.students}명 · 성적 ${c.grades}건`:'내용 없음'}${when?` · ${time(when)} 저장`:''}${device?` · ${device}`:''}`;
  $('tt-diff-text').textContent=kind==='ask-pull'?'구글 시트에 다른 PC에서 저장한 자료가 있습니다. 불러올까요?':'이 브라우저와 구글 시트가 각각 바뀌었습니다. 어느 쪽을 쓸지 골라 주세요.';
  $('tt-diff-local').textContent=line(mods.summarize(local.payload),meta?.lastSavedAt?'':'','');
  $('tt-diff-remote').textContent=line(remoteHead.counts,remoteHead.savedAt,remoteHead.device);
  $('tt-diff-classes').textContent=changed.length?`내용이 다른 반: ${changed.join(', ')}`:'';
  $('tt-diff-error').textContent='';
  diff.hidden=false;$('tt-diff-later').focus();
 }
 // Whatever is on the other side when saving is decided by this one routine.
 async function syncNow({manual=false}={}){
  if(meta?.mode!=='normal'||busy)return;
  if(pendingDiff&&!manual)return;
  const m=await ready();
  if(needsLogin()){setState('login');return}
  busy=true;
  try{
   const year=m.schoolYear();
   const local=await localPayload(year,{flush:manual});
   let fileId=meta.year===year&&meta.sub===cloud.user.sub?meta.fileId:null;
   let baseRevision=fileId?meta.baseRevision:null,baseHash=fileId?meta.baseHash:null;
   if(!fileId){
    const files=(await cloud.listFiles()).filter(f=>f.year===year);
    fileId=files[0]?.id||await cloud.createFile(year);
    await saveMeta({...meta,mode:'normal',sub:cloud.user.sub,email:cloud.user.email,fileId,year,baseRevision:null,baseHash:null,rebase:false});
   }
   const remoteHead=await cloud.readHead(fileId);
   lastHeadCheck=Date.now();
   if(meta.rebase&&remoteHead.revision===meta.baseRevision){
    await saveMeta({...meta,baseHash:local.hash,rebase:false});baseHash=local.hash;
   }
   if(remoteHead.revision&&remoteHead.revision===baseRevision&&local.hash===baseHash){firstDirtyAt=0;if(!lastSaved)lastSaved=time(meta.lastSavedAt);setState('saved');return}
   const action=m.decideSync({localHash:local.hash,baseHash,remoteRevision:remoteHead.revision,baseRevision,localEmpty:isEmpty(local.payload)});
   if(action==='push'){await push(m,fileId,year,local,baseRevision);pendingDiff=null}
   else if(action==='ask-pull'||action==='conflict'){
    const snapshot=await cloud.readSnapshot(fileId);
    if(snapshot.payload&&await m.bundle.digestString(JSON.stringify(snapshot.payload))===local.hash){
     await saveMeta({...meta,fileId,year,baseRevision:snapshot.head.revision,baseHash:local.hash});firstDirtyAt=0;lastSaved=time(snapshot.head.savedAt);setState('saved');return;
    }
    showDiff({kind:action,local,remoteHead,changed:m.changedClasses(local.payload,snapshot.payload),fileId,year});
   }
  }catch(error){
   console.warn('구글 저장 실패',error);
   const code=error?.message||'';
   if(code==='REMOTE_CHANGED'){await refreshAfterConflict();return}
   if(/SESSION_EXPIRED|PERMISSION_401/.test(code)){cloud.signOut();setState('login',friendly(error));return}
   retryAt=Date.now()+backoff;backoff=Math.min(backoff*2,MAX_BACKOFF_MS);
   setState('paused',friendly(error));
  }finally{busy=false}
 }
 async function refreshAfterConflict(){busy=false;await syncNow()}
 async function usePull(){
  const info=pendingDiff;if(!info)return;
  const m=await ready();
  const snapshot=await cloud.readSnapshot(info.fileId);
  const full=await window.__TT_BACKUP.capture();
  const incoming=m.bundle.remapInstall(snapshot.payload,cfg.installId,{validateSeating:s=>validatePersistentState(s).ok});
  const extra=new Map();
  // A new PC also gets the grades of earlier school years.
  for(const file of await cloud.listFiles()){
   if(file.year>=info.year||await store.read(gradeKey(file.year)))continue;
   const past=await cloud.readSnapshot(file.id);
   if(!past.payload)continue;
   const moved=m.bundle.remapInstall(past.payload,cfg.installId,{validateSeating:s=>validatePersistentState(s).ok});
   const old=moved.gradeYears.find(y=>y.year===file.year);
   if(old)extra.set(gradeKey(file.year),old.workspace);
  }
  extra.set(KEY,{...meta,fileId:info.fileId,year:info.year,baseRevision:snapshot.head.revision,baseHash:null,lastSavedAt:snapshot.head.savedAt,rebase:true});
  await window.__TT_BACKUP.applyPayload(incoming,{point:{createdAt:new Date().toISOString(),payload:full},keepYears:true,extra});
  location.reload();
 }
 async function usePush(){
  const info=pendingDiff;if(!info)return;
  const m=await ready();
  const snapshot=await cloud.readSnapshot(info.fileId);
  if(snapshot.payload){
   const moved=m.bundle.remapInstall(snapshot.payload,cfg.installId,{validateSeating:s=>validatePersistentState(s).ok});
   await store.commit({put:new Map([[`TT_RESTORE_POINT_${cfg.installId}`,{createdAt:new Date().toISOString(),payload:moved}]]),quiet:true});
  }
  const local=await localPayload(info.year,{flush:true});
  await push(m,info.fileId,info.year,local,snapshot.head.revision);
  pendingDiff=null;
 }
 function bindDiff(id,action){
  $(id).addEventListener('click',async()=>{
   $('tt-diff-error').textContent='';
   try{busy=true;await action();diff.hidden=true}
   catch(error){console.warn(error);$('tt-diff-error').textContent=friendly(error)}
   finally{busy=false}
  });
 }
 bindDiff('tt-diff-pull',usePull);bindDiff('tt-diff-push',usePush);
 $('tt-diff-later').addEventListener('click',()=>{diff.hidden=true});

 function renderSettings(){
  const normal=meta?.mode==='normal';
  settings.querySelectorAll('[name="tt-cloud-mode"]').forEach(r=>{r.checked=r.value===(normal?'normal':'easy')});
  const noClient=!clientId;
  settings.querySelector('[value="normal"]').disabled=noClient;
  $('tt-cloud-note').textContent=noClient?'NORMAL을 쓰려면 Google 연결값을 먼저 설정해야 합니다. (안내: classroom/README_KO.md)':'';
  $('tt-cloud-connect').hidden=!normal||!needsLogin();
  $('tt-cloud-save').hidden=!normal||needsLogin();
  const mail=cloud?.user?.email||meta?.email||'';
  $('tt-cloud-state').textContent=!normal?'지금은 이 브라우저에만 저장합니다.':`${mail?mail+' · ':''}${state==='saved'?`마지막 저장 ${lastSaved}`:state==='diff'?'자료 차이를 확인해 주세요.':needsLogin()?'구글 연결이 필요합니다.':'저장 대기 중'}`;
  $('tt-cloud-error').textContent=detail;
 }
 settings.addEventListener('change',async event=>{
  if(event.target.name!=='tt-cloud-mode')return;
  try{
   await ready();
   if(event.target.value==='normal'){
    loadGoogleScript();
    await saveMeta({mode:'normal',deviceId:meta?.deviceId||crypto.randomUUID().slice(0,4)});
    setState('login');
   }else{
    cloud?.signOut();
    pendingDiff=null;
    await store.commit({del:[KEY],quiet:true});meta=null;
    setState('easy');
   }
  }catch(error){detail=friendly(error)}
  renderSettings();
 });
 async function connect(){
  detail='';
  try{
   await ready();
   await cloud.signIn();
   await saveMeta({...meta,email:cloud.user.email});
   setState('waiting');
   if(!diff.hidden)diff.hidden=true;
   await syncNow();
  }catch(error){setState('login',friendly(error))}
  if(!settings.hidden)renderSettings();
 }
 $('tt-cloud-connect').addEventListener('click',()=>void connect());
 $('tt-cloud-save').addEventListener('click',()=>void syncNow({manual:true}));
 $('tt-cloud-close').addEventListener('click',()=>{settings.hidden=true;if(pendingDiff&&state==='diff'&&!studentView())openDiff()});
 chip.addEventListener('click',async()=>{
  await ready();
  // Google's sign-in window must open directly from a click.
  if(meta?.mode==='normal'&&needsLogin()&&window.google?.accounts?.oauth2){void connect();return}
  if(pendingDiff){openDiff();return}
  settings.hidden=false;renderSettings();
 });

 function onChange(){
  if(meta?.mode!=='normal')return;
  const now=Date.now();
  lastChangeAt=now;if(!firstDirtyAt)firstDirtyAt=now;
  if(state==='saved')setState('waiting');
 }
 store.onChange=onChange;
 try{new BroadcastChannel('tt-classroom-changes').onmessage=event=>{onChange();if(event.data?.important)importantAt=Date.now()+IMPORTANT_MS}}catch{}
 document.getElementById('confirmAssignment')?.addEventListener('click',()=>{if(meta?.mode==='normal')importantAt=Date.now()+IMPORTANT_MS});
 function tick(){
  if(meta?.mode!=='normal')return;
  if(needsLogin()){if(state!=='login'&&state!=='diff')setState('login');return}
  if(pendingDiff){if(diff.hidden&&!studentView()&&state!=='diff')setState('diff');return}
  if(Date.now()<retryAt)return;
  const now=Date.now();
  const due=(importantAt&&now>=importantAt)||(firstDirtyAt&&(now-lastChangeAt>=QUIET_MS||now-firstDirtyAt>=LONGEST_WAIT_MS))||state==='paused';
  if(due){importantAt=0;void syncNow()}
 }
 window.addEventListener('focus',()=>{
  if(meta?.mode==='normal'&&!needsLogin()&&!busy&&!pendingDiff&&Date.now()-lastHeadCheck>=HEAD_CHECK_MS)void syncNow();
 });
 (async()=>{
  meta=await store.read(KEY)||null;
  await loadModules().catch(error=>console.warn(error));
  if(meta?.mode!=='normal'){setState('easy');return}
  loadGoogleScript();
  await ready();
  if(!meta.deviceId)await saveMeta({...meta,deviceId:crypto.randomUUID().slice(0,4)});
  if(needsLogin()){setState('login');return}
  setState('waiting');
  await syncNow();
 })().catch(error=>{console.warn(error);setState('paused',friendly(error))});
 setInterval(tick,15000);
})();
