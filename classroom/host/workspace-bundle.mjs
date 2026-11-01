// Teacher Tools STAGE04 TEST ONLY — portable snapshot structure, no remote I/O.
import {validateWorkspace} from '../grades/model.mjs';
export const FORMAT='tt.seating-host.multiclass-backup';
export const VERSION=1;
const isObject=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const assert=(p,m)=>{if(!p)throw Error(m)};
const plainCopy=v=>structuredClone(v);
const idsUnique=xs=>new Set(xs).size===xs.length;
const safeID=id=>typeof id==='string'&&id.length>0&&id.length<=100&&!/[\u0000-\u001f]/.test(id);
const normalizeName=s=>String(s||'').normalize('NFC').trim();
const uniqueNames=arr=>new Set(arr.map(s=>s.normalize('NFC').toLocaleLowerCase('ko-KR'))).size===arr.length;
export function validatePayload(payload,{validateSeating=()=>true}={}){
 assert(isObject(payload),'백업 데이터 구조가 올바르지 않습니다.');
 assert(payload.format===FORMAT&&payload.version===VERSION,'지원하지 않는 다학급 백업 형식입니다.');
 assert(safeID(payload.sourceInstallId),'원본 설치 식별자가 없습니다.');
 assert(Array.isArray(payload.classes)&&payload.classes.length>=1&&payload.classes.length<=30,'학급 수가 올바르지 않습니다.');
 assert(isObject(payload.registry)&&Array.isArray(payload.registry.classes),'학급 레지스트리가 없습니다.');
 const names=payload.classes.map(c=>normalizeName(c?.name));
 assert(names.every(s=>s&&s.length<=30)&&uniqueNames(names),'중복 또는 잘못된 학급 이름입니다.');
 const cids=payload.classes.map(c=>c.id);
 assert(cids.every(safeID)&&idsUnique(cids),'학급 ID가 중복되거나 잘못되었습니다.');
 assert(payload.registry.classes.length===cids.length&&payload.registry.classes.every((r,i)=>r.id===cids[i]&&r.name===names[i]),'학급 목록과 백업 자료의 순서·ID·이름이 맞지 않습니다.');
 assert(cids.includes(payload.registry.activeId),'선택 학급 ID가 백업에 없습니다.');
 for(const c of payload.classes){
  assert(isObject(c.seating)&&Array.isArray(c.seating.students),'좌석 자료가 누락되었습니다.');
  assert(c.seating.className===c.name,'좌석 학급명이 레지스트리와 다릅니다.');
  assert(validateSeating(c.seating)===true,'자리배치 원본 구조 검증 실패: '+c.name);
  assert(isObject(c.pe),'체육 자료 구조가 올바르지 않습니다: '+c.name);
 }
 assert(Array.isArray(payload.gradeYears)&&payload.gradeYears.length<=100,'학년도별 성적 구조가 잘못되었습니다.');
 const years=[];
 for(const item of payload.gradeYears){
  assert(isObject(item)&&Number.isInteger(item.year)&&item.year>=2000&&item.year<=2100,'학년도 정보가 올바르지 않습니다.');
  assert(item.workspace?.year===item.year,'성적 학년도와 키가 일치하지 않습니다.');
  validateWorkspace(item.workspace);
  assert(item.workspace.stage03Bridge?.installId===payload.sourceInstallId,'성적 원본 설치 ID가 백업과 다릅니다.');
  for(const c of item.workspace.classes){
   if(c.stage03SourceId!==undefined){
    assert(typeof c.stage03SourceId==='string'&&c.stage03SourceId.startsWith(payload.sourceInstallId+'-'),'성적 반의 원본 식별자가 일치하지 않습니다.');
    // Historical grade workspaces may retain a deleted class; preserve their foreign key history.
   }
  }
  years.push(item.year);
 }
 assert(idsUnique(years),'성적 학년도가 중복되었습니다.');
 return {classCount:cids.length,gradeYears:years,studentCount:payload.classes.reduce((n,c)=>n+c.seating.students.length,0),gradeCount:payload.gradeYears.reduce((n,x)=>n+x.workspace.gradeValues.length,0)};
}
export function capturePayload({installId,registry,seatAndPe,gradeYears,validateSeating}){
 const classes=registry.classes.map(c=>{
  const data=seatAndPe.find(x=>x.id===c.id);
  assert(data,'학급 원본이 없습니다: '+c.name);
  return {id:c.id,name:c.name,seating:plainCopy(data.seating),pe:plainCopy(data.pe)};
 });
 const payload={format:FORMAT,version:VERSION,sourceInstallId:installId,registry:{activeId:registry.activeId,classes:registry.classes.map(c=>({id:c.id,name:c.name}))},classes,gradeYears:gradeYears.map(x=>({year:x.year,workspace:plainCopy(x.workspace)}))};
 validatePayload(payload,{validateSeating});
 return payload;
}
export function remapInstall(payload,targetInstallId,{validateSeating}={}){
 validatePayload(payload,{validateSeating});
 assert(safeID(targetInstallId),'대상 설치 ID가 올바르지 않습니다.');
 const result=plainCopy(payload);
 const source=result.sourceInstallId;
 result.sourceInstallId=targetInstallId;
 for(const record of result.gradeYears){
  record.workspace.stage03Bridge.installId=targetInstallId;
  for(const c of record.workspace.classes){
   if(c.stage03SourceId!==undefined){c.stage03SourceId=targetInstallId+c.stage03SourceId.slice(source.length);}
  }
  validateWorkspace(record.workspace);
 }
 validatePayload(result,{validateSeating});
 return result;
}
export async function digestString(s){const bytes=new TextEncoder().encode(s);const d=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function sealPayload(payload){const snapshot=plainCopy(payload),checksum=await digestString(JSON.stringify(snapshot));return {header:'tt-integrated-backup-sha256',createdAt:new Date().toISOString(),checksum,payload:snapshot};}
export async function verifyBundle(bundle,opts){
 assert(isObject(bundle)&&bundle.header==='tt-integrated-backup-sha256'&&/^[a-f0-9]{64}$/.test(bundle.checksum||''),'백업 봉인 정보가 올바르지 않습니다.');
 assert(await digestString(JSON.stringify(bundle.payload))===bundle.checksum,'백업 내용의 SHA-256 검증에 실패했습니다.');
 return validatePayload(bundle.payload,opts);
}
