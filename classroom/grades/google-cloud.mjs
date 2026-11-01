// Restricted, browser-only Google connection. Tokens never enter persistent storage.
import {TABLES,FORMAT,encodeTables,decodeTables,canonicalTables,toUpdateCells} from './sheet-codec.mjs';
const SCOPE='openid email profile https://www.googleapis.com/auth/drive.file';
const USERINFO='https://openidconnect.googleapis.com/v1/userinfo';
const SHEETS='https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE='https://www.googleapis.com/drive/v3/files';
const pickerMime='application/vnd.google-apps.spreadsheet';
export const yearFileName=year=>`교실 관리 매니저 ${Number(year)}학년도`;
export function parseYear(year){const n=Number(year);if(!Number.isInteger(n)||n<2000||n>2100)bad('YEAR_INVALID');return n;}
const quoteQuery=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const bad=code=>{throw Error(code)};
const idPattern=/^[A-Za-z0-9_-]{10,255}$/;
const tokenPattern=/^[A-Za-z0-9._~+\/-]+=*$/;
// Store only a last-used account hint and previously verified file IDs. Never cache access tokens.
const LOGIN_HINT_KEY='tt.classroom.google.last-email.v1';
const YEAR_LINKS_KEY='tt.classroom.google.year-links.v1';
const safeLocal=()=>{try{return globalThis.localStorage||null}catch{return null}};
const safeHint=()=>{try{const value=safeLocal()?.getItem(LOGIN_HINT_KEY)||'';return /^\S+@\S+\.\S+$/.test(value)&&value.length<255?value:''}catch{return ''}};
const setHint=email=>{try{safeLocal()?.setItem(LOGIN_HINT_KEY,email)}catch{}};
const clearHint=()=>{try{safeLocal()?.removeItem(LOGIN_HINT_KEY)}catch{}};
const scopedYearKey=(clientId,sub,year)=>`${clientId}|${sub}|${parseYear(year)}`;
function storedLinks(){
 try{const raw=safeLocal()?.getItem(YEAR_LINKS_KEY);if(!raw||raw.length>20000)return {};
  const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
 }catch{return {}}
}
function storedYearLink(key){const id=storedLinks()[key];return typeof id==='string'&&idPattern.test(id)?id:null;}
function clearYearLinks(clientId,sub){
 if(!sub)return;
 try{const map=storedLinks();const prefix=`${clientId}|${sub}|`;
  for(const key of Object.keys(map))if(key.startsWith(prefix))delete map[key];
  safeLocal()?.setItem(YEAR_LINKS_KEY,JSON.stringify(map));
 }catch{}
}
function rememberYearLink(key,id){if(!idPattern.test(id))return;
 try{const map=storedLinks();delete map[key];map[key]=id;
  const bounded=Object.fromEntries(Object.entries(map).slice(-60));safeLocal()?.setItem(YEAR_LINKS_KEY,JSON.stringify(bounded));
 }catch{}
}

