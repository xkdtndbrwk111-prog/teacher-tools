import {readStudents,STUDENT_STORAGE_KEY} from '../shared/student-registry.js';
"use strict";
const $=id=>document.getElementById(id);
const KEY="teacher-tools.hanja.data.v1";
const defaults={target:"mixed",direction:"forward",mode:"choice",perStudent:3,choices:4};
function frequencyLabel(weight){const n=Number(weight);if(n<=0)return "사용 안 함";if(n<=20)return "매우 낮음";if(n<=40)return "낮음";if(n<=60)return "보통";if(n<=80)return "높음";return "매우 높음"}
function frequencyOutput(weight){
 const n=Math.max(0,Math.min(100,Number(weight)||0));
 return `${frequencyLabel(n)} · ${n}`;
}
function updateWeightLabel(){
 $("weightLabel").textContent=frequencyOutput($("weight").value);
}
function selectedEntries(){
 return db.filter(e=>selectedIds.has(e.id));
}
function syncEditorMode(){
 const count=selectedIds.size;
 $("singleEditPanel").classList.toggle("hidden",count>1);
 $("bulkEditPanel").classList.toggle("hidden",count<=1);
 if(count>1){
  $("bulkCount").textContent=count;
  const items=selectedEntries();
  const values=[...new Set(items.map(e=>e.weight))];
  const value=values.length===1?values[0]:60;
  $("bulkWeight").value=value;
  $("bulkWeightLabel").textContent=values.length===1?frequencyOutput(value):"혼합";
  $("bulkHint").textContent=values.length===1
   ?"슬라이더를 놓으면 선택한 모든 항목에 같은 빈도가 적용됩니다."
   :"현재 선택 항목의 빈도가 서로 다릅니다. 슬라이더를 움직이면 모두 같은 값으로 맞춥니다.";
 }
}

let db=[],settings={...defaults},type="single",editId=null,selectedIds=new Set(),lastSelectedId=null,students=[],excluded=new Set(),session=null,advanceTimer=null,noticeTimer=null,audio=null,lastRaw=null,storageBlocked=false;

