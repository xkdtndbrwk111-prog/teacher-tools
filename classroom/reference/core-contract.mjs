/**
 * CORE-CONTRACT-01 — pure, synthetic-data-only reference implementation.
 * Not connected to Seating Manager, Google Drive, Sheets, IndexedDB or production.
 * This module defines invariants to be adopted by future adapters.
 */
export const AXES = Object.freeze(['leadership','intelligence','stamina','charm','initiative']);
export const MODES = Object.freeze(['EASY','NORMAL']);
export const CONTRACT_VERSION = 'tt.integrated.core-contract.v0.1';

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const value8 = v => v === null || (Number.isInteger(v) && v >= 1 && v <= 8);
const validId = id => typeof id === 'string' && id.trim().length > 0;
const copy = value => structuredClone(value);
const assertAxis = axis => assert(AXES.includes(axis), 'UNKNOWN_AXIS');
const assertScale = scale => assert(scale === 4 || scale === 8, 'INVALID_SCALE');
const currentRev = item => item?.revision ?? 0;
const requireRevision = (item, expected) => {
  assert(Number.isInteger(expected) && expected === currentRev(item), 'STALE_REVISION');
};
const traitKey = (membershipId, axis) => `${membershipId}\u001f${axis}`;
const aliasKey = (sourceInstanceId, entityType, legacyId) => `${sourceInstanceId}\u001f${entityType}\u001f${legacyId}`;
const requireMembership = (s, id) => {
  const m = s.memberships[id];
  assert(m && s.classes[m.classId] && s.students[m.studentId], 'MISSING_MEMBERSHIP');
  return m;
};
const requireClass = (s, id) => {
  const cls = s.classes[id]; assert(cls, 'MISSING_CLASS'); return cls;
};
const getRecord = (s, id, axis) => s.traits[traitKey(id,axis)] || {revision:0,manualBase8:null,override:null};
const idUnique = (s, kind, id) => assert(validId(id) && !s[kind][id], `DUPLICATE_OR_MISSING_${kind.toUpperCase()}_ID`);
const perform = (s, opId, fn) => {
  assert(validId(opId), 'INVALID_OP_ID');
  if (s.completedOps[opId]) return {applied:false,duplicate:true,revision:s.revision};
  fn();
  s.completedOps[opId] = true;
  s.revision++;
  return {applied:true,duplicate:false,revision:s.revision};
};