function requireJson(r){const t=r.headers.get('content-type')||'';if(!t.includes('application/json'))bad('GOOGLE_RESPONSE_INVALID')}
export function verifyGoogleProfile(profile){
 if(!profile||typeof profile.sub!=='string'||!/^[\x21-\x7e]{1,255}$/.test(profile.sub)||profile.email_verified!==true||typeof profile.email!=='string'||!/^\S+@\S+\.\S+$/.test(profile.email))bad('GOOGLE_IDENTITY_INVALID');
 return {sub:profile.sub,email:profile.email};
}
export function checkTokenResult(result){
 if(!result||result.error||typeof result.access_token!=='string'||!tokenPattern.test(result.access_token)||result.access_token.length>16384)bad('GOOGLE_OAUTH_DENIED');
 const aliases={'https://www.googleapis.com/auth/userinfo.email':'email','https://www.googleapis.com/auth/userinfo.profile':'profile'};
 const granted=new Set(String(result.scope||'').split(/\s+/).map(x=>aliases[x]||x));
 for(const s of SCOPE.split(' '))if(!granted.has(s))bad('GOOGLE_SCOPE_INCOMPLETE');
 const seconds=Number(result.expires_in);if(!(seconds>45&&seconds<=86400))bad('GOOGLE_TOKEN_INVALID');
 return {token:result.access_token,expiry:Date.now()+(seconds-30)*1000};
}
export function checkDriveFile(file,email){
 if(!file||!idPattern.test(file.id||'')||file.trashed!==false||file.mimeType!==pickerMime||file.ownedByMe!==true||!file.owners?.some(x=>x.emailAddress?.toLowerCase()===email.toLowerCase()))bad('FILE_NOT_OWNED_BY_GOOGLE_USER');
 return {id:file.id,name:file.name};
}
function waitScript(src){return new Promise((resolve,reject)=>{const exists=[...document.scripts].find(x=>x.src===src);if(exists?.dataset.loaded==='true')return resolve();const s=exists||document.createElement('script');s.src=src;s.async=true;s.addEventListener('load',()=>{s.dataset.loaded='true';resolve()},{once:true});s.addEventListener('error',()=>reject(Error('GOOGLE_SDK_LOAD_FAILED')),{once:true});if(!exists)document.head.append(s);});}
export class GoogleCloud {
 constructor(clientId){this.clientId=clientId;this.token=null;this.expiry=0;this.user=null;this.active=null;this.lastFileId=null;this.epoch=0;this.busy=false;this.fileEpoch=0;this.yearLinks=new Map();this.creating=false;}
 available(){return !!this.user&&!!this.token&&Date.now()<this.expiry;}
 requireAuth(){if(!this.available())bad('GOOGLE_SESSION_EXPIRED');}
 async request(url,{method='GET',body=null}={}){
  if(!this.token||Date.now()>=this.expiry||(url!==USERINFO&&!this.user))bad('GOOGLE_SESSION_EXPIRED');const epoch=this.epoch;
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${this.token}`,...(body===null?{}:{'Content-Type':'application/json'})},body:body===null?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  if(epoch!==this.epoch)bad('GOOGLE_SESSION_CHANGED');
  if(!r.ok)bad(r.status===401||r.status===403?`GOOGLE_PERMISSION_${r.status}`:`GOOGLE_API_${r.status}`);
  requireJson(r);return r.json();
 }
 async connect(){
  if(!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(this.clientId))bad('GOOGLE_CLIENT_ID_REQUIRED');
  // Must open Google's OAuth prompt within the direct button-click gesture.
  // SDK loads in index.html; if it is still loading, a second click is required.
  if(!globalThis.google?.accounts?.oauth2)bad('GOOGLE_SDK_LOADING_RETRY_CLICK');
  const hint=safeHint();
  const epoch=++this.epoch;this.token=null;this.expiry=0;this.user=null;this.active=null;this.lastFileId=null;this.yearLinks.clear();++this.fileEpoch;
  const response=await new Promise((resolve,reject)=>{
   // Previously granted consent is reused. An explicit account chooser remains on first use
   // or after logout; a saved email hint can skip it on returning visits when Google permits.
   const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope:SCOPE,
    ...(hint?{login_hint:hint}:{}),callback:resolve,error_callback:()=>reject(Error('GOOGLE_OAUTH_POPUP_CLOSED'))});
   client.requestAccessToken({prompt:hint?'':'select_account'});
  });
  if(epoch!==this.epoch)bad('GOOGLE_SESSION_CHANGED');
  const t=checkTokenResult(response);this.token=t.token;this.expiry=t.expiry;
  try {const user=verifyGoogleProfile(await this.request(USERINFO));if(epoch!==this.epoch)bad('GOOGLE_SESSION_CHANGED');
   if(hint&&user.email.toLowerCase()!==hint.toLowerCase())bad('GOOGLE_ACCOUNT_CHANGED_RETRY');
   this.user=user;setHint(user.email);return user;
  }catch(e){this.logout({clearAccountHint:false});if(e.message==='GOOGLE_ACCOUNT_CHANGED_RETRY')clearHint();throw e}
 }
 async recheck(){this.requireAuth();const old=this.user;const current=verifyGoogleProfile(await this.request(USERINFO));if(current.sub!==old.sub||current.email.toLowerCase()!==old.email.toLowerCase()){this.logout();bad('GOOGLE_ACCOUNT_CHANGED')}return current;}
 logout({clearAccountHint=true}={}){if(clearAccountHint){clearHint();clearYearLinks(this.clientId,this.user?.sub)}++this.epoch;++this.fileEpoch;this.token=null;this.user=null;this.active=null;this.lastFileId=null;this.expiry=0;this.yearLinks.clear();}
 yearKey(year){this.requireAuth();return `${this.user.sub}:${parseYear(year)}`;}
 preferredYearFile(year){return this.yearLinks.get(this.yearKey(year))||storedYearLink(scopedYearKey(this.clientId,this.user.sub,year));}
 switchYear(year){++this.fileEpoch;this.active=null;this.lastFileId=this.available()?this.preferredYearFile(year):null;}
 async ownerFile(id){this.requireAuth();if(!idPattern.test(id))bad('FILE_ID_INVALID');await this.recheck();const f=await this.request(`${DRIVE}/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,owners(emailAddress),ownedByMe`);return checkDriveFile(f,this.user.email)}
 async findYearFiles(year){
  parseYear(year);this.requireAuth();const sub=this.user.sub,epoch=this.epoch;
  await this.recheck();
  // drive.file allows discovery only of files authorized for this OAuth app. An empty
  // result is NOT a global proof that no similarly named Drive file exists.
  const query=`name = '${quoteQuery(yearFileName(year))}' and mimeType = '${pickerMime}' and trashed = false`;
  const found=[],seen=new Set();let token='',page=0;
  do{
   if(++page>20)bad('YEAR_FILE_SEARCH_LIMIT');
   const url=new URL(DRIVE);
   url.searchParams.set('q',query);url.searchParams.set('spaces','drive');url.searchParams.set('pageSize','100');
   url.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,trashed,ownedByMe,owners(emailAddress),createdTime)');
   if(token)url.searchParams.set('pageToken',token);
   const response=await this.request(url.toString());
   if(response.incompleteSearch)bad('YEAR_FILE_SEARCH_INCOMPLETE');
   if(!Array.isArray(response.files))bad('YEAR_FILE_SEARCH_INVALID');
   for(const f of response.files){
    // Do not expose other users' files in the selection UI. Malformed own-file
    // metadata must stop the search rather than silently invite a new file.
    if(f.ownedByMe===false)continue;
    const valid=checkDriveFile(f,this.user.email);
    if(!seen.has(valid.id)){seen.add(valid.id);found.push({id:valid.id,name:valid.name,createdTime:f.createdTime||null});}
   }
   const next=response.nextPageToken||'';
   if(next===token&&next)bad('YEAR_FILE_SEARCH_INVALID');token=next;
  }while(token);
  if(epoch!==this.epoch||this.user?.sub!==sub)bad('GOOGLE_SESSION_CHANGED');
  return found.sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||''))||a.id.localeCompare(b.id));
 }
 async create(year){
  parseYear(year);this.requireAuth();if(this.creating)bad('CREATE_IN_PROGRESS');
  this.creating=true;
  try{
   const perform=async()=>{
    await this.recheck();if(this.active)bad('GOOGLE_FILE_ALREADY_SELECTED');
  // A create request must never bypass discovery, including on double click.
  const existing=await this.findYearFiles(year);
  if(existing.length>1)bad('DUPLICATE_YEAR_FILES_SELECT_EXISTING');
  if(existing.length===1)return {...await this.open(existing[0].id,year),reused:true};
  const name=yearFileName(year);
  const res=await this.request(SHEETS,{method:'POST',body:{properties:{title:name},sheets:Object.keys(TABLES).map(title=>({properties:{title,gridProperties:{rowCount:3000,columnCount:12}}}))}});
  if(!idPattern.test(res.spreadsheetId||''))bad('GOOGLE_CREATE_RESPONSE_INVALID');
  const f=await this.ownerFile(res.spreadsheetId);const id=f.id;
  // If this partial operation fails, the file may already exist. Do NOT retry create blindly.
  const {fresh}=await import('./model.mjs');
  const tables=encodeTables(fresh(year),this.user.sub,crypto.randomUUID());
  const ids=Object.fromEntries((res.sheets||[]).map(x=>[x.properties.title,x.properties.sheetId]));
  await this.request(`${SHEETS}/${id}:batchUpdate`,{method:'POST',body:{requests:toUpdateCells(tables,ids)}});
  return {...await this.open(id,year),reused:false};
   };
   // Lock create across tabs on this browser origin. Another device may still race.
   const lockName=`tt-classroom-new-year-${this.user.sub}-${year}`;
   return globalThis.navigator?.locks?.request ? await globalThis.navigator.locks.request(lockName,{mode:'exclusive'},perform) : await perform();
  }finally{this.creating=false;}
 }
 async choose(apiKey,year){
  this.requireAuth();if(!/^AIza[A-Za-z0-9_-]{20,}$/.test(apiKey))bad('PICKER_API_KEY_REQUIRED');
  await waitScript('https://apis.google.com/js/api.js');
  if(!globalThis.gapi?.load)bad('PICKER_SDK_MISSING');
  await new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('PICKER_SDK_FAILED')),timeout:15000,ontimeout:()=>reject(Error('PICKER_SDK_TIMEOUT'))}));
  const picked=await new Promise((resolve,reject)=>{
   const view=new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setIncludeFolders(false).setSelectFolderEnabled(false);
   const pk=new google.picker.PickerBuilder().addView(view).setOAuthToken(this.token).setDeveloperKey(apiKey).setAppId(this.clientId.split('-')[0]).setOrigin(location.origin).setMaxItems(1).setCallback(event=>{
    if(event.action===google.picker.Action.PICKED){pk.setVisible(false);resolve(event.docs?.[0]?.id)}
    if(event.action===google.picker.Action.CANCEL){pk.setVisible(false);reject(Error('PICKER_CANCELLED'))}
   }).build();pk.setVisible(true);
  });
  return this.open(picked,year);
 }
 async sheetsMetadata(id){const s=await this.request(`${SHEETS}/${encodeURIComponent(id)}?fields=spreadsheetId,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`);
  const ids=Object.fromEntries((s.sheets||[]).map(x=>[x.properties.title,x.properties.sheetId]));
  for(const name of Object.keys(TABLES))if(!Number.isInteger(ids[name]))bad('SHEET_NOT_CLASSROOM_FORMAT');
  return ids;
 }
 async readTables(id){
  const url=new URL(`${SHEETS}/${encodeURIComponent(id)}/values:batchGet`);
  for(const [name,h] of Object.entries(TABLES))url.searchParams.append('ranges',`'${name}'!A1:${String.fromCharCode(64+h.length)}20002`);
  url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
  const result=await this.request(url.toString());const groups=result.valueRanges||[];
  return Object.fromEntries(Object.keys(TABLES).map((key,i)=>[key,groups[i]?.values||[]]));
 }
 async open(id,year){const epoch=this.epoch,fileEpoch=this.fileEpoch,sub=this.user?.sub;parseYear(year);await this.ownerFile(id);const ids=await this.sheetsMetadata(id);const tables=await this.readTables(id);const parsed=decodeTables(tables,year,sub);
  if(epoch!==this.epoch||fileEpoch!==this.fileEpoch||this.user?.sub!==sub)bad('GOOGLE_SESSION_CHANGED');
  this.active={id,year,ids,base:canonicalTables(tables),revision:parsed.revision};this.lastFileId=id;this.yearLinks.set(this.yearKey(year),id);rememberYearLink(scopedYearKey(this.clientId,sub,year),id);return {id,workspace:parsed.workspace};
 }
 async reload(){if(!this.active)bad('GOOGLE_FILE_NOT_SELECTED');const {id,year}=this.active;return this.open(id,year)}
 async save(workspace){
  if(this.busy)bad('SAVE_IN_PROGRESS');if(!this.active)bad('GOOGLE_FILE_NOT_SELECTED');
  this.busy=true;
  const ctx={...this.active}, userSub=this.user?.sub,epoch=this.epoch;
  try{
   if(Number(workspace.year)!==ctx.year)bad('YEAR_MISMATCH');
   await this.ownerFile(ctx.id);if(this.user?.sub!==userSub||this.epoch!==epoch)bad('GOOGLE_ACCOUNT_CHANGED');
   const latest=await this.readTables(ctx.id);
   decodeTables(latest,ctx.year,userSub);
   if(canonicalTables(latest)!==ctx.base)bad('REMOTE_CHANGED_RELOAD_REQUIRED');
   const tables=encodeTables(workspace,userSub,crypto.randomUUID());
   const maxRows=Object.fromEntries(Object.entries(latest).map(([key,rows])=>[key,rows.length]));
   // One explicit batch request for all tables. No blind retry after uncertain outcome.
   await this.request(`${SHEETS}/${ctx.id}:batchUpdate`,{method:'POST',body:{requests:toUpdateCells(tables,ctx.ids,maxRows)}});
   const readback=await this.readTables(ctx.id);
   if(canonicalTables(readback)!==canonicalTables(tables)){this.active=null;bad('SAVE_RESULT_UNKNOWN_CHECK_SHEETS')}
   this.active={...ctx,base:canonicalTables(readback),revision:tables._TT_META[1][4]};return true;
  }catch(e){if(!['REMOTE_CHANGED_RELOAD_REQUIRED','YEAR_MISMATCH','GOOGLE_ACCOUNT_CHANGED'].includes(e.message))this.active=null;throw e}
  finally{this.busy=false}
 }
}
