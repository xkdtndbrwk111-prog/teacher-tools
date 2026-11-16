import hashlib, pathlib, sys
p=pathlib.Path(sys.argv[1]); raw=p.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='1dd6afd9aa51f589637f4ee23d4f4fda7edeb79ced0d862d96df2f91dda2b481', 'Unexpected podo baseline'
s=raw.decode();
def rep(a,b):
 global s
 assert s.count(a)==1,a[:120]
 s=s.replace(a,b,1)
def span(a,b,v):
 global s
 i=s.index(a); j=s.index(b,i); s=s[:i]+v+s[j:]
rep('document.head.append(css);','''css.textContent+=`
#podoDetail,dialog.podo-pin,#ttClasskit:has([data-ck-page="podo"]:not([hidden])){position:fixed!important;inset:0!important;margin:auto!important;transform:none!important}
#podoDetail .podo-cut-area .podo-ball.filled{background:radial-gradient(circle at 27% 20%,#ecbdf5,#b17ac5 48%,#75438c)}
#podoDetail[data-grape="green"] .podo-cut-area .podo-ball.filled{background:radial-gradient(circle at 27% 20%,#f5ffd6,#bce179 48%,#83ad3c)}
.podo-card .podo-preview{display:none;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:8px;height:100%;width:100%;overflow:hidden;color:#405567;text-align:center}
.podo-card.podo-expanded .podo-overview{display:none}.podo-card.podo-expanded .podo-preview{display:flex}
.podo-preview strong,.podo-preview span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:850;font-size:clamp(12px,1.1vw,20px)}
.podo-preview-grid{display:flex;flex-direction:column;align-items:center;gap:3px}.podo-preview-row{display:flex;gap:3px}
.podo-preview-ball{position:relative;display:grid;place-items:center;width:var(--podo-size);height:var(--podo-size);flex:none;border:1px dashed #a1adb5;border-radius:50%;background:#fff9;font-size:12px;color:#8796a1}
.podo-preview-ball.filled{border:2px solid #fffefa;background:radial-gradient(circle at 27% 20%,#ecbdf5,#b17ac5 48%,#75438c);box-shadow:0 2px 3px #37424a52}
.podo-card[data-grape="green"] .podo-preview-ball.filled{background:radial-gradient(circle at 27% 20%,#f5ffd6,#bce179 48%,#83ad3c)}
.podo-preview-ball img{position:absolute;width:84%;height:84%;inset:8%;object-fit:contain;pointer-events:none}
dialog.podo-pin{box-sizing:border-box;width:min(425px,calc(100vw - 32px));height:max-content;max-height:calc(100dvh - 40px);padding:24px;border:1px solid var(--border);border-radius:18px;background:var(--panel);color:var(--text);overflow:auto}
dialog.podo-pin::backdrop{background:#07182099}.podo-pin form{display:grid;gap:12px}.podo-pin input{width:100%;font-size:26px;text-align:center;letter-spacing:.3em;padding:10px}.podo-pin form div{display:flex;gap:8px}.podo-pin form button{flex:1;min-height:44px}.podo-pin [role="alert"]{color:#c43e43;min-height:1em}
#podoDetail .podo-ball.podo-landing{z-index:4}
#podoDetail .podo-fly{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box;transform-origin:center;pointer-events:none;overflow:hidden;z-index:4}
`;
document.head.append(css);''')
rep('card.prepend(overview);card.tabIndex=0;', '''const preview=document.createElement('div');preview.className='podo-preview';preview.innerHTML='<strong>🍇 우리 반 포도알</strong><span id="podoPreviewInfo"></span><div id="podoPreviewGrid" class="podo-preview-grid" aria-hidden="true"></div>';card.prepend(preview,overview);card.tabIndex=0;''')
rep('draw();if(!detail.open)detail.showModal();requestAnimationFrame(renderCutPaper);','if(!detail.open){detailEpoch++;detailUnlocked=false;detail.showModal()}draw();requestAnimationFrame(renderCutPaper);')
rep("detail.addEventListener('cancel',()=>{ /* native Escape closes this dialog *"+"/ });", "detail.addEventListener('close',()=>{detailUnlocked=false;detailEpoch++;if(pinDialog.open)pinDialog.close();if(activeFlight)activeFlight.cancel()});")
rep("card.classList.toggle('podo-compact',w<235||h<135);",'''card.classList.toggle('podo-compact',w<235||h<135);
 const lengths=rowFor(state?.goal||30),rows=lengths.length,cols=Math.max(...lengths),size=Math.floor(Math.min(72,(w-22-3*(cols-1))/cols,(h-82-3*(rows-1))/rows));
 const expanded=!!state&&w>=235&&h>=180&&size>=22;card.classList.toggle('podo-expanded',expanded);if(expanded){card.style.setProperty('--podo-size',size+'px');renderPreview()}''')
