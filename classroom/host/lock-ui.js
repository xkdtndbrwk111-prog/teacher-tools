// Teacher lock: covers the screen so students cannot read names and grades on the board.
// It does not encrypt the stored data. Loaded before the seating scripts so nothing shows first.
(()=>{
 'use strict';
 const KEY='meta.lock',ITERATIONS=200000,MAX_TRIES=5,WAIT_MS=30000;
 const store=window.__TT_STORE;
 let record=null,locked=false,lastActive=Date.now(),tries=0,blockedUntil=0,afterUnlock=null,bypassGate=false;
 const watchedFrames=new WeakSet();
 const hex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const unhex=text=>Uint8Array.from(text.match(/../g),x=>parseInt(x,16));
 const randomHex=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
 async function derive(secret,salt,iterations){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations},key,256));
 }
 const validPin=pin=>/^\d{4,8}$/.test(pin);
 const check=async(secret,part)=>await derive(secret,part.salt,part.iterations)===part.hash;
 const seal=async secret=>{const salt=randomHex(16);return{salt,iterations:ITERATIONS,hash:await derive(secret,salt,ITERATIONS)}};
 function newRecoveryCode(){
  const letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',values=crypto.getRandomValues(new Uint8Array(10));
  const code=[...values].map(v=>letters[v%letters.length]).join('');
  return code.slice(0,5)+'-'+code.slice(5);
 }
 const normalizeCode=code=>code.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 async function savePin(pin,idleMinutes){
  const code=newRecoveryCode();
  const next={pin:await seal(pin),recovery:await seal(normalizeCode(code)),idleMinutes};
  await store.commit({put:new Map([[KEY,next]])});
  record=next;refreshButtons();
  return code;
 }
 function setInert(on){for(const el of document.body.children)if(!el.classList.contains('tt-lock'))el.inert=on}

 // Lock screen. The keypad sits low so it can be reached on the classroom board.
 const screen=document.createElement('div');screen.className='tt-lock';screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-labelledby','tt-lock-title');
 screen.innerHTML=`<div class="tt-lock-card">
  <h1 id="tt-lock-title">교실 매니저 잠금</h1>
  <form id="tt-lock-form" autocomplete="off">
   <input id="tt-lock-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off" aria-label="잠금 번호">
   <div class="tt-lock-keys">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-key="${n}">${n}</button>`).join('')}<button type="button" data-key="back" aria-label="한 글자 지우기">⌫</button><button type="button" data-key="0">0</button><button type="submit" class="tt-lock-ok">확인</button></div>
  </form>
  <form id="tt-lock-recovery-form" autocomplete="off" hidden>
   <label>복구 코드<input id="tt-lock-code" type="text" autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX"></label>
   <button type="submit" class="tt-lock-ok">코드 확인</button>
  </form>
  <p id="tt-lock-message" role="alert"></p>
  <button type="button" id="tt-lock-forgot" class="tt-lock-link">번호를 잊었어요</button>
 </div>`;
 const pinInput=screen.querySelector('#tt-lock-pin'),message=screen.querySelector('#tt-lock-message');
 const pinForm=screen.querySelector('#tt-lock-form'),codeForm=screen.querySelector('#tt-lock-recovery-form'),codeInput=screen.querySelector('#tt-lock-code'),forgot=screen.querySelector('#tt-lock-forgot');
 function showPinForm(){pinForm.hidden=false;codeForm.hidden=true;forgot.textContent='번호를 잊었어요';pinInput.value='';codeInput.value=''}
 function lockNow(){
  if(!record)return;
  locked=true;document.activeElement?.blur?.();
  setInert(true);screen.hidden=false;showPinForm();message.textContent='';pinInput.focus();
 }
 function unlock(){
  locked=false;tries=0;screen.hidden=true;pinInput.value='';codeInput.value='';setInert(false);lastActive=Date.now();
  const next=afterUnlock;afterUnlock=null;if(next)next();
 }
 screen.querySelector('.tt-lock-keys').addEventListener('click',event=>{
  const key=event.target.closest('[data-key]')?.dataset.key;if(!key)return;
  pinInput.value=key==='back'?pinInput.value.slice(0,-1):(pinInput.value+key).slice(0,8);
 });
 pinForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const wait=blockedUntil-Date.now();
  if(wait>0){message.textContent=`잠시 후 다시 시도하세요. (${Math.ceil(wait/1000)}초)`;return}
  const pin=pinInput.value;pinInput.value='';
  if(await check(pin,record.pin))return unlock();
  if(++tries>=MAX_TRIES){tries=0;blockedUntil=Date.now()+WAIT_MS;message.textContent='번호가 여러 번 틀렸습니다. 30초 뒤에 다시 시도하세요.'}
  else message.textContent='번호가 맞지 않습니다.';
 });
 forgot.addEventListener('click',()=>{
  const toCode=codeForm.hidden;
  pinForm.hidden=toCode;codeForm.hidden=!toCode;message.textContent='';
  forgot.textContent=toCode?'번호로 열기':'번호를 잊었어요';
  (toCode?codeInput:pinInput).focus();
 });
 codeForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const wait=blockedUntil-Date.now();
  if(wait>0){message.textContent=`잠시 후 다시 시도하세요. (${Math.ceil(wait/1000)}초)`;return}
  if(await check(normalizeCode(codeInput.value),record.recovery)){unlock();openSettings({recovered:true});return}
  if(++tries>=MAX_TRIES){tries=0;blockedUntil=Date.now()+WAIT_MS}
  message.textContent='복구 코드가 맞지 않습니다.';
 });

 // Setup and settings.
 const dialog=document.createElement('div');dialog.className='tt-lock-settings';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','tt-lock-settings-title');
 dialog.innerHTML=`<form class="tt-lock-settings-card" autocomplete="off">
  <h2 id="tt-lock-settings-title">잠금 설정</h2>
  <p>잠금은 학생에게 화면이 보이지 않게 가리는 기능입니다. 저장된 자료를 암호화하지는 않습니다.</p>
  <label id="tt-lock-current-row">지금 번호<input id="tt-lock-current" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
  <label><span id="tt-lock-new-label">새 번호 (숫자 4~8자리)</span><input id="tt-lock-new" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
  <label>새 번호 확인<input id="tt-lock-new2" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
  <label>자동 잠금<select id="tt-lock-idle"><option value="5">5분 뒤</option><option value="10">10분 뒤</option><option value="30">30분 뒤</option><option value="0">사용 안 함</option></select></label>
  <p id="tt-lock-settings-error" class="tt-lock-error" role="alert"></p>
  <div id="tt-lock-code-box" class="tt-lock-code-box" hidden><strong>복구 코드</strong><code id="tt-lock-code-value"></code><span>번호를 잊었을 때 필요합니다. 지금 적어 두세요. 다시 볼 수 없습니다.</span></div>
  <div class="tt-lock-settings-actions"><button type="button" id="tt-lock-remove" class="tt-lock-danger">잠금 끄기</button><span></span><button type="button" id="tt-lock-cancel">닫기</button><button type="submit" id="tt-lock-save">저장</button></div>
 </form>`;
 const field=id=>dialog.querySelector('#'+id),settingsError=field('tt-lock-settings-error');
 let recovered=false;
 function openSettings({recovered:fromCode=false}={}){
  recovered=fromCode;
  for(const id of ['tt-lock-current','tt-lock-new','tt-lock-new2'])field(id).value='';
  settingsError.textContent=fromCode?'새 번호를 정해 주세요.':'';
  field('tt-lock-code-box').hidden=true;field('tt-lock-save').hidden=false;
  field('tt-lock-settings-title').textContent=record?'잠금 설정':'잠금 번호 만들기';
  field('tt-lock-current-row').hidden=!record||recovered;
  field('tt-lock-remove').hidden=!record||recovered;
  field('tt-lock-cancel').hidden=recovered;
  field('tt-lock-new-label').textContent=record&&!recovered?'새 번호 (바꿀 때만, 숫자 4~8자리)':'새 번호 (숫자 4~8자리)';
  field('tt-lock-idle').value=String(record?.idleMinutes??10);
  dialog.hidden=false;(record&&!recovered?field('tt-lock-current'):field('tt-lock-new')).focus();
 }
 function closeSettings(){dialog.hidden=true;refreshButtons()}
 field('tt-lock-cancel').addEventListener('click',closeSettings);
 async function currentPinOk(){
  if(!record||recovered)return true;
  if(await check(field('tt-lock-current').value,record.pin))return true;
  settingsError.textContent='지금 번호가 맞지 않습니다.';field('tt-lock-current').value='';return false;
 }
 dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();settingsError.textContent='';
  const pin=field('tt-lock-new').value,idle=Number(field('tt-lock-idle').value);
  const changing=!record||recovered||pin!==''||field('tt-lock-new2').value!=='';
  if(changing&&!validPin(pin)){settingsError.textContent='번호는 숫자 4~8자리로 입력하세요.';return}
  if(changing&&pin!==field('tt-lock-new2').value){settingsError.textContent='두 번호가 같지 않습니다.';return}
  if(!await currentPinOk())return;
  try{
   if(changing){
    const code=await savePin(pin,idle);
    field('tt-lock-code-value').textContent=code;field('tt-lock-code-box').hidden=false;
    field('tt-lock-save').hidden=true;field('tt-lock-remove').hidden=true;field('tt-lock-cancel').hidden=false;
   }else{
    record={...record,idleMinutes:idle};await store.commit({put:new Map([[KEY,record]])});closeSettings();
   }
  }catch(error){settingsError.textContent='저장하지 못했습니다: '+error.message}
 });
 field('tt-lock-remove').addEventListener('click',async()=>{
  settingsError.textContent='';
  if(!await currentPinOk())return;
  try{await store.commit({del:[KEY]});record=null;closeSettings()}
  catch(error){settingsError.textContent='저장하지 못했습니다: '+error.message}
 });

 let lockButton=null,settingsButton=null;
 function refreshButtons(){
  if(lockButton)lockButton.textContent=record?'🔒 잠금':'🔓 잠금 만들기';
  if(settingsButton)settingsButton.hidden=!record;
 }
 function watchFrame(){
  const frame=document.querySelector('.tt-grade-iframe');
  if(!frame?.contentWindow||watchedFrames.has(frame))return;
  watchedFrames.add(frame);
  for(const type of ['pointerdown','keydown'])frame.contentWindow.addEventListener(type,()=>{lastActive=Date.now()},{passive:true});
 }
 const studentViewOpen=()=>{
  const seats=document.getElementById('playbackScreen'),pitch=document.getElementById('pePitchReveal');
  return(seats&&!seats.classList.contains('hidden'))||(pitch&&pitch.getAttribute('aria-hidden')==='false');
 };
 function checkIdle(){
  watchFrame();
  if(!record||locked||!record.idleMinutes||studentViewOpen()||!dialog.hidden)return;
  if(Date.now()-lastActive>=record.idleMinutes*60000)lockNow();
 }
 window.__TT_LOCK={
  async start(){
   document.body.append(screen,dialog);
   record=await store.read(KEY)||null;
   if(record)lockNow();
  },
  // Called once the top bar and the student view exist.
  mount(){
   const controls=document.querySelector('.tt-class-controls');
   lockButton=document.createElement('button');lockButton.type='button';lockButton.id='tt-lock-now';
   lockButton.onclick=()=>{if(record)lockNow();else openSettings()};
   settingsButton=document.createElement('button');settingsButton.type='button';settingsButton.id='tt-lock-open-settings';settingsButton.textContent='⚙';settingsButton.title='잠금 설정';settingsButton.setAttribute('aria-label','잠금 설정');
   settingsButton.onclick=()=>openSettings();
   controls?.append(lockButton,settingsButton);refreshButtons();
   // Students must not get from their screen back to the teacher screen without the number.
   for(const id of ['backToTeacher','simpleBackToTeacher','pePitchBack'])document.getElementById(id)?.addEventListener('click',event=>{
    if(!record||bypassGate)return;
    event.preventDefault();event.stopImmediatePropagation();
    afterUnlock=()=>{bypassGate=true;event.target.click();bypassGate=false};
    lockNow();
   },true);
   for(const type of ['pointerdown','keydown'])window.addEventListener(type,()=>{lastActive=Date.now()},{passive:true,capture:true});
   setInterval(checkIdle,15000);
   if(locked)setInert(true);
  }
 };
})();