function notify(message){$("notice").textContent=message;$("notice").classList.remove("hidden");clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$("notice").classList.add("hidden"),5000)}
function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function validateEntry(e){
 if(!["single","word"].includes(e.type))throw Error("데이터 종류를 확인해 주세요.");
 if(!e.text||!Array.from(e.text).every(c=>/^\p{Script=Han}$/u.test(c)))throw Error("한자만 입력해 주세요.");
 if(e.type==="single"&&Array.from(e.text).length!==1)throw Error("단일 한자는 저장할 때 한 글자여야 합니다.");
 if(e.type==="word"&&Array.from(e.text).length<2)throw Error("한자어는 두 글자 이상 입력해 주세요.");
 if(!String(e.reading).trim()||!String(e.meaning).trim())throw Error("훈/뜻과 음/읽기를 모두 입력해 주세요.");
 if(!Number.isFinite(e.weight)||e.weight<0||e.weight>100)throw Error("출제 빈도를 확인해 주세요.");e.enabled=e.weight>0;
 return e;
}
function validateSettings(s){
 if(!["single","word","mixed"].includes(s.target)||!["forward","reverse","both"].includes(s.direction)||!["choice","manual"].includes(s.mode)||!Number.isInteger(s.perStudent)||s.perStudent<1||s.perStudent>50||!Number.isInteger(s.choices)||s.choices<2||s.choices>6)throw Error("문제 설정을 확인해 주세요.");
 return s;
}
function load(){
 try{
  lastRaw=localStorage.getItem(KEY);
  if(lastRaw){const d=JSON.parse(lastRaw);if(d.version!==1||!Array.isArray(d.entries))throw Error("저장 형식 오류");db=d.entries.map(x=>validateEntry({...x,weight:x.enabled===false?0:Number(x.weight??60)}));settings=validateSettings({...defaults,...d.settings})}
  else db=[];
 }catch{storageBlocked=true;db=[];settings={...defaults};$("saveStatus").textContent="저장 데이터 확인 필요 · 덮어쓰기 중지";notify("한자 데이터를 읽지 못했습니다. 기존 저장 데이터는 덮어쓰지 않습니다.")}
 for(const k of Object.keys(defaults))$(k).value=settings[k];
}
function save(){
 if(storageBlocked){notify("저장 데이터 오류 또는 다른 탭 변경으로 저장이 중지되었습니다. 새로고침 후 확인해 주세요.");return false}
 try{if(localStorage.getItem(KEY)!==lastRaw){storageBlocked=true;throw Error("다른 탭에서 데이터가 변경되었습니다. 새로고침해 주세요.")}const raw=JSON.stringify({version:1,entries:db,settings});localStorage.setItem(KEY,raw);if(localStorage.getItem(KEY)!==raw)throw Error("저장 확인 실패");lastRaw=raw;$("saveStatus").textContent="이 브라우저에 저장됨";return true}catch(e){$("saveStatus").textContent="저장 실패 · 변경 내용 확인 필요";notify(e.message);return false}
}
function panel(name){$("dataPanel").classList.toggle("hidden",name!=="data");$("questionsPanel").classList.toggle("hidden",name!=="questions");document.querySelectorAll("[data-panel]").forEach(b=>b.classList.toggle("on",b.dataset.panel===name))}
function resetForm(){
 editId=null;
 selectedIds.clear();
 lastSelectedId=null;
 $("entryForm").reset();
 $("weight").value=60;
 updateWeightLabel();
 $("editTitle").textContent=type==="single"?"한자 등록":"한자어 등록";
 $("textLabel").textContent=type==="single"?"한자":"조합 한자";
 $("meaningLabel").textContent=type==="single"?"훈":"뜻";
 $("readingLabel").textContent=type==="single"?"음":"읽기";
 syncEditorMode();
 renderDb();
}
function editEntry(e){
 type=e.type;
 document.querySelectorAll("[data-type]").forEach(x=>x.classList.toggle("on",x.dataset.type===type));
 selectedIds.clear();
 selectedIds.add(e.id);
 lastSelectedId=e.id;
 editId=e.id;
 panel("data");
 $("editTitle").textContent="항목 상세 설정";
 $("textLabel").textContent=type==="single"?"한자":"조합 한자";
 $("meaningLabel").textContent=type==="single"?"훈":"뜻";
 $("readingLabel").textContent=type==="single"?"음":"읽기";
 $("hanzi").value=e.text;
 $("meaning").value=e.meaning;
 $("reading").value=e.reading;
 $("weight").value=e.weight;
 updateWeightLabel();
 syncEditorMode();
 renderDb();
}
function restoreSingleSelection(){
 if(selectedIds.size!==1)return false;
 const only=db.find(e=>selectedIds.has(e.id));
 if(!only)return false;
 editId=only.id;
 $("editTitle").textContent="항목 상세 설정";
 $("textLabel").textContent=only.type==="single"?"한자":"조합 한자";
 $("meaningLabel").textContent=only.type==="single"?"훈":"뜻";
 $("readingLabel").textContent=only.type==="single"?"음":"읽기";
 $("hanzi").value=only.text;
 $("meaning").value=only.meaning;
 $("reading").value=only.reading;
 $("weight").value=only.weight;
 updateWeightLabel();
 syncEditorMode();
 return true;
}
function handleCardClick(ev,e){
 if(ev.shiftKey){
  if(selectedIds.has(e.id)){
   selectedIds.delete(e.id);
  }else{
   selectedIds.add(e.id);
  }
  lastSelectedId=e.id;
  editId=null;
  if(selectedIds.size===1)restoreSingleSelection();
  else if(selectedIds.size===0){
   $("entryForm").reset();
   $("weight").value=60;
   updateWeightLabel();
   $("editTitle").textContent=type==="single"?"한자 등록":"한자어 등록";
   syncEditorMode();
  }else{
   syncEditorMode();
  }
  renderDb();
  return;
 }
 editEntry(e);
}
function deleteEntries(ids){
 const doomed=new Set(ids);
 if(!doomed.size)return;
 const beforeDb=db;db=db.filter(x=>!doomed.has(x.id));
 if(editId&&doomed.has(editId))editId=null;
 for(const id of doomed)selectedIds.delete(id);
 if(!save()){db=beforeDb;renderDb();return}
 if(selectedIds.size===1)restoreSingleSelection();
 else if(selectedIds.size>1)syncEditorMode();
 else{
  $("entryForm").reset();
  $("weight").value=60;
  updateWeightLabel();
  $("editTitle").textContent=type==="single"?"한자 등록":"한자어 등록";
  syncEditorMode();
 }
 renderDb();
}
function renderDb(){
 const entries=db.filter(e=>e.type===type);
 $("dbTitle").textContent=type==="single"?"단일 한자":"한자어";
 $("dbSummary").textContent=`${entries.length}개 등록 · ${entries.filter(e=>e.enabled).length}개 사용`;
 $("emptyDb").classList.toggle("hidden",entries.length>0);
 $("entries").replaceChildren();

 for(const e of entries){
  const card=document.createElement("article");
  card.className="entry-card"+(e.enabled?"":" off")+(selectedIds.has(e.id)?" selected":"");
  card.setAttribute("aria-selected",String(selectedIds.has(e.id)));
  card.style.setProperty("--freq-brightness",String(.5+Math.max(0,Math.min(100,e.weight))/200));
  card.onclick=ev=>handleCardClick(ev,e);

  const h=document.createElement("h2");
  h.textContent=e.text;
  const info=document.createElement("p");
  info.textContent=e.type==="single"?`${e.meaning} ${e.reading}`:`${e.reading} · ${e.meaning}`;
  const meta=document.createElement("small");
  meta.textContent=`${e.enabled?"사용":"제외"} · 출제 ${frequencyLabel(e.weight)}`;

  const actions=document.createElement("div");
  actions.className="actions";
  const del=document.createElement("button");
  del.type="button";
  del.textContent="삭제";
  del.className="delete";
  del.onclick=ev=>{
   ev.stopPropagation();
   if(!confirm(`${e.text} 항목을 삭제할까요?`))return;
   deleteEntries([e.id]);
  };
  actions.append(del);
  card.append(h,info,meta,actions);
  $("entries").append(card);
 }
 syncEditorMode();
}
function refreshRoster(){try{students=[...readStudents()];$("start").disabled=false;renderStudents()}catch(e){students=[];$("start").disabled=true;renderStudents();notify(`학생명단을 읽을 수 없습니다. ${e.message}`)}}
function renderStudents(){
 $("studentCards").replaceChildren();$("rosterSummary").textContent=`참가 ${students.filter(s=>!excluded.has(s.id)).length} / ${students.length}명`;
 if(!students.length){const p=document.createElement("p");p.textContent="자리배치 매니저에서 학생명단을 먼저 저장해 주세요.";$("studentCards").append(p);return}
 for(const s of students){const b=document.createElement("button");b.className="hanja-student";b.setAttribute("aria-pressed",String(!excluded.has(s.id)));const sprite=document.createElement("div");sprite.className="hanja-sprite";sprite.style.backgroundImage=`url("${s.sprite}")`;const name=document.createElement("span");name.textContent=s.name;const st=document.createElement("small");st.textContent=excluded.has(s.id)?"제외":"참가";b.append(sprite,name,st);b.onclick=()=>{excluded.has(s.id)?excluded.delete(s.id):excluded.add(s.id);renderStudents()};$("studentCards").append(b)}
}
function readSettings(){return validateSettings({target:$("target").value,direction:$("direction").value,mode:$("mode").value,perStudent:Number($("perStudent").value),choices:Number($("choices").value)})}
function answerFor(e,d){if(d==="reverse")return e.text;return e.type==="single"?`${e.meaning} ${e.reading}`:e.reading}
function promptFor(e,d){if(d==="forward")return e.text;return e.type==="single"?`${e.meaning} ${e.reading}`:e.reading}
function questionLabel(e,d){if(e.type==="single")return d==="forward"?"단일 한자 · 한자 → 훈음":"단일 한자 · 훈음 → 한자";return d==="forward"?"한자어 · 한자어 → 읽기":"한자어 · 읽기 → 한자어"}
function instructionFor(e,d){if(e.type==="single")return d==="forward"?"이 한자의 올바른 훈음을 고르세요.":"이 훈음에 해당하는 한자를 고르세요.";return d==="forward"?"이 한자어의 올바른 읽기를 고르세요.":"이 읽기에 해당하는 한자어를 고르세요."}
function revealAnswerText(q){if(q.entry.type!=="word")return q.answer;return `${q.answer} — ${q.entry.meaning}`}
function showWordMeaning(button,q){if(!q||q.entry.type!=="word")return;if(button)button.classList.add("correct-choice");$("meaningOverlayText").textContent=q.entry.meaning;$("meaningOverlay").classList.remove("hidden")}
function eligible(data,s){return data.filter(e=>e.enabled&&(s.target==="mixed"||e.type===s.target))}
function makeQuestion(data,s,lastId=null){
 let pool=eligible(data,s);if(!pool.length)throw Error("출제할 활성 한자/한자어가 없습니다.");if(pool.some(e=>e.id!==lastId))pool=pool.filter(e=>e.id!==lastId);
 let n=Math.random()*pool.reduce((sum,e)=>sum+e.weight,0),entry=pool[pool.length-1];for(const e of pool){n-=e.weight;if(n<0){entry=e;break}}
 const direction=s.direction==="both"?(Math.random()<.5?"forward":"reverse"):s.direction,answer=answerFor(entry,direction);
 const distractors=[...new Set(data.filter(e=>e.enabled&&e.type===entry.type&&e.id!==entry.id).map(e=>answerFor(e,direction)))].filter(a=>a!==answer);
 const options=shuffle([answer,...shuffle(distractors).slice(0,s.choices-1)]);
 if(s.mode==="choice"&&options.length<2)throw Error("같은 종류의 서로 다른 답이 2개 이상 필요합니다.");
 return {id:entry.id,entry,direction,prompt:promptFor(entry,direction),answer,options};
}
function checkReady(data,s){validateSettings(s);const pool=eligible(data,s);if(!pool.length)throw Error("활성 한자/한자어를 등록해 주세요.");if(s.mode==="choice"){const types=[...new Set(pool.map(e=>e.type))];for(const t of types)if(data.filter(e=>e.enabled&&e.type===t).length<2)throw Error("객관식은 같은 종류의 활성 항목이 2개 이상 필요합니다.")}}
function sound(success){try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});const t=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type="sine";o.frequency.setValueAtTime(success?660:180,t);o.frequency.exponentialRampToValueAtTime(success?990:110,t+.16);g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.26)}catch{}}
function fanfare(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});const start=audio.currentTime+.03;const notes=[[523.25,0,.20],[659.25,.16,.22],[783.99,.32,.24],[1046.5,.50,.55],[783.99,.50,.55],[659.25,.50,.55]];for(const [freq,offset,dur] of notes){const o=audio.createOscillator(),g=audio.createGain();o.type="triangle";o.frequency.setValueAtTime(freq,start+offset);g.gain.setValueAtTime(.0001,start+offset);g.gain.exponentialRampToValueAtTime(.10,start+offset+.025);g.gain.exponentialRampToValueAtTime(.0001,start+offset+dur);o.connect(g);g.connect(audio.destination);o.start(start+offset);o.stop(start+offset+dur+.03)}}catch{}}

