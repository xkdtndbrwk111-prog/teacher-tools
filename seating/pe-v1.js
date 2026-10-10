
(()=>{
"use strict";

// Display-only product rename. Preserve the actual editable class name and all saved data.
const APP_DISPLAY_TITLE="자리배치 매니저 V1.00";
const originalRenderTopTitle=renderTopTitle;
renderTopTitle=function(){
  originalRenderTopTitle();
  document.getElementById("topClassTitle").textContent=APP_DISPLAY_TITLE;
};
renderTopTitle();

const PE_KEY="teacher-tools.seating.pe-prototype.v2";
const TRAITS=[
  ["leadership","통솔"],["intelligence","지력"],["stamina","체력"],["charm","매력"],["initiative","적극"]
];
const LEVELS=[4,3,2,1];
const LEVEL_LABEL={4:"매",3:"잘",2:"보",1:"노",null:"·"};
const TEAM_COLORS=["#2563eb","#dc2626","#16a34a","#ea580c","#7c3aed","#0891b2"];

let mode="classroom";
let peState=loadPEState();
let peAssignments=[];
let peConfirmed=[];
let peShowAllAbilities=false;
let peFixedEditTeam=0;

function loadPEState(){
  try{return JSON.parse(localStorage.getItem(PE_KEY))||{}}catch{return{}}
}
function persistPE(){
  try{localStorage.setItem(PE_KEY,JSON.stringify(peState))}catch{}
}
function ensurePEStudent(student,index){
  if(!peState[student.id]){
    peState[student.id]={traits:Object.fromEntries(TRAITS.map(([k])=>[k,null])),fixedTeam:0};
  }
  peState[student.id].traits ||= {};
  TRAITS.forEach(([k])=>{if(!LEVELS.includes(peState[student.id].traits[k]))peState[student.id].traits[k]=null});
  if(!Number.isInteger(peState[student.id].fixedTeam))peState[student.id].fixedTeam=0;
  return peState[student.id];
}
function injectStyles(){
  const style=document.createElement("style");
  style.textContent=`
    .prototype-mode-switch{display:flex;align-items:center;padding:3px;background:#17243a;border:1px solid #334763;border-radius:12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}
    #newAssignment{width:112px;min-width:112px;flex:0 0 112px}
#confirmAssignment{width:96px;min-width:96px;flex:0 0 96px}
.pe-team-summary{display:none!important}
    .prototype-mode-switch button{height:38px;padding:0 18px;border:0;border-radius:9px;background:transparent;color:#aebed3;font-weight:900;white-space:nowrap}
    .prototype-mode-switch button.on{background:#fff;color:#172033;box-shadow:0 2px 8px rgba(0,0,0,.24)}
    /* Keep the shared header geometry identical in both modes. */
    .brand-block strong .prototype-badge{display:inline-block;font-size:10px;font-weight:900;color:#fbbf24;border:1px solid #7c5b13;border-radius:999px;padding:2px 6px;margin-left:7px;vertical-align:2px}
    .pe-toolbar{display:none;align-items:center;gap:10px;min-height:56px;padding:8px 12px;background:#111b2d;border-bottom:1px solid #2a3a53;color:#e5edf8}
    body.pe-mode .workspace-toolbar{display:none}
    body.pe-mode .pe-toolbar{display:flex}
    body.pe-mode .workspace{display:none}
    .pe-workspace{display:none;min-height:0;flex:1;padding:14px;background:#e9eef5;overflow:auto}
    body.pe-mode .pe-workspace{display:flex;flex-direction:column}
    .pe-team-count{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.pe-team-count strong{font-size:11px;color:#94a3b8;font-weight:900;margin-right:2px}.pe-team-count button{min-width:46px;min-height:40px;padding:8px 12px;border:1px solid #40516d;border-radius:9px;background:#e7edf6;color:#18233a;font-weight:850}.pe-team-count button.on{background:#bfdbfe;border-color:#60a5fa;color:#172033}
    .pe-toolbar-note{margin-left:auto;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#b6c5d9;font-weight:400}
    .pe-board{display:grid;grid-template-columns:repeat(var(--pe-cols,2),minmax(210px,1fr));gap:12px;align-content:start;min-height:100%;width:100%}
    /* 2팀은 한 행 전체, 4팀은 2×2로 Workspace를 넉넉하게 사용한다. */
    .pe-board.pe-count-2{grid-template-columns:repeat(2,minmax(280px,1fr));grid-template-rows:minmax(390px,1fr);align-content:stretch}
    .pe-board.pe-count-4{grid-template-columns:repeat(2,minmax(280px,1fr));grid-template-rows:repeat(2,minmax(270px,1fr));align-content:stretch}
    .pe-team{display:flex;flex-direction:column;background:#fff;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 5px 18px rgba(15,23,42,.07);overflow:hidden;min-height:230px;transition:border-color .12s,box-shadow .12s,transform .12s}
    .pe-board.pe-count-2 .pe-team,.pe-board.pe-count-4 .pe-team{min-height:0;height:100%}.pe-team.pe-drop-target{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.18),0 8px 22px rgba(15,23,42,.10);transform:translateY(-1px)}
    .pe-team-head{height:47px;min-height:47px;flex:0 0 47px;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 13px;color:#fff;font-weight:950}.pe-team-head small{font-size:12px;opacity:.92}
    .pe-team-title{display:flex;align-items:center;gap:7px;min-width:0}.pe-team-title>span{white-space:nowrap}.pe-team-head-actions{display:flex;align-items:center;gap:5px}.pe-team-head button{height:28px;padding:0 9px;border:1px solid rgba(255,255,255,.58);border-radius:7px;background:rgba(255,255,255,.13);color:#fff;font-size:10px;font-weight:950;cursor:pointer}.pe-team-head button:hover,.pe-team-head button.on{background:#fff;color:#172033;border-color:#fff}.pe-team-head button.fixed-edit-on{background:#fef3c7;color:#92400e;border-color:#fde68a}
    .pe-team-body{min-height:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:7px;padding:10px;align-content:start;flex:1}
    .pe-board.pe-count-2 .pe-team-body{grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:9px;padding:12px}
    .pe-board.pe-count-2 .pe-member{min-height:96px;padding:8px 9px}
    .pe-board.pe-count-4 .pe-team-body{grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:8px;padding:11px}
    .pe-board.pe-count-4 .pe-member{min-height:88px}
    .pe-member{position:relative;min-height:82px;border:1px solid #d7dee8;border-radius:10px;background:#f8fafc;display:flex;align-items:center;gap:6px;padding:6px 7px;cursor:pointer;user-select:none}.pe-member:hover{border-color:#94a3b8;background:#fff}.pe-member.fixed{box-shadow:inset 0 0 0 2px #f59e0b;background:#fffbeb}.pe-member.fixed::after{content:"🔒";position:absolute;right:6px;top:5px;font-size:12px}.pe-member.pe-just-fixed{animation:peLockPulse .28s ease-out}@keyframes peLockPulse{0%{transform:scale(.97)}60%{transform:scale(1.025)}100%{transform:scale(1)}}.pe-member .student-mini-sprite{flex:0 0 auto}.pe-member strong{font-size:13px;line-height:1.2}.pe-member em{font-style:normal;font-size:10px;color:#92400e;font-weight:900;display:block;margin-top:3px}.pe-empty{padding:24px;color:#94a3b8;font-size:12px;text-align:center;grid-column:1/-1}
    .trait-radar-wrap{display:grid;grid-template-columns:132px 1fr;gap:9px;align-items:center}.trait-radar{width:132px;height:132px}.trait-grid{display:flex;flex-direction:column;gap:5px}.trait-row{display:grid;grid-template-columns:36px repeat(4,1fr);gap:4px;align-items:center}.trait-row>span{font-size:11px;font-weight:900;color:#475569}.trait-row button{height:29px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#475569;font-size:11px;font-weight:950;padding:0}.trait-row button.on{background:#172033;color:#fff;border-color:#172033}.trait-row.inactive-axis{opacity:.38}.trait-hint{margin-top:7px;font-size:10px;color:#64748b;line-height:1.45}.trait-legend{display:flex;justify-content:center;gap:8px;margin-top:4px;font-size:10px;color:#64748b}.trait-legend b{color:#172033}
    .pe-fixed-team{margin-top:10px}.pe-fixed-team select{margin-top:5px}
    /* Preserve the original 3×2 dock-tab footprint in PE mode.
       Classroom-only tabs stay visible but are intentionally inactive in this prototype. */
    body.pe-mode .dock-tab[data-tab="groups"],body.pe-mode .dock-tab[data-tab="rules"],body.pe-mode .dock-tab[data-tab="teacher"],body.pe-mode .dock-tab[data-tab="history"]{display:block;opacity:.38;cursor:default;pointer-events:none}
    body.pe-mode .strip-help{font-size:0} body.pe-mode .strip-help::after{content:"학생을 팀으로 끌면 고정 · 배치된 학생 클릭은 고정/해제 · 우클릭은 고정 해제";font-size:12px}
    .pe-team-summary{display:flex;align-items:center;gap:8px;padding:0 12px;height:34px;min-height:34px;flex:0 0 34px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:10px;color:#64748b;font-weight:800}.pe-team-summary svg{width:34px;height:34px;overflow:visible}
    .pe-team-ability{grid-column:1/-1;min-height:0;height:100%;display:flex;align-items:center;justify-content:center;gap:20px;padding:18px 16px 22px}.pe-team-ability .team-radar-large{width:220px;height:220px;flex:0 0 220px}
    .pe-board.pe-count-2 .pe-team-ability .team-radar-large{width:300px;height:300px;flex-basis:300px}
    .pe-board.pe-count-4 .pe-team-ability .team-radar-large{width:245px;height:245px;flex-basis:245px}.pe-team-ability-copy{display:flex;flex-direction:column;gap:8px;min-width:118px}.pe-team-ability-copy strong{font-size:15px;color:#172033}.pe-team-ability-copy span{font-size:11px;color:#64748b;line-height:1.45}.pe-axis-key{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:3px}.pe-axis-key b{height:30px;border:1px solid #d8e0ea;border-radius:8px;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:11px;color:#334155}
    .pe-fixed-banner{display:none;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:11px;font-weight:900}.pe-fixed-banner.show{display:flex}.pe-fixed-banner button{margin-left:auto;border:1px solid #fdba74;background:#fff;border-radius:7px;height:27px;padding:0 9px;color:#9a3412;font-size:10px;font-weight:900}.student-card.pe-fixed-target{box-shadow:inset 0 0 0 3px #f59e0b!important;background:#fffbeb!important}
    .pe-prototype-note{position:fixed;right:10px;bottom:8px;z-index:90;background:#111827;color:#fff;border-radius:8px;padding:5px 9px;font-size:10px;opacity:.82;pointer-events:none}
    @media(max-width:1100px){.prototype-mode-switch button{padding:0 10px}.pe-board{grid-template-columns:repeat(2,minmax(190px,1fr))}}
  `;
  document.head.appendChild(style);
}

function injectModeUI(){
  const sw=document.createElement("div");sw.className="prototype-mode-switch";sw.innerHTML=`<button id="modeClassroom" class="on" type="button">🏫 학급 자리배치</button><button id="modePE" type="button">⚽ 체육 모둠</button>`;
  document.querySelector(".studio-topbar").insertBefore(sw,document.querySelector(".top-actions"));
  // Product title is rendered without the former prototype badge.
  $("modeClassroom").onclick=()=>setMode("classroom");$("modePE").onclick=()=>setMode("pe");

  const toolbar=document.createElement("section");toolbar.className="pe-toolbar";toolbar.innerHTML=`<div class="pe-team-count"><strong>팀 수</strong>${[2,3,4,5,6].map(n=>`<button type="button" data-team-count="${n}">${n}팀</button>`).join("")}</div><div id="peFixedBanner" class="pe-fixed-banner"><span id="peFixedBannerText"></span><button id="peFixedDone" type="button">고정 지정 끝내기</button></div><div class="pe-surface-control pe-pitch-toolbar-choice" role="group" aria-label="체육 모둠 운동장 선택"><span>운동장</span><div class="pe-surface-buttons"><button type="button" data-pe-surface="grass" aria-pressed="true">🌿 잔디</button><button type="button" data-pe-surface="dirt" aria-pressed="false">🟤 흙</button></div></div><label class="pe-manager-lines"><input type="checkbox" id="peManagerLines" checked> 축구장 라인</label><div class="pe-toolbar-note">하단 학생을 팀으로 드래그하면 고정 · 배치 학생 클릭/우클릭으로 고정 관리</div>`;
  document.querySelector(".workspace-toolbar").after(toolbar);
  toolbar.querySelectorAll("[data-team-count]").forEach(b=>b.onclick=()=>{const n=Number(b.dataset.teamCount);if(!canChangeTeamCount(n))return;peState.teamCount=n;peFixedEditTeam=0;persistPE();peAssignments=[];peConfirmed=[];renderPE();renderStudentStrip();updateModeChrome()});
  $("peFixedDone").onclick=()=>{peFixedEditTeam=0;renderPE();renderStudentStrip();updateModeChrome()};

  const pe=document.createElement("section");pe.className="pe-workspace";pe.innerHTML=`<div id="peBoard" class="pe-board"></div>`;document.querySelector(".workspace").after(pe);
}

function setMode(next){
  mode=next;document.body.classList.toggle("pe-mode",mode==="pe");
  $("modeClassroom").classList.toggle("on",mode==="classroom");$("modePE").classList.toggle("on",mode==="pe");
  if(mode==="pe"&&["groups","rules","teacher","history"].includes(document.querySelector(".dock-tab.on")?.dataset.tab||""))activateDock("student");
  updateModeChrome();renderStudentInspector();renderPE();
}
function updateModeChrome(){
  const count=peState.teamCount||4;
  document.querySelectorAll("[data-team-count]").forEach(b=>b.classList.toggle("on",Number(b.dataset.teamCount)===count));
  const fixedBanner=$("peFixedBanner"),fixedBannerText=$("peFixedBannerText");
  if(fixedBanner){fixedBanner.classList.toggle("show",mode==="pe"&&peFixedEditTeam>0);if(fixedBannerText)fixedBannerText.textContent=peFixedEditTeam?`${peFixedEditTeam}팀 고정 지정 중 · 하단 학생 클릭 또는 드래그로 고정/해제`:""}
  if(mode==="pe"){
    $("generateAssignment").textContent="새 팀 편성";$("confirmAssignment").textContent="팀 확정";$("openPlayback").textContent="팀 공개 ▶";
    $("assignmentStatus").textContent=peAssignments.length?"체육 팀 편성 미리보기 · 고정 팀 유지":"팀 수와 고정 학생을 확인한 뒤 새 팀 편성을 눌러 주세요.";
  }else{
    $("generateAssignment").textContent="새 배치";$("confirmAssignment").textContent="배치 확정";$("openPlayback").textContent="학생 화면 ▶";
  }
}

function radarSvg(values,labels,activeKeys=null,small=false){
  const w=small?34:132,h=w,c=w/2,r=small?14:46,n=values.length;
  const point=(i,val)=>{const a=-Math.PI/2+i*Math.PI*2/n,rr=r*(val/4);return[c+Math.cos(a)*rr,c+Math.sin(a)*rr]};
  const outer=values.map((_,i)=>point(i,4).join(",")).join(" ");
  const mid=values.map((_,i)=>point(i,2).join(",")).join(" ");
  const poly=values.map((v,i)=>point(i,v||0).join(",")).join(" ");
  const axes=values.map((_,i)=>{const p=point(i,4);return`<line x1="${c}" y1="${c}" x2="${p[0]}" y2="${p[1]}"/>`}).join("");
  const texts=small?"":labels.map((lab,i)=>{const a=-Math.PI/2+i*Math.PI*2/n,rr=r+17,x=c+Math.cos(a)*rr,y=c+Math.sin(a)*rr+4;const inactive=activeKeys&&activeKeys[i]===false;return`<text x="${x}" y="${y}" text-anchor="middle" font-size="10" font-weight="900" fill="${inactive?'#aeb8c5':'#475569'}">${lab}</text>`}).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="trait-radar" aria-hidden="true"><g fill="none" stroke="#cbd5e1" stroke-width="1">${axes}<polygon points="${mid}"/><polygon points="${outer}"/></g><polygon points="${poly}" fill="rgba(37,99,235,.22)" stroke="#2563eb" stroke-width="${small?1.2:2}"/>${texts}</svg>`;
}

const baseRenderStudentInspector=renderStudentInspector;
renderStudentInspector=function(){
  baseRenderStudentInspector();
  // V2.12: remove ONLY the legacy balance-rating panel from the student tab.
  // Keep the five-axis traits, student fields, and classroom placement logic intact.
  const inspector=$("studentInspector");
  if(inspector){
    for(const section of inspector.querySelectorAll(".inspector-section")){
      const heading=section.querySelector(".inspector-label");
      if(heading && heading.textContent.trim()==="배치 균형 속성 · 비공개"){
        section.remove();
      }
    }
  }
  if(historyView)return;
  const student=studentById(selectedStudentId),root=inspector;if(!student||!root)return;
  const idx=classState.students.findIndex(s=>s.id===student.id),data=ensurePEStudent(student,idx),traits=data.traits;
  root.querySelector(".trait-prototype")?.remove();
  const section=document.createElement("div");section.className="inspector-section trait-prototype";
  const values=TRAITS.map(([k])=>traits[k]);
  const active=TRAITS.map(([k])=>mode==="classroom"?k!=="stamina":k!=="intelligence");
  section.innerHTML=`<span class="inspector-label">5축 특성 · 비공개</span><div class="trait-radar-wrap">${radarSvg(values,TRAITS.map(x=>x[1]),active)}<div class="trait-grid">${TRAITS.map(([k,label],i)=>`<div class="trait-row ${active[i]?'':'inactive-axis'}"><span>${label}</span>${LEVELS.map(v=>`<button type="button" data-trait="${k}" data-value="${v}" class="${traits[k]===v?'on':''}">${LEVEL_LABEL[v]}</button>`).join("")}</div>`).join("")}</div></div><div class="trait-hint">${mode==="classroom"?"교실 균형 계산: 통솔 · 지력 · 매력 · 적극 / 체력 제외":"체육 균형 계산: 체력 · 통솔 · 적극 · 매력 / 지력 제외"}</div>${mode==="pe"?`<div class="pe-fixed-team"><span class="inspector-label">체육 팀 고정</span><select id="peFixedTeam"><option value="0">자동 배정</option>${Array.from({length:peState.teamCount||4},(_,i)=>`<option value="${i+1}" ${data.fixedTeam===i+1?'selected':''}>${i+1}팀 고정</option>`).join("")}</select></div>`:""}`;
  const anchor=root.querySelectorAll(".inspector-section")[1]||root.firstChild;anchor?.after(section);
  section.querySelectorAll("[data-trait]").forEach(btn=>btn.onclick=()=>{traits[btn.dataset.trait]=Number(btn.dataset.value);persistPE();renderStudentInspector();if(mode==="pe")renderPE()});
  const fixed=$("peFixedTeam");if(fixed)fixed.onchange=e=>{data.fixedTeam=Number(e.target.value);persistPE();peAssignments=[];peConfirmed=[];renderStudentInspector();renderPE();updateModeChrome()};
  persistPE();
};

const baseRenderStudentStrip=renderStudentStrip;
renderStudentStrip=function(){baseRenderStudentStrip();if(mode==="pe")decorateStudentStrip()};
function decorateStudentStrip(){
  document.querySelectorAll(".student-card").forEach(card=>{
    const id=card.dataset.studentId,data=peState[id];
    card.classList.toggle("pe-fixed-target",Boolean(peFixedEditTeam&&data?.fixedTeam===peFixedEditTeam));
    if(data?.fixedTeam){
      const copy=card.querySelector(".student-card-copy small");if(copy&&!copy.querySelector(".pe-strip-fixed")){const b=document.createElement("b");b.className="pe-strip-fixed";b.style.color="#b45309";b.textContent=` · 🔒 ${data.fixedTeam}팀`;copy.appendChild(b)}
    }
    if(peFixedEditTeam){
      card.onclick=()=>{
        const student=studentById(id);if(!student)return;const d=ensurePEStudent(student,classState.students.indexOf(student));
        d.fixedTeam=d.fixedTeam===peFixedEditTeam?0:peFixedEditTeam;persistPE();peAssignments=[];peConfirmed=[];selectedStudentId=id;renderStudentStrip();renderStudentInspector();renderPE();updateModeChrome();
      };
    }
  });
}

function peTeamOfStudent(studentId){
  if(peAssignments.length){
    const at=peAssignments.findIndex(team=>team.some(s=>s.id===studentId));
    if(at>=0)return at+1;
  }
  return peState[studentId]?.fixedTeam||0;
}
function setPEFixedTeam(studentId,teamNo,{moveAssignment=true}={}){
  const student=studentById(studentId),n=peState.teamCount||4;if(!student||teamNo<1||teamNo>n)return false;
  const data=ensurePEStudent(student,classState.students.indexOf(student));
  data.fixedTeam=teamNo;
  if(moveAssignment&&peAssignments.length===n){
    peAssignments.forEach(team=>{const at=team.findIndex(s=>s.id===studentId);if(at>=0)team.splice(at,1)});
    peAssignments[teamNo-1].push(student);
  }
  peConfirmed=[];persistPE();return true;
}
function clearPEFixedTeam(studentId){
  const student=studentById(studentId);if(!student)return false;
  const data=ensurePEStudent(student,classState.students.indexOf(student));
  if(!data.fixedTeam)return false;
  data.fixedTeam=0;peConfirmed=[];persistPE();return true;
}
function refreshPEAfterFixedChange(studentId,message){
  selectedStudentId=studentId;
  if(message)setAssignmentStatus(message);
  renderPE();renderStudentStrip();renderStudentInspector();updateModeChrome();
}
function canChangeTeamCount(n){
  const invalid=classState.students.filter(s=>(peState[s.id]?.fixedTeam||0)>n);
  if(!invalid.length)return true;
  alert(`${invalid.map(s=>s.name).join(", ")} 학생이 ${n+1}팀 이상에 고정되어 있습니다.\n먼저 학생의 고정 팀을 변경해 주세요.`);return false;
}
// Equal team sizes take precedence; reserve any +1 slots required by locked students.
function teamTargets(n,total,fixedCounts=[]){
  const base=Math.floor(total/n),extra=total%n;
  const targets=Array(n).fill(base),required=[];
  for(let i=0;i<n;i++){
    const locked=fixedCounts[i]||0;
    if(locked>base+1)return null;
    if(locked>base)required.push(i);
  }
  if(required.length>extra)return null;
  required.forEach(i=>targets[i]++);
  const remaining=Array.from({length:n},(_,i)=>i).filter(i=>!required.includes(i));
  remaining.sort((a,b)=>(fixedCounts[b]||0)-(fixedCounts[a]||0)||a-b);
  remaining.slice(0,extra-required.length).forEach(i=>targets[i]++);
  return targets;
}
function peVector(student){const t=ensurePEStudent(student,classState.students.indexOf(student)).traits;return[t.stamina,t.leadership,t.initiative,t.charm]}
function peGender(student){return student.gender==='male'?'male':student.gender==='female'?'female':'unknown'}
function scoreTeams(teams,targets){
  const vectors=teams.map(team=>{const sums=[0,0,0,0];team.forEach(s=>peVector(s).forEach((v,i)=>sums[i]+=v));return sums});
  const weights=[2.2,1.25,1.05,.8];let score=0;
  for(let axis=0;axis<4;axis++){
    const avgs=vectors.map((v,i)=>teams[i].length?v[axis]/teams[i].length:0),mean=avgs.reduce((a,b)=>a+b,0)/avgs.length;
    score+=avgs.reduce((a,v)=>a+(v-mean)*(v-mean)*weights[axis],0);
  }
  teams.forEach((t,i)=>{const d=t.length-targets[i];score+=d*d*80});
  return score;
}
// Exact small-state quota search: minimize boys/girls deviations before trait balancing.
// Unknown gender has a separate quota; it is NEVER inferred from the sprite or name.
// All fixed students are counted first and may make equal gender counts impossible.
function peGenderQuotas(teams,targets,auto){
  const n=teams.length,remaining={male:0,female:0,unknown:0};
  const locked=teams.map(t=>({male:t.filter(s=>peGender(s)==='male').length,female:t.filter(s=>peGender(s)==='female').length}));
  auto.forEach(s=>remaining[peGender(s)]++);
  const totalM=remaining.male+locked.reduce((a,t)=>a+t.male,0);
  const totalF=remaining.female+locked.reduce((a,t)=>a+t.female,0);
  const total=targets.reduce((a,b)=>a+b,0)||1;
  const futureSlots=Array(n+1).fill(0);
  for(let i=n-1;i>=0;i--)futureSlots[i]=futureSlots[i+1]+targets[i]-teams[i].length;
  const meanM=totalM/n,meanF=totalF/n,memo=new Map();
  function solve(i,maleLeft,femaleLeft){
    if(i===n)return maleLeft===0&&femaleLeft===0?{cost:0,quotas:[]}:null;
    const key=`${i}|${maleLeft}|${femaleLeft}`;
    if(memo.has(key))return memo.get(key);
    let best=null;
    const slots=targets[i]-teams[i].length;
    for(let m=0;m<=Math.min(slots,maleLeft);m++){
      for(let f=0;f<=Math.min(slots-m,femaleLeft);f++){
        if(maleLeft-m+femaleLeft-f>futureSlots[i+1])continue;
        const tail=solve(i+1,maleLeft-m,femaleLeft-f);
        if(!tail)continue;
        const totalTeamM=locked[i].male+m,totalTeamF=locked[i].female+f;
        const fairness=(totalTeamM-meanM)**2+(totalTeamF-meanF)**2;
        // Tiny tie-breaker: when team sizes differ, a larger team gets
        // approximately its proportional share without overriding count fairness.
        const proportional=(totalTeamM-totalM*targets[i]/total)**2+(totalTeamF-totalF*targets[i]/total)**2;
        const cost=tail.cost+fairness+proportional*.0001;
        if(!best||cost<best.cost-1e-9)best={cost,quotas:[{male:m,female:f,unknown:slots-m-f},...tail.quotas]};
      }
    }
    memo.set(key,best);
    return best;
  }
  return solve(0,remaining.male,remaining.female)?.quotas||null;
}
function generatePETeams(){
  peConfirmed=[]; // a fresh distribution invalidates any previous approval
  const n=peState.teamCount||4,students=[...classState.students];
  const teams=Array.from({length:n},()=>[]),auto=[];
  students.forEach((s,i)=>{const fixed=ensurePEStudent(s,i).fixedTeam;if(fixed>=1&&fixed<=n)teams[fixed-1].push(s);else auto.push(s)});
  const targets=teamTargets(n,students.length,teams.map(t=>t.length));
  if(!targets){alert('현재 고정 학생 수로는 팀 인원을 1명 이내 차이로 맞출 수 없습니다. 고정을 조정해 주세요.');return}
  const quotas=peGenderQuotas(teams,targets,auto);
  if(!quotas){alert('남녀 인원 배분을 계산하지 못했습니다. 고정 학생 설정을 확인해 주세요.');return}
  const remaining=quotas.map(q=>({...q}));
  // Randomized tie order; high-stamina students are allocated early to balance
  // the independent ability axes within each already balanced gender quota.
  for(let i=auto.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[auto[i],auto[j]]=[auto[j],auto[i]]}
  auto.sort((a,b)=>(peVector(b)[0]||0)-(peVector(a)[0]||0));
  auto.forEach(student=>{
    const gender=peGender(student);
    let best=-1,bestScore=Infinity;
    for(let i=0;i<n;i++){
      if(remaining[i][gender]<=0)continue;
      teams[i].push(student);
      const sc=scoreTeams(teams,targets)+Math.random()*.03;
      teams[i].pop();
      if(sc<bestScore){bestScore=sc;best=i}
    }
    if(best<0)throw new Error('PE gender-quota allocation inconsistent');
    teams[best].push(student);remaining[best][gender]--;
  });
  // Optimize independent traits without changing team sizes or gender quotas.
  // Locked students are NEVER exchanged; only like-for-like gender swaps.
  let current=scoreTeams(teams,targets);
  for(let pass=0;pass<500;pass++){
    const a=Math.floor(Math.random()*n),b=Math.floor(Math.random()*n);if(a===b)continue;
    const ca=teams[a].filter(s=>!ensurePEStudent(s,students.indexOf(s)).fixedTeam);
    if(!ca.length)continue;
    const sa=ca[Math.floor(Math.random()*ca.length)];
    const cb=teams[b].filter(s=>!ensurePEStudent(s,students.indexOf(s)).fixedTeam&&peGender(s)===peGender(sa));
    if(!cb.length)continue;
    const sb=cb[Math.floor(Math.random()*cb.length)],ia=teams[a].indexOf(sa),ib=teams[b].indexOf(sb);
    teams[a][ia]=sb;teams[b][ib]=sa;
    const next=scoreTeams(teams,targets);
    if(next<=current)current=next;else{teams[a][ia]=sa;teams[b][ib]=sb}
  }
  peAssignments=teams;renderPE();updateModeChrome();
}
function teamRadarLarge(values){
  const w=260,h=260,c=130,r=82,labels=["체력","통솔","적극","매력"],n=4;
  const point=(i,val)=>{const a=-Math.PI/2+i*Math.PI*2/n,rr=r*(val/4);return[c+Math.cos(a)*rr,c+Math.sin(a)*rr]};
  const ring=val=>values.map((_,i)=>point(i,val).join(",")).join(" ");
  const axes=values.map((_,i)=>{const p=point(i,4);return`<line x1="${c}" y1="${c}" x2="${p[0]}" y2="${p[1]}"/>`}).join("");
  const texts=labels.map((lab,i)=>{const a=-Math.PI/2+i*Math.PI*2/n,rr=r+29,x=c+Math.cos(a)*rr,y=c+Math.sin(a)*rr+5;return`<text x="${x}" y="${y}" text-anchor="middle" font-size="15" font-weight="950" fill="#334155">${lab}</text>`}).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="team-radar-large" aria-label="팀 능력 레이더"><g fill="none" stroke="#cbd5e1" stroke-width="1.4">${axes}<polygon points="${ring(1)}"/><polygon points="${ring(2)}"/><polygon points="${ring(3)}"/><polygon points="${ring(4)}"/></g><polygon points="${values.map((v,i)=>point(i,v||0).join(",")).join(" ")}" fill="rgba(37,99,235,.24)" stroke="#2563eb" stroke-width="3"/>${texts}</svg>`;
}
function teamAverage(team){if(!team.length)return[0,0,0,0];const sum=[0,0,0,0];team.forEach(s=>peVector(s).forEach((v,i)=>sum[i]+=v));return sum.map(v=>v/team.length)}
function renderPE(){
  if(!$('peBoard'))return;
  const n=peState.teamCount||4,board=$('peBoard');
  const cols=n===4?2:(n<=3?n:3);
  document.documentElement.style.setProperty('--pe-cols',cols);
  board.className=`pe-board pe-count-${n}`;
  const teams=peAssignments.length===n?peAssignments:Array.from({length:n},()=>[]);
  if(!peAssignments.length){
    classState.students.forEach(s=>{const fixed=ensurePEStudent(s,classState.students.indexOf(s)).fixedTeam;if(fixed>=1&&fixed<=n)teams[fixed-1].push(s)});
  }
  $('peBoard').innerHTML=teams.map((team,i)=>{
    const teamNo=i+1,avg=teamAverage(team),abilityOpen=peShowAllAbilities;
    const boys=team.filter(s=>peGender(s)==="male").length,girls=team.filter(s=>peGender(s)==="female").length,unspecified=team.length-boys-girls;
    const members=team.length?team.map(s=>{const idx=classState.students.indexOf(s),d=ensurePEStudent(s,idx);return`<div class="pe-member ${d.fixedTeam===teamNo?'fixed':''}" data-student-id="${s.id}" data-team-no="${teamNo}" title="클릭: 이 팀 고정/해제 · 우클릭: 고정 해제">${studentPreviewMarkup(s,idx)}<div><strong>${escapeHtml(s.name)}</strong>${d.fixedTeam===teamNo?`<em>🔒 ${teamNo}팀 고정</em>`:'<em style="color:#64748b">클릭해 고정</em>'}</div></div>`}).join(''):`<div class="pe-empty">${peAssignments.length?'배정 학생 없음':'하단 학생을 이 팀으로 끌어 고정할 수 있습니다.'}</div>`;
    const ability=`<div class="pe-team-ability">${teamRadarLarge(avg)}<div class="pe-team-ability-copy"><strong>${teamNo}팀 능력 균형</strong><span>체육 편성에 사용하는 네 능력의 팀 평균 형태입니다. 숫자 총점은 사용하지 않습니다.</span><div class="pe-axis-key"><b>체력</b><b>통솔</b><b>적극</b><b>매력</b></div></div></div>`;
    return`<section class="pe-team" data-pe-team="${teamNo}"><div class="pe-team-head" style="background:${TEAM_COLORS[i]}"><div class="pe-team-title"><span>${teamNo}팀</span><button type="button" data-team-ability="${teamNo}" class="${abilityOpen?'on':''}">${abilityOpen?'팀원 보기':'팀 능력'}</button><button type="button" data-fixed-edit="${teamNo}" class="${peFixedEditTeam===teamNo?'fixed-edit-on':''}">${peFixedEditTeam===teamNo?'고정 지정 중':'고정 지정'}</button></div><small>${team.length}명 · 남 ${boys} / 여 ${girls}${unspecified?` / 미지정 ${unspecified}`:""}</small></div><div class="pe-team-body">${abilityOpen?ability:members}</div></section>`;
  }).join('');

  // 하단 학생 카드 -> 팀 드롭: 해당 팀에 즉시 고정하고, 이미 편성된 상태라면 그 팀으로 이동한다.
  $('peBoard').querySelectorAll('[data-pe-team]').forEach(teamEl=>{
    const teamNo=Number(teamEl.dataset.peTeam);
    teamEl.ondragover=event=>{if(mode!=="pe")return;event.preventDefault();event.dataTransfer.dropEffect="move";teamEl.classList.add('pe-drop-target')};
    teamEl.ondragleave=event=>{if(!teamEl.contains(event.relatedTarget))teamEl.classList.remove('pe-drop-target')};
    teamEl.ondrop=event=>{
      event.preventDefault();teamEl.classList.remove('pe-drop-target');
      const studentId=event.dataTransfer.getData('application/x-student-id')||event.dataTransfer.getData('text/plain');
      const student=studentById(studentId);if(!student)return;
      setPEFixedTeam(studentId,teamNo,{moveAssignment:true});
      refreshPEAfterFixedChange(studentId,`${student.name} 학생을 ${teamNo}팀에 고정했습니다.`);
    };
  });

  // 편성된 학생: 클릭으로 현재 팀 고정/해제, 우클릭으로 언제든 고정 해제.
  $('peBoard').querySelectorAll('.pe-member').forEach(card=>{
    card.onclick=event=>{
      event.preventDefault();event.stopPropagation();
      const studentId=card.dataset.studentId,teamNo=Number(card.dataset.teamNo),student=studentById(studentId);if(!student)return;
      const data=ensurePEStudent(student,classState.students.indexOf(student));
      if(data.fixedTeam===teamNo){
        clearPEFixedTeam(studentId);
        refreshPEAfterFixedChange(studentId,`${student.name} 학생의 팀 고정을 해제했습니다.`);
      }else{
        setPEFixedTeam(studentId,teamNo,{moveAssignment:false});
        refreshPEAfterFixedChange(studentId,`${student.name} 학생을 ${teamNo}팀에 고정했습니다.`);
      }
    };
    card.oncontextmenu=event=>{
      event.preventDefault();event.stopPropagation();
      const studentId=card.dataset.studentId,student=studentById(studentId);if(!student)return;
      if(clearPEFixedTeam(studentId))refreshPEAfterFixedChange(studentId,`${student.name} 학생의 팀 고정을 해제했습니다.`);
    };
  });
  $('peBoard').querySelectorAll('[data-team-ability]').forEach(btn=>btn.onclick=event=>{event.stopPropagation();peShowAllAbilities=!peShowAllAbilities;renderPE()});
  $('peBoard').querySelectorAll('[data-fixed-edit]').forEach(btn=>btn.onclick=event=>{event.stopPropagation();const team=Number(btn.dataset.fixedEdit);peFixedEditTeam=peFixedEditTeam===team?0:team;renderPE();renderStudentStrip();updateModeChrome()});
  decorateStudentStrip();
}

// ==== PE V2.8 field selector: keep approved 1.5 / 1.75 / 2.0 geometry ====
// Team names, exact student IDs, team colors and visual attributes come from
// the current Seating Studio PE assignment. Traits must never leave teacher UI.
const pePitch = {
  W:1120, H:720, scale:1.5, spriteScale:1.75, tagScale:2,
  field:{x:129,y:105,w:1422,h:870},
  camera:{x:280,y:180},
  teams:[], images:new Map(), loading:0, surface:"grass", showLines:true
};
pePitch.field.cx=pePitch.field.x+pePitch.field.w/2;
pePitch.field.cy=pePitch.field.y+pePitch.field.h/2;
const peGrass=new Image();
peGrass.src='data:image/png;base64,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';
peGrass.addEventListener('load',()=>{if($('pePitchReveal').classList.contains('is-open'))drawPEPitch()});
peGrass.addEventListener('error',()=>{if($('pePitchReveal').classList.contains('is-open'))drawPEPitch()});
// Original 32×32 pixel dirt pattern from the earlier light schoolyard version.
// Texture is embedded, so grass and dirt render without extra asset downloads.
const peDirt=new Image();
peDirt.onload=()=>{if(pePitch.surface==='dirt'&&$('pePitchReveal').classList.contains('is-open'))drawPEPitch()};
peDirt.onerror=()=>{if(pePitch.surface==='dirt'&&$('pePitchReveal').classList.contains('is-open'))drawPEPitch()};
peDirt.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAADbUlEQVR4nIVWSZYrNwwDB9k5em6V6+QIrhJJZCHVbOfXql+b4ggQlH//+RuAAAVJGiEAWMnqrAQE+ydgVfaCwN0ARCQIa6pqAKoyewGwpqIKAoCvParq4mh+VNXmDqBHVBUoIupvZVX0nGEE2TMqAIiqN4MKCGYNL17Fb94BSBWXdR1hBFgjMjKjIPC2VQC4m4llzyr2HjcvfssUwCXrGabPmPq9gipCAIEARURh/GMEuGR6dn2q7NouEX/5nqM1tzlGRqSQLzvCuKiOYZ4ypaiJvQBUrAp6c1MFUFXfmjkeASPwFqYZALjYSwzMlZUARE20idrAkgiqal15G88fwjQHwCoAvrmeDWEVa/k/d7/BukNzHxgAJwtERHCfy5aLqLhP2B2u1w1Fc7w1fAmmmao0N1UlCcDPRf2u+ur6DFDYqICgXGsVkaq6+X2Qa7whvlDsR3OquKwHG/zmWu9oORDFXCH0t88w55XAzfIEkLFsjgoEYmaqWlU30IAUNfG/xjMIDx4cpsIq1mcmJEJCVXcmNwCfZb3uJQE4XIiIm5LoS3CLGpEHNDZQkMX+me3iweR+cnoZFVmMD8sqm6iJv5XO7MwQIIlIAHDFAyccFTy+jfTcIDjziuViAyGgwpdNmwlonicq/nSdPSMZBUC+5bW1/gluPk30YSFiL9cqu0kHTxzGDZoXpI2VM7Il6e9Xw1fUv/Se14kN2Qsoc1V3sSYyobm3YmeDb4vaVNsg92Bgj7wr3c7nowJudd87uHPCz9FOP7zEaQAghz4PybxUJr+W486JJ7QwijAdpEaVZFqBt6V6Pwy+TEhY5aoymTuJ08GPuvv7L2/NVGQoYWZlJ+93xn0TEzKebJ8XCTLjAk1lMT7ByG2Au7t7ub828WY517U1t4b3zeaP4gOa2vvdACxLz9sdNQNcH6iqu7nZvlYjM56IOhJlZqpqa9ZgJwQSAFlTPIe8HZ0gM/MK1uPCuGW9TMXetWSbBkREPdYAYA1j7je5uLblcP1ZVhCtucO+XlDjSGKVn9R1O//OOnxq3b7ScTrO8DjUzu0TUZ8S2Exoy5LVK7Pc1GaYY8+ssd8fOGW6/z3rG5IVkRFZEIeAxT72hkDaXgEFKt7U3FUAhFpl8MmGb/XJIAPpv1E8pGapWO4H7UOUzlehnvAC4D9PRzrpizXpOAAAAABJRU5ErkJggg==';
function setPEPitchSurface(surface){
  if(surface!=='grass'&&surface!=='dirt')return;
  pePitch.surface=surface;
  // Side gutters use the very same embedded ground texture as the canvas.
  document.querySelectorAll('[data-pe-surface]').forEach(btn=>{
    btn.setAttribute('aria-pressed',String(btn.dataset.peSurface===surface));
  });
  $('pePitchSurfaceDescription').textContent=(surface==='grass'?'Rasak 잔디 축구장':'밝은 황토색 흙 운동장')+
    ' · 센터서클 중앙 · 운동장 1.5× / 학생 1.75× / 이름표 2.0×';
  $('pePitchReveal').classList.toggle('is-dirt',surface==='dirt');
  $('pePitchCanvas').setAttribute('aria-label',
    `실제 확정된 팀과 학생 캐릭터가 배치된 ${surface==='grass'?'잔디':'흙'} 운동장`);
  if($('pePitchReveal').classList.contains('is-open'))drawPEPitch();
}


function peSpritePath(student,index){
  // Same canonical character/hair/outfit scheme as shared/student-registry.js.
  // Invalid/unset values follow the registry's deterministic fallback algorithm.
  let h=2166136261;
  const text=`${student.id||''}|${student.name||''}|${index}`;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
  h>>>=0;
  const pool=student.gender==='male'?['boy1','boy2']:student.gender==='female'?['girl','trav','prin']:['boy1','boy2','girl','trav','prin'];
  const v=student.visual||{};
  const character=['boy1','boy2','girl','trav','prin'].includes(v.character)?v.character:pool[h%pool.length];
  const hair=['brown','black'].includes(v.hair)?v.hair:['brown','black'][(h>>>4)%2];
  const outfit=['green','blue','red','yellow','purple','orange'].includes(v.outfit)?v.outfit:['green','blue','red','yellow','purple','orange'][(h>>>9)%6];
  return new URL(`../shared/assets/students/${character}_${hair}_${outfit}.png`,document.baseURI).href;
}
// Match the canvas backing aspect to its measured CSS aspect at every viewport.
// Fix H=720 logical units; adjust W only, so characters and text keep their
// natural shape, while the pitch outline stays within the painted canvas.
function resizePEPitchStage(){
  const canvas=$('pePitchCanvas');
  const box=canvas.parentElement.getBoundingClientRect();
  if(box.width<10||box.height<10)return;
  const logicalH=720;
  const logicalW=Math.max(1,Math.round(logicalH*box.width/box.height));
  const factor=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  const pxW=Math.max(1,Math.round(box.width*factor));
  const pxH=Math.max(1,Math.round(box.height*factor));
  if(canvas.width!==pxW)canvas.width=pxW;
  if(canvas.height!==pxH)canvas.height=pxH;
  pePitch.W=logicalW;pePitch.H=logicalH;
  pePitch.camera.x=0;pePitch.camera.y=0;
  // Real sidelines, penalty areas and center circle are ALL inside the canvas.
  const marginX=Math.max(32,Math.min(75,logicalW*.048));
  const marginY=31;
  pePitch.field={x:marginX,y:marginY,w:logicalW-2*marginX,h:logicalH-2*marginY};
  pePitch.field.cx=logicalW/2;pePitch.field.cy=logicalH/2;
}
function pePitchLayouts(n){
  // All coordinates are relative to the center circle (560,360 screen pixels).
  // 2 teams = broad left/right blocks; 3 = three vertical blocks;
  // 4-6 = two rows (prevents nameplates from crossing the other team's sprites).
  switch(n){
    case 2:return [[-279,0],[279,0]];
    case 3:return [[-370,0],[0,0],[370,0]];
    case 4:return [[-269,-158],[269,-158],[-269,158],[269,158]];
    case 5:return [[-380,-158],[0,-158],[380,-158],[-190,158],[190,158]];
    case 6:return [[-380,-158],[0,-158],[380,-158],[-380,158],[0,158],[380,158]];
    default:return [];
  }
}
function pePitchOffsets(total,n){
  // Feet anchors. Every row reserves sprite height 56px + nameplate 40px + gap.
  // This prevents the label of an upper student from covering a lower sprite.
  const columns=n===2?4:n===3?2:n===4?Math.min(4,Math.max(2,Math.ceil(total/2))):3;
  const rows=Math.ceil(total/columns);
  const gapX=n===2?128:n===3?136:n===4?125:118;
  const rowGap=rows<=2?146:Math.min(145,480/(rows-1));
  const result=[];
  for(let row=0;row<rows;row++){
    const count=Math.min(columns,total-row*columns);
    for(let col=0;col<count;col++){
      result.push([(col-(count-1)/2)*gapX,(row-(rows-1)/2)*rowGap]);
    }
  }
  return result;
}
function pePitchRenderPlan(){
  const f=pePitch.field,centers=pePitchLayouts(pePitch.teams.length);
  return pePitch.teams.map((roster,t)=>{
    const [dx,dy]=centers[t];
    const offsets=pePitchOffsets(roster.length,pePitch.teams.length);
    // For extra-wide monitors use available space; compact screens reduce x
    // distance but never apply nonuniform transforms to sprites/nameplates.
    const spread=Math.max(.55,Math.min(1.35,(pePitch.W-110)/1090));
    const cx=f.cx+dx*spread, cy=f.cy+dy;
    return {team:t,centerX:cx,centerY:cy,members:roster.map((person,i)=>({
      person,team:t,index:i,x:Math.round(cx+offsets[i][0]*spread),y:Math.round(cy+offsets[i][1])
    }))};
  });
}
function pePitchSnapshot(){
  const studentsById=new Map(classState.students.map((s,i)=>[s.id,{student:s,index:i}]));
  return peConfirmed.map((ids,i)=>ids.map(id=>{
    const hit=studentsById.get(id);
    return hit?{id,team:i,name:hit.student.name,src:peSpritePath(hit.student,hit.index)}:null;
  }).filter(Boolean));
}
function updatePEBriefControls(){
  const ready=peEntry.mode==='done';
  $('pePitchSimpleOpen').disabled=!ready;
  $('pePitchSimpleOpen').title=ready?'확정된 팀으로 간단 배치표 보기':'학생 입장이 끝나면 열 수 있습니다';
}
function showPEBrief(){
  if(peEntry.mode!=='done')return;
  const teams=pePitch.teams;
  const grid=$('peSimpleGrid');grid.replaceChildren();
  grid.style.setProperty('--pe-cols',teams.length<=3?teams.length:teams.length===4?2:3);
  teams.forEach((members,index)=>{
    const card=document.createElement('section');card.className='pe-simple-team';
    const title=document.createElement('div');title.className='pe-simple-team-name';
    title.textContent=`${index+1}팀 · ${members.length}명`;
    title.style.backgroundColor=TEAM_COLORS[index]||'#176539';
    title.style.color='#fff';
    card.append(title);
    const list=document.createElement('div');list.className='pe-simple-team-members';
    list.style.setProperty('--pe-member-cols',Math.min(4,Math.max(2,Math.ceil(Math.sqrt(members.length)))));
    for(const person of members){
      const label=document.createElement('div');label.className='pe-simple-name';
      label.textContent=person.name;list.append(label);
    }
    card.append(list);grid.append(card);
  });
  $('peSimplePanel').hidden=false;
  $('pePitchReveal').classList.add('is-simple');
  $('pePitchSimpleReturn').hidden=false;
  $('pePitchSaveJpg').hidden=false;
  $('pePitchSimpleReturn').focus();
}
function hidePEBrief(){
  $('pePitchReveal').classList.remove('is-simple');
  $('peSimplePanel').hidden=true;
  $('pePitchSimpleReturn').hidden=true;
  $('pePitchSaveJpg').hidden=true;
  requestAnimationFrame(drawPEPitch);
}
function downloadPEBriefJpg(){
  if(peEntry.mode!=='done'||!pePitch.teams.length)return;
  // Stand-alone vector/text export: no remote sprite dependency or tainted canvas.
  const c=document.createElement('canvas');c.width=1920;c.height=1200;
  const g=c.getContext('2d');if(!g)return;
  const W=c.width,H=c.height;
  g.fillStyle='#f3f5f8';g.fillRect(0,0,W,H);
  g.fillStyle='#fff';g.fillRect(44,44,W-88,H-88);
  g.fillStyle='#19263b';g.textAlign='center';g.textBaseline='middle';
  g.font='900 62px system-ui, sans-serif';g.fillText('오늘의 체육 모둠 배치표',W/2,125);
  g.font='600 26px system-ui, sans-serif';g.fillStyle='#718096';
  const groups=pePitch.teams;
  g.fillText(`${groups.length}팀 · ${groups.reduce((n,t)=>n+t.length,0)}명`,W/2,184);
  const cols=groups.length<=3?groups.length:groups.length===4?2:3;
  const rows=Math.ceil(groups.length/cols);
  const padX=90,gapX=30,gapY=26,top=225,bottom=85;
  const cellW=(W-2*padX-gapX*(cols-1))/cols;
  const cellH=(H-top-bottom-gapY*(rows-1))/rows;
  const rounded=(x,y,w,h,r)=>{g.beginPath();g.roundRect(x,y,w,h,r)};
  groups.forEach((team,i)=>{
    const row=Math.floor(i/cols),col=i%cols;
    const x=padX+col*(cellW+gapX),y=top+row*(cellH+gapY);
    rounded(x,y,cellW,cellH,16);g.fillStyle='#f8fafc';g.fill();g.strokeStyle='#c5d0dd';g.lineWidth=3;g.stroke();
    rounded(x+12,y+12,cellW-24,67,10);g.fillStyle=TEAM_COLORS[i]||'#176539';g.fill();
    g.fillStyle='white';g.font='900 34px system-ui, sans-serif';g.fillText(`${i+1}팀 (${team.length}명)`,x+cellW/2,y+47);
    const listCols=Math.min(4,Math.max(2,Math.ceil(Math.sqrt(team.length))));
    const listRows=Math.ceil(team.length/listCols);
    const innerX=x+20,innerTop=y+96;
    const slotGapX=10,slotGapY=12;
    const boxW=(cellW-40-(listCols-1)*slotGapX)/listCols;
    const boxH=Math.min(78,(cellH-113-(listRows-1)*slotGapY)/listRows);
    for(let j=0;j<team.length;j++){
      const bx=innerX+(j%listCols)*(boxW+slotGapX),by=innerTop+Math.floor(j/listCols)*(boxH+slotGapY);
      rounded(bx,by,boxW,boxH,8);g.fillStyle='#fff';g.fill();g.lineWidth=2;g.strokeStyle='#516075';g.stroke();
      const name=team[j].name;let size=Math.min(30,boxW/Math.max(2.5,[...name].length*.9));
      g.font=`800 ${size}px system-ui, sans-serif`;g.fillStyle='#1d2a40';g.fillText(name,bx+boxW/2,by+boxH/2);
    }
  });
  const a=document.createElement('a');
  a.download='체육_모둠_간단_배치표.jpg';
  a.href=c.toDataURL('image/jpeg',.94);
  document.body.append(a);a.click();a.remove();
}
function openPEPitch(){
  if(!peConfirmed.length){alert('먼저 「새 팀 편성」 후 「팀 확정」을 눌러 주세요.');return}
  if(peConfirmed.length!==(peState.teamCount||4)){
    alert('팀 수가 변경되었습니다. 새 팀 편성 후 다시 확정해 주세요.');return;
  }
  if(peConfirmed.flat().length!==classState.students.length ||
     new Set(peConfirmed.flat()).size!==classState.students.length){
    alert('학생 명단이 변경되었습니다. 새 팀 편성 후 다시 확정해 주세요.');return;
  }
  const teams=pePitchSnapshot();
  if(!teams.length || teams.some(t=>!t.length) || !pePitchLayouts(teams.length).length){
    alert('확정된 팀 명단이 없습니다. 팀 편성을 다시 확인해 주세요.');return;
  }
  pePitch.teams=teams;
  hidePEBrief();
  resetPEEntrance();
  $('pePitchTeamCount').textContent=`${teams.length}팀 · ${teams.flat().length}명`;
  $('pePitchReveal').classList.add('is-open');
  $('pePitchReveal').setAttribute('aria-hidden','false');
  document.body.classList.add('pe-pitch-open');
  $('pePitchBack').focus();
  // Avoid long waits: render immediately, update each sprite as it loads.
  for(const p of teams.flat()){
    if(pePitch.images.has(p.src))continue;
    const img=new Image();const record={img,status:'loading'};
    pePitch.images.set(p.src,record);
    img.onload=()=>{record.status='loaded';updatePEPitchStatus();drawPEPitch()};
    img.onerror=()=>{record.status='failed';updatePEPitchStatus();drawPEPitch()};
    img.src=p.src;
  }
  updatePEPitchStatus();drawPEPitch();
}
function closePEPitch(){
  cancelPEEntrance();
  hidePEBrief();
  $('pePitchReveal').classList.remove('is-open');
  $('pePitchReveal').setAttribute('aria-hidden','true');
  document.body.classList.remove('pe-pitch-open');
  $('openPlayback').focus();
}
function updatePEPitchStatus(){
  const all=pePitch.teams.flat(),loaded=all.filter(p=>pePitch.images.get(p.src)?.status==='loaded').length;
  const failed=all.filter(p=>pePitch.images.get(p.src)?.status==='failed').length;
  const pending=all.length-loaded-failed;
  $('pePitchSpriteStatus').textContent=pending?`학생 캐릭터 읽는 중 · ${loaded}/${all.length}`:
    failed?`${loaded}명 캐릭터 표시 완료 · ${failed}명은 온라인 PNG를 불러오지 못했습니다.`:'실제 학생 캐릭터 · 팀명과 학생 이름만 표시';
}
// Entrance timing uses a virtual clock so 1×/5× keep the same wave order.
// Exactly one student PER TEAM enters in each wave, from the nearest side.
const peEntry={mode:'ready',rate:1,elapsed:0,lastTime:null,raf:0,msPerWave:1650,pauseBetween:250};
function peEntranceTotal(){
  const waves=Math.max(0,...pePitch.teams.map(team=>team.length));
  return waves? (waves-1)*(peEntry.msPerWave+peEntry.pauseBetween)+peEntry.msPerWave:0;
}
function cancelPEEntrance(){
  if(peEntry.raf){cancelAnimationFrame(peEntry.raf);peEntry.raf=0}
  peEntry.lastTime=null;
}
function resetPEEntrance(){
  cancelPEEntrance();peEntry.mode='ready';peEntry.rate=1;peEntry.elapsed=0;
  updatePEEntranceUI();
  if($('pePitchReveal').classList.contains('is-open'))drawPEPitch();
}
function finishPEEntrance(){
  cancelPEEntrance();peEntry.mode='done';peEntry.elapsed=peEntranceTotal();
  updatePEEntranceUI();drawPEPitch();
}
function startPEEntrance(rate){
  if(peEntry.mode==='done')resetPEEntrance();
  const motionReduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(motionReduced){finishPEEntrance();return;}
  peEntry.mode='playing';peEntry.rate=rate;
  // Do not reset the elapsed time when switching from 1x to 5x.
  peEntry.lastTime=null;
  updatePEEntranceUI();
  if(!peEntry.raf)peEntry.raf=requestAnimationFrame(tickPEEntrance);
}
function tickPEEntrance(time){
  peEntry.raf=0;
  if(peEntry.mode!=='playing'||!$('pePitchReveal').classList.contains('is-open'))return;
  if(peEntry.lastTime!==null){
    const dt=Math.max(0,Math.min(time-peEntry.lastTime,100));
    peEntry.elapsed+=dt*peEntry.rate;
  }
  peEntry.lastTime=time;
  if(peEntry.elapsed>=peEntranceTotal()){finishPEEntrance();return}
  updatePEEntranceUI();drawPEPitch();
  peEntry.raf=requestAnimationFrame(tickPEEntrance);
}
function peEntranceProgress(memberIndex){
  if(peEntry.mode==='done')return 1;
  if(peEntry.mode==='ready')return -1;
  const start=memberIndex*(peEntry.msPerWave+peEntry.pauseBetween);
  if(peEntry.elapsed<start)return -1;
  return Math.min(1,(peEntry.elapsed-start)/peEntry.msPerWave);
}
function updatePEEntranceUI(){
  const total=pePitch.teams.reduce((sum,arr)=>sum+arr.length,0);
  const arrived=peEntry.mode==='done'?total:peEntry.mode==='ready'?0:
    pePitch.teams.reduce((sum,team)=>sum+team.filter((_,i)=>peEntranceProgress(i)>=1).length,0);
  const status=peEntry.mode==='ready'?'입장 준비 · 시작을 눌러 주세요':
    peEntry.mode==='done'?`입장 완료 · ${total}명`:`입장 중 · ${arrived}/${total}명 · ${peEntry.rate}×`;
  $('pePitchEntranceStatus').textContent=status;
  for(const [id,value] of [['pePitchRun1',1],['pePitchRun5',5]]){
    $(id).setAttribute('aria-pressed',String(peEntry.mode==='playing'&&peEntry.rate===value));
  }
  $('pePitchInstant').disabled=peEntry.mode==='done';
  updatePEBriefControls();
}
function pePitchRounded(ctx,x,y,w,h,r){
  ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);
  else {ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath()}
}
function drawPEPitch(){
  const canvas=$('pePitchCanvas');if(!canvas)return;
  if(!document.body.classList.contains('pe-pitch-open'))return;
  if($('pePitchReveal').classList.contains('is-simple'))return;
  resizePEPitchStage();
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const {W,H,scale:Z,field:f}=pePitch;
  // HiDPI backing exactly matches measured viewport proportions.
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,W,H);
  ctx.save();ctx.translate(-pePitch.camera.x,-pePitch.camera.y);
  const worldW=W,worldH=H;
  const isDirt=pePitch.surface==='dirt';
  const texture=isDirt?peDirt:peGrass;
  ctx.fillStyle=isDirt?'#e0b884':'#448a24';ctx.fillRect(0,0,worldW,worldH);
  if(texture.complete&&texture.naturalWidth){
    const pattern=ctx.createPattern(texture,'repeat');
    if(pattern){ctx.fillStyle=pattern;ctx.fillRect(0,0,worldW,worldH)}
  }
  ctx.fillStyle=isDirt?'rgba(114,75,38,.025)':'rgba(9,31,8,.12)';
  ctx.fillRect(0,0,worldW,worldH);
  ctx.fillStyle=isDirt?'rgba(255,243,214,.06)':'rgba(255,255,190,.075)';
  ctx.fillRect(f.x,f.y,f.w,f.h);
  // Optional lines: disabled means no white pitch markings, including
  // sidelines, middle stripe, center circle, penalty area, goals or spots.
  if(pePitch.showLines){
    ctx.strokeStyle=isDirt?'#fff7e5':'#f3f5e6';ctx.lineWidth=4*Z;
    ctx.lineCap='square';ctx.lineJoin='miter';
    const line=(a,b,c,d)=>{ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.stroke()};
    ctx.strokeRect(f.x,f.y,f.w,f.h);line(f.cx,f.y,f.cx,f.y+f.h);
    ctx.beginPath();ctx.arc(f.cx,f.cy,78*Z,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=isDirt?'#fff7e5':'#f3f5e6';ctx.fillRect(f.cx-4*Z,f.cy-4*Z,8*Z,8*Z);
    const pd=146*Z,ph=300*Z,sd=55*Z,sh=138*Z;
    ctx.strokeRect(f.x,f.cy-ph/2,pd,ph);ctx.strokeRect(f.x+f.w-pd,f.cy-ph/2,pd,ph);
    ctx.strokeRect(f.x,f.cy-sh/2,sd,sh);ctx.strokeRect(f.x+f.w-sd,f.cy-sh/2,sd,sh);
    const ls=f.x+105*Z,rs=f.x+f.w-105*Z;
    ctx.fillRect(ls-3*Z,f.cy-3*Z,6*Z,6*Z);ctx.fillRect(rs-3*Z,f.cy-3*Z,6*Z,6*Z);
    const r=78*Z,a=Math.acos((pd-105*Z)/r);
    ctx.beginPath();ctx.arc(ls,f.cy,r,-a,a);ctx.stroke();
    ctx.beginPath();ctx.arc(rs,f.cy,r,Math.PI-a,Math.PI+a);ctx.stroke();
    ctx.strokeRect(f.x-28*Z,f.cy-52*Z,28*Z,104*Z);
    ctx.strokeRect(f.x+f.w,f.cy-52*Z,28*Z,104*Z);
  }
  const plan=pePitchRenderPlan();
  const pixelSize=32*pePitch.spriteScale;
  const tag=pePitch.tagScale;
  for(const group of plan){
    const minY=Math.min(...group.members.map(p=>p.y));
    const firstY=Number.isFinite(minY)?minY:group.centerY;
    const teamTitleY=firstY-pixelSize-41;
    const title=(group.team+1)+'팀';
    ctx.font='800 18px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#122016e6';pePitchRounded(ctx,group.centerX-38,teamTitleY-17,76,34,11);ctx.fill();
    ctx.lineWidth=2;ctx.strokeStyle=TEAM_COLORS[group.team];ctx.stroke();
    ctx.fillStyle='#fff';ctx.fillText(title,group.centerX,teamTitleY+1);
    for(const member of group.members){
      const p=member.person;
      // Paired columns across the vertical centerline enter in mirror order.
      // On right-hand teams, reverse each row's index, matching left positions.
      const teamSize=group.members.length;
      const columns=pePitch.teams.length===2?4:pePitch.teams.length===3?2:pePitch.teams.length===4?Math.min(4,Math.max(2,Math.ceil(teamSize/2))):3;
      const row=Math.floor(member.index/columns),rowStart=row*columns;
      const rowCount=Math.min(columns,teamSize-rowStart);
      const mirroredIndex=rowStart+(rowCount-1-(member.index-rowStart));
      const isRight=group.centerX>f.cx;
      const progress=peEntranceProgress(isRight?mirroredIndex:member.index);
      if(progress<0)continue;
      const direction=group.centerX<=f.cx?-1:1;
      const entranceEdge=direction===-1?pePitch.camera.x-100:pePitch.camera.x+W+100;
      // Smooth horizontal entrance, with each new wave starting only after
      // the previous wave has reached its final positions.
      const easing=progress*progress*(3-2*progress);
      const x=Math.round(entranceEdge+(member.x-entranceEdge)*easing);
      const y=member.y;
      ctx.fillStyle='#0c27178b';ctx.beginPath();ctx.ellipse(x,y-1,pixelSize*.39,pixelSize*.125,0,0,Math.PI*2);ctx.fill();
      const sprite=pePitch.images.get(p.src);
      if(sprite?.status==='loaded'){
        // Facing into the field while walking; front idle when arrived.
        const walk=progress<1;
        const frame=walk?Math.floor(peEntry.elapsed/140)%3:1;
        const row=walk?(direction===-1?2:1):0;
        ctx.drawImage(sprite.img,32*frame,32*row,32,32,x-pixelSize/2,y-pixelSize,pixelSize,pixelSize);
      }else{
        ctx.fillStyle='#1a3229';ctx.fillRect(x-pixelSize*.47,y-pixelSize*.97,pixelSize*.94,pixelSize*.94);
        ctx.strokeStyle='#d6e9c8';ctx.lineWidth=pePitch.spriteScale;
        ctx.strokeRect(x-pixelSize*.47,y-pixelSize*.97,pixelSize*.94,pixelSize*.94);
        ctx.fillStyle='#f7edd0';ctx.font=`bold ${17*pePitch.spriteScale}px system-ui`;
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',x,y-pixelSize*.53);
      }
      ctx.font=`bold ${12*tag}px system-ui, sans-serif`;
      const width=Math.ceil(ctx.measureText(p.name).width+12*tag);
      ctx.fillStyle='#102b1ccd';pePitchRounded(ctx,x-width/2,y+2*tag,width,20*tag,5*tag);ctx.fill();
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.name,x,y+12*tag);
      ctx.fillStyle=TEAM_COLORS[group.team];ctx.fillRect(x-width/2,y+3*tag,3*tag,18*tag);
    }
  }
  ctx.restore();
}
// Surface and line selection affect only the background layers, not teams.
// Manager controls are mounted by injectModeUI(), so their listeners are registered AFTER it.
$('pePitchRun1').addEventListener('click',()=>startPEEntrance(1));
$('pePitchRun5').addEventListener('click',()=>startPEEntrance(5));
$('pePitchInstant').addEventListener('click',finishPEEntrance);
$('pePitchReplay').addEventListener('click',resetPEEntrance);
$('pePitchBack').onclick=closePEPitch;
$('pePitchSimpleOpen').addEventListener('click',showPEBrief);
$('pePitchSimpleReturn').addEventListener('click',hidePEBrief);
$('pePitchSaveJpg').addEventListener('click',downloadPEBriefJpg);
const pePitchResizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{
  if($('pePitchReveal').classList.contains('is-open')&&!$('pePitchReveal').classList.contains('is-simple'))drawPEPitch();
}):null;
if(pePitchResizeObserver)pePitchResizeObserver.observe(document.querySelector('.pe-pitch-main'));
else window.addEventListener('resize',()=>{if($('pePitchReveal').classList.contains('is-open'))drawPEPitch()});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('pePitchReveal').classList.contains('is-open')){e.preventDefault();closePEPitch()}
});
// ==== End PE V2.7 soccer reveal ====

