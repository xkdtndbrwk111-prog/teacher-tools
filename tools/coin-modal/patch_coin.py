from pathlib import Path
import sys
root=Path(sys.argv[1])
def replace(s,a,b):
    assert s.count(a)==1,(a[:100],s.count(a))
    return s.replace(a,b)
# Both packaged external source and the active inline copy use the exact same authentication dialog.
def pin(s):
    s=replace(s,"'설정을 변경하려면 교사 인증번호를 입력하세요.';let settled", "scope==='coin'?'코인을 지급하거나 회수하려면 교사 인증번호를 입력하세요.':'설정을 변경하려면 교사 인증번호를 입력하세요.';let settled")
    return replace(s,'window.ttPodo={openSetup,syncForm,redraw:draw,info:', '''async function requestCoinAccess(){const expected=state?.pinHash;if(!expected||!await requestPin('coin')||state?.pinHash!==expected)return null;return ()=>Boolean(state?.pinHash===expected&&read()?.pinHash===expected)}
window.ttPodo={openSetup,syncForm,redraw:draw,hasTeacherPin:()=>Boolean(state?.pinHash),requestCoinAccess,info:''')
for f in ('dashboard.html','podo.js'):
    p=root/f;p.write_text(pin(p.read_text(encoding='utf-8-sig')),encoding='utf-8')
