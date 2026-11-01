// STAGE 03.3: pure, local-only grade workspace reconciliation for class management.
// Never talks to Google and never selects a member by name.
import {validateWorkspace,fresh} from '../grades/model.mjs';
function capture(w,c){
 const memberships=w.memberships.filter(mem=>mem.classId===c.id),ids=new Set(memberships.map(mem=>mem.id));
 const studentIds=new Set(memberships.map(mem=>mem.studentId));
 const assessments=w.assessments.filter(a=>a.classIds.includes(c.id)),aids=new Set(assessments.map(a=>a.id));
 return structuredClone({class:c,memberships,students:w.students.filter(s=>studentIds.has(s.id)),assessments,criteria:w.criteria.filter(x=>aids.has(x.assessmentId)),gradeValues:w.gradeValues.filter(g=>ids.has(g.membershipId))});
}
export function restoreDeletedClass(workspace,saved,{year,installId,name}){
 const out=workspace?structuredClone(workspace):{...fresh(year),stage03Bridge:{installId,format:'stage031-multiclass-projection.v1'}};
 validateWorkspace(out);
 if(out.classes.some(c=>c.id===saved.class.id))throw Error('같은 반의 성적이 이미 있습니다.');
 out.classes.push({...saved.class,name});
 const addMissing=(list,items)=>{for(const item of items)if(!list.some(x=>x.id===item.id))list.push(item)};
 addMissing(out.students,saved.students);
 out.memberships.push(...saved.memberships);
 for(const a of saved.assessments){
  const existing=out.assessments.find(x=>x.id===a.id);
  if(existing){if(!existing.classIds.includes(saved.class.id))existing.classIds.push(saved.class.id)}
  else out.assessments.push({...a,classIds:[saved.class.id]});
 }
 addMissing(out.criteria,saved.criteria);
 out.gradeValues.push(...saved.gradeValues);
 validateWorkspace(out);
 return out;
}
export function reconcileGradeClasses(workspace,installId,classes,deletedIds){
 if(!workspace)return {workspace:null,changed:false,removedGradeValues:0,removedMemberships:0,removedByClass:{}};
 validateWorkspace(workspace);
 if(workspace.stage03Bridge?.installId!==installId)throw Error('성적 원본 설치 ID가 다릅니다. 삭제를 중단합니다.');
 const out=structuredClone(workspace),desired=new Map(classes.map(c=>[installId+'-'+c.id,c.name]));
 const deleted=new Set(deletedIds.map(id=>installId+'-'+id));
 let changed=false,removedGradeValues=0,removedMemberships=0;
 const removedByClass={};
 const droppedGradeClassIds=new Set();
 for(const c of out.classes){
  if(!c.stage03SourceId)continue;
  if(deleted.has(c.stage03SourceId)){
   droppedGradeClassIds.add(c.id);changed=true;
   removedByClass[c.stage03SourceId.slice(installId.length+1)]=capture(workspace,c);
   continue;
  }
  if(desired.has(c.stage03SourceId)&&c.name!==desired.get(c.stage03SourceId)){
   c.name=desired.get(c.stage03SourceId);changed=true;
  }
 }
 if(droppedGradeClassIds.size){
  out.classes=out.classes.filter(c=>!droppedGradeClassIds.has(c.id));
  const removedMembers=new Set(out.memberships.filter(mem=>droppedGradeClassIds.has(mem.classId)).map(mem=>mem.id));
  removedMemberships=removedMembers.size;
  out.memberships=out.memberships.filter(mem=>!removedMembers.has(mem.id));
  const referencedStudents=new Set(out.memberships.map(mem=>mem.studentId));
  out.students=out.students.filter(s=>referencedStudents.has(s.id));
  const removedAssessments=new Set();
  for(const assessment of out.assessments){
   const nextIds=assessment.classIds.filter(id=>!droppedGradeClassIds.has(id));
   if(!nextIds.length){removedAssessments.add(assessment.id);continue;}
   assessment.classIds=nextIds;
  }
  out.assessments=out.assessments.filter(a=>!removedAssessments.has(a.id));
  out.criteria=out.criteria.filter(c=>!removedAssessments.has(c.assessmentId));
  const oldGradeCount=out.gradeValues.length;
  out.gradeValues=out.gradeValues.filter(g=>!removedMembers.has(g.membershipId)&&!removedAssessments.has(g.assessmentId));
  removedGradeValues=oldGradeCount-out.gradeValues.length;
 }
 validateWorkspace(out);
 return {workspace:out,changed,removedGradeValues,removedMemberships,removedByClass};
}