function applause(){
 try{
  audio??=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume().catch(()=>{});
  const start=audio.currentTime+.10;
  const length=Math.max(1,Math.floor(audio.sampleRate*.075));
  const buffer=audio.createBuffer(1,length,audio.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<length;i++){
   const env=Math.pow(1-i/length,2.4);
   data[i]=(Math.random()*2-1)*env;
  }
  for(let i=0;i<46;i++){
   const src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
   src.buffer=buffer;
   filter.type="bandpass";
   filter.frequency.value=1100+Math.random()*1700;
   filter.Q.value=.65+Math.random()*.7;
   const when=start+i*.075+Math.random()*.09;
   gain.gain.setValueAtTime(.0001,when);
   gain.gain.exponentialRampToValueAtTime(.025+Math.random()*.035,when+.006);
   gain.gain.exponentialRampToValueAtTime(.0001,when+.075);
   src.connect(filter);filter.connect(gain);gain.connect(audio.destination);
   src.start(when);src.stop(when+.09);
  }
 }catch{}
}
function studentChangeChime(){
 try{
  audio??=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume().catch(()=>{});
  const start=audio.currentTime+.02;
  const bells=[[880,0],[659.25,.24]];
  for(const [freq,offset] of bells){
   for(const [mul,level] of [[1,.11],[2,.032]]){
    const o=audio.createOscillator(),g=audio.createGain();
    o.type="sine";o.frequency.setValueAtTime(freq*mul,start+offset);
    g.gain.setValueAtTime(.0001,start+offset);
    g.gain.exponentialRampToValueAtTime(level,start+offset+.012);
    g.gain.exponentialRampToValueAtTime(.0001,start+offset+.62);
    o.connect(g);g.connect(audio.destination);
    o.start(start+offset);o.stop(start+offset+.65);
   }
  }
 }catch{}
}
let particleInterval=null,particleStopTimer=null,particleCleanupTimer=null;
function clearCelebration(){
 clearInterval(particleInterval);particleInterval=null;
 clearTimeout(particleStopTimer);particleStopTimer=null;
 clearTimeout(particleCleanupTimer);particleCleanupTimer=null;
 const layer=$("celebrationParticles");if(layer)layer.replaceChildren();
}
function spawnCelebrationBurst(layer,count=14){
 const colors=["#ffcf33","#ff6b6b","#4dabf7","#69db7c","#b197fc","#ffa94d"];
 for(let i=0;i<count;i++){
  const p=document.createElement("i");p.className="celebration-particle";
  p.style.setProperty("--x",`${3+Math.random()*94}%`);
  p.style.setProperty("--dx",`${-190+Math.random()*380}px`);
  p.style.setProperty("--rot",`${-540+Math.random()*1080}deg`);
  p.style.setProperty("--delay",`${Math.random()*.12}s`);
  p.style.setProperty("--dur",`${2.2+Math.random()*1.5}s`);
  p.style.setProperty("--size",`${10+Math.random()*16}px`);
  p.style.backgroundColor=colors[Math.floor(Math.random()*colors.length)];
  layer.append(p);
  setTimeout(()=>p.remove(),3900);
 }
}
function launchCelebration(){
 const layer=$("celebrationParticles");if(!layer)return;
 clearCelebration();
 if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
 spawnCelebrationBurst(layer,24);
 particleInterval=setInterval(()=>spawnCelebrationBurst(layer,14),280);
 particleStopTimer=setTimeout(()=>{clearInterval(particleInterval);particleInterval=null;particleStopTimer=null},5000);
 particleCleanupTimer=setTimeout(()=>{layer.replaceChildren();particleCleanupTimer=null},8900);
}