p=root/'coins-ui.js';s=p.read_text(encoding='utf-8-sig')
s=replace(s,"selected=new Set(),panel='grant';", "selected=new Set(),panel='view',access=null,epoch=0,authPending=false,filterValue='';")
s=replace(s,"if(roster.cls!==snap.roster.cls)selected.clear();", "if(roster.cls!==snap.roster.cls){lock();epoch++;}")
a=s.index(' style.textContent=`');b=s.index(' document.head.append(style);',a)
s=s[:a]+''' style.textContent=`#coinApp:modal{position:fixed!important;inset:0!important;margin:auto!important;transform:none!important;width:min(1240px,92vw);height:min(860px,90dvh);max-width:none;max-height:none;padding:0;border:1px solid var(--border);border-radius:18px;background:var(--tt-modal-panel,var(--panel));color:var(--text);box-shadow:0 18px 60px #0008;overflow:hidden}
#coinApp::backdrop{background:#07182099}
#coinApp [hidden]{display:none!important}
#coinBody{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;gap:0}
#coinTop{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);flex:none}
#coinTitle{font-size:clamp(20px,1.6vw,30px);font-weight:900;margin:0}
#coinNav{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}
#coinNote{padding:7px 20px;min-height:32px;font-size:clamp(14px,1.1vw,19px);font-weight:750;color:var(--text)}
#coinColumns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.18fr);gap:12px;flex:1;min-height:0;padding:0 14px 14px}
#coinHistoryPane,#coinRosterPane{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--border);border-radius:14px;background:var(--surface);overflow:hidden}
.coin-pane-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);font-weight:900;font-size:clamp(17px,1.3vw,23px)}
#coinHistoryList,#coinMain{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:10px}
#coinGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(106px,1fr));gap:8px;align-content:start}
#coinGrid .coin-student{min-height:68px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:7px;border:1px solid var(--border);border-radius:10px;background:var(--panel);color:var(--text);font-size:clamp(15px,1.1vw,20px);font-weight:750;min-width:0;overflow-wrap:anywhere}
#coinGrid .coin-student b{font-size:clamp(22px,1.7vw,30px);font-weight:900;color:var(--text)}
#coinGrid .coin-student.minus b{color:#c24141}
body[data-theme=black] #coinGrid .coin-student.minus b{color:#fda4af}
#coinGrid button.coin-student.on{outline:3px solid var(--accent);outline-offset:-3px;background:var(--today)}
#coinGrid button.coin-student:hover{filter:brightness(.95)}
#coinActions{display:flex;flex-wrap:wrap;gap:7px;padding:10px;border-top:1px solid var(--border);justify-content:center}
#coinActions:empty{display:none}
#coinApp button.nav,#coinApp button.act{min-height:44px;padding:8px 14px;font-weight:800;font-size:clamp(15px,1.15vw,20px);border:1px solid var(--border);border-radius:10px;background:var(--control);color:var(--control-text)}
#coinApp button.act{min-width:56px;background:var(--accent);color:#fff}
#coinApp button.act.neg{background:#98514f;color:#fff}
#coinApp button.nav.on{background:var(--today);color:var(--text);outline:2px solid var(--accent);outline-offset:-2px}
#coinFilter{max-width:58%;min-height:38px;padding:4px 6px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;font:inherit;font-size:15px}
#coinHistory{width:100%;border-collapse:collapse;table-layout:fixed;color:var(--text);font-size:clamp(15px,1.15vw,20px);line-height:1.3}
#coinHistory td{padding:9px 4px;border-bottom:1px solid var(--border);text-align:left;color:var(--text);overflow-wrap:anywhere;vertical-align:top}
#coinHistory td:first-child{width:29%;font-size:.88em;font-weight:600}
#coinHistory td:nth-child(2){width:20%;font-weight:850}
#coinHistory td:nth-child(3){width:51%;font-weight:800}
#coinHistory small{display:block;color:var(--text);font-size:.82em;font-weight:500;opacity:.88;margin-top:2px}
#coinSettings{display:grid;gap:14px;font-size:clamp(16px,1.3vw,22px)}
#coinSettings label{display:flex;align-items:center;justify-content:space-between;gap:12px}
#coinSettings input[type=number],#coinSettings select{width:112px;min-height:46px;font-size:20px;text-align:center;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px}
#coinSettings input[type=checkbox]{width:28px;height:28px}
@media(max-width:760px){#coinApp:modal{width:96vw;height:94dvh}#coinTop{flex-wrap:wrap;padding:10px}#coinColumns{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:0 8px 8px;gap:6px}#coinGrid{grid-template-columns:repeat(auto-fill,minmax(74px,1fr))}#coinHistory td{padding:6px 2px;font-size:13px}#coinActions{padding:6px;gap:4px}}
`;
'''+s[b:]
s=replace(s,'dialog.innerHTML=`<div id="coinBody"><div id="coinTop"><h2 id="coinTitle">🪙 코인</h2><div id="coinNote" role="status"></div><ul id="coinRecent"></ul></div><div id="coinMain"></div><div id="coinActions"></div><div id="coinNav"></div></div>`;', '''dialog.innerHTML=`<div id="coinBody"><div id="coinTop"><h2 id="coinTitle">🪙 코인</h2><div id="coinNav"></div></div><div id="coinNote" role="status"></div><div id="coinColumns"><section id="coinHistoryPane" aria-label="히스토리"><div class="coin-pane-head">히스토리<select id="coinFilter" aria-label="기록 종류"></select></div><div id="coinHistoryList"></div></section><section id="coinRosterPane" aria-label="학생 코인"><div class="coin-pane-head" id="coinRosterTitle">학생 코인</div><div id="coinMain"></div><div id="coinActions"></div></section></div></div>`;''')
s=replace(s,' const say=text=>', ''' const filter=$('coinFilter');filter.add(new Option('전체',''));for(const [k,v] of Object.entries(SOURCE))filter.add(new Option(v,k));filter.onchange=()=>{filterValue=filter.value;renderHistory()};
 function lock(){access=null;panel='view';selected.clear()}
 function authorized(){return Boolean(dialog.open&&access&&access.cls===roster.cls&&access.epoch===epoch&&access.valid())}
 function permit(){if(authorized())return true;lock();say('교사 인증이 필요합니다.');if(dialog.open)render();return false}
 async function teacherPanel(next){
  if(!dialog.open||authPending)return;
  if(authorized()){panel=next;render();return}
  const auth=window.ttPodo;if(!auth?.hasTeacherPin?.()){say('포도알 관리에서 교사 인증번호를 먼저 설정해 주세요.');return}
  const session=epoch,cls=roster.cls;authPending=true;
  try{const valid=await auth.requestCoinAccess();if(!valid||!dialog.open||epoch!==session||roster.cls!==cls)return;access={valid,cls,epoch:session};panel=next;say('교사 모드 · 닫으면 자동으로 잠깁니다.');render()}finally{authPending=false}
 }
 dialog.addEventListener('close',()=>{epoch++;lock()});
 const say=text=>''')
