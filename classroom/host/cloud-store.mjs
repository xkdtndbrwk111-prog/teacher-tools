// NORMAL mode: the teacher's own Google Sheet holds a copy of everything synced from this browser.
// TT_DATA is the source of truth. The readable grade tabs are for viewing; edits there are not read back.
import {GoogleCloud,checkDriveFile} from '../grades/google-cloud.mjs';
import {TABLES,encodeTables,toUpdateCells} from '../grades/sheet-codec.mjs';
import {fresh} from '../grades/model.mjs';
const SHEETS='https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE='https://www.googleapis.com/drive/v3/files';
const MIME='application/vnd.google-apps.spreadsheet';
const NAME_PREFIX='교실 매니저 ',NAME_SUFFIX='학년도';
export const DATA_TAB='TT_DATA',SYNC_TAB='TT_SYNC';
const SYNC_HEADER=['revision','savedAt','device','countsJSON','note'];
const NOTE='교실 매니저가 관리하는 파일입니다. 시트에서 직접 고친 값은 프로그램에 반영되지 않습니다.';
// Google drops cells over 50,000 characters, so long text is stored in pieces.
export const CHUNK=40000;
export const cloudFileName=year=>`${NAME_PREFIX}${Number(year)}${NAME_SUFFIX}`;
export function splitChunks(text,size=CHUNK){
 const out=[];for(let i=0;i<text.length;i+=size)out.push(text.slice(i,i+size));
 return out.length?out:[''];
}
const SESSION_KEY='tt.classroom.google.session';
export class ClassroomCloud extends GoogleCloud{
 // The page reloads on every class change; the token lasts until the tab closes or it expires.
 restoreSession(){
  try{
   const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
   if(!saved||saved.clientId!==this.clientId||Date.now()>=saved.expiry)return false;
   this.token=saved.token;this.expiry=saved.expiry;this.user=saved.user;
   return true;
  }catch{return false}
 }
 keepSession(){try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({clientId:this.clientId,token:this.token,expiry:this.expiry,user:this.user}))}catch{}}
 dropSession(){try{sessionStorage.removeItem(SESSION_KEY)}catch{}}
 async signIn(){const user=await this.connect();this.keepSession();return user}
 signOut(){this.dropSession();this.logout()}
 async listFiles(){
  this.requireAuth();
  const url=new URL(DRIVE);
  url.searchParams.set('q',`name contains '${NAME_PREFIX.trim()}' and mimeType = '${MIME}' and trashed = false`);
  url.searchParams.set('spaces','drive');url.searchParams.set('pageSize','100');url.searchParams.set('orderBy','createdTime');
  url.searchParams.set('fields','files(id,name,mimeType,trashed,ownedByMe,owners(emailAddress),createdTime)');
  const result=await this.request(url.toString());
  const out=[];
  for(const f of result.files||[]){
   if(f.ownedByMe===false)continue;
   const match=/^교실 매니저 (\d{4})학년도$/.exec(f.name||'');
   if(match)out.push({...checkDriveFile(f,this.user.email),year:Number(match[1])});
  }
  return out;
 }
 async createFile(year){
  this.requireAuth();
  const tabs=[SYNC_TAB,DATA_TAB,...Object.keys(TABLES)];
  const made=await this.request(SHEETS,{method:'POST',body:{properties:{title:cloudFileName(year)},sheets:tabs.map(title=>({properties:{title,gridProperties:{rowCount:1000,columnCount:12}}}))}});
  if(!made.spreadsheetId)throw Error('GOOGLE_CREATE_RESPONSE_INVALID');
  return made.spreadsheetId;
 }
 async metadata(id){
  const s=await this.request(`${SHEETS}/${encodeURIComponent(id)}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`);
  return Object.fromEntries((s.sheets||[]).map(x=>[x.properties.title,{id:x.properties.sheetId,rows:x.properties.gridProperties?.rowCount||0}]));
 }
 async readRanges(id,ranges){
  const url=new URL(`${SHEETS}/${encodeURIComponent(id)}/values:batchGet`);
  ranges.forEach(r=>url.searchParams.append('ranges',r));
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  return (await this.request(url.toString())).valueRanges||[];
 }
 // Cheap check before every save and when the teacher comes back to the tab.
 async readHead(id){
  const [sync]=await this.readRanges(id,[`'${SYNC_TAB}'!A1:E2`]);
  const row=sync?.values?.[1];
  if(!row||!row[0])return{revision:null,savedAt:'',device:'',counts:null};
  let counts=null;try{counts=JSON.parse(row[3])}catch{}
  return{revision:String(row[0]),savedAt:String(row[1]||''),device:String(row[2]||''),counts};
 }
 async readSnapshot(id){
  const [sync,data]=await this.readRanges(id,[`'${SYNC_TAB}'!A1:E2`,`'${DATA_TAB}'!A1:B`]);
  const row=sync?.values?.[1];
  if(!row||!row[0])return{head:{revision:null,savedAt:'',device:'',counts:null},payload:null};
  const head=await this.readHead(id);
  const text=(data?.values||[]).slice(1).sort((a,b)=>Number(a[0])-Number(b[0])).map(r=>String(r[1]??'')).join('');
  if(head.counts&&head.counts.chars!==text.length)throw Error('CLOUD_DATA_INCOMPLETE');
  return{head,payload:JSON.parse(text)};
 }
 // One batch: Google applies all of it or none of it.
 async write(id,payload,{year,workspace,baseRevision,device,counts}){
  this.requireAuth();
  const head=await this.readHead(id);
  if(head.revision&&head.revision!==baseRevision)throw Error('REMOTE_CHANGED');
  const tabs=await this.metadata(id);
  for(const name of [SYNC_TAB,DATA_TAB,...Object.keys(TABLES)])if(!tabs[name])throw Error('SHEET_NOT_CLASSROOM_FORMAT');
  const revision=crypto.randomUUID(),savedAt=new Date().toISOString();
  const text=JSON.stringify(payload),chunks=splitChunks(text);
  const tables=encodeTables(workspace||fresh(year),this.user.sub,revision,savedAt);
  const dataRows=[['part','text'],...chunks.map((c,i)=>[i,c])];
  const requests=[];
  const fit=(name,count)=>{if(count>tabs[name].rows){requests.push({updateSheetProperties:{properties:{sheetId:tabs[name].id,gridProperties:{rowCount:count+200}},fields:'gridProperties.rowCount'}});tabs[name].rows=count+200}};
  fit(DATA_TAB,dataRows.length);
  for(const name of Object.keys(TABLES))fit(name,tables[name].length);
  const cells=(sheetId,rows,end,columns)=>({updateCells:{range:{sheetId,startRowIndex:0,endRowIndex:end,startColumnIndex:0,endColumnIndex:columns},rows:rows.map(line=>({values:line.map(v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v??'')}}))})),fields:'userEnteredValue'}});
  const ids=Object.fromEntries(Object.keys(TABLES).map(name=>[name,tabs[name].id]));
  const rowCounts=Object.fromEntries(Object.keys(TABLES).map(name=>[name,tabs[name].rows]));
  requests.push(...toUpdateCells(tables,ids,rowCounts));
  requests.push(cells(tabs[DATA_TAB].id,dataRows,tabs[DATA_TAB].rows,2));
  // The head goes last, so an interrupted save never looks complete.
  requests.push(cells(tabs[SYNC_TAB].id,[SYNC_HEADER,[revision,savedAt,device,JSON.stringify({...counts,chars:text.length}),NOTE]],2,5));
  await this.request(`${SHEETS}/${encodeURIComponent(id)}:batchUpdate`,{method:'POST',body:{requests}});
  const after=await this.readHead(id);
  if(after.revision!==revision)throw Error('SAVE_RESULT_UNKNOWN');
  return after;
 }
}
// What to do, from whether each side moved since the last sync.
export function decideSync({localHash,baseHash,remoteRevision,baseRevision,localEmpty}){
 if(!remoteRevision)return'push';
 if(!baseRevision)return localEmpty?'ask-pull':'conflict';
 const localChanged=localHash!==baseHash,remoteChanged=remoteRevision!==baseRevision;
 if(localChanged&&remoteChanged)return'conflict';
 if(remoteChanged)return'ask-pull';
 if(localChanged)return'push';
 return'none';
}
export function summarize(payload){
 const classes=payload?.classes||[];
 return{
  classes:classes.length,
  students:classes.reduce((n,c)=>n+(c.seating?.students?.length||0),0),
  grades:(payload?.gradeYears||[]).reduce((n,y)=>n+(y.workspace?.gradeValues||[]).filter(g=>g.value!==null).length,0)
 };
}
export function changedClasses(a,b){
 const key=c=>JSON.stringify({s:c.seating,p:c.pe});
 const left=new Map((a?.classes||[]).map(c=>[c.id,c])),right=new Map((b?.classes||[]).map(c=>[c.id,c]));
 const names=new Set();
 for(const [id,c] of left)if(!right.has(id)||key(right.get(id))!==key(c))names.add(c.name);
 for(const [id,c] of right)if(!left.has(id))names.add(c.name);
 return[...names];
}
