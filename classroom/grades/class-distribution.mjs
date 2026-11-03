// Teacher-only class distribution of standard scores. Read-only on the workspace and never sent
// outside the grade manager: no message, storage write or network request comes from here.
import {classAssessmentDistribution,formatGrade,roster} from './model.mjs';
import {buildStudentSubjectDashboard} from './student-dashboard.mjs';

const REASON={incomplete:'평가 일부 미입력',no_comparable_assessments:'비교 가능한 평가 없음',insufficient:'완료 학생 5명 미만',constant:'모든 점수가 같음',needs_direction:'기록 방향 미정',missing:'미입력'};
export const distributionReason=status=>REASON[status]||'계산 불가';

export function classDistributionSubjects(workspace,classId){
 return [...new Set(workspace.assessments.filter(a=>a.classIds.includes(classId)).map(a=>a.subject))];
}
export function classDistributionAssessments(workspace,classId,subject){
 return workspace.assessments.filter(a=>a.classIds.includes(classId)&&a.subject===subject);
}
// One subject (same composite as the personal dashboard) or one assessment.
// points: pupils with a standard score, best first; excluded: the rest, with why.
export function buildClassDistribution(workspace,classId,{subject,assessmentId=null}){
 const people=roster(workspace,classId),points=[],excluded=[];let status='ok';
 if(assessmentId){
  const a=workspace.assessments.find(x=>x.id===assessmentId),c=workspace.criteria.find(x=>x.assessmentId===assessmentId);
  const dist=classAssessmentDistribution(workspace,assessmentId,classId);
  status=dist.status;
  for(const r of dist.records){
   const person=people.find(p=>p.id===r.membershipId);
   if(r.z!==null)points.push({membershipId:r.membershipId,name:r.name,number:r.number,z:r.z,detail:formatGrade(c,r.raw)});
   else excluded.push({membershipId:r.membershipId,name:r.name,number:person?.number??r.number,reason:r.raw===null?REASON.missing:distributionReason(dist.status)});
  }
  points.title=`${a.subject} · ${a.title}`;
 }else{
  for(const person of people){
   const s=buildStudentSubjectDashboard(workspace,person.id)?.subjects.find(x=>x.name===subject);
   if(s&&s.z!==null)points.push({membershipId:person.id,name:person.name,number:person.number,z:s.z,detail:`평가 ${s.completed}/${s.total}개 입력`});
   else{excluded.push({membershipId:person.id,name:person.name,number:person.number,reason:distributionReason(s?.status)});if(s&&s.status!=='incomplete')status=s.status;}
  }
  if(points.length)status='ok';
 }
 points.sort((x,y)=>y.z-x.z||x.number-y.number);
 let rank=0;points.forEach((p,i)=>{if(i&&Math.abs(p.z-points[i-1].z)>1e-9)rank=i;p.rank=rank+1;});
 return {title:assessmentId?points.title:`${subject} · 교과 전체`,status,points:[...points],excluded};
}
// Name chips stacked above the axis so none overlap; returns each chip's column x and row.
export function stackChips(points,xOf,chipWidth){
 const rows=[];
 return points.map(p=>{
  const x=xOf(p.z);let row=0;
  while((rows[row]||[]).some(other=>Math.abs(other-x)<chipWidth+3))row++;
  (rows[row]||=[]).push(x);
  return {...p,x,row};
 });
}
