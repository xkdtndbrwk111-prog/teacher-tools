// Read-only per-student learning dashboard. It never mutates the assessment source.
import {classAssessmentDistribution,formatGrade,roster} from './model.mjs';

const EPS=1e-10;
export function buildStudentSubjectDashboard(workspace,membershipId){
 const current=roster(workspace).find(x=>x.id===membershipId);
 if(!current)return null;
 const allClassmates=roster(workspace,current.classId);
 const groups=new Map();
 for(const assessment of workspace.assessments){
  if(!assessment.classIds.includes(current.classId))continue;
  const criterion=workspace.criteria.find(x=>x.assessmentId===assessment.id);
  if(!criterion)continue;
  const dist=classAssessmentDistribution(workspace,assessment.id,current.classId);
  const record=dist.records.find(x=>x.membershipId===membershipId);
  const detail={assessmentId:assessment.id,title:assessment.title,subject:assessment.subject,
   criterion:criterion.name,type:dist.criterionType,raw:record?.raw??null,
   display:formatGrade(criterion,record?.raw??null),z:record?.z??null,
   status:dist.status,completed:record?.raw!==null&&record?.raw!==undefined,
   sampleCount:dist.sampleCount,direction:dist.direction,unit:dist.unit};
  if(!groups.has(assessment.subject))groups.set(assessment.subject,{name:assessment.subject,details:[],distributions:[]});
  const group=groups.get(assessment.subject);group.details.push(detail);group.distributions.push(dist);
 }
 return {membershipId,studentId:current.studentId,name:current.name,classId:current.classId,className:current.className,number:current.number,
  subjects:[...groups.values()].map(group=>{
   const validDists=group.distributions.filter(dist=>dist.status==='ok');
   const completed=group.details.filter(d=>d.completed).length;
   const allIncluded=validDists.every(dist=>dist.records.some(r=>r.membershipId===membershipId&&r.z!==null));
   // Comparability: every student in the reference group must have all of the
   // same valid assessment components. Missing components never become zero.
   const members=allClassmates.map(person=>{
    const zs=validDists.map(dist=>dist.records.find(r=>r.membershipId===person.id)?.z??null);
    return {id:person.id,zs,composite:zs.length&&zs.every(z=>z!==null)?zs.reduce((a,b)=>a+b,0)/zs.length:null};
   });
   const peers=members.filter(person=>person.composite!==null);
   const avg=peers.length?peers.reduce((sum,person)=>sum+person.composite,0)/peers.length:null;
   const sd=peers.length?Math.sqrt(peers.reduce((sum,person)=>sum+(person.composite-avg)**2,0)/peers.length):null;
   const currentValue=members.find(p=>p.id===membershipId)?.composite??null;
   let status='ok',z=null;
   if(!validDists.length)status='no_comparable_assessments';
   else if(!allIncluded || currentValue===null)status='incomplete';
   else if(peers.length<5)status='insufficient';
   else if(sd<EPS)status='constant';
   else z=(currentValue-avg)/sd;
   return {name:group.name,z,status,completed,total:group.details.length,
    comparableAssessments:validDists.length,peerCount:peers.length,details:group.details};
  })};
}
