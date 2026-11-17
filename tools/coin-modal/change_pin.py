from pathlib import Path
import sys
root=Path(sys.argv[1])
def once(s,a,b):
 assert s.count(a)==1,(a[:100],s.count(a));return s.replace(a,b,1)
for f in ('dashboard.html','podo.js'):
 p=root/f;s=p.read_text();s=once(s,"function requestPin(scope){", "function requestPin(scope,verified=null){");s=once(s,"creating=scope==='coin-create'&&!expected,epoch=detailEpoch;", "changing=scope==='coin-change'&&Boolean(expected)&&verified===expected,creating=(scope==='coin-create'&&!expected)||changing,epoch=detailEpoch;");s=once(s,"if(teacherPin()){error.textContent='인증번호가 이미 설정되었습니다. 다시 열어 주세요.';return}","if(teacherPin()!==expected){error.textContent='인증번호가 변경되었습니다. 다시 열어 주세요.';return}");s=once(s,"const next=state?{...state,pinHash:hash}:{version:1,configured:false,pinHash:hash};", "const record=readRecord();const next=record?.version===1?{...record,pinHash:hash}:{version:1,configured:false,pinHash:hash};");s=once(s,"window.ttPodo={openSetup,syncForm,redraw:draw,hasTeacherPin:","async function changeTeacherPin(){const expected=teacherPin();if(!expected||!await requestPin('coin')||teacherPin()!==expected)return false;return requestPin('coin-change',expected)}\nwindow.ttPodo={openSetup,syncForm,redraw:draw,changeTeacherPin,hasTeacherPin:");p.write_text(s)
p=root/'coins-ui.js';s=p.read_text();a="  form.append(button('저장','act',";s=once(s,a,"  form.append(button('공통 인증번호 변경','nav',async()=>{if(!permit())return;const ok=await window.ttPodo?.changeTeacherPin?.();if(ok){epoch++;lock();say('공통 인증번호가 변경되었습니다. 다시 인증해 주세요.');if(dialog.open)render()}}));\n"+a);p.write_text(s)
