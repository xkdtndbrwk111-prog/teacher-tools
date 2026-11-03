// Classroom Manager product model V0.1: local workspace only, never Google-authoritative.
export const ABILITY_AXES=Object.freeze({intelligence:'지력',stamina:'체력',leadership:'지도력',charm:'매력',initiative:'적극성'});
export const LEVEL_SETS = Object.freeze({3:Object.freeze(['매우잘함','잘함','보통']),4:Object.freeze(['매우잘함','잘함','보통','노력요함']),5:Object.freeze(['수','우','미','양','가'])});
export const getCriterionType = c => c?.type === 'level' ? 'level' : c?.type === 'other' ? 'other' : 'score';
// A school's own level names (상·중·하, ◎○△, 우수·보통·향상필요 ...) come with a school plan; other level
// assessments use the fixed sets above.
// An assessment belongs to 1학기 or 2학기; one without a semester (made before semesters) shows in both.
export const SEMESTERS = Object.freeze(['1','2']);
export const inSemester = (a, semester) => !a?.semester || !semester || a.semester === semester;
export const levelsOf = c => c?.custom ? (Array.isArray(c.levels) ? c.levels : []) : (LEVEL_SETS[c?.levelCount] || []);
const PLAN_FIELDS=['school','schoolCode','year','semester','grade','period','code','standard','unit','element','area','method','file'];
function cleanPlan(plan){
 if(plan===undefined||plan===null)return undefined;
 if(typeof plan!=='object'||Array.isArray(plan))throw Error('수행평가 정보 형식 오류');
 const out={};
 for(const k of PLAN_FIELDS){const v=plan[k];if(v===undefined||v==='')continue;
  if(Array.isArray(v)){if(v.length>10||v.some(x=>typeof x!=='string'||x.length>60))throw Error('수행평가 정보 형식 오류');out[k]=v.map(x=>x.trim());}
  else{if(typeof v!=='string'&&typeof v!=='number')throw Error('수행평가 정보 형식 오류');const t=String(v).trim();if(t.length>2000)throw Error('수행평가 정보가 너무 깁니다.');if(t)out[k]=t;}}
 return out;
}
function cleanCustomLevels(levels,notes){
 if(!Array.isArray(levels)||levels.length<2||levels.length>5)throw Error('단계는 2~5개여야 합니다.');
 const names=levels.map(x=>str(x));
 if(names.some(x=>!x||x.length>20)||new Set(names).size!==names.length)throw Error('단계 이름을 확인하세요.');
 const n={};
 if(notes!==undefined&&notes!==null){if(typeof notes!=='object'||Array.isArray(notes))throw Error('단계 설명 형식 오류');
  for(const [k,v] of Object.entries(notes)){if(!names.includes(k))continue;if(typeof v!=='string'||v.length>1500)throw Error('단계 설명이 너무 깁니다.');if(v.trim())n[k]=v.trim();}}
 return {levels:names,levelNotes:n};
}
export const formatGrade = (criterion, value) => value === null || value === undefined ? '— 미입력 —' : getCriterionType(criterion) === 'other' ? `${value}${criterion.unit}` : getCriterionType(criterion) === 'score' ? `${value}점` : String(value);
export const SCHEMA = 'tt.classroom.workspace.v1';
export const gid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const str = v => typeof v === 'string' ? v.trim() : '';
export function schoolYear(date = new Date()) {
 return date.getMonth() < 2 ? date.getFullYear() - 1 : date.getFullYear();
}
export function fresh(year = schoolYear()) {
  return { schema: SCHEMA, year: Number(year), classes: [], students: [], memberships: [], assessments: [], criteria: [], gradeValues: [], updatedAt: null };
}
export function sample(year = schoolYear()) {
  const m = fresh(year);
  for (const name of ['6학년 1반', '6학년 2반', '6학년 3반', '6학년 4반']) {
    const c = addClass(m, name);
    for (const n of ['김가온', '이하늘', '박다온', '최서준', '정하린']) addStudent(m, c.id, n);
  }
  const a = addAssessment(m, {title:'1단원 평가',subject:'수학',criterion:'점수',maxScore:100,classIds:m.classes.map(c=>c.id)});
  for (const member of m.memberships) {if (m.memberships.indexOf(member) % 4 !== 0) setGrade(m, a.id, member.id, String(70+(m.memberships.indexOf(member)*3)%31));}
  return m;
}
export function addClass(m, name) {
  name = str(name); if (!name || name.length > 50) throw Error('학급 이름은 1~50자로 입력하세요.');
  if (m.classes.some(c => c.name === name)) throw Error('같은 학급 이름이 이미 있습니다.');
  const c = {id:gid(), name}; m.classes.push(c); return c;
}
export function renameClass(m, id, name) {
  const c=m.classes.find(c=>c.id===id); if(!c) throw Error('학급을 찾을 수 없습니다.');
  name=str(name); if(!name || name.length>50 || m.classes.some(x=>x.id!==id&&x.name===name)) throw Error('학급 이름을 확인하세요.');
  c.name=name;
}
export function addStudent(m, classId, name) {
  if(!m.classes.some(c=>c.id===classId)) throw Error('학급이 없습니다.');
  name=str(name); if(!name || name.length>50) throw Error('학생 이름은 1~50자로 입력하세요.');
  const st={id:gid(),name}; const member={id:gid(),studentId:st.id,classId,number:m.memberships.filter(x=>x.classId===classId).reduce((v,x)=>Math.max(v,x.number),0)+1,active:true};
  m.students.push(st);m.memberships.push(member);return member;
}
export function setMemberNumbers(m, classId, numbers) {
 const members=m.memberships.filter(x=>x.active&&x.classId===classId);
 const values=members.map(x=>numbers[x.id]??x.number);
 if(values.some(n=>!Number.isInteger(n)||n<1||n>999))throw Error('번호는 1~999로 입력하세요.');
 if(new Set(values).size!==values.length)throw Error('같은 번호를 두 학생에게 줄 수 없습니다.');
 members.forEach((x,i)=>{x.number=values[i]});
}
export function renameStudent(m, membershipId, name) {
  const mem=m.memberships.find(x=>x.id===membershipId);const st=mem&&m.students.find(x=>x.id===mem.studentId);
  name=str(name);if(!st || !name || name.length>50) throw Error('학생 이름을 확인하세요.');st.name=name;
}
export function deactivateStudent(m, membershipId) {
 const mem=m.memberships.find(x=>x.id===membershipId);if(!mem) throw Error('학급 소속을 찾을 수 없습니다.');mem.active=false;
}
export function addAssessment(m, {title,subject,criterion,maxScore,classIds,gradeType='score',levelCount=3,unit='',recordDirection='',customLevels=null,levelNotes=null,plan=undefined,semester='' }) {
 title=str(title);subject=str(subject);criterion=str(criterion)|| (gradeType==='level'?'평가 수준':'점수');
 if(!title || title.length>100 || !subject || subject.length>50 || !criterion || criterion.length>80) throw Error('평가 정보를 확인하세요.');
 if(!['score','level','other'].includes(gradeType)) throw Error('평가 방식은 점수·단계·기타 중 선택하세요.');
 if(gradeType==='other'&&!['higher','lower'].includes(recordDirection))throw Error('기타 평가의 우수 방향을 선택하세요.');
 let newCriterion;
 if(gradeType==='level') {
  if(customLevels){
   const custom=cleanCustomLevels(customLevels,levelNotes);
   newCriterion={type:'level',custom:true,levelCount:custom.levels.length,...custom,maxScore:null};
   const p=cleanPlan(plan);if(p)newCriterion.plan=p;
  }else{
  const levels=LEVEL_SETS[Number(levelCount)];
  if(!levels) throw Error('단계 수는 3, 4, 5 중에서 선택하세요.');
  newCriterion={type:'level',levelCount:Number(levelCount),levels:[...levels],maxScore:null};
  }
 } else if(gradeType==='other') {
  unit=str(unit);
  if(!unit || unit.length>12 || /[<>\\]/.test(unit)) throw Error('기타 평가 단위는 1~12자로 입력하세요. (예: 초, m, 회)');
  newCriterion={type:'other',unit,recordDirection,maxScore:null};
 } else {
  const max=Number(maxScore);
  if(!Number.isFinite(max) || max<=0 || max>10000) throw Error('만점은 0보다 크고 10000 이하로 지정하세요.');
  newCriterion={type:'score',maxScore:max};
 }
 const ids=[...new Set(classIds||[])];if(!ids.length || ids.some(id=>!m.classes.some(c=>c.id===id))) throw Error('적용할 학급을 선택하세요.');
 semester=String(semester||'');if(semester&&!SEMESTERS.includes(semester))throw Error('학기는 1학기 또는 2학기로 고르세요.');
 const a={id:gid(),title,subject,classIds:ids,...(semester?{semester}:{})};m.assessments.push(a);
 m.criteria.push({id:gid(),assessmentId:a.id,name:criterion,...newCriterion});return a;
}
export function setGrade(m, assessmentId, membershipId, value) {
 const a=m.assessments.find(x=>x.id===assessmentId),mem=m.memberships.find(x=>x.id===membershipId&&x.active),c=m.criteria.find(x=>x.assessmentId===assessmentId);
 if(!a||!mem||!c||!a.classIds.includes(mem.classId))throw Error('평가·학생의 소속 관계가 올바르지 않습니다.');
 const input=str(value);
 let normalized;
 if(getCriterionType(c)==='level') {
  if(input!==''&&!levelsOf(c).includes(input)) throw Error(`이 평가는 ${levelsOf(c).join('·')} 중 하나를 선택하세요.`);
  normalized=input===''?null:input;
 } else if(getCriterionType(c)==='other') {
  const cleaned=input.endsWith(c.unit)?input.slice(0,-c.unit.length).trim():input;
  if(cleaned!=='' && (!/^\d+(?:\.\d{1,3})?$/.test(cleaned)||Number(cleaned)>999999999)) throw Error(`기록은 0 이상의 숫자(소수 셋째 자리까지)로 입력하세요. 단위: ${c.unit}`);
  normalized=cleaned===''?null:Number(cleaned);
 } else {
  const num=input===''?null:Number(input);
  if(num!==null && (!Number.isFinite(num)||num<0||num>c.maxScore||!/^\d+(\.\d{1,2})?$/.test(input))) throw Error(`점수는 0~${c.maxScore} 사이의 숫자(소수 둘째 자리까지)로 입력하세요.`);
  normalized=num;
 }
 const existing=m.gradeValues.find(x=>x.assessmentId===assessmentId&&x.criterionId===c.id&&x.membershipId===membershipId);
 if(existing) existing.value=normalized;
 else m.gradeValues.push({assessmentId,criterionId:c.id,membershipId,value:normalized});
 return normalized;
}
export function getGrade(m,aid,mid) {const c=m.criteria.find(x=>x.assessmentId===aid);return m.gradeValues.find(v=>v.assessmentId===aid&&v.criterionId===c?.id&&v.membershipId===mid)?.value??null;}
export function roster(m, classId=null) {
 return m.memberships.filter(mem=>mem.active&&(classId===null||mem.classId===classId)).map(mem=>({ ...mem,name:m.students.find(s=>s.id===mem.studentId)?.name||'',className:m.classes.find(c=>c.id===mem.classId)?.name||''})).sort((a,b)=>a.className.localeCompare(b.className,'ko') || a.number-b.number);
}
export function validateWorkspace(w) {
 if(!w || w.schema!==SCHEMA || !Number.isInteger(w.year) || w.year<2000 || w.year>2100) throw Error('지원하지 않는 학년도/형식의 백업입니다.');
 for(const name of ['classes','students','memberships','assessments','criteria','gradeValues']) if(!Array.isArray(w[name]) || w[name].length>20000) throw Error('백업 구조를 확인하세요.');
 const indexes={};for(const name of ['classes','students','memberships','assessments','criteria']){
  const ids=new Set();for(const row of w[name]) {if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)) throw Error(`중복 또는 누락된 ${name} ID가 있습니다.`);ids.add(row.id);}indexes[name]=ids;
 }
 for(const student of w.students)if(student.seatingLink!==undefined&&!validSeatingLink(student.seatingLink))throw Error('자리배치 아바타 연결 데이터 오류');
 const unique=new Set();
 for(const mem of w.memberships)if(!indexes.students.has(mem.studentId)||!indexes.classes.has(mem.classId)||!Number.isInteger(mem.number)||mem.number<1)throw Error('학급 소속 ID 오류');
 for(const a of w.assessments){if(!Array.isArray(a.classIds)||!a.classIds.length||a.classIds.some(id=>!indexes.classes.has(id)))throw Error('평가 연결 ID 오류');if(a.semester!==undefined&&!SEMESTERS.includes(a.semester))throw Error('평가 학기 오류');}
 for(const c of w.criteria){
  if(!indexes.assessments.has(c.assessmentId) || !str(c.name) || c.name.length>80) throw Error('평가 기준 오류');
  if(c.type!==undefined && !['score','level','other'].includes(c.type)) throw Error('평가 방식 오류');
  if(c.abilityAxis!==undefined && c.abilityAxis!=='' && !Object.hasOwn(ABILITY_AXES,c.abilityAxis))throw Error('평가 능력치 연결 값 오류');
  if(getCriterionType(c)==='other' && c.recordDirection!==undefined && !['higher','lower'].includes(c.recordDirection))throw Error('기타 평가 해석 방향 오류');
  if(getCriterionType(c)==='level'&&c.custom){
   const custom=cleanCustomLevels(c.levels,c.levelNotes);
   if(c.levelCount!==custom.levels.length||custom.levels.some((v,i)=>v!==c.levels[i]))throw Error('평가 단계 구성 오류');
   cleanPlan(c.plan);
  }else if(getCriterionType(c)==='level'){
   const levels=LEVEL_SETS[c.levelCount];
   if(!levels||!Array.isArray(c.levels)||c.levels.length!==levels.length||c.levels.some((v,i)=>v!==levels[i])) throw Error('평가 단계 구성 오류');
  }else if(getCriterionType(c)==='other') {
   if(!str(c.unit)||c.unit.length>12||/[<>\\]/.test(c.unit))throw Error('기타 평가 단위 오류');
  }else if(!Number.isFinite(c.maxScore)||c.maxScore<=0||c.maxScore>10000) throw Error('평가 만점 오류');
 }
 for(const v of w.gradeValues){const a=w.assessments.find(x=>x.id===v.assessmentId), c=w.criteria.find(x=>x.id===v.criterionId&&x.assessmentId===v.assessmentId),mem=w.memberships.find(x=>x.id===v.membershipId);if(!a||!c||!mem||!a.classIds.includes(mem.classId)|| (v.value!==null && (getCriterionType(c)==='level' ? !levelsOf(c).includes(v.value) : (typeof v.value!=='number'||!Number.isFinite(v.value)||v.value<0|| (getCriterionType(c)==='other' ? (v.value>999999999||!Number.isInteger(v.value*1000)) : v.value>c.maxScore))))) throw Error('성적-학생-평가 ID 오귀속/값 오류');const k=`${v.assessmentId}|${v.criterionId}|${v.membershipId}`;if(unique.has(k))throw Error('중복 성적 키');unique.add(k);}
 return true;
}
export function restoreWorkspace(input, year, {allowYearChange=false}={}) {
 const w=typeof input==='string'?JSON.parse(input):input;validateWorkspace(w);
 if(!allowYearChange && Number(year)!==w.year) throw Error(`다른 학년도(${w.year}) 백업입니다. 학년도를 일치시켜야 합니다.`);
 return structuredClone(w);
}
export function gradeCsv(m,assessmentId) {
 const a=m.assessments.find(x=>x.id===assessmentId);if(!a) throw Error('평가를 선택하세요.');
 const q=x=>`"${String(x??'').replaceAll('"','""')}"`;
 const c=m.criteria.find(x=>x.assessmentId===assessmentId);
 return [['학년도','학급','번호','학생','과목','평가',getCriterionType(c)==='level'?'평가 단계':getCriterionType(c)==='other'?`${c.name} (${c.unit})`:'점수'].map(q).join(','),...roster(m).filter(r=>a.classIds.includes(r.classId)).map(r=>[m.year,r.className,r.number,r.name,a.subject,a.title,getGrade(m,assessmentId,r.id)??''].map(q).join(','))].join('\r\n');
}