export function newWorkspace({workspaceId,schoolYear,mode='EASY',ownerSub=null}={}) {
  assert(validId(workspaceId), 'INVALID_WORKSPACE_ID');
  assert(Number.isInteger(schoolYear) && schoolYear>=2000 && schoolYear<=2100, 'INVALID_YEAR');
  assert(MODES.includes(mode), 'INVALID_MODE');
  return {schema:CONTRACT_VERSION,workspaceId,schoolYear,mode,ownerSub,restoreEpoch:1,revision:0,
    students:{}, classes:{}, memberships:{}, aliases:{}, traits:{}, completedOps:{}};
}
export function addClass(s,{id,name,scale=4},opId){
  return perform(s,opId,()=>{
    idUnique(s,'classes',id);assert(validId(name),'INVALID_NAME');assertScale(scale);
    s.classes[id]={id,name,schoolYear:s.schoolYear,scale,scaleRevision:0,axisModes:Object.fromEntries(AXES.map(k=>[k,'manual'])),mapping:Object.fromEntries(AXES.map(k=>[k,[]])),mappingRevision:0};
  });
}
export function addStudent(s,{id,name},opId){
  return perform(s,opId,()=>{
    idUnique(s,'students',id); assert(validId(name),'INVALID_NAME');
    s.students[id]={id,name,revision:0};
  });
}
export function addMembership(s,{id,studentId,classId,number,active=true},opId){
  return perform(s,opId,()=>{
    idUnique(s,'memberships',id);assert(s.students[studentId], 'MISSING_STUDENT');requireClass(s,classId);
    assert(Number.isInteger(number)&&number>0,'INVALID_NUMBER');
    s.memberships[id]={id,studentId,classId,schoolYear:s.schoolYear,number,active,revision:0};
  });
}
export function renameStudent(s,studentId,newName,expectedRevision,opId){
  return perform(s,opId,()=>{
    const st=s.students[studentId];assert(st,'MISSING_STUDENT');requireRevision(st,expectedRevision);
    assert(validId(newName),'INVALID_NAME');st.name=newName;st.revision++;
  });
}
export function deactivateMembership(s,membershipId,expectedRevision,opId){
  return perform(s,opId,()=>{
    const m=requireMembership(s,membershipId);requireRevision(m,expectedRevision);
    m.active=false;m.revision++;
  });
}
export function approveLegacyAlias(s,{sourceInstanceId,entityType,legacyId,targetId},opId){
  return perform(s,opId,()=>{
    assert(validId(sourceInstanceId)&&validId(legacyId)&&['student','membership'].includes(entityType),'INVALID_ALIAS');
    assert(validId(targetId),'INVALID_ALIAS_TARGET');
    assert(entityType==='student'?Boolean(s.students[targetId]):Boolean(s.memberships[targetId]),'UNKNOWN_ALIAS_TARGET');
    const key=aliasKey(sourceInstanceId,entityType,legacyId);
    assert(!s.aliases[key] || s.aliases[key] === targetId,'ALIAS_CONFLICT_REQUIRES_EXPLICIT_REVIEW');
    s.aliases[key]=targetId;
  });
}
export function switchMode(s,mode,opId){
  return perform(s,opId,()=>{assert(MODES.includes(mode),'INVALID_MODE');s.mode=mode;});
}
export function setClassScale(s,classId,scale,expectedScaleRevision,opId){
  return perform(s,opId,()=>{
    const cls=requireClass(s,classId);assertScale(scale);
    assert(cls.scaleRevision === expectedScaleRevision,'STALE_SCALE_REVISION');
    cls.scale=scale;cls.scaleRevision++;
  });
}
export function setAxisMode(s,classId,axis,mode,expectedMappingRevision,opId){
  return perform(s,opId,()=>{
    assertAxis(axis);assert(['manual','auto'].includes(mode),'INVALID_AXIS_MODE');
    const cls=requireClass(s,classId);
    assert(cls.mappingRevision===expectedMappingRevision,'STALE_MAPPING_REVISION');
    cls.axisModes[axis]=mode;cls.mappingRevision++;
  });
}
export function setAxisSubjects(s,classId,axis,subjectIds,expectedMappingRevision,opId){
  return perform(s,opId,()=>{
    assertAxis(axis);assert(Array.isArray(subjectIds) && subjectIds.every(validId),'INVALID_SUBJECTS');
    assert(new Set(subjectIds).size===subjectIds.length,'DUPLICATE_SUBJECT');
    const cls=requireClass(s,classId);assert(cls.mappingRevision===expectedMappingRevision,'STALE_MAPPING_REVISION');
    cls.mapping[axis]=[...subjectIds];cls.mappingRevision++;
  });
}
export function setManualBase(s,membershipId,axis,v8,expectedRevision,opId){
  return perform(s,opId,()=>{
    requireMembership(s,membershipId);assertAxis(axis);assert(value8(v8),'INVALID_VALUE8');
    const k=traitKey(membershipId,axis);const rec=getRecord(s,membershipId,axis);requireRevision(rec,expectedRevision);
    s.traits[k]={...rec,manualBase8:v8,revision:rec.revision+1};
  });
}
export function setOverride(s,membershipId,axis,v8,expectedRevision,opId){
  return perform(s,opId,()=>{
    const m=requireMembership(s,membershipId);assertAxis(axis);assert(value8(v8) && v8!==null,'INVALID_OVERRIDE');
    const cls=requireClass(s,m.classId);assert(s.mode==='NORMAL','MODE_FEATURE_DISABLED');assert(cls.axisModes[axis]==='auto','NOT_AUTO_AXIS');
    const k=traitKey(membershipId,axis);const rec=getRecord(s,membershipId,axis);requireRevision(rec,expectedRevision);
    s.traits[k]={...rec,override:{value8:v8,createdAtMappingRevision:cls.mappingRevision},revision:rec.revision+1};
  });
}
export function clearOverride(s,membershipId,axis,expectedRevision,opId){
  return perform(s,opId,()=>{
    requireMembership(s,membershipId);assertAxis(axis);assert(s.mode==='NORMAL','MODE_FEATURE_DISABLED');
    const k=traitKey(membershipId,axis);const rec=getRecord(s,membershipId,axis);requireRevision(rec,expectedRevision);
    // Revision increments and persisted null is the tombstone: old Set must not resurrect.
    s.traits[k]={...rec,override:null,revision:rec.revision+1};
  });
}
export const displayScore = (v8,scale) => {
  assertScale(scale);assert(value8(v8),'INVALID_VALUE8');
  return v8 === null ? null : scale===8?v8:Math.ceil(v8/2);
};
export const enteredValue8 = (score,scale) => {
  assertScale(scale);assert(Number.isInteger(score) && score>=1 && score<=scale,'INVALID_DISPLAY_SCORE');
  return scale===8?score:score*2;
};
export function traitRevision(s,membershipId,axis){return getRecord(s,membershipId,axis).revision;}
/**
 * Cache is input, not persisted here. Cache entry must be {value8,status,dependencyKey}.
 * The future grade calculator owns cache generation and stable subject/cohort rules.
 */