rep('const safe=(s,max=80)', '''let previewKey='';
function renderPreview(){if(!state||!card.classList.contains('podo-expanded'))return;const key=JSON.stringify([state.goal,state.type,state.reward,state.stamps]);if(key===previewKey)return;previewKey=key;const frag=document.createDocumentFragment();let i=0;for(const len of rowFor(state.goal)){const row=document.createElement('div');row.className='podo-preview-row';for(let j=0;j<len;j++,i++){const slot=document.createElement('div');slot.className='podo-preview-ball';if(i<state.stamps.length){slot.classList.add('filled');slot.append(makeStamp(state.stamps[i]))}else slot.textContent=String(i+1);row.append(slot)}frag.append(row)}$('podoPreviewGrid').replaceChildren(frag);$('podoPreviewInfo').textContent=state.stamps.length+' / '+state.goal+'알 · '+safe(state.reward,20)}
function makeStamp(person){const img=new Image();img.alt=person==='hoja'?'호자':'나한상';img.src=SRC[person];img.onerror=()=>{if(!img.dataset.tried){img.dataset.tried='1';img.src=FALLBACK[person]}else img.classList.add('err')};return img}
const safe=(s,max=80)''')
rep('let state=read(),unlockedUntil=0,working=false,','let state=read(),detailUnlocked=false,detailEpoch=0,activeFlight=null,working=false,')
rep('if(!configured)return;\n card.dataset.grape','syncOverviewSize();if(!configured)return;\n card.dataset.grape')
span('async function authorize(){','function log(','''const pinDialog=document.createElement('dialog');pinDialog.className='podo-pin';pinDialog.id='podoPinDialog';pinDialog.setAttribute('aria-label','포도알 교사 인증');pinDialog.innerHTML='<form method="dialog"><h3>🍇 교사 인증</h3><p id="podoPinHelp"></p><input id="podoPinInput" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="교사 인증번호 4자리"><p id="podoPinError" role="alert"></p><div><button type="button" id="podoPinCancel">취소</button><button type="submit" class="accent">확인</button></div></form>';document.body.append(pinDialog);
let pinPending=null;
function requestPin(scope){if(pinPending)return Promise.resolve(false);const expected=state?.pinHash,epoch=detailEpoch;let resolve;pinPending=new Promise(r=>resolve=r);const pending=pinPending;const input=$('podoPinInput'),error=$('podoPinError');input.value='';error.textContent='';$('podoPinHelp').textContent=scope==='detail'?'인증하면 이 포도알 판을 닫을 때까지 붙이거나 뗄 수 있습니다.':'설정을 변경하려면 교사 인증번호를 입력하세요.';let settled=false,checking=false;
 const finish=ok=>{if(settled)return;settled=true;pinPending=null;input.value='';if(pinDialog.open)pinDialog.close();resolve(ok)};
 pinDialog.onclose=()=>{if(!pinDialog.open)finish(false)};pinDialog.oncancel=e=>{e.preventDefault();finish(false)};$('podoPinCancel').onclick=()=>finish(false);
 pinDialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(settled||checking)return;const pin=input.value.trim();checking=true;try{const valid=/^\\d{4}$/.test(pin)&&expected&&await hashPin(pin)===expected;if(settled)return;if(!valid||state?.pinHash!==expected){error.textContent='인증번호가 맞지 않습니다.';input.value='';input.focus();return}if(scope==='detail'&&(!detail.open||epoch!==detailEpoch)){finish(false);return}finish(true)}catch{error.textContent='인증을 확인하지 못했습니다.'}finally{checking=false}};
 pinDialog.showModal();input.focus();return pending;
}
async function authorize(scope='settings'){const epoch=detailEpoch;if(scope==='detail'&&detail.open&&detailUnlocked)return true;const ok=await requestPin(scope);if(scope!=='detail')return ok;if(ok&&detail.open&&epoch===detailEpoch){detailUnlocked=true;return true}return false}
''')
span('async function apply(delta){', "$('podoAdd').addEventListener",'''async function apply(delta){
 if(working||!state||!detail.open)return;
 const session=detailEpoch;working=true;
 try{
  if(delta>0&&state.due&&new Date(state.due+'T23:59:59').getTime()<Date.now()){alert('기한이 지난 포도알 칭찬판입니다. 앱관리에서 새 목표를 설정하세요.');return}
  if(delta>0&&state.stamps.length>=state.goal)return;
  if(delta<0&&!state.stamps.length)return;
  if(!await authorize('detail')||!detail.open||session!==detailEpoch)return;
  const before=JSON.stringify(state),person=stampPerson(),index=delta>0?state.stamps.length:state.stamps.length-1;
  if(delta>0){state.stamps.push(person);log('add',(person==='hoja'?'호자':'나한상')+' +1')}else{const removed=state.stamps.pop();log('remove',(removed==='hoja'?'호자':'나한상')+' -1')}
  if(!save()){state=JSON.parse(before);alert('포도알 기록을 저장하지 못했습니다.');return}
  if(delta>0){
   // Use the destination slot as the containing block, not a fixed viewport position inside a modal.
   const target=grid.querySelector(`[data-index="${index}"]`),from=$('podoAdd');sfxAdd();
   if(target&&from&&target.offsetWidth){target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const a=from.getBoundingClientRect(),b=target.getBoundingClientRect(),sx=b.width/Math.max(1,target.offsetWidth),sy=b.height/Math.max(1,target.offsetHeight),dx=(a.left+a.width/2-b.left-b.width/2)/sx,dy=(a.top+a.height/2-b.top-b.height/2)/sy;
    const flyer=document.createElement('div');flyer.className='podo-fly';flyer.style.background=state.type==='green'?'#b6df72':'#b37cc5';flyer.append(makeStamp(person));target.classList.add('podo-landing');target.append(flyer);
    try{activeFlight=flyer.animate([{transform:`translate(${dx}px,${dy}px) scale(.65) rotate(-12deg)`},{transform:`translate(${dx*.42}px,${dy*.42-45}px) scale(1.3) rotate(13deg)`,offset:.5},{transform:'translate(0,0) scale(1)'}],{duration:600,easing:'cubic-bezier(.26,.74,.22,1)',fill:'forwards'});await activeFlight.finished.catch(()=>{})}finally{activeFlight=null;flyer.remove();target.classList.remove('podo-landing')}
   }
  }else sfxRemove();
  draw();renderHistory();if(detail.open&&session===detailEpoch&&state.stamps.length>=state.goal){detail.close();sfxWin();openWin()}
 }finally{working=false}
}
''')
# Store old PIN check independently from detail authorization; management reset remains confirmed.
rep('if(state&&!pin&&!(await authorize()))return;','if(state&&!(await authorize()))return;detailUnlocked=false;')
rep("const before=JSON.stringify(state);state.stamps=[];","detailUnlocked=false;const before=JSON.stringify(state);state.stamps=[];")
# Prevent an asynchronous draw from recreating an active landing slot; resize still follows the anchor.
rep('grid.replaceChildren();let i=0;', 'if(activeFlight)return;grid.replaceChildren();let i=0;')
# The external script can be replaced in the signed HTML update without modifying the R6 runtime.
out=s.encode();p.write_bytes(out);print('podo sha256',hashlib.sha256(out).hexdigest())
if len(sys.argv)>2:
 h=pathlib.Path(sys.argv[2]); html=h.read_text();tag='<script src="/podo.js"></script>';assert html.count(tag)==1 and '</script' not in s.lower();h.write_text(html.replace(tag,'<script id="tt-podo-v1652">'+s+'</script>',1));print('html sha256',hashlib.sha256(h.read_bytes()).hexdigest())