// Seating Manager is the only avatar editor. Classroom stores a read-only link to its exported profile.
export const SEATING_CHARACTERS = Object.freeze(['boy1','boy2','girl','trav','prin']);
export const SEATING_HAIR = Object.freeze(['brown','black']);
export const SEATING_OUTFITS = Object.freeze(['green','blue','red','yellow','purple','orange']);
export const SEATING_GLASSES = Object.freeze(['none','red','black','brown','navy','pink','gray']);
export function validSeatingLink(link) {
 return !!link && typeof link.id==='string' && link.id.length>0 && link.id.length<=100 &&
   SEATING_CHARACTERS.includes(link.visual?.character) && SEATING_HAIR.includes(link.visual?.hair) &&
   SEATING_OUTFITS.includes(link.visual?.outfit) && SEATING_GLASSES.includes(link.visual?.glasses||'none') && (link.gender===undefined||['male','female','none'].includes(link.gender));
}
export function extractSeatingRoster(value) {
 const data=typeof value==='string'?JSON.parse(value):value;
 const state=data?.classState||data;
 if(!state || !Array.isArray(state.students) || state.students.length>300 || typeof state.className!=='string')
   throw Error('자리배치 매니저의 JSON 백업 또는 동일 출처 저장 자료가 아닙니다.');
 if(data?.classState && data.format!=='teacher-tools.seating.backup') throw Error('자리배치 매니저 백업 형식이 아닙니다.');
 const ids=new Set();
 const students=state.students.map(x=>{
  if(typeof x?.id!=='string'||!x.id||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>50)throw Error('자리배치 학생 식별자가 올바르지 않습니다.');
  ids.add(x.id);
  const v=x.visual;
  const visual={character:v?.character,hair:v?.hair,outfit:v?.outfit,glasses:v?.glasses||'none'};
  if(!validSeatingLink({id:x.id,visual}))return {id:x.id,name:x.name.trim(),visual:null,gender:['male','female'].includes(x.gender)?x.gender:'none'};
  return {id:x.id,name:x.name.trim(),visual,gender:['male','female'].includes(x.gender)?x.gender:'none'};
 });
 return {className:state.className.trim(),students};
}
export function connectSeatingProfiles(m,classId,seating) {
 const classObj=m.classes.find(x=>x.id===classId);if(!classObj)throw Error('학급을 선택하세요.');
 const parsed=extractSeatingRoster(seating);
 const members=roster(m,classId);
 const sourceCounts=new Map(),targetCounts=new Map();
 for(const student of parsed.students)sourceCounts.set(student.name,(sourceCounts.get(student.name)||0)+1);
 for(const member of members)targetCounts.set(member.name,(targetCounts.get(member.name)||0)+1);
 let linked=0,skipped=0;
 for(const member of members){
  const candidate=parsed.students.find(x=>x.name===member.name);
  if(!candidate||!candidate.visual||sourceCounts.get(member.name)!==1||targetCounts.get(member.name)!==1){skipped++;continue;}
  const student=m.students.find(x=>x.id===member.studentId);
  student.seatingLink={id:candidate.id,visual:{...candidate.visual},gender:candidate.gender};linked++;
 }
 return {linked,skipped,sourceClass:parsed.className};
}
export function studentResults(m,membershipId) {
 const member=m.memberships.find(x=>x.id===membershipId&&x.active);if(!member)return [];
 return m.assessments.filter(a=>a.classIds.includes(member.classId)).map(a=>{const c=m.criteria.find(x=>x.assessmentId===a.id);return {assessmentId:a.id,title:a.title,subject:a.subject,criterion:c,value:getGrade(m,a.id,membershipId),display:formatGrade(c,getGrade(m,a.id,membershipId))};});
}

