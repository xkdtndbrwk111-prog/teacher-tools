// STAGE 03 — Disposable, local-only projection of the seating roster into
// a V0.6.8 grade TEST workspace. Never match students by name or overwrite grades.
import {addClass,addStudent,validateWorkspace} from './model.mjs';
const AXIS_VISUAL={character:['boy1','boy2','girl','trav','prin'],hair:['brown','black'],outfit:['green','blue','red','yellow','purple','orange'],glasses:['none','red','black','brown','navy','pink','gray']};
export function validateHostRoster(roster){
 if(!roster||typeof roster!=='object'||typeof roster.sourceInstanceId!=='string'||!/^[-a-zA-Z0-9]{8,100}$/.test(roster.sourceInstanceId)||typeof roster.className!=='string'||!roster.className.trim()||roster.className.length>50||!Array.isArray(roster.students)||roster.students.length>200)throw Error('자리배치 학급 원본 형식 오류');
 const ids=new Set();
 const students=roster.students.map((s,index)=>{
  if(!s||typeof s.id!=='string'||!s.id||s.id.length>100||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>50)throw Error('중복/누락 학생 ID: 자동 연결을 중단했습니다.');
  ids.add(s.id);
  const visual=Object.fromEntries(Object.keys(AXIS_VISUAL).map(k=>[k,s.visual?.[k]]));
  const safeVisual=Object.keys(visual).every(k=>AXIS_VISUAL[k].includes(visual[k]))?visual:null;
  return {id:s.id,name:s.name.trim(),gender:['male','female'].includes(s.gender)?s.gender:'none',visual:safeVisual,number:index+1};
 });
 return {sourceInstanceId:roster.sourceInstanceId,className:roster.className.trim(),students};
}
// Numbers belong to the teacher: a new student goes last and list order never renumbers anyone.
const nextNumber=(w,classId)=>w.memberships.filter(x=>x.active&&x.classId===classId).reduce((n,x)=>Math.max(n,x.number),0)+1;
export function projectRoster(workspace,host){
 const roster=validateHostRoster(host);
 if(workspace.stage03Bridge && workspace.stage03Bridge.installId!==host.installId)throw Error('다른 설치의 성적 작업공간입니다. 자동 연결을 차단합니다.');
 if(!workspace.stage03Bridge && (workspace.classes.length||workspace.students.length||workspace.gradeValues.length))throw Error('출처를 알 수 없는 기존 성적 작업공간은 자동 병합하지 않습니다.');
 const out=structuredClone(workspace);
 let changed=false;
 if(!out.stage03Bridge){out.stage03Bridge={installId:host.installId,format:'stage031-multiclass-projection.v1'};changed=true;}
 let cls=out.classes.find(c=>c.stage03SourceId===roster.sourceInstanceId);
 if(!cls){cls=addClass(out,roster.className);cls.stage03SourceId=roster.sourceInstanceId;changed=true;}
 if(cls.name!==roster.className){cls.name=roster.className;changed=true;}
 const seen=new Set();const current=out.memberships.filter(x=>x.classId===cls.id);
 const linkBySeatId=new Map();
 for(const mem of current){if(!mem.stage03SeatingId)continue;
  if(linkBySeatId.has(mem.stage03SeatingId))throw Error('동일 자리배치 ID에 두 소속이 연결되어 있습니다.');
  linkBySeatId.set(mem.stage03SeatingId,mem);
 }
 let added=0,renamed=0,deactivated=0;
 for(const pupil of roster.students){
  let mem=linkBySeatId.get(pupil.id);
  if(!mem){
   const number=nextNumber(out,cls.id);
   mem=addStudent(out,cls.id,pupil.name);
   mem.number=number;
   mem.stage03SeatingId=pupil.id;
   const st=out.students.find(s=>s.id===mem.studentId);st.stage03SeatingId=pupil.id;
   added++;changed=true;
  }
  const st=out.students.find(s=>s.id===mem.studentId);
  if(!st)throw Error('성적 학생 참조가 끊어졌습니다.');
  if(st.name!==pupil.name){st.name=pupil.name;renamed++;changed=true;}
  if(!mem.active){
   mem.active=true;changed=true;
   if(out.memberships.some(x=>x!==mem&&x.active&&x.classId===cls.id&&x.number===mem.number))mem.number=nextNumber(out,cls.id);
  }
  const desired=pupil.visual?{id:pupil.id,visual:pupil.visual,gender:pupil.gender}:null;
  if(desired && JSON.stringify(st.seatingLink)!==JSON.stringify(desired)){st.seatingLink=desired;changed=true;}
  if(!desired && st.seatingLink){delete st.seatingLink;changed=true;}
  seen.add(pupil.id);
 }
 for(const mem of current){if(mem.stage03SeatingId&&!seen.has(mem.stage03SeatingId)&&mem.active){mem.active=false;deactivated++;changed=true;}}
 validateWorkspace(out);
 return {workspace:out,changed,stats:{added,renamed,deactivated,active:roster.students.length,previousUnlinked:deactivated}};
}
export function inactiveMembers(workspace,classId){
 return workspace.memberships.filter(mem=>!mem.active&&mem.classId===classId&&mem.stage03SeatingId).map(mem=>({
  id:mem.id,
  name:workspace.students.find(s=>s.id===mem.studentId)?.name||'',
  gradeCount:workspace.gradeValues.filter(g=>g.membershipId===mem.id&&g.value!==null).length
 }));
}
// The excluded record keeps its IDs and takes over the current student's seating link.
export function relinkInactiveMembership(workspace,inactiveId,targetId){
 const out=structuredClone(workspace);
 const old=out.memberships.find(mem=>mem.id===inactiveId),target=out.memberships.find(mem=>mem.id===targetId);
 if(!old||old.active||!target||!target.active||old.classId!==target.classId)throw Error('같은 반의 제외 학생과 현재 학생만 연결할 수 있습니다.');
 const oldValues=out.gradeValues.filter(g=>g.membershipId===old.id&&g.value!==null);
 const newValues=out.gradeValues.filter(g=>g.membershipId===target.id&&g.value!==null);
 if(newValues.some(g=>oldValues.some(x=>x.assessmentId===g.assessmentId)))throw Error('두 학생 모두 성적이 입력된 평가가 있어 연결하지 않았습니다. 한쪽 성적을 먼저 지워 주세요.');
 out.gradeValues=out.gradeValues.filter(g=>g.membershipId!==target.id&&!(g.membershipId===old.id&&g.value===null));
 out.gradeValues.push(...newValues.map(g=>({...g,membershipId:old.id})));
 const oldStudent=out.students.find(s=>s.id===old.studentId),newStudent=out.students.find(s=>s.id===target.studentId);
 oldStudent.name=newStudent.name;
 oldStudent.stage03SeatingId=newStudent.stage03SeatingId;
 if(newStudent.seatingLink)oldStudent.seatingLink=newStudent.seatingLink;else delete oldStudent.seatingLink;
 old.stage03SeatingId=target.stage03SeatingId;
 if(out.memberships.some(mem=>mem!==old&&mem!==target&&mem.active&&mem.classId===old.classId&&mem.number===old.number))old.number=target.number;
 old.active=true;
 out.memberships=out.memberships.filter(mem=>mem.id!==target.id);
 if(!out.memberships.some(mem=>mem.studentId===newStudent.id))out.students=out.students.filter(s=>s.id!==newStudent.id);
 validateWorkspace(out);
 return out;
}