export function effectiveTrait(s,membershipId,axis,cache=null){
  const m=requireMembership(s,membershipId), cls=requireClass(s,m.classId);assertAxis(axis);
  const rec=getRecord(s,membershipId,axis);
  let score8,source;
  if(s.mode==='EASY'||cls.axisModes[axis]==='manual'){
    score8=rec.manualBase8;source=score8===null?'unassigned':'manual';
  } else if(rec.override){
    score8=rec.override.value8;source='override';
  } else if(cache && cache.status==='ok' && cache.dependencyKey===cache.currentDependencyKey && value8(cache.value8) && cache.value8!==null){
    score8=cache.value8;source='automatic';
  } else {
    score8=null;source='unavailable';
  }
  return {value8:score8,display:displayScore(score8,cls.scale),source,scale:cls.scale,manualBase8:rec.manualBase8,overrideActive:Boolean(rec.override),traitRevision:rec.revision,scaleRevision:cls.scaleRevision,mappingRevision:cls.mappingRevision};
}
/** Pure click interpreter: no side effect or network action. */
export function interpretTraitClick({axisMode,scale,displayedScore,clickedScore,source}){
  assertScale(scale);assert(Number.isInteger(clickedScore) && clickedScore>=1 && clickedScore<=scale,'INVALID_DISPLAY_SCORE');
  assert(['manual','auto'].includes(axisMode),'INVALID_AXIS_MODE');
  if(axisMode==='manual')return displayedScore===clickedScore?{command:'NOOP'}:{command:'SET_MANUAL',value8:enteredValue8(clickedScore,scale)};
  if(source==='override')return displayedScore===clickedScore?{command:'CLEAR_OVERRIDE'}:{command:'SET_OVERRIDE',value8:enteredValue8(clickedScore,scale)};
  return {command:'CONFIRM_OVERRIDE',value8:enteredValue8(clickedScore,scale)};
}
/**
 * One guarded UI click mutation. Called AFTER showing any required confirmation.
 * Captures the input scale and revisions: an old 4-point click cannot be
 * reinterpreted as a new 8-point click after a concurrent scale change.
 * This is local reference behavior; remote writes still require separate CAS.
 */
export function commitTraitClick(s,{membershipId,axis,clickedScore,expectedScale,expectedScaleRevision,expectedTraitRevision,opId,confirmed=false,cache=null}){
  if(s.completedOps[opId]) return {applied:false,duplicate:true,revision:s.revision};
  const m=requireMembership(s,membershipId),cls=requireClass(s,m.classId);assertAxis(axis);
  assertScale(expectedScale);
  assert(cls.scale===expectedScale && cls.scaleRevision===expectedScaleRevision,'STALE_SCALE_REVISION');
  assert(traitRevision(s,membershipId,axis)===expectedTraitRevision,'STALE_REVISION');
  const view=effectiveTrait(s,membershipId,axis,cache);
  const action=interpretTraitClick({axisMode:s.mode==='EASY'?'manual':cls.axisModes[axis],scale:cls.scale,
    displayedScore:view.display,clickedScore,source:view.source});
  if(action.command==='NOOP')return {applied:false,noop:true};
  if(action.command==='CONFIRM_OVERRIDE'){
    assert(confirmed,'CONFIRMATION_REQUIRED');
    return setOverride(s,membershipId,axis,action.value8,expectedTraitRevision,opId);
  }
  if(action.command==='SET_MANUAL')return setManualBase(s,membershipId,axis,action.value8,expectedTraitRevision,opId);
  if(action.command==='SET_OVERRIDE')return setOverride(s,membershipId,axis,action.value8,expectedTraitRevision,opId);
  if(action.command==='CLEAR_OVERRIDE')return clearOverride(s,membershipId,axis,expectedTraitRevision,opId);
  throw Error('UNKNOWN_CLICK_COMMAND');
}
/** Does not mutate anything: adapters should be able to display class/trait snapshots. */
export function snapshot(s){return copy(s);}