a=s.index('  const recent=mine()');b=s.index("  if(panel==='grant'&&!st.settings.enabled)",a)
s=s[:a]+'''  if(panel!=='view'&&!authorized())lock();
  const nav=$('coinNav');nav.replaceChildren(
   button('코인 지급','nav'+(panel==='grant'?' on':''),()=>teacherPanel('grant')),
   button('설정','nav'+(panel==='settings'?' on':''),()=>teacherPanel('settings')),
   ...(authorized()?[button('잠그기','nav',()=>{epoch++;lock();say('조회 전용');render()})]:[]),
   button('닫기','nav',()=>dialog.close()));
  renderHistory();
  $('coinRosterTitle').textContent=panel==='settings'?'코인 설정':panel==='grant'?'학생 선택 · 지급 및 회수':'학생 코인';
  const actions=$('coinActions');actions.replaceChildren();
'''+s[b:]
s=replace(s,"if(roster.cls)actions.append(button('코인 켜기','act',()=>{const cls=roster.cls;return serial(async()=>{", "if(roster.cls)actions.append(button('코인 켜기','act',()=>{if(!permit())return;const cls=roster.cls,session=epoch;return serial(async()=>{")
s=replace(s,"try{await load();if(roster.cls!==cls)throw Error('학급이 변경됐어요.');await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',...state().settings,enabled:true", "try{await load();if(epoch!==session||!permit()||roster.cls!==cls)throw Error('교사 인증 또는 학급이 변경됐어요.');await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',...state().settings,enabled:true")
s=replace(s,"if(panel==='grant')renderGrant(st,actions);\n  else if(panel==='history')renderHistory();\n  else renderSettings(st);", "if(panel==='settings')renderSettings(st);else renderGrant(st,actions,panel==='grant'&&authorized());")
s=replace(s,'function renderGrant(st,actions){','function renderGrant(st,actions,editable){')
s=replace(s,"const b=button('','');if(selected.has(s.id))b.classList.add('on');", "const b=editable?button('','coin-student'):document.createElement('div');b.classList.add('coin-student');if(editable&&selected.has(s.id))b.classList.add('on');")
s=replace(s,"b.onclick=()=>{if(selected.has(s.id))", "if(editable)b.onclick=()=>{if(!permit())return;if(selected.has(s.id))")
s=replace(s,"main().replaceChildren(grid);\n  actions.append", "main().replaceChildren(grid);\n  if(!editable)return;\n  actions.append")
s=replace(s,"'nav',()=>{if(selected.size===roster.students.length)","'nav',()=>{if(!permit())return;if(selected.size===roster.students.length)")
s=replace(s,"function give(amount){const cls=roster.cls,ids=new Set(selected);return serial(()=>giveNow(amount,cls,ids));}","function give(amount){if(!permit())return;const cls=roster.cls,ids=new Set(selected),session=epoch;return serial(()=>giveNow(amount,cls,ids,session));}")
s=replace(s,"async function giveNow(amount,cls,ids){\n  try{await load();if(roster.cls!==cls||!state().settings.enabled)","async function giveNow(amount,cls,ids,session){\n  try{await load();if(epoch!==session||!permit()||roster.cls!==cls||!state().settings.enabled)")
a=s.index(' function renderHistory(){');b=s.index(' function renderSettings(st){',a)
s=s[:a]+''' function renderHistory(){
  const host=$('coinHistoryList'),top=host.scrollTop;
  const table=document.createElement('table');table.id='coinHistory';
  const list=mine().filter(e=>!filterValue||(e.type==='setting'?filterValue==='settings':e.source===filterValue)).map(historyLine).filter(Boolean).reverse().slice(0,300);
  for(const row of list){const tr=table.insertRow();tr.insertCell().textContent=row[0];tr.insertCell().textContent=row[1];const td=tr.insertCell();td.textContent=row[2];const source=document.createElement('small');source.textContent=row[3];td.append(source)}
  if(list.length)host.replaceChildren(table);else host.textContent='아직 기록이 없습니다.';
  host.scrollTop=top;
 }
'''+s[b:]
s=replace(s,"form.append(button('저장','act',()=>{const cls=roster.cls;return serial(async()=>{\n   const cap=Number($('coinCap').value),amount=Number($('coinWeekly').value);", "form.append(button('저장','act',()=>{if(!permit())return;const cls=roster.cls,session=epoch,cap=Number($('coinCap').value),amount=Number($('coinWeekly').value),enabled=on.checked,weeklyOn=weekly.checked,weeklyDay=Number(day.value);return serial(async()=>{")
s=replace(s,"await load();if(roster.cls!==cls)throw Error('학급이 변경됐어요.');\n    await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',enabled:on.checked,cap,weeklyOn:weekly.checked,weeklyAmount:amount,weeklyDay:Number(day.value)", "await load();if(epoch!==session||!permit()||roster.cls!==cls)throw Error('교사 인증 또는 학급이 변경됐어요.');\n    await append([{at:new Date().toISOString(),cls:roster.cls,type:'setting',enabled,cap,weeklyOn,weeklyAmount:amount,weeklyDay")
s=replace(s,"panel='grant';selected.clear();say('');\n  dialog.showModal();\n  await housekeeping();\n  render();", "if(dialog.open)return;epoch++;lock();filterValue='';filter.value='';say('조회 전용');\n  dialog.showModal();\n  await housekeeping();\n  if(dialog.open)render();")
# Heartbeat refresh plus class-change revocation. Existing housekeeping remains independent of student view.
s=replace(s," setInterval(housekeeping,10*60000);", " setInterval(housekeeping,10*60000);\n setInterval(()=>{if(dialog.open)void serial(async()=>{try{const oldCls=roster.cls,rev=snap?.revision;await load();if(oldCls!==roster.cls||rev!==snap.revision||panel!=='view'&&!authorized())render()}catch(error){say(error.message)}})},5000);")
p.write_text(s,encoding='utf-8')
