// Grades → seating trait levels. Read-only on the workspace: rank pupils of one class by their
// average standard score over the chosen subjects, then cut the ranking into equal bands.
import {classAssessmentDistribution} from './model.mjs';

export const TRAIT_AXES=Object.freeze([['leadership','통솔'],['intelligence','지력'],['stamina','체력'],['charm','매력'],['initiative','적극']]);
export function classSubjects(workspace,classId){
 return [...new Set(workspace.assessments.filter(a=>a.classIds.includes(classId)).map(a=>a.subject))];
}
// Returns membershipId → level (scale is best). Pupils with no usable grade are left out.
// An assessment is skipped when it cannot give a standard score (fewer than 5 results, all equal, no direction).
export function rankTraitLevels(workspace,classId,subjects,scale){
 const wanted=new Set(subjects),scores=new Map(),skipped=[];let used=0;
 for(const a of workspace.assessments){
  if(!a.classIds.includes(classId)||!wanted.has(a.subject))continue;
  const dist=classAssessmentDistribution(workspace,a.id,classId);
  if(dist.status!=='ok'){skipped.push({subject:a.subject,title:a.title,status:dist.status});continue;}
  used++;
  for(const r of dist.records)if(r.z!==null){if(!scores.has(r.membershipId))scores.set(r.membershipId,[]);scores.get(r.membershipId).push(r.z);}
 }
 const ranked=[...scores].map(([id,zs])=>({id,score:zs.reduce((x,y)=>x+y,0)/zs.length})).sort((x,y)=>y.score-x.score);
 const levels=new Map();let rank=0;
 ranked.forEach((p,i)=>{
  // Equal scores share the higher band.
  if(i&&Math.abs(p.score-ranked[i-1].score)>1e-9)rank=i;
  levels.set(p.id,scale-Math.floor(rank*scale/ranked.length));
 });
 return {levels,skipped,used};
}