const originalGenerate=$("generateAssignment").onclick;
const originalConfirm=$("confirmAssignment").onclick;
const originalPlayback=$("openPlayback").onclick;
$("generateAssignment").onclick=()=>mode==="pe"?generatePETeams():originalGenerate?.();
$("confirmAssignment").onclick=()=>{if(mode!=="pe")return originalConfirm?.();if(!peAssignments.length)return alert("먼저 새 팀 편성을 실행하세요.");peConfirmed=peAssignments.map(t=>t.map(s=>s.id));$("assignmentStatus").textContent=`체육 ${peState.teamCount||4}팀을 확정했습니다. · ${classState.students.length}명`;$("assignmentStatus").classList.add("success")};
$("openPlayback").onclick=()=>{if(mode!=="pe")return originalPlayback?.();openPEPitch()};

injectStyles();
classState.students.forEach(ensurePEStudent);persistPE();
injectModeUI();
// Attach only after the PE manager toolbar has been created.
// Binding before injectModeUI() aborted the entire prototype initialization.
$('peManagerLines').checked=pePitch.showLines;
$('peManagerLines').addEventListener('change',e=>{
  pePitch.showLines=e.target.checked;
  if($('pePitchReveal').classList.contains('is-open'))drawPEPitch();
});
// Both controls select the same playground. Theme changes never change a team.
document.querySelectorAll('[data-pe-surface]').forEach(btn=>{
  btn.addEventListener('click',()=>setPEPitchSurface(btn.dataset.peSurface));
});
setPEPitchSurface(pePitch.surface);
updateModeChrome();renderStudentInspector();renderStudentStrip();renderPE();
})();

