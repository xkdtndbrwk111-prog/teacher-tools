// Classroom Manager V0.6: inspectable Sheets tables, no hidden serialized student database.
import {SCHEMA,validateWorkspace} from './model.mjs';
export const FORMAT='tt.classroom.google-sheets.v1';
export const TABLES=Object.freeze({
  _TT_META:['format','schema','year','ownerSub','revision','savedAt'],
  TT_CLASSES:['id','name'],
  TT_STUDENTS:['id','name','seatingLinkJSON'],
  TT_MEMBERSHIPS:['id','studentId','classId','number','active'],
  TT_ASSESSMENTS:['id','title','subject','classIdsJSON'],
  TT_CRITERIA:['id','assessmentId','name','type','maxScore','levelCount','levelsJSON','unit','recordDirection'],
  TT_GRADES:['assessmentId','criterionId','membershipId','value']
});
const rowsOf=(w,ownerSub,revision,savedAt)=>({
 _TT_META:[[FORMAT,SCHEMA,String(w.year),ownerSub,revision,savedAt]],
 TT_CLASSES:w.classes.map(r=>[r.id,r.name]),
 TT_STUDENTS:w.students.map(r=>[r.id,r.name,r.seatingLink?JSON.stringify(r.seatingLink):'']),
 TT_MEMBERSHIPS:w.memberships.map(r=>[r.id,r.studentId,r.classId,r.number,r.active?'TRUE':'FALSE']),
 TT_ASSESSMENTS:w.assessments.map(r=>[r.id,r.title,r.subject,JSON.stringify(r.classIds)]),
 TT_CRITERIA:w.criteria.map(r=>[r.id,r.assessmentId,r.name,r.type||'score',r.maxScore??'',r.levelCount??'',r.levels?JSON.stringify(r.levels):'',r.unit||'',r.recordDirection||'']),
 TT_GRADES:w.gradeValues.map(r=>[r.assessmentId,r.criterionId,r.membershipId,r.value===null?'':r.value])
});
export function encodeTables(workspace,ownerSub,revision,savedAt=new Date().toISOString()){
 validateWorkspace(workspace);
 if(!ownerSub||typeof ownerSub!=='string'||ownerSub.length>255)throw Error('OWNER_SUB_REQUIRED');
 if(typeof revision!=='string'||revision.length<5)throw Error('REVISION_REQUIRED');
 const data=rowsOf(workspace,ownerSub,revision,savedAt);
 return Object.fromEntries(Object.entries(TABLES).map(([name,columns])=>[name,[[...columns],...data[name]]]));
}
const text=v=>String(v??'');
const json=(v,fallback)=>v===''?fallback:JSON.parse(text(v));
function checkHeaders(name,rows){
 const hdr=TABLES[name];if(!Array.isArray(rows)||JSON.stringify(rows[0])!==JSON.stringify(hdr))throw Error(`SHEET_HEADERS_INVALID:${name}`);
 if(rows.length>20002)throw Error('SHEET_TOO_LARGE');
}
export function decodeTables(tables,expectedYear,expectedSub){
 for(const [name] of Object.entries(TABLES))checkHeaders(name,tables[name]);
 const get=name=>tables[name].slice(1).filter(r=>r.some(v=>text(v)!==''));
 const meta=get('_TT_META');if(meta.length!==1)throw Error('SHEET_META_INVALID');
 const [format,schema,year,sub,revision,savedAt]=meta[0];
 if(format!==FORMAT||schema!==SCHEMA||Number(year)!==Number(expectedYear))throw Error('SHEET_FORMAT_OR_YEAR_MISMATCH');
 if(sub!==expectedSub)throw Error('SHEET_OWNER_SUB_MISMATCH');
 if(typeof revision!=='string'||revision.length<5)throw Error('SHEET_REVISION_INVALID');
 const w={schema:SCHEMA,year:Number(year),updatedAt:savedAt||null,
  classes:get('TT_CLASSES').map(([id,name])=>({id:text(id),name:text(name)})),
  students:get('TT_STUDENTS').map(([id,name,link])=>({...{id:text(id),name:text(name)},...(link?{seatingLink:json(link,null)}:{})})),
  memberships:get('TT_MEMBERSHIPS').map(([id,studentId,classId,number,active])=>({id:text(id),studentId:text(studentId),classId:text(classId),number:Number(number),active:active===true||text(active).toUpperCase()==='TRUE'})),
  assessments:get('TT_ASSESSMENTS').map(([id,title,subject,ids])=>({id:text(id),title:text(title),subject:text(subject),classIds:json(ids,[])})),
  criteria:get('TT_CRITERIA').map(([id,assessmentId,name,type,maxScore,levelCount,levels,unit,recordDirection])=>{
   const r={id:text(id),assessmentId:text(assessmentId),name:text(name),type:text(type)||'score'};
   if(r.type==='score')r.maxScore=Number(maxScore);
   if(r.type==='level'){r.maxScore=null;r.levelCount=Number(levelCount);r.levels=json(levels,[])}
   if(r.type==='other'){r.maxScore=null;r.unit=text(unit);r.recordDirection=text(recordDirection)}
   return r;
  }),
  gradeValues:get('TT_GRADES').map(([assessmentId,criterionId,membershipId,value])=>({assessmentId:text(assessmentId),criterionId:text(criterionId),membershipId:text(membershipId),value:value===''||value===undefined||value===null?null:/^-?(?:\d+\.?\d*|\.\d+)$/.test(text(value))?Number(value):text(value)}))};
 validateWorkspace(w);
 return {workspace:w,revision,savedAt:text(savedAt)};
}
// Sheets can trim trailing empty cells and rows on reads. Normalize for conflict comparison.
export function canonicalTables(tables){
 // Google Sheets values API omits trailing blank cells; compare equivalent table content.
 return JSON.stringify(Object.fromEntries(Object.entries(TABLES).map(([name,columns])=>[
  name,(tables[name]||[]).map(row=>Array.from({length:columns.length},(_,i)=>text(row[i])))
 ])));
}
export function toUpdateCells(tables,ids,existingRowCounts={}){
 return Object.entries(TABLES).map(([name,headers])=>{
  if(!Number.isInteger(ids[name])||ids[name]<0)throw Error(`SHEET_TAB_NOT_FOUND:${name}`);
  const data=tables[name];const rowCount=Math.max(data.length, existingRowCounts[name]||0);
  const rows=data.map(line=>({values:line.map(v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:text(v)}}))}));
  return {updateCells:{range:{sheetId:ids[name],startRowIndex:0,endRowIndex:rowCount,startColumnIndex:0,endColumnIndex:headers.length},rows,fields:'userEnteredValue'}};
 });
}