function fitHanjaRoom(){
 const shell=$("hanjaRoomShell"),viewport=document.querySelector(".game-viewport");
 if(!shell||!viewport||$("game").classList.contains("hidden"))return;
 const roomW=1980,roomH=1140;
 const availableW=Math.max(320,viewport.clientWidth-24);
 const availableH=Math.max(420,viewport.clientHeight-24);
 const scale=Math.min(1,availableW/roomW,availableH/roomH);
 document.documentElement.style.setProperty("--hanja-room-scale",scale);
 shell.style.width=`${roomW*scale}px`;
 shell.style.height=`${roomH*scale}px`;
}
function startGame(){
 try{settings=readSettings();checkReady(db,settings);if(!save())throw Error("설정을 저장하지 못했습니다.");refreshRoster();const participants=students.filter(s=>!excluded.has(s.id));if(!participants.length)throw Error("이번 수업에 참가할 학생을 선택해 주세요.");session={students:shuffle(participants),settings:{...settings},db:db.map(e=>({...e})),studentIndex:0,solved:0,lastId:null,locked:false,revealed:false,q:null};$("manager").classList.add("hidden");$("game").classList.remove("hidden");fitHanjaRoom();nextQuestion()}catch(e){notify(e.message)}
}
function nextQuestion(){
 if(!session)return;if(session.studentIndex>=session.students.length){$("correctOverlay").classList.add("hidden");$("meaningOverlay").classList.add("hidden");$("meaningOverlayText").textContent="";$("gameSprite").classList.remove("jump");$("progress").textContent=`수업 완료 · ${session.students.length}명 × ${session.settings.perStudent}문제`;$("questionCounter").textContent="완료";$("questionType").textContent="모두 마쳤어요";$("questionPrompt").textContent="수고했어요!";$("questionInstruction").textContent="";$("options").replaceChildren();$("manual").classList.add("hidden");$("feedback").textContent="모든 학생이 문제를 풀었습니다.";$("currentStudent").classList.add("hidden");document.querySelector(".question-modal").classList.add("complete");session.locked=true;fanfare();applause();launchCelebration();return}
 session.q=makeQuestion(session.db,session.settings,session.lastId);session.lastId=session.q.id;session.locked=false;session.revealed=false;renderQuestion();
}
function renderQuestion(){
 const s=session.students[session.studentIndex],q=session.q;document.querySelector(".question-modal").classList.remove("complete");$("questionCounter").textContent=`문제 ${session.solved+1} / ${session.settings.perStudent}`;$("progress").textContent=`학생 ${session.studentIndex+1}/${session.students.length} · ${s.name} 문제 ${session.solved+1}/${session.settings.perStudent}`;$("questionType").textContent=questionLabel(q.entry,q.direction);$("questionPrompt").textContent=q.prompt;$("questionInstruction").textContent=instructionFor(q.entry,q.direction);$("feedback").textContent="";$("currentStudent").classList.remove("hidden");$("studentName").textContent=s.name;$("gameSprite").style.backgroundImage=`url("${s.sprite}")`;$("gameSprite").classList.remove("jump");$("correctOverlay").classList.add("hidden");$("meaningOverlay").classList.add("hidden");$("meaningOverlayText").textContent="";$("options").replaceChildren();$("manual").classList.toggle("hidden",session.settings.mode!=="manual");$("answer").classList.add("hidden");$("judgement").classList.add("hidden");$("reveal").classList.remove("hidden");$("reveal").disabled=false;$("correct").disabled=false;$("wrong").disabled=false;
 if(session.settings.mode==="choice")q.options.forEach((option,index)=>{const b=document.createElement("button");const num=document.createElement("span"),txt=document.createElement("span");num.className="choice-number";num.textContent=String(index+1);txt.className="choice-text";txt.textContent=option;b.append(num,txt);if(Array.from(option).length>6)b.classList.add("compact-choice");b.onclick=()=>judge(option===q.answer,b);$("options").append(b)});$("options").classList.toggle("hidden",session.settings.mode!=="choice")
}
function advanceAfterCorrect(){
 if(!session||!session.locked)return;
 clearTimeout(advanceTimer);advanceTimer=null;
 $("meaningOverlay").classList.add("hidden");
 $("meaningOverlayText").textContent="";
 session.solved++;
 let changedStudent=false;
 if(session.solved>=session.settings.perStudent){
  session.studentIndex++;
  session.solved=0;
  changedStudent=session.studentIndex<session.students.length;
 }
 if(changedStudent)studentChangeChime();
 nextQuestion();
}
function judge(correct,button=null){
 if(!session||session.locked||(session.settings.mode==="manual"&&!session.revealed))return;
 sound(correct);
 if(!correct){$("feedback").textContent="✕ 다시 도전해 보세요.";return}
 session.locked=true;
 const q=session.q;
 if(q.entry.type==="word"){
  $("feedback").textContent="O 정답!";
  showWordMeaning(button,q);
 }else{
  $("feedback").textContent="O 정답!";
 }
 $("gameSprite").classList.add("jump");
 $("correctOverlay").classList.remove("hidden");
 document.querySelectorAll("#options button,#judgement button").forEach(b=>b.disabled=true);
 const wait=q.entry.type==="word"?2200:850;
 advanceTimer=setTimeout(advanceAfterCorrect,wait);
}
function parseFrequency(v,fallback=60){const s=String(v??"").trim();const map={"사용 안 함":0,"사용안함":0,"제외":0,"매우 낮음":20,"낮음":40,"보통":60,"높음":80,"매우 높음":100};if(s in map)return map[s];const n=Number(s);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):fallback}
function normalizeUse(v){const s=String(v??"사용").trim().toLowerCase();return !["제외","미사용","n","no","0","false","off"].includes(s)}
function importWorkbook(wb){
 const rows=[];
 function readSheet(name,t){
  const sheet=wb.Sheets[name];if(!sheet)return;
  XLSX.utils.sheet_to_json(sheet,{defval:""}).forEach((r,i)=>{
   const text=String(t==="single"?(r["한자"]??r["text"]??""):(r["한자어"]??r["text"]??"")).trim();if(!text)return;
   const entry={id:`${t}_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,type:t,text,
    meaning:String(t==="single"?(r["훈"]??r["훈/뜻"]??r["meaning"]??""):(r["뜻"]??r["meaning"]??"")).trim(),
    reading:String(t==="single"?(r["음"]??r["음/읽기"]??r["reading"]??""):(r["읽기"]??r["reading"]??"")).trim(),
    enabled:true,weight:(()=>{const use=r["사용"]??r["사용/제외"]??r["enabled"];if(use!==undefined&&use!==""&&!normalizeUse(use))return 0;return parseFrequency(r["출제빈도"]??r["출제비중"]??r["weight"],60)})()};
   validateEntry(entry);rows.push(entry);
  })
 }
 readSheet("단일 한자","single");readSheet("한자어","word");if(!rows.length)throw Error("「단일 한자」 또는 「한자어」 시트에서 읽을 데이터가 없습니다.");return rows;
}
$("weight").oninput=updateWeightLabel;
$("bulkWeight").oninput=()=>{
 $("bulkWeightLabel").textContent=frequencyOutput($("bulkWeight").value);
 const n=Number($("bulkWeight").value);
 document.querySelectorAll(".entry-card.selected").forEach(card=>card.style.setProperty("--freq-brightness",String(.5+n/200)));
};
$("bulkWeight").onchange=()=>{
 if(selectedIds.size<2)return;
 const n=Number($("bulkWeight").value);
 const before=db;db=db.map(e=>selectedIds.has(e.id)?{...e,weight:n,enabled:n>0}:e);
 if(!save())db=before;
 renderDb();
};
$("bulkDelete").onclick=()=>{
 if(selectedIds.size<2)return;
 const items=selectedEntries();
 const names=items.slice(0,5).map(e=>e.text).join(", ")+(items.length>5?" 외":"");
 if(!confirm(`선택한 ${items.length}개 항목을 삭제할까요?\n${names}`))return;
 deleteEntries([...selectedIds]);
};
$("clearSelection").onclick=resetForm;
$("entryForm").onsubmit=e=>{e.preventDefault();if(e.isComposing)return;try{const entry=validateEntry({id:editId||crypto.randomUUID(),type,text:$("hanzi").value.trim(),meaning:$("meaning").value.trim(),reading:$("reading").value.trim(),weight:Number($("weight").value),enabled:Number($("weight").value)>0});if(db.some(x=>x.text===entry.text&&x.type===entry.type&&x.id!==entry.id))throw Error("이미 등록된 항목입니다.");const before=db;db=editId?db.map(x=>x.id===editId?entry:x):[...db,entry];if(!save()){db=before;return}resetForm();renderDb()}catch(err){notify(err.message)}};
$("entryForm").addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.isComposing||e.keyCode===229))e.preventDefault()});
$("settingsForm").onchange=()=>{try{settings=readSettings();save()}catch(e){notify(e.message)}};$("settingsForm").onsubmit=e=>e.preventDefault();
document.querySelectorAll("[data-type]").forEach(b=>b.onclick=()=>{type=b.dataset.type;document.querySelectorAll("[data-type]").forEach(x=>x.classList.toggle("on",x===b));resetForm();panel("data")});
document.querySelectorAll("[data-panel]").forEach(b=>b.onclick=()=>panel(b.dataset.panel));
$("newEntry").onclick=()=>{resetForm();panel("data");$("hanzi").focus()};$("cancelEdit").onclick=resetForm;$("refreshRoster").onclick=refreshRoster;$("start").onclick=startGame;
$("reveal").onclick=()=>{if(!session||session.locked)return;session.revealed=true;$("answer").textContent="정답: "+revealAnswerText(session.q);$("answer").classList.remove("hidden");$("judgement").classList.remove("hidden");$("reveal").classList.add("hidden")};$("correct").onclick=()=>judge(true);$("wrong").onclick=()=>judge(false);$("meaningOverlay").onclick=()=>{if(!session||!session.locked||$("meaningOverlay").classList.contains("hidden")||session.q?.entry.type!=="word")return;advanceAfterCorrect()};
$("endGame").onclick=()=>{clearTimeout(advanceTimer);clearCelebration();$("correctOverlay").classList.add("hidden");$("meaningOverlay").classList.add("hidden");$("meaningOverlayText").textContent="";document.querySelector(".question-modal").classList.remove("complete");session=null;$("game").classList.add("hidden");$("manager").classList.remove("hidden");refreshRoster()};
$("importXlsx").onclick=()=>$("xlsxFile").click();$("xlsxFile").onchange=async ev=>{const file=ev.target.files[0];if(!file)return;try{if(!window.XLSX)throw Error("XLSX 기능을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");const wb=XLSX.read(await file.arrayBuffer());const rows=importWorkbook(wb);const replace=confirm(`총 ${rows.length}개를 읽었습니다.\n\n확인 = 현재 한자 데이터를 모두 지우고 전체 교체\n취소 = 기존 데이터에 병합`);if(replace)db=rows;else{const keys=new Set(db.map(e=>`${e.type}|${e.text}`));let added=0;for(const r of rows){const k=`${r.type}|${r.text}`;if(!keys.has(k)){db.push(r);keys.add(k);added++}}notify(`${added}개 항목을 병합했습니다. 중복 한자는 유지했습니다.`)}if(!save())throw Error("저장에 실패했습니다.");renderDb()}catch(e){notify(e.message)}finally{ev.target.value=""}};
function makeExportSheet(rows,headers,widths){
 const sheet=XLSX.utils.aoa_to_sheet([headers]);
 if(rows.length)XLSX.utils.sheet_add_json(sheet,rows,{header:headers,skipHeader:true,origin:"A2"});
 sheet["!cols"]=widths.map(w=>({wch:w}));
 return sheet;
}
$("exportXlsx").onclick=()=>{try{
 if(!window.XLSX)throw Error("XLSX 기능을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
 const wb=XLSX.utils.book_new();
 const singleHeaders=["한자","훈","음","사용","출제빈도","출제비중"];
 const wordHeaders=["한자어","읽기","뜻","사용","출제빈도","출제비중"];
 const single=db.filter(e=>e.type==="single").map(e=>({"한자":e.text,"훈":e.meaning,"음":e.reading,"사용":e.enabled?"사용":"제외","출제빈도":frequencyLabel(e.weight),"출제비중":e.weight}));
 const words=db.filter(e=>e.type==="word").map(e=>({"한자어":e.text,"읽기":e.reading,"뜻":e.meaning,"사용":e.enabled?"사용":"제외","출제빈도":frequencyLabel(e.weight),"출제비중":e.weight}));
 XLSX.utils.book_append_sheet(wb,makeExportSheet(single,singleHeaders,[12,18,18,12,16,12]),"단일 한자");
 XLSX.utils.book_append_sheet(wb,makeExportSheet(words,wordHeaders,[16,20,28,12,16,12]),"한자어");
 XLSX.writeFile(wb,"한자_학습_데이터.xlsx");
}catch(e){notify(e.message)}};
load();resetForm();renderDb();refreshRoster();
window.addEventListener("storage",e=>{if(e.key===STUDENT_STORAGE_KEY||e.key===null){if(!session)refreshRoster();else notify("학생명단이 변경되었습니다. 현재 수업은 시작할 때의 명단으로 계속합니다.")}if(e.key===KEY||e.key===null){storageBlocked=true;$("saveStatus").textContent="다른 탭에서 변경됨 · 새로고침 필요";notify("다른 탭의 한자 데이터가 변경되었습니다. 새로고침해 주세요.")}});
window.addEventListener("resize",fitHanjaRoom);
