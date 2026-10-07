"use strict";

const STORAGE_PREFIX="teacher-tools.seating";
const STORAGE_KEY=`${STORAGE_PREFIX}.state.v1`;
const LEGACY_STORAGE_KEYS=["classroom-seating-integrated-v6_7","classroom-seating-integrated-v6_4","classroom-seating-integrated-v6","classroom-seating-integrated-v5","classroom-seating-integrated-v4","classroom-seating-integrated-v3"];
const BACKUP_FORMAT=`${STORAGE_PREFIX}.backup`;
const BACKUP_FORMAT_VERSION=1;
const APP_VERSION="6.24-step1b";
const CURRENT_STATE_VERSION=9;
const DEFAULT_NAMES=["김민수","이서연","박준호","최유진","정하늘","윤지호","한서아","오도윤","강채원","임현우"];
const CHARACTERS=["boy1","boy2","girl","trav","prin"];
const HAIR_COLORS=["brown","black"];
const OUTFIT_COLORS=["green","blue","red","yellow","purple","orange"];
const STUDENT_GLASSES=[
  {id:"none",label:"안경 없음",color:null},
  {id:"red",label:"빨강 원형",color:null},
  {id:"black",label:"검정 원형",color:[45,48,54]},
  {id:"brown",label:"갈색 원형",color:[112,67,42]},
  {id:"navy",label:"남색 원형",color:[45,70,110]},
  {id:"pink",label:"분홍 원형",color:[196,79,112]},
  {id:"gray",label:"회색 원형",color:[105,112,122]}
];
const STUDENT_CHARACTER_LABELS={boy1:"남학생 1",boy2:"남학생 2",girl:"여학생 1",trav:"여학생 2",prin:"여학생 3"};
const STUDENT_HAIR_LABELS={brown:"갈색",black:"검정"};
const STUDENT_OUTFIT_LABELS={green:"초록",blue:"파랑",red:"빨강",yellow:"노랑",purple:"보라",orange:"주황"};
const studentGlassesDataUrls=new Map();

function assetSrc(path){
  return (window.__EMBEDDED_ASSETS&&(window.__EMBEDDED_ASSETS[path]||window.__EMBEDDED_ASSETS[path.replace("../shared/assets/","assets/")]))||path;
}

const DESK_SRC=assetSrc("../shared/assets/playback/desk.png");
const CHAIR_SRC=assetSrc("../shared/assets/playback/chair.png");
const USABLE_TYPES=new Set(["seat","male","female"]);
const BALANCE_LABEL={none:"미지정",A:"빼어남",B:"우수함",C:"아름다움"};
const GROUP_COLORS=["#0f766e","#2563eb","#7c3aed","#ea580c","#16a34a","#db2777","#0891b2","#a16207","#475569","#dc2626","#4f46e5","#65a30d"];
const $=id=>document.getElementById(id);

