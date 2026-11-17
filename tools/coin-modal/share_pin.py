from pathlib import Path
import sys
root=Path(sys.argv[1])
def once(s,a,b):
 assert s.count(a)==1,(a[:100],s.count(a));return s.replace(a,b,1)
def patch(s):
 s=once(s,"function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');", "function readRecord(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}\nfunction teacherPin(){const v=readRecord();return v?.version===1&&typeof v.pinHash==='string'&&v.pinHash?v.pinHash:null}\nfunction read(){try{const v=readRecord();if(v?.configured===false)return null;")
 s=once(s,"function save(){try{return window.ttStoreJson?window.ttStoreJson(KEY,state):(localStorage.setItem(KEY,JSON.stringify(state)),true)}catch{return false}}", "function storeRecord(value){try{return window.ttStoreJson?window.ttStoreJson(KEY,value):(localStorage.setItem(KEY,JSON.stringify(value)),true)}catch{return false}}\nfunction save(){return storeRecord(state)}")
 s=once(s,"pinDialog.setAttribute('aria-label','포도알 교사 인증')", "pinDialog.setAttribute('aria-label','공통 교사 인증')")
 s=once(s,"<h3>🍇 교사 인증</h3>","<h3 id=\"podoPinTitle\">🔒 교사 인증</h3>")
 s=once(s,"<p id=\"podoPinError\" role=\"alert\"></p>","<input id=\"podoPinConfirm\" type=\"password\" inputmode=\"numeric\" maxlength=\"4\" autocomplete=\"off\" aria-label=\"새 인증번호 다시 입력\" placeholder=\"새 인증번호 다시 입력\" hidden><p id=\"podoPinError\" role=\"alert\"></p>")
 s=once(s,"const expected=state?.pinHash,epoch=detailEpoch;", "const expected=teacherPin(),creating=scope==='coin-create'&&!expected,epoch=detailEpoch;")
 s=once(s,"input.value='';error.textContent='';$('podoPinHelp').textContent=", "const confirmInput=$('podoPinConfirm');input.value='';confirmInput.value='';confirmInput.hidden=!creating;error.textContent='';$('podoPinTitle').textContent=creating?'🔒 교사 인증번호 설정':'🔒 교사 인증';$('podoPinHelp').textContent=creating?'포도알·코인에서 함께 사용할 숫자 4자리를 두 번 입력하세요.':")
 s=once(s,"input.value='';if(pinDialog.open)","input.value='';confirmInput.value='';if(pinDialog.open)")
 s=once(s,"try{const valid=/^\\d{4}$/.test(pin)&&expected&&await hashPin(pin)===expected;if(settled)return;if(!valid||state?.pinHash!==expected)","try{if(creating){if(!/^\\d{4}$/.test(pin)||pin!==confirmInput.value){error.textContent='동일한 숫자 4자리를 두 번 입력하세요.';return}const hash=await hashPin(pin);if(settled)return;if(teacherPin()){error.textContent='인증번호가 이미 설정되었습니다. 다시 열어 주세요.';return}const next=state?{...state,pinHash:hash}:{version:1,configured:false,pinHash:hash};if(!storeRecord(next)){error.textContent='인증번호를 저장하지 못했습니다.';return}if(state)state=next;detailUnlocked=false;finish(true);return}const valid=/^\\d{4}$/.test(pin)&&expected&&await hashPin(pin)===expected;if(settled)return;if(!valid||teacherPin()!==expected)")
 s=once(s,"if(scope==='detail'&&detail.open&&detailUnlocked)return true;const ok=await requestPin(scope);", "const expected=teacherPin();if(scope==='detail'&&detail.open&&expected&&detailUnlocked===expected)return true;const ok=await requestPin(scope);")
 s=once(s,"detailUnlocked=true;return true", "detailUnlocked=expected;return Boolean(expected&&teacherPin()===expected)")
 s=once(s,"교사 인증번호 (숫자 4자리)","공통 교사 인증번호 (포도알·코인, 숫자 4자리)")
 s=once(s,"$('podoGoalPin').value='';renderHistory();", "$('podoGoalPin').value='';$('podoGoalPin').placeholder=teacherPin()?'변경할 때만 입력 (기존 공통 번호 사용)':'최초 공통 인증번호 4자리';renderHistory();")
 s=once(s,"if((!state||pin)&&!/^\\d{4}$/.test(pin))", "const current=teacherPin();if((!current||pin)&&!/^\\d{4}$/.test(pin))")
 s=once(s,"const before=state&&JSON.stringify(state),hash=pin?await hashPin(pin):state?.pinHash;\n if(state&&!(await authorize()))return;detailUnlocked=false;", "const before=state&&JSON.stringify(state),hash=pin?await hashPin(pin):current;\n if(current&&!(await authorize()))return;if(teacherPin()!==current){$('podoSettingsStatus').textContent='공통 인증번호가 변경되었습니다. 다시 시도하세요.';return}detailUnlocked=false;")
 s=once(s,"async function requestCoinAccess(){const expected=state?.pinHash;if(!expected||!await requestPin('coin')||state?.pinHash!==expected)return null;return ()=>Boolean(state?.pinHash===expected&&read()?.pinHash===expected)}", "async function requestCoinAccess(){const old=teacherPin();if(!await requestPin(old?'coin':'coin-create'))return null;const expected=teacherPin();if(!expected||(old&&old!==expected))return null;return ()=>teacherPin()===expected}")
 s=once(s,"hasTeacherPin:()=>Boolean(state?.pinHash)","hasTeacherPin:()=>Boolean(teacherPin())")
 # Explicit hidden rule even if board CSS styles all inputs.
 s=s.replace("dialog.podo-pin input{", "dialog.podo-pin input[hidden]{display:none!important}\ndialog.podo-pin input{",1) if 'dialog.podo-pin input{' in s else s
 return s
for f in ('dashboard.html','podo.js'):
 p=root/f;p.write_text(patch(p.read_text(encoding='utf-8-sig')),encoding='utf-8')
p=root/'coins-ui.js';s=p.read_text();s=once(s,"if(!auth?.hasTeacherPin?.()){say('포도알 관리에서 교사 인증번호를 먼저 설정해 주세요.');return}","if(!auth?.requestCoinAccess){say('공통 교사 인증을 불러오지 못했습니다.');return}")
p.write_text(s)