// Product contract V0.5: Classroom Manager calculates assessment-wise, CLASS-specific
// descriptive statistics only. Seating Manager alone decides subject -> five-axis mapping
// and 4/5/10 tier quantization. Never write seating/localStorage values here.
export const INTERPRETATION_EXPORT_FORMAT='tt.classroom.relative-metrics.v1';
export const METRIC_SPEC_VERSION=1;
export const MIN_STANDARD_COHORT=5;
export function numericAssessmentValue(criterion, raw){
 if(raw===null||raw===undefined)return null;
 if(getCriterionType(criterion)==='level'){
  const i=criterion.levels?.indexOf(raw)??-1;
  return i<0?null:criterion.levels.length-i;
 }
 return typeof raw==='number'&&Number.isFinite(raw)?raw:null;
}
export function resolvedRecordDirection(criterion){
 const type=getCriterionType(criterion);
 if(type!=='other')return 'higher';
 return ['higher','lower'].includes(criterion.recordDirection)?criterion.recordDirection:null;
}
export function classAssessmentDistribution(workspace,assessmentId,classId,{minCohort=MIN_STANDARD_COHORT}={}){
 const a=workspace.assessments.find(x=>x.id===assessmentId),c=workspace.criteria.find(x=>x.assessmentId===assessmentId);
 if(!a||!c||!a.classIds.includes(classId))throw Error('학급·평가 연결이 올바르지 않습니다.');
 const type=getCriterionType(c),direction=resolvedRecordDirection(c);
 const people=roster(workspace,classId).map(person=>{
  const raw=getGrade(workspace,assessmentId,person.id);
  const metric=numericAssessmentValue(c,raw);
  const linked=workspace.students.find(s=>s.id===person.studentId)?.seatingLink;
  return {studentId:person.studentId,membershipId:person.id,seatingId:linked?.id||null,
    name:person.name,number:person.number,raw,metric};
 });
 const valid=people.filter(p=>p.metric!==null),n=valid.length;
 const mean=n?valid.reduce((sum,v)=>sum+v.metric,0)/n:null;
 const variance=n?valid.reduce((sum,v)=>sum+(v.metric-mean)**2,0)/n:null;
 const sd=n?Math.sqrt(variance):null;
 // Never produce artificial superiority from a zero-variance class or small sample.
 const status=direction===null?'needs_direction':n<minCohort?'insufficient':sd<1e-10?'constant':'ok';
 const flip=direction==='lower'?-1:1;
 return {
  assessmentId,classId,criterionId:c.id,criterionType:type,subject:a.subject,title:a.title,
  criterionName:c.name,unit:c.unit||null,maxScore:c.maxScore??null,levelCount:c.levelCount??null,
  direction,levels:type==='level'?[...c.levels]:null,
  method:'population-zscore-v1',sampleCount:n,minSample:minCohort,
  mean,sd,status,
  records:people.map(p=>({studentId:p.studentId,membershipId:p.membershipId,
    seatingId:p.seatingId,name:p.name,number:p.number,raw:p.raw,
    z:p.metric===null||status!=='ok'?null:flip*(p.metric-mean)/sd}))
 };
}
export function createSeatingMetricsExport(workspace){
 validateWorkspace(workspace);
 return {
  format:INTERPRETATION_EXPORT_FORMAT,specVersion:METRIC_SPEC_VERSION,
  year:workspace.year,workspaceSchema:SCHEMA,sourceUpdatedAt:workspace.updatedAt??null,generatedAt:new Date().toISOString(),
  interpretation:'학급별 평가 Z점수(모집단 표준편차, 5명 이상); 기타 방향 성적 매니저에서 확정',
  // No 5-axis mapping, rounding tier or mutating source grades in this payload.
  classes:workspace.classes.map(cls=>({id:cls.id,name:cls.name,
   assessments:workspace.assessments.filter(a=>a.classIds.includes(cls.id)).map(a=>classAssessmentDistribution(workspace,a.id,cls.id))}))
 };
}