function deepCopy(value){return JSON.parse(JSON.stringify(value))}
function nowId(prefix){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}
let idCounter=1;
function nextStudentId(){return `s${Date.now().toString(36)}${String(idCounter++).padStart(3,"0")}`}
function seatId(row,col){return `seat-r${row}-c${col}`}
function freshCells(rows,cols){return Array.from({length:rows*cols},(_,i)=>({id:seatId(Math.floor(i/cols),i%cols),row:Math.floor(i/cols),col:i%cols,type:"seat"}))}
function defaultPairedCells(rows=4,cols=8){const cells=freshCells(rows,cols);cells.forEach(c=>{if(cols>=6&&(c.col===2||c.col===5))c.type="aisle"});return cells}
function isUsable(cell){return Boolean(cell&&USABLE_TYPES.has(cell.type))}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c])}
function formatDate(iso){try{return new Intl.DateTimeFormat("ko-KR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso))}catch{return String(iso||"")}}
function shuffled(items){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function groupColor(index,group=null){return group?.color||GROUP_COLORS[index%GROUP_COLORS.length]}

function studentSheetForIndex(index){
  const character=CHARACTERS[index%CHARACTERS.length];
  const hair=HAIR_COLORS[Math.floor(index/CHARACTERS.length)%HAIR_COLORS.length];
  const outfit=OUTFIT_COLORS[Math.floor(index/(CHARACTERS.length*HAIR_COLORS.length))%OUTFIT_COLORS.length];
  return assetSrc(`../shared/assets/students/${character}_${hair}_${outfit}.png`);
}
function stableStudentHash(student,index=0){
  const text=`${student.id||""}|${student.name||""}|${index}`;
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function defaultStudentVisual(student,index=0){
  const h=stableStudentHash(student,index);
  const pool=student.gender==="male"?["boy1","boy2"]:student.gender==="female"?["girl","trav","prin"]:CHARACTERS;
  return{character:pool[h%pool.length],hair:HAIR_COLORS[(h>>>4)%HAIR_COLORS.length],outfit:OUTFIT_COLORS[(h>>>9)%OUTFIT_COLORS.length],glasses:"none"};
}
function normalizedStudentVisual(student,index=0){
  const fallback=defaultStudentVisual(student,index),v=student.visual||{};
  return{
    character:CHARACTERS.includes(v.character)?v.character:fallback.character,
    hair:HAIR_COLORS.includes(v.hair)?v.hair:fallback.hair,
    outfit:OUTFIT_COLORS.includes(v.outfit)?v.outfit:fallback.outfit,
    glasses:STUDENT_GLASSES.some(g=>g.id===v.glasses)?v.glasses:"none"
  };
}
function studentVisualFor(student,index){
  const v=normalizedStudentVisual(student,index);
  return assetSrc(`../shared/assets/students/${v.character}_${v.hair}_${v.outfit}.png`);
}
function studentGlassesSrc(id){
  if(!id||id==="none")return null;
  if(id==="red")return assetSrc("../shared/assets/teacher/glasses_02.png");
  return studentGlassesDataUrls.get(id)||null;
}
function ensureStudentGlassesAssets(){
  if(studentGlassesDataUrls.size)return;
  const img=new Image();
  img.onload=()=>{
    STUDENT_GLASSES.filter(g=>g.color).forEach(item=>{
      const canvas=document.createElement("canvas");canvas.width=96;canvas.height=128;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0);
      const image=ctx.getImageData(0,0,96,128),d=image.data,[tr,tg,tb]=item.color;
      for(let i=0;i<d.length;i+=4){
        if(d[i+3]===0)continue;
        const r=d[i],g=d[i+1],b=d[i+2];
        const isRedFrame=r>g*1.28&&r>b*1.28&&r-g>24&&r-b>24;
        if(!isRedFrame)continue;
        const lum=(r+g+b)/765,f=.70+lum*.38;
        d[i]=Math.min(255,tr*f);d[i+1]=Math.min(255,tg*f);d[i+2]=Math.min(255,tb*f);
      }
      ctx.putImageData(image,0,0);studentGlassesDataUrls.set(item.id,canvas.toDataURL("image/png"));
    });
    refreshStudentPreviewLayers();
  };
  img.src=assetSrc("../shared/assets/teacher/glasses_02.png");
}
function refreshStudentPreviewLayers(){
  document.querySelectorAll("[data-student-glasses]").forEach(el=>{
    const src=studentGlassesSrc(el.dataset.studentGlasses);
    el.style.backgroundImage=src?`url("${src}")`:"none";
  });
}
function studentPreviewMarkup(student,index){
  const v=normalizedStudentVisual(student,index),sheet=studentVisualFor(student,index);
  return `<span class="student-mini-sprite" aria-hidden="true"><span class="student-mini-base" style="background-image:url('${sheet}')"></span><span class="student-mini-glasses" data-student-glasses="${v.glasses}"></span></span>`;
}
function avatarItems(prefix,count,label){return Array.from({length:count},(_,i)=>({label:`${label} ${i+1}`,src:assetSrc(`../shared/assets/teacher/${prefix}_${String(i+1).padStart(2,"0")}.png`)}))}
function hairItems(prefix,backs){const labels=["갈색","금발","검정"];return Array.from({length:6},(_,i)=>({label:`헤어 ${i+1}`,colors:[0,1,2].map(color=>({label:labels[color],front:assetSrc(`../shared/assets/teacher/${prefix}_hair_${String(i+1).padStart(2,"0")}_${color}_front.png`),back:backs.includes(i+1)?assetSrc(`../shared/assets/teacher/${prefix}_hair_${String(i+1).padStart(2,"0")}_${color}_back.png`):null}))}))}
const AVATAR_CFG={
  female:{skins:avatarItems("f_skin",4,"피부"),eyes:avatarItems("f_eyes",3,"눈"),hairs:hairItems("f",[1,2,3,5,6]),outfits:avatarItems("f_outfit",7,"여성 복장")},
  male:{skins:avatarItems("m_skin",4,"피부"),eyes:avatarItems("m_eyes",3,"눈"),hairs:hairItems("m",[2,3,4]),outfits:avatarItems("m_outfit",7,"남성 복장")},
  glasses:[{label:"없음",src:null},...avatarItems("glasses",10,"안경")],
  beards:[{label:"없음",src:null},...avatarItems("beard",8,"수염")]
};

function defaultState(){
  return{
    version:CURRENT_STATE_VERSION,
    className:"우리 반",
    students:DEFAULT_NAMES.map((name,index)=>{const s={id:nextStudentId(),name,gender:"none",balanceLevel:"none",apartFrom:[],fixedSeatId:null};s.visual=defaultStudentVisual(s,index);return s}),
    layout:{rows:4,cols:8,cells:defaultPairedCells(4,8)},
    groups:[],
    rules:{completeRandom:true,genderSeats:false,apartStudents:false,fixedSeats:false,groupBalance:false,backRowNoRepeat:false,recentGroupmatesAvoid:false},
    teacherAvatar:{gender:"female",skin:0,eyes:0,hair:0,hairColor:0,glasses:0,beard:0,outfit:2},
    assignments:[],
    history:[],
    ui:{dockCollapsed:false,studentStripCollapsed:false}
  };
}
function normalizeLayout(layout,base){
  const rows=Math.max(2,Math.min(12,Number(layout?.rows)||base.layout.rows));
  const cols=Math.max(2,Math.min(12,Number(layout?.cols)||base.layout.cols));
  const incoming=Array.isArray(layout?.cells)?layout.cells:[];
  const cells=freshCells(rows,cols);
  incoming.forEach((cell,i)=>{
    const row=Number.isInteger(cell?.row)?cell.row:Math.floor(i/cols);
    const col=Number.isInteger(cell?.col)?cell.col:i%cols;
    if(row<0||col<0||row>=rows||col>=cols)return;
    const at=row*cols+col;
    cells[at]={id:seatId(row,col),row,col,type:["seat","male","female","aisle","unused"].includes(cell?.type)?cell.type:"seat"};
  });
  return{rows,cols,cells};
}
function migrateState(saved){
  const sourceVersion=Number(saved?.version||1);
  assertSupportedStateVersion(sourceVersion);
  const base=defaultState();
  const state={...base,...(saved||{})};
  state.version=CURRENT_STATE_VERSION;
  state.className=String(saved?.className||base.className).slice(0,30)||"우리 반";
  state.layout=normalizeLayout(saved?.layout,base);
  const validSeatIds=new Set(state.layout.cells.filter(isUsable).map(c=>c.id));
  const rawStudents=Array.isArray(saved?.students)?saved.students:base.students;
  state.students=rawStudents.map((s,index)=>({
    id:s.id||nextStudentId(),
    name:String(s.name||"학생"),
    gender:["male","female"].includes(s.gender)?s.gender:"none",
    balanceLevel:["A","B","C"].includes(s.balanceLevel)?s.balanceLevel:"none",
    apartFrom:Array.isArray(s.apartFrom)?[...new Set(s.apartFrom)].slice(0,3):[],
    fixedSeatId:validSeatIds.has(s.fixedSeatId)?s.fixedSeatId:null,
    visual:normalizedStudentVisual(s,index)
  }));
  const ids=new Set(state.students.map(s=>s.id));
  state.students.forEach(s=>s.apartFrom=s.apartFrom.filter(id=>ids.has(id)&&id!==s.id).slice(0,3));
  state.rules={...base.rules,...(saved?.rules||{})};
  state.teacherAvatar={...base.teacherAvatar,...(saved?.teacherAvatar||{})};
  if(sourceVersion<=6 && Number(state.teacherAvatar.hairColor)===1)state.teacherAvatar.hairColor=2;
  state.assignments=(Array.isArray(saved?.assignments)?saved.assignments:[]).filter(a=>ids.has(a.studentId)&&validSeatIds.has(a.seatId)).map(a=>({studentId:a.studentId,seatId:a.seatId}));
  const usedGroupSeats=new Set();
  state.groups=(Array.isArray(saved?.groups)?saved.groups:[]).map((g,index)=>{
    const seatIds=(Array.isArray(g.seatIds)?g.seatIds:[]).filter(id=>validSeatIds.has(id)&&!usedGroupSeats.has(id));
    seatIds.forEach(id=>usedGroupSeats.add(id));
    return{id:g.id||nowId("group"),name:String(g.name||`${index+1}모둠`).slice(0,20),color:/^#[0-9a-fA-F]{6}$/.test(g.color||"")?g.color:GROUP_COLORS[index%GROUP_COLORS.length],seatIds};
  }).filter(g=>g.seatIds.length);
  state.ui={...base.ui,...(saved?.ui||{})};
  const rawHistory=Array.isArray(saved?.history)?saved.history:[];
  state.history=rawHistory.map((h,index)=>{
    const legacyCommon={id:h.id||`legacy-${index}-${h.createdAt||index}`,round:Number(h.round)||index+1,createdAt:h.createdAt||new Date().toISOString(),assignments:deepCopy(h.assignments)};
    const hasSnapshotData=hasHistorySnapshotData(h);
    if(hasSnapshotData)return{id:h.id,round:h.round,createdAt:h.createdAt,assignments:deepCopy(h.assignments),legacy:false,studentsSnapshot:deepCopy(h.studentsSnapshot),layoutSnapshot:deepCopy(h.layoutSnapshot),groupsSnapshot:deepCopy(h.groupsSnapshot),rulesSnapshot:deepCopy(h.rulesSnapshot),teacherAvatarSnapshot:(()=>{
      const avatar=deepCopy(h.teacherAvatarSnapshot);
      if(sourceVersion<=6 && Number(avatar.hairColor)===1)avatar.hairColor=2;
      return avatar;
    })()};
    return{...legacyCommon,legacy:true};
  });
  return state;
}
function isPlainObject(value){return Boolean(value)&&typeof value==="object"&&!Array.isArray(value)}
function hasHistorySnapshotData(item){return isPlainObject(item)&&["studentsSnapshot","layoutSnapshot","groupsSnapshot","rulesSnapshot","teacherAvatarSnapshot","assignmentSnapshot"].some(key=>Object.prototype.hasOwnProperty.call(item,key))}
function assertSupportedStateVersion(version){
  if(version>CURRENT_STATE_VERSION){
    const error=new Error(`UNSUPPORTED_FUTURE_STATE_VERSION: ${version} > ${CURRENT_STATE_VERSION}`);
    error.code="UNSUPPORTED_FUTURE_STATE_VERSION";
    throw error;
  }
}
function validateAssignmentCollection(assignments,studentIds,seatIds,label){
  const errors=[];
  if(!Array.isArray(assignments))return[`${label}이(가) 배열이 아닙니다.`];
  const assignedStudents=new Set(),assignedSeats=new Set();
  assignments.forEach((item,index)=>{
    if(!isPlainObject(item)||typeof item.studentId!=="string"||!item.studentId||typeof item.seatId!=="string"||!item.seatId){errors.push(`${label}의 ${index+1}번째 항목이 올바르지 않습니다.`);return}
    if(!studentIds.has(item.studentId))errors.push(`${label}에 존재하지 않는 학생 ID가 있습니다.`);
    if(!seatIds.has(item.seatId))errors.push(`${label}에 존재하지 않는 좌석 ID가 있습니다.`);
    if(assignedStudents.has(item.studentId))errors.push(`${label}에 중복된 학생 ID가 있습니다.`);
    if(assignedSeats.has(item.seatId))errors.push(`${label}에 중복된 좌석 ID가 있습니다.`);
    assignedStudents.add(item.studentId);assignedSeats.add(item.seatId);
  });
  return errors;
}
function validateSnapshotStudents(students,label){
  const errors=[],ids=new Set();
  if(!Array.isArray(students))return{errors:[`${label}이(가) 배열이 아닙니다.`],ids};
  students.forEach((student,index)=>{
    if(!isPlainObject(student)||typeof student.id!=="string"||!student.id||typeof student.name!=="string"){errors.push(`${label}의 ${index+1}번째 학생이 올바르지 않습니다.`);return}
    if(ids.has(student.id))errors.push(`${label}에 중복된 학생 ID가 있습니다.`);
    ids.add(student.id);
    if(!["none","male","female"].includes(student.gender))errors.push(`${label}에 올바르지 않은 성별 값이 있습니다.`);
    if(!["none","A","B","C"].includes(student.balanceLevel))errors.push(`${label}에 올바르지 않은 균형 값이 있습니다.`);
    if(!Array.isArray(student.apartFrom)||student.apartFrom.length>3)errors.push(`${label}의 떨어뜨릴 학생 설정이 올바르지 않습니다.`);
  });
  students.forEach(student=>{
    if(!isPlainObject(student)||!Array.isArray(student.apartFrom))return;
    const unique=new Set();
    student.apartFrom.forEach(id=>{
      if(typeof id!=="string"||!ids.has(id)||id===student.id)errors.push(`${label}의 떨어뜨릴 학생 참조가 올바르지 않습니다.`);
      if(unique.has(id))errors.push(`${label}의 떨어뜨릴 학생 참조가 중복되었습니다.`);
      unique.add(id);
    });
  });
  return{errors,ids};
}
function validateSnapshotLayout(layout,label){
  const errors=[],seatIds=new Set(),usableSeatIds=new Set();
  if(!isPlainObject(layout))return{errors:[`${label}이(가) 객체가 아닙니다.`],seatIds,usableSeatIds};
  const {rows,cols,cells}=layout;
  if(!Number.isInteger(rows)||rows<2||rows>12||!Number.isInteger(cols)||cols<2||cols>12)errors.push(`${label}의 행·열 범위가 올바르지 않습니다.`);
  if(!Array.isArray(cells)||cells.length!==rows*cols)return{errors:[...errors,`${label}의 셀 개수가 행·열과 맞지 않습니다.`],seatIds,usableSeatIds};
  cells.forEach((cell,index)=>{
    if(!isPlainObject(cell)||typeof cell.id!=="string"||!cell.id||!Number.isInteger(cell.row)||!Number.isInteger(cell.col)||!["seat","male","female","aisle","unused"].includes(cell.type)){errors.push(`${label}의 ${index+1}번째 셀이 올바르지 않습니다.`);return}
    if(cell.row<0||cell.row>=rows||cell.col<0||cell.col>=cols||cell.row*cols+cell.col!==index)errors.push(`${label}의 셀 좌표가 올바르지 않습니다.`);
    if(seatIds.has(cell.id))errors.push(`${label}에 중복된 좌석 ID가 있습니다.`);
    seatIds.add(cell.id);if(isUsable(cell))usableSeatIds.add(cell.id);
  });
  return{errors,seatIds,usableSeatIds};
}
function validateSnapshotGroups(groups,usableSeatIds,label){
  const errors=[],groupIds=new Set(),claimedSeats=new Set();
  if(!Array.isArray(groups))return[`${label}이(가) 배열이 아닙니다.`];
  groups.forEach((group,index)=>{
    if(!isPlainObject(group)||typeof group.id!=="string"||!group.id||typeof group.name!=="string"||!/^#[0-9a-fA-F]{6}$/.test(group.color||"")||!Array.isArray(group.seatIds)){errors.push(`${label}의 ${index+1}번째 모둠이 올바르지 않습니다.`);return}
    if(groupIds.has(group.id))errors.push(`${label}에 중복된 모둠 ID가 있습니다.`);groupIds.add(group.id);
    const localSeats=new Set();
    group.seatIds.forEach(id=>{
      if(typeof id!=="string"||!usableSeatIds.has(id))errors.push(`${label}에 존재하지 않는 좌석 참조가 있습니다.`);
      if(localSeats.has(id)||claimedSeats.has(id))errors.push(`${label}에 중복 배정된 모둠 좌석이 있습니다.`);
      localSeats.add(id);claimedSeats.add(id);
    });
  });
  return errors;
}
function validateSnapshotRules(rules,label){
  if(!isPlainObject(rules))return[`${label}이(가) 객체가 아닙니다.`];
  const keys=["completeRandom","genderSeats","apartStudents","fixedSeats","groupBalance","backRowNoRepeat","recentGroupmatesAvoid"];
  return keys.filter(key=>typeof rules[key]!=="boolean").map(key=>`${label}.${key} 값이 올바르지 않습니다.`);
}
function validateSnapshotAvatar(avatar,label){
  const errors=[];
  if(!isPlainObject(avatar))return[`${label}이(가) 객체가 아닙니다.`];
  if(!["female","male"].includes(avatar.gender))return[`${label}.gender 값이 올바르지 않습니다.`];
  const cfg=AVATAR_CFG[avatar.gender],ranges={skin:cfg.skins.length,eyes:cfg.eyes.length,hair:cfg.hairs.length,glasses:AVATAR_CFG.glasses.length,beard:AVATAR_CFG.beards.length,outfit:cfg.outfits.length};
  Object.entries(ranges).forEach(([key,length])=>{if(!Number.isInteger(avatar[key])||avatar[key]<0||avatar[key]>=length)errors.push(`${label}.${key} 값이 올바르지 않습니다.`)});
  const hairColors=cfg.hairs[avatar.hair]?.colors.length||0;
  if(!Number.isInteger(avatar.hairColor)||avatar.hairColor<0||avatar.hairColor>=hairColors)errors.push(`${label}.hairColor 값이 올바르지 않습니다.`);
  return errors;
}
function validateHistoryCollection(history,fallbackStudentIds,fallbackSeatIds){
  const errors=[],historyIds=new Set(),rounds=new Set();
  if(!Array.isArray(history))return["히스토리가 배열이 아닙니다."];
  history.forEach((item,index)=>{
    const label=`히스토리 ${index+1}`;
    if(!isPlainObject(item)){errors.push(`${label} 항목이 객체가 아닙니다.`);return}
    if(typeof item.id!=="string"||!item.id)errors.push(`${label} ID가 올바르지 않습니다.`);else if(historyIds.has(item.id))errors.push("히스토리에 중복된 ID가 있습니다.");else historyIds.add(item.id);
    if(!Number.isInteger(item.round)||item.round<1)errors.push(`${label} 순번이 올바르지 않습니다.`);else if(rounds.has(item.round))errors.push("히스토리에 중복된 순번이 있습니다.");else rounds.add(item.round);
    if(typeof item.createdAt!=="string"||!item.createdAt||Number.isNaN(Date.parse(item.createdAt)))errors.push(`${label} 생성 시각이 올바르지 않습니다.`);
    if(item.legacy){errors.push(...validateAssignmentCollection(item.assignments,fallbackStudentIds,fallbackSeatIds,`${label} 배치`));return}
    const studentResult=validateSnapshotStudents(item.studentsSnapshot,`${label} 학생 스냅샷`);errors.push(...studentResult.errors);
    const layoutResult=validateSnapshotLayout(item.layoutSnapshot,`${label} 레이아웃 스냅샷`);errors.push(...layoutResult.errors);
    errors.push(...validateAssignmentCollection(item.assignments,studentResult.ids,layoutResult.usableSeatIds,`${label} 배치 스냅샷`));
    errors.push(...validateSnapshotGroups(item.groupsSnapshot,layoutResult.usableSeatIds,`${label} 모둠 스냅샷`));
    errors.push(...validateSnapshotRules(item.rulesSnapshot,`${label} 규칙 스냅샷`));
    errors.push(...validateSnapshotAvatar(item.teacherAvatarSnapshot,`${label} 교사 아바타 스냅샷`));
    if(Array.isArray(item.studentsSnapshot))item.studentsSnapshot.forEach(student=>{if(isPlainObject(student)&&student.fixedSeatId!==null&&!layoutResult.usableSeatIds.has(student.fixedSeatId))errors.push(`${label} 학생 스냅샷에 존재하지 않는 지정석이 있습니다.`)});
  });
  return errors;
}
function validatePersistentState(state){
  const errors=[];
  if(!isPlainObject(state))return{ok:false,errors:["최상위 데이터가 객체가 아닙니다."]};
  if(!Number.isInteger(state.version)||state.version<1)errors.push("version이 올바르지 않습니다.");
  if(typeof state.className!=="string")errors.push("학급 이름이 올바르지 않습니다.");
  if(!Array.isArray(state.students))errors.push("학생 목록이 배열이 아닙니다.");
  if(!isPlainObject(state.layout))errors.push("레이아웃이 올바르지 않습니다.");
  if(!Array.isArray(state.assignments))errors.push("배치 목록이 배열이 아닙니다.");
  if(!Array.isArray(state.groups))errors.push("모둠 목록이 배열이 아닙니다.");
  if(!Array.isArray(state.history))errors.push("히스토리가 배열이 아닙니다.");
  if(!isPlainObject(state.rules))errors.push("규칙 데이터가 올바르지 않습니다.");
  if(!isPlainObject(state.teacherAvatar))errors.push("교사 캐릭터 데이터가 올바르지 않습니다.");
  if(!isPlainObject(state.ui))errors.push("화면 설정이 올바르지 않습니다.");
  if(errors.length)return{ok:false,errors};
  const {rows,cols,cells}=state.layout;
  if(!Number.isInteger(rows)||rows<2||rows>12||!Number.isInteger(cols)||cols<2||cols>12)errors.push("행·열 범위가 올바르지 않습니다.");
  if(!Array.isArray(cells)||cells.length!==rows*cols)errors.push("좌석 셀 개수가 행·열과 맞지 않습니다.");
  const studentIds=new Set();
  state.students.forEach((student,index)=>{
    if(!isPlainObject(student)||typeof student.id!=="string"||!student.id){errors.push(`${index+1}번째 학생 ID가 올바르지 않습니다.`);return}
    if(studentIds.has(student.id))errors.push("중복된 학생 ID가 있습니다.");
    studentIds.add(student.id);
    if(typeof student.name!=="string")errors.push(`${index+1}번째 학생 이름이 올바르지 않습니다.`);
    if(!Array.isArray(student.apartFrom)||student.apartFrom.length>3)errors.push(`${index+1}번째 떨어뜨릴 학생 설정이 올바르지 않습니다.`);
  });
  const usableSeatIds=new Set(Array.isArray(cells)?cells.filter(isUsable).map(cell=>cell.id):[]);
  state.students.forEach(student=>{
    if(!isPlainObject(student))return;
    if(student.fixedSeatId!==null&&!usableSeatIds.has(student.fixedSeatId))errors.push("존재하지 않는 지정석이 있습니다.");
    (student.apartFrom||[]).forEach(id=>{if(!studentIds.has(id)||id===student.id)errors.push("존재하지 않는 떨어뜨릴 학생 참조가 있습니다.")});
  });
  errors.push(...validateAssignmentCollection(state.assignments,studentIds,usableSeatIds,"현재 좌석 배치"));
  state.groups.forEach(group=>{if(!isPlainObject(group)||!Array.isArray(group.seatIds)||group.seatIds.some(id=>!usableSeatIds.has(id)))errors.push("모둠 좌석 참조가 올바르지 않습니다.")});
  errors.push(...validateHistoryCollection(state.history,studentIds,usableSeatIds));
  return{ok:errors.length===0,errors:[...new Set(errors)]};
}
function normalizeCandidateState(candidate){
  if(!isPlainObject(candidate))throw new Error("저장 데이터의 최상위 형식이 올바르지 않습니다.");
  if(!Array.isArray(candidate.students))throw new Error("학생 목록이 없거나 올바르지 않습니다.");
  if(!isPlainObject(candidate.layout)||!Array.isArray(candidate.layout.cells))throw new Error("좌석 레이아웃이 없거나 올바르지 않습니다.");
  if(candidate.version!==undefined&&(!Number.isFinite(Number(candidate.version))||Number(candidate.version)<1))throw new Error("데이터 버전이 올바르지 않습니다.");
  const incomingVersion=Number(candidate.version||1);assertSupportedStateVersion(incomingVersion);
  if(candidate.history!==undefined&&!Array.isArray(candidate.history))throw new Error("히스토리가 배열이 아닙니다.");
  (candidate.history||[]).forEach((item,index)=>{
    if(!isPlainObject(item))throw new Error(`히스토리 ${index+1} 항목이 객체가 아닙니다.`);
    if(!hasHistorySnapshotData(item)&&item.legacy!==true&&incomingVersion>3)throw new Error(`히스토리 ${index+1}의 전체 스냅샷이 누락되었습니다.`);
    if(Object.prototype.hasOwnProperty.call(item,"assignmentSnapshot"))throw new Error(`히스토리 ${index+1}에 지원하지 않는 assignmentSnapshot 필드가 있습니다. 현재 스키마는 assignments를 사용합니다.`);
  });
  if(candidate.assignments!==undefined){
    const incomingStudentIds=new Set(candidate.students.filter(isPlainObject).map(student=>student.id).filter(id=>typeof id==="string"&&id));
    const incomingLayout=normalizeLayout(candidate.layout,{layout:{rows:4,cols:8}});
    const incomingSeatIds=new Set(incomingLayout.cells.filter(isUsable).map(cell=>cell.id));
    const incomingAssignmentErrors=validateAssignmentCollection(candidate.assignments,incomingStudentIds,incomingSeatIds,"저장된 좌석 배치");
    if(incomingAssignmentErrors.length)throw new Error([...new Set(incomingAssignmentErrors)].join(" "));
  }
  const migrated=migrateState(deepCopy(candidate));
  const validation=validatePersistentState(migrated);
  if(!validation.ok)throw new Error(validation.errors.join(" "));
  return migrated;
}
function parseAndNormalizeState(raw){return normalizeCandidateState(JSON.parse(raw))}
const storageRuntime={sourceKey:null,lastKnownCanonicalRaw:null,loadIssue:null,saveBlocked:false,stale:false,migratedLegacy:false};
function loadState(){
  try{
    const current=localStorage.getItem(STORAGE_KEY);
    if(current!==null){
      storageRuntime.sourceKey=STORAGE_KEY;
      try{
        const state=parseAndNormalizeState(current);
        storageRuntime.lastKnownCanonicalRaw=current;
        return state;
      }catch(error){
        storageRuntime.loadIssue=`저장된 데이터가 손상되어 자동 저장을 멈췄습니다. JSON 백업을 불러오거나 브라우저 저장소를 확인해 주세요. (${error.message})`;
        storageRuntime.saveBlocked=true;
        return defaultState();
      }
    }
    for(const key of LEGACY_STORAGE_KEYS){
      const legacy=localStorage.getItem(key);
      if(legacy===null)continue;
      storageRuntime.sourceKey=key;
      let migrated;
      try{migrated=parseAndNormalizeState(legacy)}catch(error){
        storageRuntime.loadIssue=`이전 버전 저장 데이터가 손상되어 자동 저장을 멈췄습니다. 원본은 그대로 보존했습니다. (${error.message})`;
        storageRuntime.saveBlocked=true;
        return defaultState();
      }
      const canonicalRaw=JSON.stringify(migrated);
      try{
        localStorage.setItem(STORAGE_KEY,canonicalRaw);
        const verified=localStorage.getItem(STORAGE_KEY);
        if(verified!==canonicalRaw)throw new Error("저장 확인 값이 일치하지 않습니다.");
        parseAndNormalizeState(verified);
        storageRuntime.lastKnownCanonicalRaw=canonicalRaw;
        storageRuntime.migratedLegacy=true;
      }catch(error){
        storageRuntime.loadIssue=`이전 데이터는 불러왔지만 새 저장소로 옮기지 못했습니다. 원본은 그대로 보존되며, JSON으로 내보낸 뒤 저장 공간을 확인해 주세요. (${error.message})`;
        storageRuntime.saveBlocked=true;
      }
      return migrated;
    }
  }catch(error){
    console.warn("저장 상태를 읽지 못했습니다.",error);
    storageRuntime.loadIssue=`브라우저 저장소를 읽지 못해 자동 저장을 멈췄습니다. 현재 작업은 메모리에서 사용할 수 있으므로 JSON으로 내보내 주세요. (${error.message})`;
    storageRuntime.saveBlocked=true;
  }
  return defaultState();
}

let classState=loadState();
let paintTool="seat",isPainting=false,paintMode="apply",painted=new Set();
let selectedStudentId=classState.students[0]?.id||null;
let activeDockTab="settings";
let previewAssignments=classState.assignments.map(a=>({...a}));
let previewRevision=classState.assignments.length?0:null;
let confirmedRevision=classState.assignments.length?0:null;
let historyView=null;
let groupEdit={active:false,id:null,name:"",color:GROUP_COLORS[0],seatIds:new Set(),painting:false,mode:"add"};
let playbackData=null,playbackStudents=[],playbackToken=0,playbackRunning=false,playbackCompleted=false;
let playbackRoomWidth=999,playbackRoomHeight=1120,playbackDoorCenterX=873,playbackDoorSpawn={x:873,y:116},playbackDoorExit={x:873,y:258};
let doorEntryChain=Promise.resolve();
let playbackTeacherDir=0,teacherSpeechTimer=null,teacherProximityTimer=null,teacherSpeechSerial=0;
let usedTeacherSpeechLines=new Set(),usedStudentSpeechLines=new Set(),movementSpeechByStudent=new Map(),seatedSeatIds=new Set(),partnerSpeechCount=0,partnerSpeechSpeakers=new Set();
let avatarFrame=1,avatarTick=0;
let saveTimer=null;

let undoStack=[],redoStack=[],undoReady=false,undoRestoring=false,undoBatchDepth=0;
const UNDO_LIMIT=80;

function captureEditorSnapshot(){
  return JSON.stringify({
    classState,
    previewAssignments,
    previewRevision,
    confirmedRevision,
    selectedStudentId
  });
}
function updateUndoButtons(){
  if(!$("undoButton"))return;
  $("undoButton").disabled=undoStack.length<=1;
  $("redoButton").disabled=redoStack.length===0;
}
function resetUndoHistory(){
  undoStack=[captureEditorSnapshot()];
  redoStack=[];
  undoReady=true;
  updateUndoButtons();
}
function recordUndoPoint(){
  if(!undoReady||undoRestoring||undoBatchDepth>0)return;
  const snap=captureEditorSnapshot();
  if(undoStack.at(-1)===snap)return;
  undoStack.push(snap);
  if(undoStack.length>UNDO_LIMIT)undoStack.shift();
  redoStack=[];
  updateUndoButtons();
}
function beginUndoBatch(){undoBatchDepth++}
function endUndoBatch(){
  if(undoBatchDepth>0)undoBatchDepth--;
  if(undoBatchDepth===0)recordUndoPoint();
}
function syncRuleControlsFromState(){
  const map=[["ruleRandom","completeRandom"],["ruleGender","genderSeats"],["ruleApart","apartStudents"],["ruleFixed","fixedSeats"],["ruleGroupBalance","groupBalance"],["ruleBackRow","backRowNoRepeat"],["ruleRecentGroupmates","recentGroupmatesAvoid"]];
  map.forEach(([id,key])=>{if($(id))$(id).checked=Boolean(classState.rules[key])});
  applyRuleGating();
}
function rerenderAfterRestore(message){
  historyView=null;groupEdit={active:false,id:null,name:"",color:GROUP_COLORS[0],seatIds:new Set(),painting:false,mode:"add"};
  $("historyBanner")?.classList.add("hidden");$("groupEditor")?.classList.add("hidden");
  renderStudentsInput();renderTopTitle();applyStudioCollapse();renderLayout();renderStudentStrip();renderStudentInspector();renderGroups();renderHistory();renderGroupPalette();
  syncRuleControlsFromState();rebuildAvatarControls();
  $("targetStudentCount").value=classState.students.length;
  setAssignmentStatus(message);
}
function restoreEditorSnapshot(serialized,message){
  const snap=JSON.parse(serialized);
  classState=migrateState(snap.classState);
  previewAssignments=Array.isArray(snap.previewAssignments)?snap.previewAssignments.map(a=>({...a})):classState.assignments.map(a=>({...a}));
  previewRevision=snap.previewRevision??null;confirmedRevision=snap.confirmedRevision??null;
  selectedStudentId=snap.selectedStudentId&&classState.students.some(s=>s.id===snap.selectedStudentId)?snap.selectedStudentId:(classState.students[0]?.id||null);
  undoRestoring=true;
  try{
    rerenderAfterRestore(message);
    persistStateOnly();
  }finally{undoRestoring=false}
}
function undoAction(){
  if(undoStack.length<=1)return;
  const current=undoStack.pop();redoStack.push(current);
  restoreEditorSnapshot(undoStack.at(-1),"↶ 실행 취소");
  updateUndoButtons();
}
function redoAction(){
  if(!redoStack.length)return;
  const next=redoStack.pop();undoStack.push(next);
  restoreEditorSnapshot(next,"↷ 다시 실행");
  updateUndoButtons();
}

function setSaveStatus(message,kind=""){
  const node=$("saveStatus");if(!node)return;
  node.textContent=message;node.classList.toggle("error",kind==="error");node.classList.toggle("warning",kind==="warning");
}
function showStorageAlert(message,kind="warning",showReload=false){
  const box=$("storageAlert"),textNode=$("storageAlertText"),reload=$("reloadStorage");
  if(!box||!textNode)return;
  box.classList.remove("hidden","error","warning","success");box.classList.add(kind);textNode.textContent=message;
  if(reload)reload.classList.remove("hidden");else reload.classList.add("hidden");
}
function hideStorageAlert(){const box=$("storageAlert");if(box)box.classList.add("hidden")}
function writeCanonicalState(state,{allowOverwrite=false}={}){
  const validation=validatePersistentState(state);
  if(!validation.ok)return{ok:false,error:new Error(validation.errors.join(" "))};
  let raw;
  try{raw=JSON.stringify(state)}catch(error){return{ok:false,error}}
  try{
    const current=localStorage.getItem(STORAGE_KEY);
    if(!allowOverwrite&&current!==storageRuntime.lastKnownCanonicalRaw&&!(current===null&&storageRuntime.lastKnownCanonicalRaw===null)){
      storageRuntime.stale=true;
      return{ok:false,stale:true,error:new Error("다른 탭에서 저장 데이터가 변경되었습니다.")};
    }
    localStorage.setItem(STORAGE_KEY,raw);
    const verified=localStorage.getItem(STORAGE_KEY);
    if(verified!==raw)throw new Error("저장 후 확인 값이 일치하지 않습니다.");
    parseAndNormalizeState(verified);
    storageRuntime.lastKnownCanonicalRaw=raw;storageRuntime.sourceKey=STORAGE_KEY;storageRuntime.stale=false;
    return{ok:true,raw};
  }catch(error){return{ok:false,error}}
}
function persistStateOnly(){
  if(storageRuntime.saveBlocked){
    setSaveStatus("저장 중지 · 복구 필요","error");
    if(storageRuntime.loadIssue)showStorageAlert(storageRuntime.loadIssue,"error");
    return false;
  }
  const result=writeCanonicalState(classState);
  if(result.ok){
    setSaveStatus("브라우저 저장 · 저장됨");hideStorageAlert();
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>setSaveStatus("브라우저 저장 · 자동 저장"),1200);
    return true;
  }
  if(result.stale){
    setSaveStatus("저장 중지 · 다른 탭 변경 감지","warning");
    showStorageAlert("다른 탭에서 데이터가 변경되었습니다. 덮어쓰기를 막았습니다. 이 탭을 새로고침해 최신 데이터를 불러오세요.","warning",true);
  }else{
    console.warn("상태 저장 실패",result.error);
    setSaveStatus("저장 실패 · JSON 백업 권장","error");
    showStorageAlert(`브라우저 저장에 실패했습니다. 현재 화면의 작업은 계속 사용할 수 있습니다. 먼저 JSON으로 내보낸 뒤 저장 공간과 브라우저 설정을 확인해 주세요. (${result.error?.message||"알 수 없는 오류"})`,"error");
  }
  return false;
}
function saveState(){
  persistStateOnly();
  recordUndoPoint();
}
function studentById(id){return classState.students.find(s=>s.id===id)}
function usableCells(){return classState.layout.cells.filter(isUsable)}
function assignmentMap(list=previewAssignments){return new Map(list.map(a=>[a.seatId,a.studentId]))}
function pruneFixedSeats(){
  const valid=new Set(usableCells().map(c=>c.id));
  classState.students.forEach(s=>{if(s.fixedSeatId&&!valid.has(s.fixedSeatId))s.fixedSeatId=null});
}
function pruneGroups(){
  const valid=new Set(usableCells().map(c=>c.id)),seen=new Set();
  classState.groups=classState.groups.map(g=>({...g,seatIds:g.seatIds.filter(id=>valid.has(id)&&!seen.has(id)).filter(id=>(seen.add(id),true))})).filter(g=>g.seatIds.length);
  if(!classState.groups.length){classState.rules.groupBalance=false;classState.rules.recentGroupmatesAvoid=false}
}
function rosterCounts(students=classState.students){
  const counts={total:students.length,male:0,female:0,none:0};
  students.forEach(s=>{if(s.gender==="male")counts.male++;else if(s.gender==="female")counts.female++;else counts.none++});
  return counts;
}
function renderRosterSummary(students=historyView?.studentsSnapshot||classState.students){
  const c=rosterCounts(students||[]);
  $("rosterSummary").textContent=`전체 ${c.total}명 · 남 ${c.male}명 · 여 ${c.female}명 · 미지정 ${c.none}명`;
}
function setAssignmentStatus(message,success=false){
  const el=$("assignmentStatus");el.textContent=message;el.classList.toggle("success",success);
}
function invalidatePreview(message){
  previewAssignments=[];
  previewRevision=null;
  if(!historyView)renderLayout();
  setAssignmentStatus(message||"설정이 바뀌었습니다. 새 배치를 생성하세요.");
}
function invalidateConfirmed(message){
  classState.assignments=[];
  confirmedRevision=null;
  invalidatePreview(message||"기존 확정 배치를 해제했습니다. 새 배치를 생성하세요.");
}
function groupForSeat(seatId,groups=classState.groups){return groups.find(g=>g.seatIds.includes(seatId))||null}

function currentRenderContext(){
  if(historyView&&!historyView.legacy){
    return{
      readonly:true,
      layout:historyView.layoutSnapshot,
      students:historyView.studentsSnapshot,
      groups:historyView.groupsSnapshot||[],
      assignments:historyView.assignments||[]
    };
  }
  if(historyView?.legacy){
    return{readonly:true,layout:classState.layout,students:classState.students,groups:[],assignments:[]};
  }
  return{readonly:false,layout:classState.layout,students:classState.students,groups:classState.groups,assignments:previewAssignments};
}

function fitEditorGrid(){
  const wrap=$("editorWrap"),ctx=currentRenderContext();if(!wrap||!ctx?.layout)return;
  const {rows,cols}=ctx.layout,gap=(rows>=9||cols>=10)?4:7;
  const usableW=Math.max(220,wrap.clientWidth-66),usableH=Math.max(180,wrap.clientHeight-54);
  const rawW=Math.floor((usableW-gap*(cols-1))/cols),rawH=Math.floor((usableH-gap*(rows-1))/rows);
  const cellW=Math.max(26,Math.min(152,rawW)),cellH=Math.max(28,Math.min(118,rawH));
  document.documentElement.style.setProperty("--editor-gap",`${gap}px`);
  document.documentElement.style.setProperty("--editor-cell-w",`${cellW}px`);
  document.documentElement.style.setProperty("--editor-cell-h",`${cellH}px`);
}
function updateAxisControls(){
  if(!$("rowMinus"))return;const {rows,cols}=classState.layout,locked=Boolean(historyView);
  $("rowMinus").disabled=locked||rows<=2;$("rowPlus").disabled=locked||rows>=12;$("colMinus").disabled=locked||cols<=2;$("colPlus").disabled=locked||cols>=12;
}
function renderLayout(){
  const ctx=currentRenderContext(),{rows,cols,cells}=ctx.layout,studentMap=new Map(ctx.students.map(s=>[s.id,s])),occupied=new Map(ctx.assignments.map(a=>[a.seatId,a.studentId]));
  const root=$("layoutGrid");
  root.style.gridTemplateColumns=`repeat(${cols},var(--editor-cell-w))`;
  root.style.gridTemplateRows=`repeat(${rows},var(--editor-cell-h))`;
  root.innerHTML="";
  cells.forEach((cell,index)=>{
    const el=document.createElement("div"),seat=isUsable(cell),student=studentMap.get(occupied.get(cell.id)),fixedStudent=!ctx.readonly?classState.students.find(s=>s.fixedSeatId===cell.id):null,group=groupForSeat(cell.id,ctx.groups);
    el.className=`layout-cell ${cell.type}${ctx.readonly?" history-readonly":""}`;
    el.dataset.index=index;el.dataset.seatId=cell.id;
    if(group){el.style.setProperty("--group-color",groupColor(ctx.groups.indexOf(group),group))}
    if(!ctx.readonly&&groupEdit.active&&seat){
      el.classList.add("group-selectable");el.style.setProperty("--selection-color",groupEdit.color||GROUP_COLORS[0]);
      if(groupEdit.seatIds.has(cell.id))el.classList.add("group-selected");
      el.onmousedown=event=>{if(event.button!==0)return;event.preventDefault();beginGroupPaint(cell.id)};
      el.onmouseenter=()=>{if(groupEdit.painting)applyGroupPaint(cell.id)};
    }else if(!ctx.readonly){
      el.onmousedown=event=>{if(event.button!==0)return;event.preventDefault();beginPaint(index)};
      el.onmouseenter=()=>{if(isPainting)applyPaint(index)};
    }
    if(seat){
      const typeLabel=cell.type==="seat"?"일반 좌석":cell.type==="male"?"남학생 좌석":"여학생 좌석";
      const name=student?.name||fixedStudent?.name||"빈 좌석";
      el.innerHTML=`<span class="idx">${cell.row+1}-${cell.col+1}</span><div class="seat-info"><strong class="seat-occupant ${student||fixedStudent?"":"empty"}">${escapeHtml(name)}</strong><span class="seat-type">${typeLabel}</span>${fixedStudent?'<span class="seat-fixed">📌 고정석</span>':""}</div>${group?`<span class="group-chip">${escapeHtml(group.name)}</span>`:""}`;
      if(!ctx.readonly){
        el.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect="move";el.classList.add("drop-target")};
        el.ondragleave=()=>el.classList.remove("drop-target");
        el.ondrop=event=>{event.preventDefault();el.classList.remove("drop-target");assignFixedSeat(event.dataTransfer.getData("application/x-student-id")||event.dataTransfer.getData("text/plain"),cell.id)};
      }
    }else el.innerHTML=`<span class="cell-label">${cell.type==="aisle"?"통로":"빈 자리"}</span>`;
    root.appendChild(el);
  });
  const counts={seat:0,male:0,female:0,aisle:0,unused:0};cells.forEach(c=>counts[c.type]=(counts[c.type]||0)+1);
  $("layoutStats").innerHTML=`<div class="stat">사용 가능 <b>${counts.seat+counts.male+counts.female}</b></div><div class="stat">남학생석 <b>${counts.male}</b></div><div class="stat">여학생석 <b>${counts.female}</b></div><div class="stat">통로 <b>${counts.aisle}</b></div><div class="stat">빈 자리 <b>${counts.unused}</b></div>${ctx.groups.length?`<div class="stat">모둠 <b>${ctx.groups.length}</b></div>`:""}`;
  updateAxisControls();requestAnimationFrame(fitEditorGrid);
}
function beginPaint(index){
  if(historyView||groupEdit.active)return;
  beginUndoBatch();
  isPainting=true;painted=new Set();paintMode=classState.layout.cells[index].type===paintTool?"erase":"apply";applyPaint(index);
}
function applyPaint(index){
  if(!isPainting||painted.has(index)||historyView||groupEdit.active)return;
  painted.add(index);
  classState.layout.cells[index].type=paintMode==="erase"?"seat":paintTool;
  pruneFixedSeats();pruneGroups();
  invalidateConfirmed("레이아웃이 바뀌어 기존 확정 배치를 해제했습니다.");
  saveState();renderStudentInspector();renderGroups();applyRuleGating();
}
function endPaint(){
  const hadPaint=isPainting;
  isPainting=false;painted.clear();endGroupPaint();
  if(hadPaint)endUndoBatch();
}
function resizeGridTo(rows,cols,message="격자 크기가 바뀌어 기존 확정 배치를 해제했습니다."){
  if(historyView)return;const old=classState.layout;rows=Math.max(2,Math.min(12,rows));cols=Math.max(2,Math.min(12,cols));if(rows===old.rows&&cols===old.cols)return;
  const cells=freshCells(rows,cols);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    if(r<old.rows&&c<old.cols)cells[r*cols+c].type=old.cells[r*old.cols+c]?.type||"seat";
    else if(r>=old.rows&&c<old.cols)cells[r*cols+c].type=old.cells[(old.rows-1)*old.cols+c]?.type||"seat";
    else cells[r*cols+c].type="seat";
  }
  classState.layout={rows,cols,cells};pruneFixedSeats();pruneGroups();invalidateConfirmed(message);saveState();renderStudentInspector();renderGroups();applyRuleGating();
}
function resizeGrid(){resizeGridTo(Number($("rows").value)||4,Number($("cols").value)||8)}
function changeGridDimension(axis,delta){const {rows,cols}=classState.layout;resizeGridTo(axis==="rows"?rows+delta:rows,axis==="cols"?cols+delta:cols,`${axis==="rows"?"행":"열"}을 ${delta>0?"한 줄 늘렸습니다":"한 줄 줄였습니다"}.`)}
function pairedPreset(){
  if(historyView)return;
  const rows=4,cols=8,cells=defaultPairedCells(rows,cols);
  classState.layout={rows,cols,cells};pruneFixedSeats();pruneGroups();invalidateConfirmed("2인 짝 예시를 적용했습니다.");saveState();renderGroups();applyRuleGating();
}
function resetLayout(){
  if(historyView)return;
  if(!confirm("현재 레이아웃과 모둠 설정을 모두 초기화할까요?"))return;
  const rows=4,cols=8;classState.layout={rows,cols,cells:defaultPairedCells(rows,cols)};classState.groups=[];pruneFixedSeats();invalidateConfirmed("기본 4×8 · 2인 짝 레이아웃으로 초기화했습니다.");saveState();renderGroups();applyRuleGating();
}

function renderStudentsInput(){$("studentInput").value=classState.students.map(s=>s.name).join("\n")}
function applyStudentNames(){
  if(historyView)return;
  const names=$("studentInput").value.split("\n").map(s=>s.trim()).filter(Boolean),old=[...classState.students];
  classState.students=names.map(name=>{
    const at=old.findIndex(s=>s.name===name);
    return at>=0?old.splice(at,1)[0]:{id:nextStudentId(),name,gender:"none",balanceLevel:"none",apartFrom:[],fixedSeatId:null};
  });
  const ids=new Set(classState.students.map(s=>s.id)),validSeats=new Set(usableCells().map(c=>c.id));
  classState.students.forEach(s=>{s.apartFrom=[...new Set((s.apartFrom||[]).filter(id=>ids.has(id)&&id!==s.id))].slice(0,3);if(s.fixedSeatId&&!validSeats.has(s.fixedSeatId))s.fixedSeatId=null;if(!["A","B","C"].includes(s.balanceLevel))s.balanceLevel="none"});
  if(!classState.students.some(s=>s.id===selectedStudentId))selectedStudentId=classState.students[0]?.id||null;
  invalidateConfirmed("명단이 바뀌어 기존 확정 배치를 해제했습니다.");
  saveState();renderStudentsInput();renderStudentStrip();renderStudentInspector();renderHistory();
}
function nextPlaceholderStudentName(){
  const used=new Set(classState.students.map(s=>s.name));
  let n=classState.students.length+1,name=`새 학생 ${n}`;
  while(used.has(name)){n++;name=`새 학생 ${n}`}
  return name;
}
function makeBlankStudent(name=nextPlaceholderStudentName()){
  return{id:nextStudentId(),name,gender:"none",balanceLevel:"none",apartFrom:[],fixedSeatId:null};
}
function addStudentFromStrip(){
  if(historyView)return;
  const student=makeBlankStudent();classState.students.push(student);selectedStudentId=student.id;
  invalidateConfirmed(`${student.name}을 추가했습니다. 오른쪽 학생 속성에서 이름을 수정하세요.`);
  saveState();renderStudentsInput();renderStudentStrip();renderStudentInspector();activateDock("student");
  requestAnimationFrame(()=>{const input=$("studentNameEdit");if(input){input.focus();input.select()}});
}
function fillStudentsToTarget(){
  if(historyView)return;
  const raw=Number($("targetStudentCount").value),target=Math.max(0,Math.min(60,Math.trunc(raw||0))),current=classState.students.length;
  $("targetStudentCount").value=target;
  if(target<=current){
    setAssignmentStatus(target<current?`현재 ${current}명입니다. 총원 입력은 학생을 자동 삭제하지 않습니다. 학생 제거는 오른쪽 학생 속성에서 해주세요.`:`이미 총 ${current}명입니다.`);
    return;
  }
  const addCount=target-current,added=[];
  beginUndoBatch();
  for(let i=0;i<addCount;i++){const student=makeBlankStudent();classState.students.push(student);added.push(student)}
  selectedStudentId=added[0]?.id||selectedStudentId;
  invalidateConfirmed(`총원 ${target}명에 맞춰 ${addCount}명을 추가했습니다.`);
  persistStateOnly();endUndoBatch();
  renderStudentsInput();renderStudentStrip();renderStudentInspector();activateDock("student");
}
function removeSelectedStudent(){
  if(historyView)return;const student=studentById(selectedStudentId);if(!student)return;if(!confirm(`‘${student.name}’ 학생을 삭제할까요?\n현재 명단과 배치에서 제거됩니다.`))return;
  classState.students=classState.students.filter(s=>s.id!==student.id);classState.students.forEach(s=>s.apartFrom=(s.apartFrom||[]).filter(id=>id!==student.id));classState.assignments=classState.assignments.filter(a=>a.studentId!==student.id);previewAssignments=previewAssignments.filter(a=>a.studentId!==student.id);selectedStudentId=classState.students[0]?.id||null;
  invalidateConfirmed(`${student.name} 학생을 삭제해 기존 확정 배치를 해제했습니다.`);saveState();renderStudentsInput();renderStudentStrip();renderStudentInspector();
}
function assignFixedSeat(studentId,fixedSeatId){
  if(historyView)return;
  const student=studentById(studentId);if(!student||!usableCells().some(c=>c.id===fixedSeatId))return;
  classState.students.forEach(s=>{if(s.id!==studentId&&s.fixedSeatId===fixedSeatId)s.fixedSeatId=null});
  student.fixedSeatId=fixedSeatId;invalidatePreview(`${student.name} 학생의 고정석을 설정했습니다.`);applyRuleGating();saveState();renderStudentStrip();renderStudentInspector();
}
function clearFixedSeat(student){
  if(historyView)return;
  student.fixedSeatId=null;invalidatePreview(`${student.name} 학생의 고정석을 해제했습니다.`);applyRuleGating();saveState();renderStudentStrip();renderStudentInspector();
}
function inspectorStudents(){return historyView&&!historyView.legacy?(historyView.studentsSnapshot||[]):classState.students}
function inspectorStudentById(id){return inspectorStudents().find(s=>s.id===id)}
function bindStudentStripWheel(){
  const scroller=$("studentCards");
  if(!scroller||scroller.dataset.wheelBound==="1")return;
  scroller.dataset.wheelBound="1";
  scroller.addEventListener("wheel",event=>{
    if(scroller.scrollWidth<=scroller.clientWidth)return;

    // Mouse wheel / vertical trackpad gesture -> horizontal roster movement.
    // Native horizontal trackpad deltaX is preserved and combined naturally.
    const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
    if(!delta)return;

    const before=scroller.scrollLeft;
    scroller.scrollLeft+=delta;
    if(scroller.scrollLeft!==before)event.preventDefault();
  },{passive:false});
}
function renderStudentStrip(){
  const students=inspectorStudents();
  if(!students.some(s=>s.id===selectedStudentId))selectedStudentId=students[0]?.id||null;
  const root=$("studentCards");root.innerHTML="";
  students.forEach(student=>{
    const card=document.createElement("button");card.type="button";card.className=`student-card${student.id===selectedStudentId?" selected":""}`;card.dataset.studentId=student.id;
    if(!historyView){card.draggable=true}
    card.innerHTML=`<span class="student-card-copy"><strong>${escapeHtml(student.name)}</strong><small><span class="gender-dot ${student.gender}"></span>${student.gender==="male"?"남학생":student.gender==="female"?"여학생":"성별 미지정"}${!historyView&&student.fixedSeatId?" · 📌 고정석":""}</small></span>${studentPreviewMarkup(student,students.indexOf(student))}`;
    card.onclick=()=>{selectedStudentId=student.id;activateDock("student");renderStudentStrip();renderStudentInspector()};
    if(!historyView){
      card.ondragstart=event=>{event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("application/x-student-id",student.id);event.dataTransfer.setData("text/plain",student.id)};
    }
    root.appendChild(card);
  });
  renderRosterSummary(students);
  if(!historyView&&$("targetStudentCount"))$("targetStudentCount").value=classState.students.length;

  bindStudentStripWheel();
  ensureStudentGlassesAssets();refreshStudentPreviewLayers();
}
function renderStudentInspector(){
  const root=$("studentInspector"),nameRoot=$("studentNameSlot"),student=inspectorStudentById(selectedStudentId);
  if(!student){nameRoot.innerHTML="";root.innerHTML='<div class="student-inspector-empty">하단에서 학생을 선택하세요.</div>';return}
  if(historyView&&!historyView.legacy){
    const apartNames=(student.apartFrom||[]).map(id=>inspectorStudentById(id)?.name||id);
    nameRoot.innerHTML=`<h3 class="student-name-title sticky-history-name">${escapeHtml(student.name)}</h3>`;
    root.innerHTML=`<div class="history-detail"><b>당시 비공개 속성</b><br>
      성별: ${student.gender==="male"?"남":student.gender==="female"?"여":"미지정"}<br>
      배치 균형 속성: ${BALANCE_LABEL[student.balanceLevel]||"미지정"}<br>
      지정석: ${escapeHtml(student.fixedSeatId||"없음")}<br>
      떨어뜨릴 학생: ${escapeHtml(apartNames.join(", ")||"없음")}</div>`;
    return;
  }
  if(historyView?.legacy){nameRoot.innerHTML=`<h3 class="student-name-title sticky-history-name">${escapeHtml(student.name)}</h3>`;root.innerHTML=`<div class="notice">이 기록은 V3 레거시 히스토리라 당시 학생 속성이 저장되지 않았습니다.</div>`;return}
  const dockBody=document.querySelector(".dock-body"),keepScroll=dockBody?.scrollTop||0;
  const studentIndex=Math.max(0,classState.students.findIndex(s=>s.id===student.id));
  student.visual=normalizedStudentVisual(student,studentIndex);
  const visual=student.visual;
  const characterOptions=CHARACTERS.map(v=>`<option value="${v}" ${visual.character===v?"selected":""}>${STUDENT_CHARACTER_LABELS[v]}</option>`).join("");
  const hairOptions=HAIR_COLORS.map(v=>`<option value="${v}" ${visual.hair===v?"selected":""}>${STUDENT_HAIR_LABELS[v]}</option>`).join("");
  const outfitOptions=OUTFIT_COLORS.map(v=>`<option value="${v}" ${visual.outfit===v?"selected":""}>${STUDENT_OUTFIT_LABELS[v]}</option>`).join("");
  const glassesOptions=STUDENT_GLASSES.map(v=>`<option value="${v.id}" ${visual.glasses===v.id?"selected":""}>${v.label}</option>`).join("");
  const others=classState.students.filter(s=>s.id!==student.id);
  const apartSlots=Array.from({length:3},(_,slot)=>`<select data-apart-slot="${slot}" aria-label="떨어뜨릴 학생 ${slot+1}"><option value="">${slot+1}번 없음</option>${others.map(s=>`<option value="${s.id}" ${student.apartFrom[slot]===s.id?"selected":""}>${escapeHtml(s.name)}</option>`).join("")}</select>`).join("");
  nameRoot.innerHTML=`<div class="student-name-sticky"><span class="inspector-label">학생 이름</span><input id="studentNameEdit" class="field-input" maxlength="30" value="${escapeHtml(student.name)}"></div>`;
  root.innerHTML=`<div class="inspector-section student-visual-editor"><span class="inspector-label">외형 커스터마이즈</span><div class="student-visual-preview">${studentPreviewMarkup(student,studentIndex)}</div><div class="student-visual-grid"><label>캐릭터<select id="studentCharacter">${characterOptions}</select></label><label>머리색<select id="studentHair">${hairOptions}</select></label><label>옷 색상<select id="studentOutfit">${outfitOptions}</select></label><label>안경<select id="studentGlasses">${glassesOptions}</select></label></div></div>
    <div class="inspector-section"><span class="inspector-label">성별</span><div class="segmented"><button type="button" data-g="none" class="${student.gender==="none"?"on":""}">미지정</button><button type="button" data-g="male" class="${student.gender==="male"?"on":""}">남</button><button type="button" data-g="female" class="${student.gender==="female"?"on":""}">여</button></div></div>
    <div class="inspector-section"><span class="inspector-label">배치 균형 속성 · 비공개</span><div class="level-segment"><button type="button" data-level="A" class="${student.balanceLevel==="A"?"on":""}">빼어남</button><button type="button" data-level="B" class="${student.balanceLevel==="B"?"on":""}">우수함</button><button type="button" data-level="C" class="${student.balanceLevel==="C"?"on":""}">아름다움</button></div><button id="clearLevel" class="ghost full" type="button" style="margin-top:6px">평가 미지정</button></div>
    <div class="inspector-section"><span class="inspector-label">떨어뜨릴 학생 · 최대 3명</span><div class="apart-selects">${apartSlots}</div></div>
    <div class="inspector-section">${student.fixedSeatId?`<div class="fixed-seat-status"><span>📌 ${escapeHtml(student.fixedSeatId)}</span><button id="clearFixed" type="button">해제</button></div>`:'<div class="small-info">하단 학생 카드를 중앙 좌석으로 끌어 고정석을 설정할 수 있습니다.</div>'}</div>
    <div class="inspector-section"><button id="removeStudent" class="danger full" type="button">학생 삭제</button></div>`;
  const updateVisual=(key,value)=>{student.visual={...normalizedStudentVisual(student,studentIndex),[key]:value};saveState();renderStudentStrip();renderStudentInspector()};
  $("studentCharacter").onchange=e=>updateVisual("character",e.target.value);
  $("studentHair").onchange=e=>updateVisual("hair",e.target.value);
  $("studentOutfit").onchange=e=>updateVisual("outfit",e.target.value);
  $("studentGlasses").onchange=e=>updateVisual("glasses",e.target.value);
  ensureStudentGlassesAssets();refreshStudentPreviewLayers();
  if(dockBody)requestAnimationFrame(()=>{dockBody.scrollTop=keepScroll});
  $("studentNameEdit").onchange=event=>{const next=event.target.value.trim().slice(0,30);if(!next){event.target.value=student.name;return}student.name=next;invalidateConfirmed("학생 이름이 바뀌어 기존 확정 배치를 해제했습니다.");saveState();renderStudentsInput();renderStudentStrip();renderLayout();renderStudentInspector()};
  root.querySelectorAll("[data-g]").forEach(button=>button.onclick=()=>{student.gender=button.dataset.g;saveState();renderStudentStrip();renderStudentInspector()});
  root.querySelectorAll("[data-level]").forEach(button=>button.onclick=()=>{student.balanceLevel=button.dataset.level;saveState();renderStudentInspector()});
  $("clearLevel").onclick=()=>{student.balanceLevel="none";saveState();renderStudentInspector()};
  root.querySelectorAll("[data-apart-slot]").forEach(select=>select.onchange=event=>{const values=[...student.apartFrom];values[Number(select.dataset.apartSlot)]=event.target.value;student.apartFrom=[...new Set(values.filter(Boolean))].slice(0,3);saveState();renderStudentInspector()});
  const clear=$("clearFixed");if(clear)clear.onclick=()=>clearFixedSeat(student);const remove=$("removeStudent");if(remove)remove.onclick=removeSelectedStudent;
}


/* Groups */
function renderGroupPalette(){
  const root=$("groupPalette");if(!root)return;root.innerHTML=GROUP_COLORS.map(color=>`<button type="button" class="group-color-swatch ${groupEdit.color===color?"on":""}" data-group-color="${color}" style="background:${color}" aria-label="모둠 색상 ${color}"></button>`).join("");
  root.querySelectorAll("[data-group-color]").forEach(button=>button.onclick=()=>{groupEdit.color=button.dataset.groupColor;$("groupColor").value=groupEdit.color;renderGroupPalette();renderLayout()});
}
function renderGroups(){
  const root=$("groupList");
  if(!classState.groups.length){root.innerHTML='<div class="student-inspector-empty">아직 모둠이 없습니다.</div>';return}
  root.innerHTML=classState.groups.map((g,index)=>`<div class="group-row"><div class="group-row-head"><div><strong><span style="color:${groupColor(index,g)}">●</span> ${escapeHtml(g.name)}</strong><small>${g.seatIds.length}석</small></div><div class="group-row-actions"><button type="button" data-edit-group="${g.id}">편집</button><button type="button" class="delete" data-delete-group="${g.id}">삭제</button></div></div></div>`).join("");
  root.querySelectorAll("[data-edit-group]").forEach(button=>button.onclick=()=>startGroupEdit(button.dataset.editGroup));
  root.querySelectorAll("[data-delete-group]").forEach(button=>button.onclick=()=>deleteGroup(button.dataset.deleteGroup));
}
function startGroupEdit(id=null){
  if(historyView)return;
  const existing=id?classState.groups.find(g=>g.id===id):null;
  groupEdit={active:true,id:existing?.id||null,name:existing?.name||`${classState.groups.length+1}모둠`,color:existing?.color||GROUP_COLORS[classState.groups.length%GROUP_COLORS.length],seatIds:new Set(existing?.seatIds||[]),painting:false,mode:"add"};
  $("groupEditor").classList.remove("hidden");$("groupName").value=groupEdit.name;$("groupColor").value=groupEdit.color;renderGroupPalette();updateGroupSelectionCount();activateDock("groups");renderLayout();
}
function cancelGroupEdit(){groupEdit={active:false,id:null,name:"",color:GROUP_COLORS[0],seatIds:new Set(),painting:false,mode:"add"};$("groupEditor").classList.add("hidden");renderLayout()}
function updateGroupSelectionCount(){$("groupSelectionCount").textContent=`선택 ${groupEdit.seatIds.size}석`}
function refreshGroupSelectionClasses(){
  document.querySelectorAll(".layout-cell[data-seat-id]").forEach(el=>el.classList.toggle("group-selected",groupEdit.active&&groupEdit.seatIds.has(el.dataset.seatId)));
}
function beginGroupPaint(seatId){
  if(!groupEdit.active||historyView)return;
  groupEdit.painting=true;groupEdit.mode=groupEdit.seatIds.has(seatId)?"remove":"add";applyGroupPaint(seatId);
}
function applyGroupPaint(seatId){
  if(!groupEdit.active||!groupEdit.painting)return;
  const valid=usableCells().some(c=>c.id===seatId);if(!valid)return;
  if(groupEdit.mode==="remove")groupEdit.seatIds.delete(seatId);else groupEdit.seatIds.add(seatId);
  updateGroupSelectionCount();refreshGroupSelectionClasses();
}
function endGroupPaint(){groupEdit.painting=false}
function saveGroup(){
  if(!groupEdit.active||historyView)return;
  const name=$("groupName").value.trim().slice(0,20)||`${classState.groups.length+1}모둠`,color=/^#[0-9a-fA-F]{6}$/.test($("groupColor").value)?$("groupColor").value:groupEdit.color,seatIds=[...groupEdit.seatIds];
  if(!seatIds.length){alert("모둠에 포함할 좌석을 하나 이상 선택하세요.");return}
  const targetId=groupEdit.id||nowId("group");
  classState.groups.forEach(g=>{if(g.id!==targetId)g.seatIds=g.seatIds.filter(id=>!groupEdit.seatIds.has(id))});
  const existing=classState.groups.find(g=>g.id===targetId);
  if(existing){existing.name=name;existing.color=color;existing.seatIds=seatIds}else classState.groups.push({id:targetId,name,color,seatIds});
  classState.groups=classState.groups.filter(g=>g.seatIds.length);
  groupEdit={active:false,id:null,name:"",color:GROUP_COLORS[0],seatIds:new Set(),painting:false,mode:"add"};$("groupEditor").classList.add("hidden");
  invalidateConfirmed("모둠 구성이 바뀌어 기존 확정 배치를 해제했습니다.");saveState();renderGroups();renderLayout();applyRuleGating();
}
function deleteGroup(id){
  if(historyView)return;
  const group=classState.groups.find(g=>g.id===id);if(!group)return;
  if(!confirm(`‘${group.name}’ 모둠을 삭제할까요? 좌석 자체는 삭제되지 않습니다.`))return;
  classState.groups=classState.groups.filter(g=>g.id!==id);invalidateConfirmed("모둠 구성이 바뀌어 기존 확정 배치를 해제했습니다.");saveState();renderGroups();renderLayout();applyRuleGating();
}


function historyByRound(){
  return [...classState.history].sort((a,b)=>(Number(a.round)||0)-(Number(b.round)||0));
}
function latestHistoryRecord(){
  return historyByRound().at(-1)||null;
}
function assignmentsEqual(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;
  const map=new Map(a.map(x=>[x.studentId,x.seatId]));
  return b.every(x=>map.get(x.studentId)===x.seatId);
}
function layoutStructureSignature(layout){
  if(!layout)return"";
  const cells=(layout.cells||[]).map(c=>[
    String(c.id||""),
    Number(c.row),
    Number(c.col),
    String(c.type||"")
  ]).sort((a,b)=>a[0].localeCompare(b[0]));
  return JSON.stringify([Number(layout.rows)||0,Number(layout.cols)||0,cells]);
}
function layoutsStructurallyEqual(a,b){
  return Boolean(a&&b)&&layoutStructureSignature(a)===layoutStructureSignature(b);
}
function previousHistoryForPlayback(){
  const history=historyByRound();
  if(history.length<2)return null;

  let currentIndex=-1;
  for(let i=history.length-1;i>=0;i--){
    const currentLayout=history[i].layoutSnapshot||classState.layout;
    if(assignmentsEqual(history[i].assignments,classState.assignments)&&layoutsStructurallyEqual(currentLayout,classState.layout)){
      currentIndex=i;break;
    }
  }
  if(currentIndex<=0)return null;

  const previous=history[currentIndex-1];
  if(!previous?.assignments?.length||!previous.layoutSnapshot)return null;
  if(!layoutsStructurallyEqual(previous.layoutSnapshot,classState.layout))return null;
  return previous;
}
function layoutCellMap(layout){
  return new Map((layout?.cells||[]).map(c=>[c.id,c]));
}
function backRowStudentsFromHistory(history){
  if(!history?.assignments?.length)return new Set();
  const layout=history.layoutSnapshot||classState.layout;
  const usable=(layout?.cells||[]).filter(isUsable);
  if(!usable.length)return new Set();
  const backRow=Math.max(...usable.map(c=>c.row)),cells=layoutCellMap(layout),ids=new Set();
  history.assignments.forEach(a=>{if(cells.get(a.seatId)?.row===backRow)ids.add(a.studentId)});
  return ids;
}

/* Rules and allocator */
function bindRules(){
  [["ruleRandom","completeRandom"],["ruleGender","genderSeats"],["ruleApart","apartStudents"],["ruleGroupBalance","groupBalance"],["ruleBackRow","backRowNoRepeat"],["ruleRecentGroupmates","recentGroupmatesAvoid"]].forEach(([id,key])=>{
    $(id).checked=Boolean(classState.rules[key]);
    $(id).onchange=()=>{classState.rules[key]=$(id).checked;applyRuleGating();saveState();setAssignmentStatus("규칙 변경됨 · 다음 새 배치부터 반영됩니다.")};
  });
  $("ruleFixed").disabled=true;
  applyRuleGating();
}
function applyRuleGating(){
  const random=$("ruleRandom").checked;classState.rules.completeRandom=random;
  const groupAvailable=classState.groups.length>0;
  const latestHistory=latestHistoryRecord();
  const historyAvailable=Boolean(latestHistory?.assignments?.length);
  const historyGroupAvailable=Boolean(
    historyAvailable&&
    Array.isArray(latestHistory?.groupsSnapshot)&&
    latestHistory.groupsSnapshot.length
  );
  const fixedCount=classState.students.filter(student=>student.fixedSeatId).length;

  [
    ["ruleGender","genderSeats",false],
    ["ruleApart","apartStudents",false],
    ["ruleGroupBalance","groupBalance",!groupAvailable],
    ["ruleBackRow","backRowNoRepeat",!historyAvailable],
    ["ruleRecentGroupmates","recentGroupmatesAvoid",!groupAvailable||!historyGroupAvailable]
  ].forEach(([id,key,extraDisabled])=>{
    const box=$(id),disabled=random||extraDisabled;
    box.disabled=disabled;
    if(disabled){box.checked=false;classState.rules[key]=false}else classState.rules[key]=box.checked;
    const card=document.querySelector(`[data-rule="${key}"]`);
    card.classList.toggle("disabled",disabled);
    card.classList.toggle("active",!disabled&&box.checked);
  });

  const fixedBox=$("ruleFixed"),fixedCard=document.querySelector('[data-rule="fixedSeats"]');
  classState.rules.fixedSeats=fixedCount>0;
  fixedBox.checked=fixedCount>0;fixedBox.disabled=true;
  fixedCard.classList.toggle("disabled",fixedCount===0);
  fixedCard.classList.toggle("active",fixedCount>0);

  document.querySelector('[data-rule="completeRandom"]').classList.toggle("active",random);
  $("apartNotice").classList.toggle("hidden",!classState.rules.apartStudents);
  $("groupBalanceNotice").classList.toggle("hidden",groupAvailable||random);
  $("backRowNotice").classList.toggle("hidden",historyAvailable||random);
  $("recentGroupmatesNotice").classList.toggle("hidden",(groupAvailable&&historyGroupAvailable)||random);

  const labels=[];
  if(random)labels.push("완전 랜덤");
  else{
    if(classState.rules.genderSeats)labels.push("남녀 자리 구분");
    if(classState.rules.apartStudents)labels.push("떨어뜨릴 학생 · 외곽 우선");
    if(classState.rules.groupBalance)labels.push("모둠 균형 배치");
    if(classState.rules.backRowNoRepeat)labels.push("맨뒷자리 연속 피하기");
    if(classState.rules.recentGroupmatesAvoid)labels.push("최근 모둠원 피하기 · 약");
    if(!labels.length&&!fixedCount)labels.push("조건 없음");
  }
  if(fixedCount)labels.push(`고정석 ${fixedCount}명`);
  $("ruleSummary").innerHTML=labels.map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join("");
}
function compatible(student,seat,useGender){
  if(!useGender)return true;
  if(seat.type==="male")return student.gender==="male";
  if(seat.type==="female")return student.gender==="female";
  return true;
}

function apartInvolvedIds(){
  const ids=new Set();
  classState.students.forEach(s=>{
    if((s.apartFrom||[]).length)ids.add(s.id);
    (s.apartFrom||[]).forEach(id=>ids.add(id));
  });
  return ids;
}
function apartPairs(){
  const pairs=[],seen=new Set();
  classState.students.forEach(s=>(s.apartFrom||[]).forEach(other=>{
    const key=[s.id,other].sort().join("|");
    if(!seen.has(key)){seen.add(key);pairs.push([s.id,other])}
  }));
  return pairs;
}
function seatGeometry(){
  const seats=usableCells();
  if(!seats.length)return{minCol:0,maxCol:0,minRow:0,maxRow:0,center:0,maxDistance:1};
  const minCol=Math.min(...seats.map(s=>s.col)),maxCol=Math.max(...seats.map(s=>s.col));
  const minRow=Math.min(...seats.map(s=>s.row)),maxRow=Math.max(...seats.map(s=>s.row));
  return{
    minCol,maxCol,minRow,maxRow,
    center:(minCol+maxCol)/2,
    maxDistance:Math.max(1,Math.hypot(maxCol-minCol,(maxRow-minRow)*1.15))
  };
}
function groupIdForSeatId(seatId){
  const group=classState.groups.find(g=>(g.seatIds||[]).includes(seatId));
  return group?.id||null;
}
function apartRelationSets(){
  return classState.students
    .map(owner=>({
      ownerId:owner.id,
      targetIds:[...new Set((owner.apartFrom||[]).filter(id=>id&&id!==owner.id))]
    }))
    .filter(rel=>rel.targetIds.length);
}
function historyGroupByStudent(history){
  const result=new Map();
  if(!history?.assignments?.length||!history?.groupsSnapshot?.length)return result;

  const groupBySeat=new Map();
  for(const group of history.groupsSnapshot){
    for(const seatId of group.seatIds||[])groupBySeat.set(seatId,group.id);
  }
  for(const assignment of history.assignments){
    const groupId=groupBySeat.get(assignment.seatId);
    if(groupId)result.set(assignment.studentId,groupId);
  }
  return result;
}
function previousTogetherTargetPairs(){
  const history=latestHistoryRecord();
  const priorGroup=historyGroupByStudent(history);
  const pairs=new Set();

  for(const rel of apartRelationSets()){
    for(let i=0;i<rel.targetIds.length;i++){
      for(let j=i+1;j<rel.targetIds.length;j++){
        const a=rel.targetIds[i],b=rel.targetIds[j];
        const ga=priorGroup.get(a),gb=priorGroup.get(b);
        if(ga&&gb&&ga===gb)pairs.add([a,b].sort().join("|"));
      }
    }
  }
  return pairs;
}
function wereTargetsTogetherPreviously(a,b){
  return previousTogetherTargetPairs().has([a,b].sort().join("|"));
}
function incomingApartRelations(studentId){
  return apartRelationSets().filter(rel=>rel.targetIds.includes(studentId));
}
function relatedTargetGroupPenalty(student,seat,assignedSeatByStudent){
  if(!classState.groups.length)return 0;
  const candidateGroup=groupIdForSeatId(seat.id);
  if(!candidateGroup)return 0;

  let penalty=0;
  const previousPairs=previousTogetherTargetPairs();

  for(const rel of incomingApartRelations(student.id)){
    const siblingGroups=[];
    for(const siblingId of rel.targetIds){
      if(siblingId===student.id)continue;
      const siblingSeat=assignedSeatByStudent.get(siblingId);
      if(!siblingSeat)continue;
      const gid=groupIdForSeatId(siblingSeat.id);
      if(gid)siblingGroups.push({id:siblingId,groupId:gid});
    }

    // History rule:
    // If two targets were in the same group last time, do not place that same pair
    // together again when a different-group solution exists.
    for(const sibling of siblingGroups){
      const key=[student.id,sibling.id].sort().join("|");
      if(previousPairs.has(key)&&sibling.groupId===candidateGroup)penalty+=15000;
    }

    if(rel.targetIds.length>=3){
      // Keep the user's earlier 1:3+ rule: up to two targets may share a group.
      const sameCount=siblingGroups.filter(x=>x.groupId===candidateGroup).length;
      if(sameCount>=2)penalty+=5000+(sameCount-2)*1200;
    }

    // For 1:2 there is NO blanket same-group penalty anymore.
    // They may share this round unless they were together in the previous history.
  }
  return penalty;
}
function apartGroupDistributionPenalty(assignments){
  if(!classState.rules.apartStudents||!classState.groups.length)return 0;

  const seatByStudent=new Map();
  for(const a of assignments){
    const cell=classState.layout.cells.find(c=>c.id===a.seatId);
    if(cell)seatByStudent.set(a.studentId,cell);
  }

  const previousPairs=previousTogetherTargetPairs();
  let repeatViolations=0;
  let concentrationViolations=0;
  let soft=0;

  for(const rel of apartRelationSets()){
    if(rel.targetIds.length===1)continue; // 1:1 = distance only

    // Pairwise history anti-repeat for BOTH 1:2 and 1:3+.
    for(let i=0;i<rel.targetIds.length;i++){
      for(let j=i+1;j<rel.targetIds.length;j++){
        const a=rel.targetIds[i],b=rel.targetIds[j];
        const key=[a,b].sort().join("|");
        if(!previousPairs.has(key))continue;

        const sa=seatByStudent.get(a),sb=seatByStudent.get(b);
        if(!sa||!sb)continue;
        const ga=groupIdForSeatId(sa.id),gb=groupIdForSeatId(sb.id);
        if(ga&&gb&&ga===gb)repeatViolations++;
      }
    }

    if(rel.targetIds.length>=3){
      // Preserve prior 1:3+ concentration rule: current group may contain at most 2 targets.
      const counts=new Map();
      for(const id of rel.targetIds){
        const seat=seatByStudent.get(id);
        if(!seat)continue;
        const gid=groupIdForSeatId(seat.id);
        if(gid)counts.set(gid,(counts.get(gid)||0)+1);
      }
      for(const count of counts.values()){
        if(count>2)concentrationViolations+=count-2;
      }

      const groups=[...counts.keys()];
      if(groups.length>=1&&rel.targetIds.length>=3){
        // When legal, slightly prefer spreading across more than one group.
        soft+=Math.max(0,2-groups.length)*40;
      }
    }

    // 1:2 has no same-group penalty unless that exact pair was together last time.
  }

  // History repeat is effectively forced when a zero-repeat arrangement is feasible.
  // Concentration for 1:3+ is next priority.
  return repeatViolations*1000000+concentrationViolations*250000+soft;
}
function apartRelationshipCount(student){
  const outgoing=(student.apartFrom||[]).length;
  const incoming=classState.students.filter(s=>(s.apartFrom||[]).includes(student.id)).length;
  return outgoing+incoming;
}
function buildApartSidePlan(referenceAssignments=[]){
  const plan=new Map();
  const geometry=seatGeometry();
  const seatById=new Map(usableCells().map(s=>[s.id,s]));
  const refByStudent=new Map((referenceAssignments||[]).map(a=>[a.studentId,seatById.get(a.seatId)]));

  for(const rel of apartRelationSets()){
    const previousSeat=refByStudent.get(rel.ownerId);
    if(previousSeat){
      const previousSide=seatSideValue(previousSeat,geometry);
      if(Math.abs(previousSide)>.08){
        // Repeated "새 배치" clicks alternate the preferred half instead of
        // allowing the optimizer to collapse to the same left-side minimum.
        plan.set(rel.ownerId,previousSide<0?1:-1);
        continue;
      }
    }
    plan.set(rel.ownerId,Math.random()<.5?-1:1);
  }
  return plan;
}
function seatSideValue(seat,geometry){
  const half=Math.max(.5,(geometry.maxCol-geometry.minCol)/2);
  return Math.max(-1,Math.min(1,(seat.col-geometry.center)/half));
}
function blankSeatReferenceIds(referenceAssignments=[]){
  const occupied=new Set((referenceAssignments||[]).map(a=>a.seatId));
  return new Set(usableCells().filter(seat=>!occupied.has(seat.id)).map(seat=>seat.id));
}
function chooseReservedEmptySeats(referenceAssignments=[],useGender=false){
  const seats=usableCells();
  const surplus=Math.max(0,seats.length-classState.students.length);
  if(!surplus)return new Set();

  const fixedSeatIds=new Set(classState.students.map(s=>s.fixedSeatId).filter(Boolean));
  const previousBlankIds=blankSeatReferenceIds(referenceAssignments);
  const selected=[];
  const groupBlankCounts=new Map();

  for(let n=0;n<surplus;n++){
    const candidates=seats
      .filter(seat=>!fixedSeatIds.has(seat.id)&&!selected.includes(seat.id))
      .map(seat=>{
        const group=groupForSeat(seat.id,classState.groups);
        const groupId=group?.id||null;
        const sameGroupBlanks=groupId?(groupBlankCounts.get(groupId)||0):0;

        let score=0;

        // First priority: if the teacher is already looking at blank seats in the
        // current preview/confirmed arrangement, keep those seats blank.
        if(previousBlankIds.has(seat.id))score-=1000;

        // Prefer leaving a non-group seat empty so group capacities are disturbed less.
        if(!groupId)score-=220;
        else score+=sameGroupBlanks*140;

        // When gender-seat rules matter, preserve dedicated male/female seats and
        // reserve general seats first.
        if(useGender){
          if(seat.type==="seat")score-=170;
          else score+=180;
        }else if(seat.type==="seat"){
          score-=45;
        }

        // Small jitter only breaks genuinely equivalent reserve choices.
        score+=Math.random()*20;
        return{seat,score,groupId};
      })
      .sort((a,b)=>a.score-b.score);

    if(!candidates.length)break;

    // Keep existing blank seats very stable. Otherwise allow a few equivalent choices
    // so a candidate can recover if one reserve pattern blocks full matching.
    const best=candidates[0].score;
    const nearBest=candidates.filter(x=>x.score<=best+35).slice(0,5);
    const pick=nearBest[Math.floor(Math.random()*nearBest.length)]||candidates[0];

    selected.push(pick.seat.id);
    if(pick.groupId)groupBlankCounts.set(pick.groupId,(groupBlankCounts.get(pick.groupId)||0)+1);
  }

  return new Set(selected);
}
function completeRemainingMatching(remaining,availableSeats,useGender){
  if(!remaining.length)return{ok:true,pairs:[]};
  if(availableSeats.length<remaining.length)return{ok:false,pairs:[]};

  const students=shuffled([...remaining]);
  const seatById=new Map(availableSeats.map(s=>[s.id,s]));
  const candidateSeatIds=new Map();
  const previousBack=previousBackRowStudentSet();

  for(const student of students){
    const compatibleSeats=availableSeats.filter(seat=>compatible(student,seat,useGender));
    compatibleSeats.sort((a,b)=>{
      if(classState.rules.backRowNoRepeat&&previousBack.has(student.id)){
        const ab=isCurrentBackRowSeat(a)?1:0,bb=isCurrentBackRowSeat(b)?1:0;
        if(ab!==bb)return ab-bb;
      }
      const ar=a.type==="seat"?1:0,br=b.type==="seat"?1:0;
      if(ar!==br)return ar-br;
      return Math.random()-.5;
    });
    candidateSeatIds.set(student.id,compatibleSeats.map(s=>s.id));
  }

  const ownerBySeat=new Map();
  function visit(student,seen){
    for(const seatId of candidateSeatIds.get(student.id)||[]){
      if(seen.has(seatId))continue;
      seen.add(seatId);
      const current=ownerBySeat.get(seatId);
      if(!current||visit(current,seen)){
        ownerBySeat.set(seatId,student);
        return true;
      }
    }
    return false;
  }

  for(const student of students){
    if(!visit(student,new Set()))return{ok:false,pairs:[]};
  }

  return{
    ok:true,
    pairs:[...ownerBySeat.entries()].map(([seatId,student])=>({student,seat:seatById.get(seatId)}))
  };
}
function seatHalf(seat,geometry){
  const delta=seat.col-geometry.center;
  if(delta<-.01)return-1;
  if(delta>.01)return 1;
  return 0;
}
function assignedApartOwnersFor(studentId,assignedSeatByStudent){
  const owners=[];
  for(const rel of apartRelationSets()){
    if(!rel.targetIds.includes(studentId))continue;
    const seat=assignedSeatByStudent.get(rel.ownerId);
    if(seat)owners.push({ownerId:rel.ownerId,seat});
  }
  return owners;
}
function usableColumnBands(){
  return [...new Set(usableCells().map(seat=>seat.col))].sort((a,b)=>a-b);
}
function outerZoneColumns(){
  const cols=usableColumnBands();
  if(!cols.length)return{left:new Set(),right:new Set(),center:new Set()};

  let sideCount;
  if(cols.length>=4)sideCount=2;
  else if(cols.length>=2)sideCount=1;
  else sideCount=1;

  const left=new Set(cols.slice(0,sideCount));
  const right=new Set(cols.length===1?[]:cols.slice(-sideCount));
  const center=new Set(cols.filter(c=>!left.has(c)&&!right.has(c)));
  return{left,right,center};
}
function areAdjacentDeskMateSeats(a,b){
  return Boolean(
    a&&b&&
    isUsable(a)&&isUsable(b)&&
    a.row===b.row&&
    Math.abs(a.col-b.col)===1
  );
}
function relatedApartStudentIds(studentId){
  const ids=new Set();
  for(const [a,b] of apartPairs()){
    if(a===studentId)ids.add(b);
    else if(b===studentId)ids.add(a);
  }
  return ids;
}
function wouldBreakApartAdjacency(student,seat,assignedSeatByStudent){
  for(const otherId of relatedApartStudentIds(student.id)){
    const otherSeat=assignedSeatByStudent.get(otherId);
    if(otherSeat&&areAdjacentDeskMateSeats(seat,otherSeat))return true;
  }
  return false;
}
function apartAdjacencyConflicts(assignments){
  const seatById=new Map(usableCells().map(s=>[s.id,s]));
  const seatByStudent=new Map(assignments.map(a=>[a.studentId,seatById.get(a.seatId)]));
  const conflicts=[];
  for(const [a,b] of apartPairs()){
    const sa=seatByStudent.get(a),sb=seatByStudent.get(b);
    if(sa&&sb&&areAdjacentDeskMateSeats(sa,sb))conflicts.push([a,b]);
  }
  return conflicts;
}
function studentNameById(id){
  return classState.students.find(s=>s.id===id)?.name||"학생";
}
function ownerPreferredOuterSide(student,referenceAssignments=[]){
  const zones=outerZoneColumns();
  const refMap=new Map((referenceAssignments||[]).map(a=>[a.studentId,a.seatId]));
  const seatById=new Map(usableCells().map(s=>[s.id,s]));
  const previousSeat=seatById.get(refMap.get(student.id));

  if(previousSeat){
    if(zones.left.has(previousSeat.col))return"right";
    if(zones.right.has(previousSeat.col))return"left";
  }
  return Math.random()<.5?"left":"right";
}
function filterToOuterSide(candidates,side){
  const zones=outerZoneColumns();
  const allowed=side==="left"?zones.left:zones.right;
  const filtered=candidates.filter(seat=>allowed.has(seat.col));
  return filtered.length?filtered:candidates;
}
function preferNonBackRowCandidates(student,candidates){
  if(!classState.rules.backRowNoRepeat)return candidates;
  if(!previousBackRowStudentSet().has(student.id))return candidates;
  const nonBack=candidates.filter(seat=>!isCurrentBackRowSeat(seat));
  return nonBack.length?nonBack:candidates;
}
function oppositeHalfCandidates(student,candidates,assignedSeatByStudent,geometry){
  const owners=assignedApartOwnersFor(student.id,assignedSeatByStudent);
  if(!owners.length)return candidates;

  const zones=outerZoneColumns();
  const preferred=candidates.filter(seat=>{
    return owners.every(({seat:ownerSeat})=>{
      if(zones.left.has(ownerSeat.col))return zones.right.has(seat.col);
      if(zones.right.has(ownerSeat.col))return zones.left.has(seat.col);
      return false;
    });
  });

  return preferred.length?preferred:candidates;
}
function previousBackRowStudentSet(){
  return backRowStudentsFromHistory(latestHistoryRecord());
}
function isCurrentBackRowSeat(seat){
  const seats=usableCells();
  if(!seats.length)return false;
  const backRow=Math.max(...seats.map(s=>s.row));
  return seat.row===backRow;
}
function backRowCandidatePenalty(student,seat){
  if(!classState.rules.backRowNoRepeat)return 0;
  if(!previousBackRowStudentSet().has(student.id))return 0;
  return isCurrentBackRowSeat(seat)?12000:0;
}
function apartGreedySeatScore(student,seat,assignedSeatByStudent,geometry){
  let score=backRowCandidatePenalty(student,seat);

  // No left/right/edge pressure on the relation owner.
  // For targets, opposite-half filtering is handled before scoring.
  if(seat.type!=="seat")score-=6;

  // Keep only a light physical-distance preference inside the opposite half.
  for(const otherId of student.apartFrom||[]){
    const other=assignedSeatByStudent.get(otherId);
    if(!other)continue;
    const d=Math.hypot(seat.col-other.col,(seat.row-other.row)*1.15);
    score-=d*35;
  }
  for(const otherStudent of classState.students){
    if(!(otherStudent.apartFrom||[]).includes(student.id))continue;
    const other=assignedSeatByStudent.get(otherStudent.id);
    if(!other)continue;
    const d=Math.hypot(seat.col-other.col,(seat.row-other.row)*1.15);
    score-=d*35;
  }

  // Preserve the history-based group-repeat rule, but let back-row avoidance
  // remain stronger than ordinary apart distance.
  score+=relatedTargetGroupPenalty(student,seat,assignedSeatByStudent);

  return score+Math.random()*25;
}
function apartOwnerSidePreferenceScore(assignments,sidePlan){
  if(!sidePlan||!sidePlan.size)return 0;
  const geometry=seatGeometry();
  const cellById=new Map(usableCells().map(c=>[c.id,c]));
  const seatByStudent=new Map(assignments.map(a=>[a.studentId,cellById.get(a.seatId)]));
  let score=0;

  for(const [ownerId,preferredSide] of sidePlan.entries()){
    const seat=seatByStudent.get(ownerId);
    if(!seat)continue;
    const sideValue=seatSideValue(seat,geometry);
    const sideProduct=preferredSide*sideValue;

    // Penalize only being in the opposite half. No penalty difference between
    // near-edge and far-edge positions on the correct half.
    if(sideProduct<-.05)score+=4200;
    else if(Math.abs(sideValue)<=.12)score+=250;
  }
  return score;
}
function apartPlacementScore(assignments){
  if(!classState.rules.apartStudents)return 0;
  const zones=outerZoneColumns();
  const cellById=new Map(usableCells().map(c=>[c.id,c]));
  const seatByStudent=new Map(assignments.map(a=>[a.studentId,cellById.get(a.seatId)]));
  let score=0;

  if(apartAdjacencyConflicts(assignments).length)score+=100000000;

  for(const rel of apartRelationSets()){
    const ownerSeat=seatByStudent.get(rel.ownerId);
    if(!ownerSeat)continue;

    if(!zones.left.has(ownerSeat.col)&&!zones.right.has(ownerSeat.col))score+=12000;

    for(const targetId of rel.targetIds){
      const targetSeat=seatByStudent.get(targetId);
      if(!targetSeat)continue;

      const opposite=
        (zones.left.has(ownerSeat.col)&&zones.right.has(targetSeat.col))||
        (zones.right.has(ownerSeat.col)&&zones.left.has(targetSeat.col));

      if(!opposite)score+=7000;

      const d=Math.hypot(ownerSeat.col-targetSeat.col,(ownerSeat.row-targetSeat.row)*1.15);
      score+=Math.max(0,3.5-d)*35;
    }
  }

  return score;
}
function backRowRepeatScore(assignments){
  if(!classState.rules.backRowNoRepeat)return 0;
  const previous=latestHistoryRecord(),previousBack=backRowStudentsFromHistory(previous);
  if(!previousBack.size)return 0;
  const seats=usableCells();if(!seats.length)return 0;
  const backRow=Math.max(...seats.map(s=>s.row)),cellById=new Map(seats.map(c=>[c.id,c]));
  let score=0;
  assignments.forEach(a=>{
    if(previousBack.has(a.studentId)&&cellById.get(a.seatId)?.row===backRow)score+=30000;
  });
  return score;
}
function buildAssignmentCandidate(blankReference=[]){
  const seats=usableCells(),seatMap=new Map(seats.map(s=>[s.id,s])),occupied=new Set(),placed=new Set(),assignments=[];
  const useGender=!classState.rules.completeRandom&&classState.rules.genderSeats;
  const useApart=!classState.rules.completeRandom&&classState.rules.apartStudents;
  const assignedSeatByStudent=new Map();
  const reservedEmptySeatIds=chooseReservedEmptySeats(blankReference,useGender);

  const expectedSurplus=Math.max(0,seats.length-classState.students.length);
  if(reservedEmptySeatIds.size!==expectedSurplus){
    return{valid:false,hardFail:false,assignments:[],remaining:[...classState.students],reservedEmptySeatIds,reason:"빈 좌석 예약을 완성할 수 없어 다른 후보를 찾습니다."};
  }

  for(const s of classState.students){
    if(!s.fixedSeatId)continue;
    const seat=seatMap.get(s.fixedSeatId);
    if(!seat)return{valid:false,hardFail:true,assignments:[],remaining:[...classState.students],reservedEmptySeatIds,reason:`${s.name} 학생의 고정석이 현재 레이아웃에서 사용할 수 없습니다.`};
    if(reservedEmptySeatIds.has(seat.id))return{valid:false,hardFail:false,assignments:[],remaining:[...classState.students],reservedEmptySeatIds,reason:"고정석과 빈 좌석 예약이 겹쳐 다른 빈 좌석 후보를 찾습니다."};
    if(occupied.has(seat.id))return{valid:false,hardFail:true,assignments:[],remaining:[...classState.students],reservedEmptySeatIds,reason:`${s.name} 학생의 고정석이 다른 학생의 고정석과 충돌합니다.`};
    if(!compatible(s,seat,useGender))return{valid:false,hardFail:true,assignments:[],remaining:[...classState.students],reservedEmptySeatIds,reason:`${s.name} 학생의 고정석과 현재 남녀 좌석 조건이 충돌합니다.`};
    assignments.push({studentId:s.id,seatId:seat.id});
    occupied.add(seat.id);placed.add(s.id);assignedSeatByStudent.set(s.id,seat);
  }

  if(useApart){
    const fixedConflicts=apartAdjacencyConflicts(assignments);
    if(fixedConflicts.length){
      const [a,b]=fixedConflicts[0];
      return{
        valid:false,
        hardFail:true,
        assignments:[],
        remaining:[...classState.students],
        reservedEmptySeatIds,
        reason:`${studentNameById(a)} 학생과 ${studentNameById(b)} 학생의 고정석이 붙어 있는 짝꿍 자리라 회피 규칙을 지킬 수 없습니다.`
      };
    }
  }

  let remaining=shuffled(classState.students.filter(s=>!placed.has(s.id)));

  if(useApart){
    const involved=apartInvolvedIds(),geometry=seatGeometry();

    const priority=remaining.filter(s=>involved.has(s.id)).sort((a,b)=>{
      const aOut=(a.apartFrom||[]).length,bOut=(b.apartFrom||[]).length;
      if(aOut!==bOut)return bOut-aOut;
      const ar=apartRelationshipCount(a),br=apartRelationshipCount(b);
      return br-ar||Math.random()-.5;
    });

    for(const student of priority){
      let candidates=seats.filter(seat=>
        !reservedEmptySeatIds.has(seat.id)&&
        !occupied.has(seat.id)&&
        compatible(student,seat,useGender)&&
        !wouldBreakApartAdjacency(student,seat,assignedSeatByStudent)
      );

      if(!candidates.length){
        return{
          valid:false,
          hardFail:false,
          assignments:[],
          remaining:[...remaining],
          reservedEmptySeatIds,
          reason:`${student.name} 학생의 회피 관계를 지키면서 붙지 않는 좌석을 찾지 못해 다른 후보를 찾습니다.`
        };
      }

      // Priority: never repeat the back row if another legal seat exists.
      candidates=preferNonBackRowCandidates(student,candidates);

      const isOwner=(student.apartFrom||[]).length>0;
      if(isOwner){
        // Owner goes to left two or right two usable columns when possible.
        const side=ownerPreferredOuterSide(student,blankReference);
        candidates=filterToOuterSide(candidates,side);
      }else{
        // Target goes to the opposite two usable columns of its owner.
        candidates=oppositeHalfCandidates(student,candidates,assignedSeatByStudent,geometry);
      }

      const ranked=candidates
        .map(seat=>({
          seat,
          score:apartGreedySeatScore(student,seat,assignedSeatByStudent,geometry)
        }))
        .sort((a,b)=>a.score-b.score);

      const bestScore=ranked[0].score;
      const nearBest=ranked.filter(x=>x.score<=bestScore+80).slice(0,6);
      const pick=nearBest[Math.floor(Math.random()*nearBest.length)]||ranked[0];
      const seat=pick.seat;

      assignments.push({studentId:student.id,seatId:seat.id});
      occupied.add(seat.id);placed.add(student.id);assignedSeatByStudent.set(student.id,seat);
    }

    remaining=remaining.filter(s=>!placed.has(s.id));
  }

  const availableSeats=seats.filter(s=>!reservedEmptySeatIds.has(s.id)&&!occupied.has(s.id));
  const matching=completeRemainingMatching(remaining,availableSeats,useGender);

  if(!matching.ok){
    return{valid:false,hardFail:false,assignments:[],remaining:[...remaining],reservedEmptySeatIds,reason:"이 빈 좌석/회피 조합에서는 전원 배치가 어려워 다른 후보를 찾습니다."};
  }

  for(const {student,seat} of matching.pairs){
    assignments.push({studentId:student.id,seatId:seat.id});
    occupied.add(seat.id);placed.add(student.id);assignedSeatByStudent.set(student.id,seat);
  }

  if(assignments.length!==classState.students.length){
    return{valid:false,hardFail:false,assignments:[],remaining:classState.students.filter(s=>!placed.has(s.id)),reservedEmptySeatIds,reason:"학생 전원 배치 검증에 실패해 다른 후보를 찾습니다."};
  }

  if(assignments.some(a=>reservedEmptySeatIds.has(a.seatId))){
    return{valid:false,hardFail:false,assignments:[],remaining:[...classState.students],reservedEmptySeatIds,reason:"예약 빈 좌석 침범이 감지되어 다른 후보를 찾습니다."};
  }

  if(useApart){
    const conflicts=apartAdjacencyConflicts(assignments);
    if(conflicts.length){
      return{
        valid:false,
        hardFail:false,
        assignments:[],
        remaining:[...classState.students],
        reservedEmptySeatIds,
        reason:"붙어 있는 짝꿍 좌석에 회피 관계 학생이 배치되어 후보를 폐기합니다."
      };
    }
  }

  return{valid:true,hardFail:false,assignments,remaining:[],reservedEmptySeatIds};
}
function groupBalanceScore(assignments){
  if(!classState.groups.length)return 0;
  const byStudent=new Map(classState.students.map(s=>[s.id,s])),bySeat=new Map(assignments.map(a=>[a.seatId,a.studentId]));
  const overall={A:0,B:0,C:0};let overallKnown=0;
  classState.students.forEach(s=>{if(["A","B","C"].includes(s.balanceLevel)){overall[s.balanceLevel]++;overallKnown++}});
  if(!overallKnown)return 0;
  const ratio={A:overall.A/overallKnown,B:overall.B/overallKnown,C:overall.C/overallKnown};
  let score=0;
  for(const group of classState.groups){
    const counts={A:0,B:0,C:0};let known=0;
    for(const sid of group.seatIds){
      const student=byStudent.get(bySeat.get(sid));if(!student||!["A","B","C"].includes(student.balanceLevel))continue;
      counts[student.balanceLevel]++;known++;
    }
    if(!known)continue;
    for(const level of ["A","B","C"]){const target=known*ratio[level],diff=counts[level]-target;score+=diff*diff*4}
    const max=Math.max(counts.A,counts.B,counts.C);
    if(known>=3&&max===known)score+=25+known*5;
    else if(known>=4&&max>=known-1)score+=10;
  }
  return score;
}
function previousGroupmatePairs(){
  const history=latestHistoryRecord();
  const priorGroup=historyGroupByStudent(history);
  const membersByGroup=new Map();

  for(const [studentId,groupId] of priorGroup.entries()){
    if(!membersByGroup.has(groupId))membersByGroup.set(groupId,[]);
    membersByGroup.get(groupId).push(studentId);
  }

  const pairs=new Set();
  for(const members of membersByGroup.values()){
    for(let i=0;i<members.length;i++){
      for(let j=i+1;j<members.length;j++){
        pairs.add([members[i],members[j]].sort().join("|"));
      }
    }
  }
  return pairs;
}
function recentGroupmateRepeatCount(assignments){
  if(!classState.rules.recentGroupmatesAvoid||!classState.groups.length)return 0;

  const previousPairs=previousGroupmatePairs();
  if(!previousPairs.size)return 0;

  const currentGroupByStudent=new Map();
  for(const a of assignments){
    const gid=groupIdForSeatId(a.seatId);
    if(gid)currentGroupByStudent.set(a.studentId,gid);
  }

  const students=[...currentGroupByStudent.keys()];
  let repeats=0;
  for(let i=0;i<students.length;i++){
    for(let j=i+1;j<students.length;j++){
      const a=students[i],b=students[j];
      if(currentGroupByStudent.get(a)!==currentGroupByStudent.get(b))continue;
      if(previousPairs.has([a,b].sort().join("|")))repeats++;
    }
  }
  return repeats;
}

function backRowRepeatCount(assignments){
  if(!classState.rules.backRowNoRepeat)return 0;
  const previousBack=backRowStudentsFromHistory(latestHistoryRecord());
  if(!previousBack.size)return 0;
  const seats=usableCells();
  if(!seats.length)return 0;
  const backRow=Math.max(...seats.map(s=>s.row));
  const cellById=new Map(seats.map(c=>[c.id,c]));
  let count=0;
  for(const a of assignments){
    if(previousBack.has(a.studentId)&&cellById.get(a.seatId)?.row===backRow)count++;
  }
  return count;
}
function apartOuterViolationCount(assignments){
  if(!classState.rules.apartStudents)return 0;
  const zones=outerZoneColumns();
  const cellById=new Map(usableCells().map(c=>[c.id,c]));
  const seatByStudent=new Map(assignments.map(a=>[a.studentId,cellById.get(a.seatId)]));
  let count=0;

  for(const rel of apartRelationSets()){
    const ownerSeat=seatByStudent.get(rel.ownerId);
    if(!ownerSeat)continue;

    const ownerLeft=zones.left.has(ownerSeat.col);
    const ownerRight=zones.right.has(ownerSeat.col);
    if(!ownerLeft&&!ownerRight){count++;continue}

    for(const targetId of rel.targetIds){
      const targetSeat=seatByStudent.get(targetId);
      if(!targetSeat)continue;
      const opposite=(ownerLeft&&zones.right.has(targetSeat.col))||(ownerRight&&zones.left.has(targetSeat.col));
      if(!opposite)count++;
    }
  }
  return count;
}
function apartGroupPriorityMetrics(assignments){
  const result={repeat:0,concentration:0};
  if(!classState.rules.apartStudents||!classState.groups.length)return result;

  const seatByStudent=new Map();
  for(const a of assignments){
    const cell=classState.layout.cells.find(c=>c.id===a.seatId);
    if(cell)seatByStudent.set(a.studentId,cell);
  }
  const previousPairs=previousTogetherTargetPairs();

  for(const rel of apartRelationSets()){
    if(rel.targetIds.length===1)continue;

    for(let i=0;i<rel.targetIds.length;i++){
      for(let j=i+1;j<rel.targetIds.length;j++){
        const a=rel.targetIds[i],b=rel.targetIds[j];
        const key=[a,b].sort().join("|");
        if(!previousPairs.has(key))continue;
        const sa=seatByStudent.get(a),sb=seatByStudent.get(b);
        if(!sa||!sb)continue;
        const ga=groupIdForSeatId(sa.id),gb=groupIdForSeatId(sb.id);
        if(ga&&gb&&ga===gb)result.repeat++;
      }
    }

    if(rel.targetIds.length>=3){
      const counts=new Map();
      for(const id of rel.targetIds){
        const seat=seatByStudent.get(id);
        if(!seat)continue;
        const gid=groupIdForSeatId(seat.id);
        if(gid)counts.set(gid,(counts.get(gid)||0)+1);
      }
      for(const count of counts.values()){
        if(count>2)result.concentration+=count-2;
      }
    }
  }
  return result;
}
function buildCandidatePriority(assignments,{optimizeBack,optimizeApart,optimizeGroup,optimizeRecentGroupmates}){
  const groupMetrics=optimizeApart?apartGroupPriorityMetrics(assignments):{repeat:0,concentration:0};
  const balanceScore=optimizeGroup?groupBalanceScore(assignments):0;

  // Balance remains stronger.  The recent-groupmate rule only gets a say among
  // candidates in the same broad balance band (4 points = one natural score unit
  // in the current A/B/C squared-deviation formula).
  const balanceBand=optimizeGroup?Math.floor(balanceScore/4):0;

  return[
    optimizeBack?backRowRepeatCount(assignments):0,
    optimizeApart?apartOuterViolationCount(assignments):0,
    optimizeApart?groupMetrics.repeat:0,
    optimizeApart?groupMetrics.concentration:0,
    balanceBand,
    optimizeRecentGroupmates?recentGroupmateRepeatCount(assignments):0,
    balanceScore,
    optimizeApart?apartPlacementScore(assignments):0,
    Math.random()
  ];
}

function compareCandidatePriority(a,b){
  if(!b)return-1;
  for(let i=0;i<Math.max(a.length,b.length);i++){
    const av=Number(a[i]??0),bv=Number(b[i]??0);
    if(av<bv)return-1;
    if(av>bv)return 1;
  }
  return 0;
}

function generateAssignment(){
  if(historyView){setAssignmentStatus("과거보기 모드에서는 새 배치를 만들 수 없습니다.");return}

  const optimizeGroup=classState.rules.groupBalance&&classState.groups.length;
  const optimizeApart=classState.rules.apartStudents&&apartPairs().length;
  const optimizeBack=classState.rules.backRowNoRepeat&&backRowStudentsFromHistory(latestHistoryRecord()).size;
  const optimizeRecentGroupmates=Boolean(
    classState.rules.recentGroupmatesAvoid&&
    classState.groups.length&&
    previousGroupmatePairs().size
  );

  const maxTargets=Math.max(0,...apartRelationSets().map(rel=>rel.targetIds.length));
  const attempts=optimizeApart?(maxTargets>=2?900:600):(optimizeGroup||optimizeBack?360:1);

  const sideReference=previewAssignments.length?previewAssignments:classState.assignments;
  const blankReference=sideReference;

  let best=null,bestPriority=null,reason="";
  for(let i=0;i<attempts;i++){
    const candidate=buildAssignmentCandidate(blankReference);
    if(!candidate.valid){
      reason=candidate.reason;
      if(candidate.hardFail)break;
      continue;
    }

    const priority=buildCandidatePriority(candidate.assignments,{
      optimizeBack,
      optimizeApart,
      optimizeGroup,
      optimizeRecentGroupmates
    });

    if(compareCandidatePriority(priority,bestPriority)<0){
      best=candidate;
      bestPriority=priority;
    }
  }

  if(!best){
    previewAssignments=[];previewRevision=null;renderLayout();
    setAssignmentStatus(reason||"현재 조건으로 배치를 만들 수 없습니다.");
    recordUndoPoint();return;
  }

  previewAssignments=best.assignments;
  previewRevision=Date.now()+Math.random();
  renderLayout();

  const applied=[];
  if(optimizeBack)applied.push("맨뒷자리 연속 회피 우선");
  if(optimizeApart)applied.push("떨어뜨릴 학생 좌우 2열 분리·짝꿍 금지·직전 모둠 반복 회피");
  if(optimizeGroup)applied.push("모둠 균형");
  if(optimizeRecentGroupmates)applied.push("최근 모둠원 피하기 · 약");

  const reservedBlankCount=best.reservedEmptySeatIds?.size||0;
  if(reservedBlankCount)applied.push(`빈 좌석 ${reservedBlankCount}석 예약`);

  const suffix=applied.length?` · ${applied.join(" · ")} 적용`:"";
  setAssignmentStatus(`${best.assignments.length}명 새 배치 미리보기${suffix}`);
  recordUndoPoint();
}
function nextHistoryRound(){return classState.history.reduce((max,item)=>Math.max(max,Number(item.round)||0),0)+1}

function normalizedSnapshotForConfirm(assignments){
  return{
    studentsSnapshot:deepCopy(classState.students),
    layoutSnapshot:deepCopy(classState.layout),
    groupsSnapshot:deepCopy(classState.groups),
    rulesSnapshot:deepCopy(classState.rules),
    teacherAvatarSnapshot:deepCopy(classState.teacherAvatar),
    assignments:deepCopy(assignments||[])
  };
}
function snapshotEquivalentToCurrent(history,assignments){
  if(!history)return false;
  const current=normalizedSnapshotForConfirm(assignments);
  const prior={
    studentsSnapshot:history.studentsSnapshot||[],
    layoutSnapshot:history.layoutSnapshot||null,
    groupsSnapshot:history.groupsSnapshot||[],
    rulesSnapshot:history.rulesSnapshot||{},
    teacherAvatarSnapshot:history.teacherAvatarSnapshot||{},
    assignments:history.assignments||[]
  };
  return JSON.stringify(prior)===JSON.stringify(current);
}

function confirmAssignment(){
  if(historyView){setAssignmentStatus("과거보기 모드에서는 배치를 확정할 수 없습니다.");return}

  const sourceAssignments=(previewAssignments.length?previewAssignments:classState.assignments).map(a=>({...a}));
  if(!sourceAssignments.length){setAssignmentStatus("먼저 새 배치를 생성하세요.");return}

  const latest=latestHistoryRecord();
  if(snapshotEquivalentToCurrent(latest,sourceAssignments)){
    classState.assignments=sourceAssignments;
    confirmedRevision=previewRevision;
    saveState();
    setAssignmentStatus(`최근 히스토리 #${latest.round}와 동일한 확정 배치입니다.`,true);
    return;
  }

  classState.assignments=sourceAssignments;
  const snap=normalizedSnapshotForConfirm(classState.assignments);
  classState.history.push({
    id:nowId("history"),
    round:nextHistoryRound(),
    createdAt:new Date().toISOString(),
    ...snap
  });

  confirmedRevision=previewRevision;
  saveState();renderHistory();applyRuleGating();
  setAssignmentStatus(`배치 확정 완료 · 최근 히스토리 #${classState.history.at(-1).round} 저장`,true);
}
function rulesText(rules){
  if(!rules)return"기록 없음";
  if(rules.completeRandom)return"완전 랜덤";
  const out=[];if(rules.genderSeats)out.push("남녀 자리 구분");if(rules.fixedSeats)out.push("지정석");if(rules.apartStudents)out.push("떨어뜨릴 학생");if(rules.groupBalance)out.push("모둠 균형 배치");if(rules.backRowNoRepeat)out.push("맨뒷자리 연속 피하기");return out.join(" · ")||"조건 없음";
}

/* History */
function renderHistory(){
  const root=$("historyList");
  if(!classState.history.length){root.innerHTML='<div class="student-inspector-empty">확정된 배치가 없습니다.</div>';renderHistoryDetail();return}
  root.innerHTML=[...classState.history].sort((a,b)=>(Number(b.round)||0)-(Number(a.round)||0)).map(item=>`<div class="history-row ${historyView?.id===item.id?"selected":""}"><div class="history-row-main"><button type="button" data-view-history="${escapeHtml(item.id)}">#${item.round} · ${escapeHtml(formatDate(item.createdAt))}</button><button type="button" class="history-delete" data-delete-history="${escapeHtml(item.id)}">삭제</button></div><div class="history-meta">${item.assignments.length}명${item.legacy?" · V3 레거시 기록":" · 전체 스냅샷"}</div></div>`).join("");
  root.querySelectorAll("[data-view-history]").forEach(button=>button.onclick=()=>enterHistoryView(button.dataset.viewHistory));
  root.querySelectorAll("[data-delete-history]").forEach(button=>button.onclick=()=>deleteHistory(button.dataset.deleteHistory));
  renderHistoryDetail();
}
function renderHistoryDetail(){
  const root=$("historyDetail");
  if(!historyView){root.innerHTML='<span class="small-info">기록을 선택하면 당시 좌석·모둠·규칙·학생 정보가 읽기 전용으로 표시됩니다.</span>';return}
  if(historyView.legacy){root.innerHTML=`<b>#${historyView.round} · ${escapeHtml(formatDate(historyView.createdAt))}</b><div class="notice">V3에서 저장된 레거시 기록입니다. 당시에는 좌석 assignment만 저장되어 다른 과거 정보는 복원할 수 없습니다.</div>`;return}
  const groups=(historyView.groupsSnapshot||[]).map(g=>`${escapeHtml(g.name)} ${g.seatIds.length}석`).join(" · ")||"없음";
  root.innerHTML=`<b>#${historyView.round} · ${escapeHtml(formatDate(historyView.createdAt))}</b>
    <canvas id="historyTeacherCanvas" width="96" height="96" aria-label="당시 교사 아바타"></canvas>
    <div><b>당시 규칙</b><br>${escapeHtml(rulesText(historyView.rulesSnapshot))}</div>
    <div style="margin-top:6px"><b>당시 모둠</b><br>${groups}</div>
    <div class="history-private"><b>당시 학생 비공개 스냅샷</b><br>${(historyView.studentsSnapshot||[]).map(s=>`${escapeHtml(s.name)} · ${s.gender==="male"?"남":s.gender==="female"?"여":"미지정"} · ${BALANCE_LABEL[s.balanceLevel]||"미지정"}`).join("<br>")}</div>`;
  requestAnimationFrame(()=>drawAvatar($("historyTeacherCanvas"),historyView.teacherAvatarSnapshot,false,0));
}
function enterHistoryView(id){
  const item=classState.history.find(h=>h.id===id);if(!item)return;
  cancelGroupEdit();historyView=item;selectedStudentId=(item.studentsSnapshot?.[0]?.id)||classState.students[0]?.id||null;
  $("historyBanner").classList.remove("hidden");$("historyBannerTitle").textContent=item.legacy?`레거시 기록 #${item.round} · 당시 레이아웃 정보 없음`:`과거 배치 #${item.round} 보는 중`;
  activateDock("history");renderLayout();renderStudentStrip();renderStudentInspector();renderHistory();
}
function exitHistory(){
  historyView=null;selectedStudentId=classState.students[0]?.id||null;$("historyBanner").classList.add("hidden");renderLayout();renderStudentStrip();renderStudentInspector();renderHistory();
}
function deleteHistory(id){
  const item=classState.history.find(h=>h.id===id);if(!item)return;
  if(!confirm(`#${item.round} 배치 기록을 삭제할까요?\n삭제한 기록은 복구할 수 없습니다.`))return;
  classState.history=classState.history.filter(h=>h.id!==id);
  if(historyView?.id===id)exitHistory();
  saveState();renderHistory();
}

/* Avatar */
const imageCache=new Map();
function loadImage(src){if(!src)return null;if(imageCache.has(src))return imageCache.get(src);const image=new Image();image.src=src;image.onload=renderTeacherCanvases;imageCache.set(src,image);return image}
function fillSelect(select,items){select.innerHTML="";items.forEach((item,index)=>{const option=document.createElement("option");option.value=index;option.textContent=item.label;select.appendChild(option)})}
function rebuildAvatarControls(){
  const a=classState.teacherAvatar,c=AVATAR_CFG[a.gender];a.skin=Math.min(a.skin,c.skins.length-1);a.eyes=Math.min(a.eyes,c.eyes.length-1);a.hair=Math.min(a.hair,c.hairs.length-1);a.hairColor=Math.max(0,Math.min(a.hairColor,c.hairs[a.hair]?.colors.length-1));a.outfit=Math.min(a.outfit,c.outfits.length-1);
  fillSelect($("avatarSkin"),c.skins);fillSelect($("avatarEyes"),c.eyes);fillSelect($("avatarHair"),c.hairs);fillSelect($("avatarOutfit"),c.outfits);fillSelect($("avatarGlasses"),AVATAR_CFG.glasses);fillSelect($("avatarBeard"),AVATAR_CFG.beards);
  [["avatarSkin","skin"],["avatarEyes","eyes"],["avatarHair","hair"],["avatarHairColor","hairColor"],["avatarGlasses","glasses"],["avatarBeard","beard"],["avatarOutfit","outfit"]].forEach(([id,key])=>$(id).value=a[key]);
  $("avatarFemale").classList.toggle("on",a.gender==="female");$("avatarMale").classList.toggle("on",a.gender==="male");$("beardWrap").classList.toggle("hidden",a.gender!=="male");renderTeacherCanvases();saveState();
}
function avatarSources(a){const c=AVATAR_CFG[a.gender],hair=c.hairs[a.hair]?.colors[a.hairColor]||c.hairs[0].colors[0];return[hair.back,c.skins[a.skin]?.src,c.eyes[a.eyes]?.src,c.outfits[a.outfit]?.src,a.gender==="male"?AVATAR_CFG.beards[a.beard]?.src:null,AVATAR_CFG.glasses[a.glasses]?.src,hair.front]}
function drawAvatar(canvas,a,large=true,dir=0){if(!canvas||!a)return;const ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);avatarSources(a).forEach(src=>{const image=loadImage(src);if(image?.complete&&image.naturalWidth)ctx.drawImage(image,avatarFrame*32,dir*32,32,32,large?16:0,large?16:0,large?224:96,large?224:96)})}
function renderTeacherCanvases(){drawAvatar($("teacherCanvas"),classState.teacherAvatar,true,0);if(playbackData)drawAvatar($("playbackTeacherCanvas"),playbackData.teacherAvatar,false,playbackTeacherDir);if(historyView&&!historyView.legacy)drawAvatar($("historyTeacherCanvas"),historyView.teacherAvatarSnapshot,false,0)}
function bindAvatar(){
  $("avatarFemale").onclick=()=>{classState.teacherAvatar.gender="female";classState.teacherAvatar.beard=0;rebuildAvatarControls()};
  $("avatarMale").onclick=()=>{classState.teacherAvatar.gender="male";rebuildAvatarControls()};
  [["avatarSkin","skin"],["avatarEyes","eyes"],["avatarHair","hair"],["avatarHairColor","hairColor"],["avatarGlasses","glasses"],["avatarBeard","beard"],["avatarOutfit","outfit"]].forEach(([id,key])=>$(id).onchange=e=>{classState.teacherAvatar[key]=Number(e.target.value);saveState();renderTeacherCanvases()});
  $("randomAvatar").onclick=()=>{const a=classState.teacherAvatar,c=AVATAR_CFG[a.gender];a.skin=Math.floor(Math.random()*c.skins.length);a.eyes=Math.floor(Math.random()*c.eyes.length);a.hair=Math.floor(Math.random()*c.hairs.length);a.hairColor=Math.floor(Math.random()*3);a.glasses=Math.floor(Math.random()*AVATAR_CFG.glasses.length);a.outfit=Math.floor(Math.random()*c.outfits.length);a.beard=a.gender==="male"?Math.floor(Math.random()*AVATAR_CFG.beards.length):0;rebuildAvatarControls()};
  $("resetAvatar").onclick=()=>{classState.teacherAvatar={gender:"female",skin:0,eyes:0,hair:0,hairColor:0,glasses:0,beard:0,outfit:2};rebuildAvatarControls()};
  rebuildAvatarControls();setInterval(()=>{avatarFrame=[0,1,2,1][avatarTick++%4];renderTeacherCanvases()},180);
}

/* Dock */
function activateDock(tab){
  activeDockTab=tab;document.querySelectorAll(".dock-tab").forEach(b=>b.classList.toggle("on",b.dataset.tab===tab));document.querySelectorAll(".dock-panel").forEach(p=>p.classList.toggle("hidden",p.dataset.panel!==tab));
  if(tab==="history")renderHistory();if(tab==="groups")renderGroups();if(tab==="student")renderStudentInspector();
}

/* Playback payload is intentionally sanitized. */
function buildPublicPairReactions(){
  const assignmentBySeat=new Map(classState.assignments.map(a=>[a.seatId,a.studentId]));
  const studentsById=new Map(classState.students.map(s=>[s.id,s]));
  const rows=new Map();
  classState.layout.cells.filter(isUsable).forEach(cell=>{
    if(!rows.has(cell.row))rows.set(cell.row,[]);
    rows.get(cell.row).push(cell);
  });
  const reactions=[];
  [...rows.values()].forEach(cells=>{
    cells.sort((a,b)=>a.col-b.col);
    let run=[];
    const flush=()=>{
      for(let i=0;i+1<run.length;i+=2){
        const a=run[i],b=run[i+1],sa=studentsById.get(assignmentBySeat.get(a.id)),sb=studentsById.get(assignmentBySeat.get(b.id));
        if(!sa||!sb)continue;
        if(sa.gender==="female"&&sb.gender==="female")reactions.push({seatIds:[a.id,b.id],line:"우와~ 여자 짝이다"});
        else if(sa.gender==="male"&&sb.gender==="male")reactions.push({seatIds:[a.id,b.id],line:"우와~ 남자 짝이다"});
      }
      run=[];
    };
    cells.forEach(cell=>{
      if(run.length&&cell.col!==run.at(-1).col+1)flush();
      run.push(cell);
    });
    flush();
  });
  return reactions;
}
function buildPlaybackInput(){
  const ids=new Set(classState.assignments.map(a=>a.studentId));
  const previousHistory=previousHistoryForPlayback();
  return{
    layout:deepCopy(classState.layout),
    students:classState.students.filter(s=>ids.has(s.id)).map((student,index)=>({
      id:student.id,
      name:student.name,
      visual:studentVisualFor(student,index),
      glasses:normalizedStudentVisual(student,index).glasses
    })),
    assignments:classState.assignments.map(a=>({...a})),
    groups:classState.groups.map(g=>({id:g.id,name:g.name,color:g.color,seatIds:[...g.seatIds]})),
    pairReactions:buildPublicPairReactions(),
    historyTransition:Boolean(previousHistory),
    previousAssignments:(previousHistory?.assignments||[]).map(a=>({...a})),
    previousRound:previousHistory?.round||null,
    teacherAvatar:{...classState.teacherAvatar},
    className:classState.className
  };
}
function openPlayback(){
  if(!classState.assignments.length){alert("먼저 배치를 확정하세요.");return}
  playbackData=buildPlaybackInput();playbackCompleted=false;$("simpleViewButton").classList.add("hidden");$("simpleView").classList.add("hidden");$("gameView").classList.remove("hidden");
  $("teacherScreen").classList.add("hidden");$("playbackScreen").classList.remove("hidden");
  buildPlaybackRoom();resetPlaybackDialogue();preparePlaybackStartState();renderTeacherCanvases();fitRoom();$("playbackStatus").textContent="준비 완료";
}
function backToTeacher(){
  playbackToken++;playbackRunning=false;resetPlaybackDialogue();$("playbackScreen").classList.add("hidden");$("teacherScreen").classList.remove("hidden");document.querySelectorAll(".play-btn").forEach(b=>b.disabled=false);$("simpleView").classList.add("hidden");$("gameView").classList.remove("hidden");
}
function setBg(el,url){el.style.backgroundImage=`url("${url}")`}
function buildPlaybackRoom(){
  const root=$("seats"),{rows,cols,cells}=playbackData.layout;root.innerHTML="";playbackStudents=[];

  // Height stays fixed; width expands only when the logical classroom needs more columns.
  playbackRoomWidth=Math.min(1892,1360+Math.max(0,cols-8)*133);
  playbackRoomHeight=1120;
  const TOPBAND_RENDER_W=1002,DOOR_OPENING_CENTER_X=875.5;
  playbackDoorCenterX=playbackRoomWidth-TOPBAND_RENDER_W+DOOR_OPENING_CENTER_X;
  playbackDoorSpawn={x:playbackDoorCenterX,y:116};
  playbackDoorExit={x:playbackDoorCenterX,y:258};

  document.documentElement.style.setProperty("--room-w",`${playbackRoomWidth}px`);
  document.documentElement.style.setProperty("--wall-extension-w",`${Math.max(0,playbackRoomWidth-1002)}px`);
  $("room").style.width=`${playbackRoomWidth}px`;
  $("room").style.height=`${playbackRoomHeight}px`;

  const availableSeatWidth=playbackRoomWidth-296;
  const seatW=Math.min(133,availableSeatWidth/cols);
  const seatH=Math.min(175,(797-(rows-1)*10)/rows);
  const chairW=seatW*54/133,chairTop=seatW*58/133,nameFont=Math.max(11,Math.min(20,seatW*.17));
  document.documentElement.style.setProperty("--seat-w",`${seatW}px`);
  document.documentElement.style.setProperty("--seat-h",`${seatH}px`);
  document.documentElement.style.setProperty("--chair-w",`${chairW}px`);
  document.documentElement.style.setProperty("--chair-top",`${chairTop}px`);
  document.documentElement.style.setProperty("--seat-name-font",`${nameFont}px`);

  const seatAreaWidth=cols*seatW;
  root.style.width=`${seatAreaWidth}px`;
  root.style.height=`${rows*seatH+(rows-1)*10}px`;
  const seatAreaLeft=Math.max(0,(playbackRoomWidth-seatAreaWidth)/2);
  document.documentElement.style.setProperty("--seat-area-left",`${seatAreaLeft}px`);
  root.style.left=`${seatAreaLeft}px`;

  const assignmentBySeat=new Map(playbackData.assignments.map(a=>[a.seatId,a.studentId]));
  const previousByStudent=new Map((playbackData.previousAssignments||[]).map(a=>[a.studentId,a.seatId]));
  const studentsById=new Map(playbackData.students.map(s=>[s.id,s]));
  const studentIndexes=new Map(playbackData.students.map((s,i)=>[s.id,i]));

  cells.forEach(cell=>{
    const seat=document.createElement("div"),student=studentsById.get(assignmentBySeat.get(cell.id));
    seat.className=`seat ${isUsable(cell)?"":"non-seat"}`;
    seat.dataset.seatId=cell.id;
    seat.style.left=`${cell.col*seatW}px`;
    seat.style.top=`${cell.row*(seatH+10)}px`;
    seat.innerHTML=`<img class="desk" src="${DESK_SRC}" alt=""><div class="student"><div class="speech-bubble"></div><div class="sprite"></div><div class="student-glasses-layer"></div></div><img class="chair" src="${CHAIR_SRC}" alt=""><div class="seat-name" title="${escapeHtml(student?.name||"")}">${escapeHtml(student?.name||"")}</div>`;
    if(student){
      const sheet=student.visual||studentSheetForIndex(studentIndexes.get(student.id)),sprite=seat.querySelector(".student .sprite");
      setBg(sprite,sheet);
      const glasses=student.glasses||"none",glassesLayer=seat.querySelector(".student-glasses-layer"),glassesSrc=studentGlassesSrc(glasses);
      if(glassesSrc)setBg(glassesLayer,glassesSrc);else glassesLayer.style.backgroundImage="none";
      sprite.style.setProperty("--bob-delay",`${(-.13*((studentIndexes.get(student.id)*3)%9)).toFixed(2)}s`);
      playbackStudents.push({id:student.id,name:student.name,sheet,glasses,seat,cell,previousSeatId:previousByStudent.get(student.id)||null});
    }
    root.appendChild(seat);
  });
  hidePlaybackAll();
}
function framePos(dir,frame){const row={down:0,left:1,right:2,up:3}[dir];return `${-frame*85}px ${-row*85}px`}
function setWalkerFrame(w,dir,frame){
  const pos=framePos(dir,frame);
  const sprite=w.querySelector(".sprite");if(sprite)sprite.style.backgroundPosition=pos;
  const glasses=w.querySelector(".student-glasses-layer");if(glasses)glasses.style.backgroundPosition=pos;
}

function playbackTeacherPoint(){
  const el=$("playbackTeacher"),room=$("room");if(!el||!room)return{x:playbackRoomWidth/2,y:267};
  const roomR=room.getBoundingClientRect(),r=el.getBoundingClientRect(),scale=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--room-scale"))||1,border=parseFloat(getComputedStyle(room).borderLeftWidth)||0;
  return{x:(r.left+r.width/2-roomR.left)/scale-border,y:(r.top+r.height/2-roomR.top)/scale-border};
}
function dirToward(from,to){
  const dx=to.x-from.x,dy=to.y-from.y;
  if(Math.abs(dx)>Math.abs(dy))return dx<0?1:2;
  return dy<0?3:0;
}
function setPlaybackTeacherToward(point){
  playbackTeacherDir=dirToward(playbackTeacherPoint(),point);
  renderTeacherCanvases();
}
function showTeacherSpeech(line,point=null,hold=1900){
  if(usedTeacherSpeechLines.has(line))return false;
  usedTeacherSpeechLines.add(line);
  if(point)setPlaybackTeacherToward(point);
  const bubble=$("teacherBubble");if(!bubble)return false;
  const serial=++teacherSpeechSerial;
  clearTimeout(teacherSpeechTimer);
  bubble.textContent=line;bubble.classList.add("show");
  teacherSpeechTimer=setTimeout(()=>{
    if(serial!==teacherSpeechSerial)return;
    bubble.classList.remove("show");playbackTeacherDir=0;renderTeacherCanvases();
  },hold);
  return true;
}
function roomContentPointForElement(target){
  const room=$("room"),roomR=room.getBoundingClientRect(),r=target.getBoundingClientRect();
  const scale=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--room-scale"))||1;
  const border=parseFloat(getComputedStyle(room).borderLeftWidth)||0;
  return{
    x:(r.left+r.width/2-roomR.left)/scale-border,
    y:(r.top-roomR.top)/scale-border
  };
}
function showStudentSpeech(target,line,hold=1550){
  if(!target||usedStudentSpeechLines.has(line))return false;
  usedStudentSpeechLines.add(line);
  const room=$("room"),bubble=document.createElement("div");
  bubble.className="global-student-bubble";
  bubble.textContent=line;
  room.appendChild(bubble);

  let active=true;
  const follow=()=>{
    if(!active||!target.isConnected||!bubble.isConnected)return;
    const p=roomContentPointForElement(target);
    bubble.style.left=`${p.x}px`;
    bubble.style.top=`${p.y-8}px`;
    requestAnimationFrame(follow);
  };
  follow();
  setTimeout(()=>{active=false;bubble.remove()},hold);
  return true;
}
function resetPlaybackDialogue(){
  clearTimeout(teacherSpeechTimer);clearInterval(teacherProximityTimer);
  teacherProximityTimer=null;teacherSpeechSerial++;playbackTeacherDir=0;
  usedTeacherSpeechLines=new Set();usedStudentSpeechLines=new Set();movementSpeechByStudent=new Map();seatedSeatIds=new Set();
  partnerSpeechCount=0;partnerSpeechSpeakers=new Set();
  $("teacherBubble")?.classList.remove("show");
  $("room")?.querySelectorAll(".speech-bubble").forEach(b=>b.classList.remove("show"));
  $("room")?.querySelectorAll(".global-student-bubble").forEach(b=>b.remove());
  renderTeacherCanvases();
}
function assignMovementDialogue(movers=[]){
  movementSpeechByStudent=new Map();
  if(!movers.length)return;
  const ids=movers.map(s=>s.id).sort(()=>Math.random()-.5);
  if(ids[0])movementSpeechByStudent.set(ids[0],"야~ 비켜~");
  if(ids[1])movementSpeechByStudent.set(ids[1],"누구랑 짝일까?");
}
function walkerPoint(w){
  const room=$("room"),roomR=room.getBoundingClientRect(),r=w.getBoundingClientRect(),scale=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--room-scale"))||1,border=parseFloat(getComputedStyle(room).borderLeftWidth)||0;
  return{x:(r.left+r.width/2-roomR.left)/scale-border,y:(r.top+r.height/2-roomR.top)/scale-border};
}
function startTeacherProximityMonitor(runId){
  clearInterval(teacherProximityTimer);
  teacherProximityTimer=setInterval(()=>{
    if(runId!==playbackToken||!playbackRunning){
      clearInterval(teacherProximityTimer);
      teacherProximityTimer=null;
      return;
    }

    const teacherCanvas=$("playbackTeacherCanvas"),room=$("room");
    if(!teacherCanvas||!room)return;

    const t=teacherCanvas.getBoundingClientRect();
    const scale=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--room-scale"))||1;
    let nearest=null,nearestDistance=Infinity;

    room.querySelectorAll(".walker").forEach(w=>{
      const sprite=w.querySelector(".sprite"),r=(sprite||w).getBoundingClientRect();
      const dx=(r.left+r.width/2)-(t.left+t.width/2);
      const dy=(r.top+r.height/2)-(t.top+t.height/2);
      const d=Math.hypot(dx,dy)/scale;
      const point=walkerPoint(w);
      if(d<nearestDistance){nearestDistance=d;nearest=point}
    });

    if(nearest&&nearestDistance<145){
      showTeacherSpeech("얘들아.. 멈춰",nearest,1750);
    }
  },120);
}
function alreadySeatedAdjacentPartners(s){
  return playbackStudents.filter(other=>
    other.id!==s.id&&
    seatedSeatIds.has(other.cell.id)&&
    other.cell.row===s.cell.row&&
    Math.abs(other.cell.col-s.cell.col)===1
  );
}
function tryPartnerSeatSpeech(s,target){
  if(partnerSpeechCount>=2||partnerSpeechSpeakers.has(s.id))return false;

  const partners=alreadySeatedAdjacentPartners(s);
  if(!partners.length)return false;

  // Playback order and walking time are randomized, so the first two eligible
  // "second sitters" are random each run. In a 3-seat run, the 2nd or 3rd sitter
  // can qualify as long as an adjacent classmate is already seated.
  const partner=partners[Math.floor(Math.random()*partners.length)];
  const line=`이번 짝궁은 ${partner.name}이네.`;

  if(!showStudentSpeech(target,line,2000))return false;
  partnerSpeechCount++;
  partnerSpeechSpeakers.add(s.id);
  return true;
}
function handleSeatSpeech(s){
  const target=s.seat.querySelector(".student");

  // IMPORTANT: check before marking this student seated.
  // Therefore the first person in a buddy pair can never say this line.
  const saidPartnerLine=tryPartnerSeatSpeech(s,target);

  seatedSeatIds.add(s.cell.id);

  if(saidPartnerLine)return;

  const pair=(playbackData.pairReactions||[]).find(r=>
    r.seatIds.includes(s.cell.id)&&
    r.seatIds.every(id=>seatedSeatIds.has(id))&&
    !usedStudentSpeechLines.has(r.line)
  );
  if(pair&&showStudentSpeech(target,pair.line,1900))return;

  const usableRows=playbackData.layout.cells.filter(isUsable).map(c=>c.row);
  const front=Math.min(...usableRows),back=Math.max(...usableRows);

  if(s.cell.row===front){
    if(showStudentSpeech(target,"우와~ 앞자리다",1700))return;
    if(showStudentSpeech(target,"와~ 칠판이 잘 보여여요.",1800))return;
  }

  if(s.cell.row===back){
    showStudentSpeech(target,"뒷자리 좋아~",1700);
  }
}
function showSeat(s){const student=s.seat.querySelector(".student");student.querySelector(".sprite").style.backgroundPosition="-77px -231px";const g=student.querySelector(".student-glasses-layer");if(g)g.style.backgroundPosition="-77px -231px";student.classList.add("visible");s.seat.querySelector(".seat-name").classList.add("visible")}
function hidePlaybackAll(){
  $("room").querySelectorAll(".student,.seat-name").forEach(e=>e.classList.remove("visible"));
  $("room").querySelectorAll(".speech-bubble").forEach(e=>e.classList.remove("show"));
  $("room").querySelectorAll(".global-student-bubble").forEach(e=>e.remove());
  $("room").querySelectorAll(".walker,.launch-sprite-overlay").forEach(e=>e.remove());
  clearHistoryStartState();
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
const NAV_CELL=6,NAV_DESK_MARGIN=18,NAV_TOP_LIMIT=214,NAV_SIDE_MARGIN=14,NAV_BOTTOM_MARGIN=14,WALK_PX_PER_SEC=118;
class MinHeap{constructor(){this.a=[]}push(node,priority){const n={node,priority};this.a.push(n);let i=this.a.length-1;while(i>0){const p=(i-1)>>1;if(this.a[p].priority<=priority)break;this.a[i]=this.a[p];i=p}this.a[i]=n}pop(){if(!this.a.length)return null;const root=this.a[0],last=this.a.pop();if(this.a.length){this.a[0]=last;let i=0;while(true){let l=i*2+1,r=l+1,b=i;if(l<this.a.length&&this.a[l].priority<this.a[b].priority)b=l;if(r<this.a.length&&this.a[r].priority<this.a[b].priority)b=r;if(b===i)break;[this.a[i],this.a[b]]=[this.a[b],this.a[i]];i=b}}return root.node}get size(){return this.a.length}}
function roomRectToLocal(el,roomR,scale){const room=$("room"),border=parseFloat(getComputedStyle(room).borderLeftWidth)||0,r=el.getBoundingClientRect();return{left:(r.left-roomR.left)/scale-border,top:(r.top-roomR.top)/scale-border,right:(r.right-roomR.left)/scale-border,bottom:(r.bottom-roomR.top)/scale-border}}
function buildNavigationGrid(){
  const room=$("room"),roomR=room.getBoundingClientRect(),scale=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--room-scale"))||1,cols=Math.ceil(playbackRoomWidth/NAV_CELL),rows=Math.ceil(playbackRoomHeight/NAV_CELL),blocked=Array.from({length:rows},()=>new Uint8Array(cols));
  for(let r=0;r<rows;r++){const y=r*NAV_CELL+NAV_CELL/2;for(let c=0;c<cols;c++){const x=c*NAV_CELL+NAV_CELL/2;if(x<NAV_SIDE_MARGIN||x>playbackRoomWidth-NAV_SIDE_MARGIN||y<NAV_TOP_LIMIT||y>playbackRoomHeight-NAV_BOTTOM_MARGIN)blocked[r][c]=1}}
  room.querySelectorAll(".desk").forEach(desk=>{if(desk.closest(".non-seat"))return;const d=roomRectToLocal(desk,roomR,scale),left=d.left-NAV_DESK_MARGIN,right=d.right+NAV_DESK_MARGIN,top=d.top-NAV_DESK_MARGIN,bottom=d.bottom+NAV_DESK_MARGIN,c0=Math.max(0,Math.floor(left/NAV_CELL)),c1=Math.min(cols-1,Math.ceil(right/NAV_CELL)),r0=Math.max(0,Math.floor(top/NAV_CELL)),r1=Math.min(rows-1,Math.ceil(bottom/NAV_CELL));for(let rr=r0;rr<=r1;rr++){const y=rr*NAV_CELL+NAV_CELL/2;if(y<top||y>bottom)continue;for(let cc=c0;cc<=c1;cc++){const x=cc*NAV_CELL+NAV_CELL/2;if(x>=left&&x<=right)blocked[rr][cc]=1}}});
  return{blocked,cols,rows,roomR,scale};
}
function nearestWalkable(point,nav){const tc=Math.max(0,Math.min(nav.cols-1,Math.floor(point.x/NAV_CELL))),tr=Math.max(0,Math.min(nav.rows-1,Math.floor(point.y/NAV_CELL)));if(!nav.blocked[tr][tc])return{c:tc,r:tr};for(let radius=1;radius<22;radius++)for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++){if(Math.max(Math.abs(dc),Math.abs(dr))!==radius)continue;const c=tc+dc,r=tr+dr;if(c>=0&&r>=0&&c<nav.cols&&r<nav.rows&&!nav.blocked[r][c])return{c,r}}return null}
function navKey(c,r,cols){return r*cols+c}
function findPath(nav,startPt,goalPt,traffic,seed){
  const start=nearestWalkable(startPt,nav),goal=nearestWalkable(goalPt,nav);if(!start||!goal)return null;
  const total=nav.cols*nav.rows,g=new Float64Array(total),parent=new Int32Array(total),closed=new Uint8Array(total);g.fill(Infinity);parent.fill(-1);
  const startKey=navKey(start.c,start.r,nav.cols),goalKey=navKey(goal.c,goal.r,nav.cols),heap=new MinHeap();g[startKey]=0;heap.push({c:start.c,r:start.r,key:startKey},0);
  const dirs=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[-1,1,1.414],[1,-1,1.414],[-1,-1,1.414]];
  while(heap.size){
    const cur=heap.pop();if(closed[cur.key])continue;closed[cur.key]=1;
    if(cur.key===goalKey){const cells=[];let key=goalKey;while(key!==-1){const r=Math.floor(key/nav.cols),c=key-r*nav.cols;cells.push({c,r});if(key===startKey)break;key=parent[key]}return cells.reverse().map(p=>({x:p.c*NAV_CELL+NAV_CELL/2,y:p.r*NAV_CELL+NAV_CELL/2}))}
    for(const[dc,dr,step]of dirs){const nc=cur.c+dc,nr=cur.r+dr;if(nc<0||nr<0||nc>=nav.cols||nr>=nav.rows||nav.blocked[nr][nc])continue;if(dc&&dr&&(nav.blocked[cur.r][nc]||nav.blocked[nr][cur.c]))continue;const nk=navKey(nc,nr,nav.cols);if(closed[nk])continue;const hash=((nc*73856093)^(nr*19349663)^(seed*83492791))>>>0,tentative=g[cur.key]+step+traffic[nr][nc]*1.35+(hash%23)*.003;if(tentative<g[nk]){g[nk]=tentative;parent[nk]=cur.key;heap.push({c:nc,r:nr,key:nk},tentative+Math.hypot(goal.c-nc,goal.r-nr))}}
  }
  return null;
}
function addTraffic(path,traffic){if(!path)return;for(const p of path){const c=Math.floor(p.x/NAV_CELL),r=Math.floor(p.y/NAV_CELL);for(let dr=-3;dr<=3;dr++)for(let dc=-3;dc<=3;dc++){const rr=r+dr,cc=c+dc;if(rr<0||cc<0||rr>=traffic.length||cc>=traffic[0].length)continue;const d=Math.hypot(dc,dr);if(d<=3.2)traffic[rr][cc]+=Math.max(0,3.3-d)*.42}}}
function compressPath(path){if(!path||path.length<3)return path||[];const out=[path[0]];let dx0=null,dy0=null;for(let i=1;i<path.length;i++){const dx=Math.sign(path[i].x-path[i-1].x),dy=Math.sign(path[i].y-path[i-1].y);if(dx0!==null&&(dx!==dx0||dy!==dy0))out.push(path[i-1]);dx0=dx;dy0=dy}out.push(path[path.length-1]);return out}
function getSeatApproach(s,nav){const d=roomRectToLocal(s.seat.querySelector(".desk"),nav.roomR,nav.scale);return{x:(d.left+d.right)/2,y:d.bottom+24}}
function removeHistoryStartForStudent(studentId){
  $("room").querySelectorAll("[data-history-start]").forEach(el=>{
    if(el.dataset.historyStart===studentId)el.remove();
  });
}
function clearHistoryStartState(){
  $("room").querySelectorAll(".history-start-student,.history-start-name").forEach(el=>el.remove());
}
function preparePlaybackStartState(){
  hidePlaybackAll();
  if(!playbackData?.historyTransition)return;

  const seatsById=new Map([...$("seats").querySelectorAll(".seat")].map(el=>[el.dataset.seatId,el]));
  playbackStudents.forEach(s=>{
    if(!s.previousSeatId)return;

    if(s.previousSeatId===s.cell.id){
      showSeat(s);
      seatedSeatIds.add(s.cell.id);
      return;
    }

    const oldSeat=seatsById.get(s.previousSeatId);
    if(!oldSeat)return;

    const ghost=document.createElement("div");
    ghost.className="history-start-student";
    ghost.dataset.studentId=s.id;
    ghost.dataset.historyStart=s.id;
    ghost.innerHTML='<div class="sprite"></div><div class="student-glasses-layer"></div>';
    setBg(ghost.querySelector(".sprite"),s.sheet);
    const ghostGlasses=studentGlassesSrc(s.glasses);if(ghostGlasses)setBg(ghost.querySelector(".student-glasses-layer"),ghostGlasses);

    const name=document.createElement("div");
    name.className="seat-name history-start-name visible";
    name.dataset.historyStart=s.id;
    name.textContent=s.name;
    name.title=s.name;

    oldSeat.appendChild(ghost);
    oldSeat.appendChild(name);
  });
}

function getPreviousSeatStart(s,nav){
  if(!playbackData?.historyTransition||!s.previousSeatId)return null;
  const ghost=[...$("room").querySelectorAll(".history-start-student")]
    .find(el=>el.dataset.studentId===s.id);
  if(ghost){
    const r=roomRectToLocal(ghost,nav.roomR,nav.scale);
    return{x:(r.left+r.right)/2,y:(r.top+r.bottom)/2+13};
  }
  const oldSeat=[...$("seats").querySelectorAll(".seat")].find(el=>el.dataset.seatId===s.previousSeatId);
  if(!oldSeat)return null;
  const r=roomRectToLocal(oldSeat,nav.roomR,nav.scale);
  return{x:(r.left+r.right)/2,y:r.top+70};
}
function getPreviousSeatExit(s,nav){
  if(!playbackData?.historyTransition||!s.previousSeatId)return null;
  const oldSeat=[...$("seats").querySelectorAll(".seat")].find(el=>el.dataset.seatId===s.previousSeatId);
  const desk=oldSeat?.querySelector(".desk");
  if(!oldSeat||!desk)return null;
  const d=roomRectToLocal(desk,nav.roomR,nav.scale);
  // A short point behind the desk/chair.  The launch sprite stays above the desk
  // until it reaches here, then returns to the ordinary moving-student layer.
  return{x:(d.left+d.right)/2,y:d.bottom+30};
}
function directionForSegment(a,b){const dx=b.x-a.x,dy=b.y-a.y;return Math.abs(dx)>Math.abs(dy)?(dx<0?"left":"right"):(dy<0?"up":"down")}
function moveWalker(w,x,y,ms,dir,speed,runId){return new Promise(resolve=>{if(runId!==playbackToken){resolve();return}let frame=0;setWalkerFrame(w,dir,frame);const tick=setInterval(()=>{frame=(frame+1)%3;setWalkerFrame(w,dir,frame)},Math.max(80,260/speed));w.style.transition=`left ${ms}ms linear, top ${ms}ms linear`;requestAnimationFrame(()=>{w.style.left=`${x}px`;w.style.top=`${y}px`});setTimeout(()=>{clearInterval(tick);resolve()},ms+20)})}
async function walkPath(w,path,speed,mul,runId){if(!path||path.length<2)return;for(let i=1;i<path.length;i++){if(runId!==playbackToken)return;const a=path[i-1],b=path[i],distance=Math.hypot(b.x-a.x,b.y-a.y);await moveWalker(w,b.x,b.y,Math.max(55,distance/(WALK_PX_PER_SEC*speed*mul)*1000),directionForSegment(a,b),speed*mul,runId)}}
async function queueDoorEntry(w,speed,mul,runId){
  let release;
  const previous=doorEntryChain;
  doorEntryChain=new Promise(resolve=>{release=resolve});
  await previous;
  if(runId!==playbackToken){release();return false}

  w.style.visibility="visible";
  w.style.left=`${playbackDoorSpawn.x}px`;
  w.style.top=`${playbackDoorSpawn.y}px`;
  w.style.zIndex="25";

  await moveWalker(
    w,
    playbackDoorExit.x,
    playbackDoorExit.y,
    560/(speed*mul),
    "down",
    speed*mul,
    runId
  );
  release();
  return runId===playbackToken;
}
async function animateOne(s,index,speed,runId,plan){
  if(plan?.stay)return;

  const historyMode=Boolean(plan?.fromHistory);
  const wave=[0,160,70,240,110,310][index%6];
  const delay=historyMode
    ? (index*45+40+Math.random()*100)/speed
    : (index*95+wave+120+Math.random()*260)/speed;
  await sleep(delay);if(runId!==playbackToken)return;

  const mul=.92+Math.random()*.2,w=document.createElement("div");
  w.className="walker";
  w.innerHTML=`<div class="speech-bubble"></div><div class="sprite"></div><div class="student-glasses-layer"></div><div class="tag">${escapeHtml(s.name)}</div>`;
  setBg(w.querySelector(".sprite"),s.sheet);
  const walkerGlasses=studentGlassesSrc(s.glasses);if(walkerGlasses)setBg(w.querySelector(".student-glasses-layer"),walkerGlasses);
  $("room").appendChild(w);

  // The normal moving student container NEVER rises above the desk.
  w.style.zIndex="25";

  if(historyMode){
    const visualStart=plan.visualStart,exitPoint=plan.exitPoint;
    if(!visualStart||!exitPoint){w.remove();return}

    // Keep the normal walker hidden below desk while only a sprite-only overlay
    // bridges the seated pose to the clear point behind the old desk.
    w.style.visibility="hidden";
    w.style.left=`${exitPoint.x}px`;
    w.style.top=`${exitPoint.y}px`;

    const launch=document.createElement("div");
    launch.className="launch-sprite-overlay";
    launch.innerHTML='<div class="sprite"></div><div class="student-glasses-layer"></div>';
    setBg(launch.querySelector(".sprite"),s.sheet);
    const launchGlasses=studentGlassesSrc(s.glasses);if(launchGlasses)setBg(launch.querySelector(".student-glasses-layer"),launchGlasses);
    $("room").appendChild(launch);
    launch.style.left=`${visualStart.x}px`;
    launch.style.top=`${visualStart.y}px`;
    setWalkerFrame(launch,"up",1);

    await new Promise(requestAnimationFrame);
    removeHistoryStartForStudent(s.id);
    await sleep(Math.max(45,100/speed));

    const egressDistance=Math.hypot(exitPoint.x-visualStart.x,exitPoint.y-visualStart.y);
    await moveWalker(
      launch,
      exitPoint.x,
      exitPoint.y,
      Math.max(90,egressDistance/(WALK_PX_PER_SEC*speed*mul)*1000),
      directionForSegment(visualStart,exitPoint),
      speed*mul,
      runId
    );

    if(runId!==playbackToken){
      launch.remove();
      w.remove();
      return;
    }

    // At the clear point, swap the raised sprite-only overlay for the ordinary
    // walker.  From here on the student is again below desk layer as intended.
    const exitDir=directionForSegment(visualStart,exitPoint);
    setWalkerFrame(w,exitDir,1);
    w.style.left=`${exitPoint.x}px`;
    w.style.top=`${exitPoint.y}px`;
    w.style.visibility="visible";
    launch.remove();
    await new Promise(requestAnimationFrame);
  }else{
    w.style.visibility="hidden";
    w.style.left=`${playbackDoorSpawn.x}px`;
    w.style.top=`${playbackDoorSpawn.y}px`;
    await sleep((45+Math.random()*90)/speed);
    const entered=await queueDoorEntry(w,speed,mul,runId);
    if(!entered){w.remove();return}
  }

  const movementLine=movementSpeechByStudent.get(s.id);
  if(movementLine)showStudentSpeech(w,movementLine,1650);

  const path=plan?.path||[];
  if(path.length){
    if(historyMode)await walkPath(w,[plan.exitPoint,...path],speed,mul,runId);
    else await walkPath(w,[playbackDoorExit,...path],speed,mul,runId);
  }
  if(runId!==playbackToken){w.remove();return}

  showSeat(s);handleSeatSpeech(s);
  requestAnimationFrame(()=>requestAnimationFrame(()=>w.remove()));
}
function markPlaybackComplete(){clearInterval(teacherProximityTimer);teacherProximityTimer=null;playbackCompleted=true;$("simpleViewButton").classList.remove("hidden");$("playbackStatus").textContent="✨ 배치 완료! · 간단 자리표도 볼 수 있습니다."}
async function runPlayback(speed){
  if(playbackRunning)return;
  playbackToken++;const runId=playbackToken;playbackRunning=true;playbackCompleted=false;
  $("simpleViewButton").classList.add("hidden");
  document.querySelectorAll(".play-btn").forEach(b=>b.disabled=true);

  doorEntryChain=Promise.resolve();
  const nav=buildNavigationGrid(),traffic=Array.from({length:nav.rows},()=>new Float32Array(nav.cols));
  const queue=[...playbackStudents].sort(()=>Math.random()-.5),plans=new Map();

  resetPlaybackDialogue();
  preparePlaybackStartState();

  let historyMoverCount=0;
  queue.forEach((s,i)=>{
    const canUseHistory=Boolean(playbackData.historyTransition&&s.previousSeatId);
    const sameSeat=canUseHistory&&s.previousSeatId===s.cell.id;

    if(sameSeat){
      plans.set(s,{stay:true,fromHistory:true});
      return;
    }

    const visualStart=canUseHistory?getPreviousSeatStart(s,nav):null;
    const exitPoint=canUseHistory?getPreviousSeatExit(s,nav):null;
    const fromHistory=Boolean(visualStart&&exitPoint);
    if(fromHistory)historyMoverCount++;

    const navStart=fromHistory?exitPoint:playbackDoorExit;
    const goal=getSeatApproach(s,nav);
    let path=findPath(nav,navStart,goal,traffic,i+1);
    if(path){path=compressPath(path);addTraffic(path,traffic)}

    plans.set(s,{
      path,
      visualStart,
      exitPoint,
      fromHistory,
      stay:false
    });
  });

  // Existing movement dialogue now chooses ONLY students who will actually walk.
  // This makes the same situation dialogue work in history-to-new-seat mode too.
  const movers=queue.filter(s=>!plans.get(s)?.stay);
  assignMovementDialogue(movers);

  const teacherPoint=historyMoverCount?{x:playbackRoomWidth/2,y:430}:{x:playbackDoorExit.x,y:playbackDoorExit.y};
  showTeacherSpeech("얘들아~ 뛰지 말거라",teacherPoint,2100);
  startTeacherProximityMonitor(runId);

  await Promise.all(queue.map((s,i)=>animateOne(s,i,speed,runId,plans.get(s))));
  if(runId===playbackToken){
    playbackRunning=false;
    document.querySelectorAll(".play-btn").forEach(b=>b.disabled=false);
    markPlaybackComplete();
  }
}
function finishPlayback(){playbackToken++;playbackRunning=false;resetPlaybackDialogue();hidePlaybackAll();playbackStudents.forEach(showSeat);document.querySelectorAll(".play-btn").forEach(b=>b.disabled=false);markPlaybackComplete()}
function fitRoom(){
  if($("playbackScreen").classList.contains("hidden")||$("gameView").classList.contains("hidden"))return;
  const shell=$("roomShell"),viewport=document.querySelector(".viewport");
  const availableW=Math.max(260,(viewport?.clientWidth||window.innerWidth-190)-12);
  const availableH=Math.max(320,(viewport?.clientHeight||window.innerHeight)-12);
  const scale=Math.min(1,availableW/(playbackRoomWidth+20),availableH/(playbackRoomHeight+20));
  document.documentElement.style.setProperty("--room-scale",scale);
  shell.style.width=`${(playbackRoomWidth+20)*scale}px`;
  shell.style.height=`${(playbackRoomHeight+20)*scale}px`;
}

/* Simplified public chart + JPG */
function roundedRectPath(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
function fitCanvasText(ctx,text,maxWidth,startSize,minSize=22){let size=startSize;while(size>minSize){ctx.font=`900 ${size}px Arial,"Apple SD Gothic Neo","Noto Sans KR",sans-serif`;if(ctx.measureText(text).width<=maxWidth)break;size-=2}return size}
function renderSimpleCanvas(){
  if(!playbackData)return;
  const canvas=$("simpleCanvas"),ctx=canvas.getContext("2d"),{rows,cols,cells}=playbackData.layout,cellW=220,cellH=128,margin=90,header=160;
  canvas.width=margin*2+cols*cellW;canvas.height=margin+header+rows*cellH+36;
  ctx.fillStyle="#f8fafc";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#172033";ctx.textAlign="center";ctx.font='900 54px Arial,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';ctx.fillText(playbackData.className?`${playbackData.className} 자리표`:"오늘의 자리표",canvas.width/2,62);
  ctx.fillStyle="#166534";roundedRectPath(ctx,margin,88,cols*cellW,54,12);ctx.fill();ctx.fillStyle="#fff";ctx.font='900 28px Arial,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';ctx.fillText("칠판 · 교실 앞",canvas.width/2,124);
  const studentById=new Map(playbackData.students.map(s=>[s.id,s])),assignmentBySeat=new Map(playbackData.assignments.map(a=>[a.seatId,a.studentId]));
  const groupBySeat=new Map();playbackData.groups.forEach((g,index)=>g.seatIds.forEach(id=>groupBySeat.set(id,{...g,index})));
  cells.forEach(cell=>{
    if(!isUsable(cell))return;
    const x=margin+cell.col*cellW+8,y=margin+header+cell.row*cellH+8,w=cellW-16,h=cellH-16,group=groupBySeat.get(cell.id),student=studentById.get(assignmentBySeat.get(cell.id)),name=student?.name||"빈 자리";
    ctx.fillStyle="#fff";ctx.strokeStyle="#334155";ctx.lineWidth=4;roundedRectPath(ctx,x,y,w,h,16);ctx.fill();ctx.stroke();
    if(group){ctx.fillStyle=groupColor(group.index,group);roundedRectPath(ctx,x+8,y+8,w-16,20,8);ctx.fill();ctx.fillStyle="#fff";ctx.textAlign="left";ctx.font='900 15px Arial,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';ctx.fillText(group.name,x+16,y+23)}
    ctx.textAlign="center";ctx.fillStyle=student?"#172033":"#94a3b8";const size=fitCanvasText(ctx,name,w-22,42,22);ctx.font=`900 ${size}px Arial,"Apple SD Gothic Neo","Noto Sans KR",sans-serif`;ctx.fillText(name,x+w/2,y+h/2+size*.32);
  });
}
function openSimpleView(){if(!playbackCompleted)return;renderSimpleCanvas();$("gameView").classList.add("hidden");$("simpleView").classList.remove("hidden")}
function backToGame(){$("simpleView").classList.add("hidden");$("gameView").classList.remove("hidden");fitRoom()}
function localDateStamp(){const d=new Date(),p=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`}
function downloadSimpleJpg(){
  renderSimpleCanvas();const canvas=$("simpleCanvas"),filename=`자리배치_${localDateStamp()}.jpg`;
  const trigger=blob=>{const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  if(canvas.toBlob)canvas.toBlob(blob=>{if(blob)trigger(blob)},"image/jpeg",.92);
  else{const a=document.createElement("a");a.href=canvas.toDataURL("image/jpeg",.92);a.download=filename;a.click()}
}
function setTransferStatus(message,kind=""){
  const node=$("dataTransferStatus");if(!node)return;
  node.textContent=message;node.classList.toggle("error",kind==="error");node.classList.toggle("success",kind==="success");
}
function safeFilenamePart(value){return String(value||"우리반").trim().replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"_").slice(0,30)||"우리반"}
function buildBackupPayload(state){
  const validation=validatePersistentState(state);
  if(!validation.ok)throw new Error(validation.errors.join(" "));
  return{format:BACKUP_FORMAT,formatVersion:BACKUP_FORMAT_VERSION,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),classState:deepCopy(state)};
}
function parseBackupText(text){
  const payload=JSON.parse(text);
  if(!isPlainObject(payload)||payload.format!==BACKUP_FORMAT)throw new Error("이 앱에서 내보낸 백업 형식이 아닙니다.");
  if(payload.formatVersion!==BACKUP_FORMAT_VERSION)throw new Error(`지원하지 않는 백업 버전입니다. (지원 버전: ${BACKUP_FORMAT_VERSION})`);
  if(!isPlainObject(payload.classState))throw new Error("학급 데이터가 없습니다.");
  return normalizeCandidateState(payload.classState);
}
function exportClassData(){
  try{
    const payload=buildBackupPayload(classState);
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");
    anchor.href=url;anchor.download=`자리배치_${safeFilenamePart(classState.className)}_${localDateStamp()}.json`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setTransferStatus("현재 학급 데이터를 JSON 파일로 내보냈습니다.","success");
  }catch(error){setTransferStatus(`JSON 내보내기에 실패했습니다: ${error.message}`,"error")}
}
async function importClassData(file){
  if(!file)return;
  setTransferStatus("JSON 파일을 확인하는 중입니다.");
  try{
    const text=await file.text();
    const normalized=parseBackupText(text);
    const studentCount=normalized.students.length;
    if(!confirm(`‘${normalized.className}’ 학급 데이터(${studentCount}명)를 불러올까요?\n현재 이 탭의 데이터는 가져온 내용으로 교체됩니다.`)){
      setTransferStatus("가져오기를 취소했습니다.");return;
    }
    const committed=writeCanonicalState(normalized,{allowOverwrite:true});
    if(!committed.ok)throw new Error(`브라우저 저장소에 안전하게 기록하지 못했습니다. 현재 데이터는 변경되지 않았습니다. ${committed.error?.message||""}`);
    classState=normalized;
    previewAssignments=classState.assignments.map(item=>({...item}));
    previewRevision=classState.assignments.length?0:null;confirmedRevision=classState.assignments.length?0:null;
    selectedStudentId=classState.students[0]?.id||null;
    storageRuntime.loadIssue=null;storageRuntime.saveBlocked=false;storageRuntime.stale=false;
    undoRestoring=true;
    try{rerenderAfterRestore("JSON 백업에서 학급 데이터를 불러왔습니다.")}finally{undoRestoring=false}
    resetUndoHistory();hideStorageAlert();setSaveStatus("브라우저 저장 · 가져오기 완료");
    setTransferStatus("가져오기와 저장 확인을 완료했습니다.","success");
  }catch(error){
    console.warn("JSON 가져오기 실패",error);
    setTransferStatus(`가져오기에 실패했습니다: ${error.message}`,"error");
  }finally{$("importJsonFile").value=""}
}
function handleExternalStorageChange(event){
  if(event.key!==STORAGE_KEY||event.newValue===storageRuntime.lastKnownCanonicalRaw)return;
  storageRuntime.stale=true;
  setSaveStatus("저장 중지 · 다른 탭 변경 감지","warning");
  showStorageAlert("다른 탭에서 이 학급 데이터가 변경되었습니다. 현재 탭의 자동 덮어쓰기를 막았습니다. 새로고침해 최신 데이터를 불러오세요.","warning",true);
}

/* Studio panel collapse */
function applyStudioCollapse(){requestAnimationFrame(fitEditorGrid)}

/* UI bindings */
function bindUI(){
  document.addEventListener("mouseup",endPaint);document.addEventListener("mouseleave",endPaint);
  document.querySelectorAll(".toolbtn").forEach(button=>button.onclick=()=>{if(historyView||groupEdit.active)return;paintTool=button.dataset.tool;document.querySelectorAll(".toolbtn").forEach(b=>b.classList.toggle("on",b===button))});
  document.querySelectorAll(".dock-tab").forEach(button=>button.onclick=()=>activateDock(button.dataset.tab));
  $("resetLayout").onclick=resetLayout;$("applyStudents").onclick=applyStudentNames;
  $("rowMinus").onclick=()=>changeGridDimension("rows",-1);$("rowPlus").onclick=()=>changeGridDimension("rows",1);$("colMinus").onclick=()=>changeGridDimension("cols",-1);$("colPlus").onclick=()=>changeGridDimension("cols",1);
  $("addStudent").onclick=addStudentFromStrip;$("fillStudentCount").onclick=fillStudentsToTarget;
  $("targetStudentCount").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();fillStudentsToTarget()}};
  $("undoButton").onclick=undoAction;$("redoButton").onclick=redoAction;
  $("groupColor").oninput=e=>{groupEdit.color=e.target.value;renderGroupPalette();renderLayout()};
  $("generateAssignment").onclick=generateAssignment;$("confirmAssignment").onclick=confirmAssignment;$("openPlayback").onclick=openPlayback;$("exitHistoryView").onclick=exitHistory;
  $("newGroup").onclick=()=>startGroupEdit();$("saveGroup").onclick=saveGroup;$("cancelGroup").onclick=cancelGroupEdit;
  $("className").onchange=e=>{classState.className=e.target.value.trim().slice(0,30)||"우리 반";saveState();renderTopTitle()};
  $("backToTeacher").onclick=backToTeacher;$("simpleBackToTeacher").onclick=backToTeacher;$("run1").onclick=()=>runPlayback(1);$("run5").onclick=()=>runPlayback(5);$("instant").onclick=finishPlayback;
  $("simpleViewButton").onclick=openSimpleView;$("backToGame").onclick=backToGame;$("downloadJpg").onclick=downloadSimpleJpg;
  $("exportJson").onclick=exportClassData;$("importJson").onclick=()=>$("importJsonFile").click();$("importJsonFile").onchange=event=>importClassData(event.target.files?.[0]);$("reloadStorage").onclick=()=>location.reload();
  window.addEventListener("resize",()=>{fitRoom();fitEditorGrid()});
  window.addEventListener("storage",handleExternalStorageChange);
  document.addEventListener("keydown",event=>{
    const editable=["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
    if(editable)return;
    const mod=event.ctrlKey||event.metaKey;
    if(mod&&event.key.toLowerCase()==="z"){event.preventDefault();event.shiftKey?redoAction():undoAction()}
    else if(mod&&event.key.toLowerCase()==="y"){event.preventDefault();redoAction()}
  });
}
function renderTopTitle(){$("topClassTitle").textContent=`${classState.className||"우리 반"} · 자리배치 Studio V6.24`;$("className").value=classState.className||"우리 반"}
function init(){
  bindUI();bindRules();bindAvatar();renderStudentsInput();renderTopTitle();renderLayout();renderStudentStrip();renderStudentInspector();renderGroups();renderHistory();renderGroupPalette();activateDock("settings");ensureStudentGlassesAssets();
  if(window.ResizeObserver){new ResizeObserver(()=>fitEditorGrid()).observe($("editorWrap"))}
  if(classState.assignments.length)setAssignmentStatus("저장된 확정 배치를 불러왔습니다.",true);
  if(storageRuntime.saveBlocked){setSaveStatus("저장 중지 · 복구 필요","error");showStorageAlert(storageRuntime.loadIssue,"error")}
  else{
    persistStateOnly();
    if(storageRuntime.migratedLegacy){showStorageAlert("이전 버전 데이터를 안전하게 불러와 새 저장 형식으로 복사했습니다. 이전 원본도 그대로 보존되어 있습니다.","success")}
  }
  $("targetStudentCount").value=classState.students.length;
  resetUndoHistory();
}
init();
