/* Teacher-account theme file. Existing drive.file consent; no pupil data, no new OAuth flow. */
const API='https://www.googleapis.com/drive/v3/files',UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const KIND='teacher-tools-theme-v1',NAME='Teacher Tools - Theme Preferences.json';
const FIELDS='id,name,mimeType,trashed,ownedByMe,owners(emailAddress),appProperties,shared';
export function normalizePref(p,T){
 const theme=T.normalize(p?.theme);return p?.version===1&&typeof p.automatic==='boolean'&&theme?{version:1,theme,automatic:p.automatic}:null;
}
export function createThemeCloud({auth,T,fetcher=fetch}){
 const original=auth.session();
 const current=()=>{const s=auth.session();if(s.sub!==original.sub||s.generation!==original.generation||s.key!==original.key)throw Error('THEME_AUTH_CHANGED');return s};
 async function req(url,opt={}){
  const s=current();const {headers={},...rest}=opt;
  const r=await fetcher(url,{...rest,headers:{...headers,Authorization:'Bearer '+s.accessToken},credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  current();if(!r.ok)throw Error('THEME_DRIVE_'+r.status);return r;
 }
 function checked(file){
  if(!file||typeof file.id!=='string'||!/^[A-Za-z0-9_-]{10,200}$/.test(file.id)||file.trashed!==false||file.ownedByMe!==true||file.shared===true||file.mimeType!=='application/json'||file.appProperties?.ttKind!==KIND||!file.owners?.some(x=>x.emailAddress?.toLowerCase()===original.email.toLowerCase()))throw Error('THEME_FILE_IDENTITY');
  return file.id;
 }
 async function find(){
  const found=[];let token='';let pages=0;
  do{
   if(++pages>20)throw Error('THEME_SEARCH_INCOMPLETE');
   const u=new URL(API);u.searchParams.set('q',"trashed = false and appProperties has { key='ttKind' and value='"+KIND+"' }");u.searchParams.set('spaces','drive');u.searchParams.set('pageSize','100');u.searchParams.set('fields','nextPageToken,incompleteSearch,files('+FIELDS+')');if(token)u.searchParams.set('pageToken',token);
   const data=await (await req(u.toString())).json();current();
   if(data.incompleteSearch||!Array.isArray(data.files))throw Error('THEME_SEARCH_INCOMPLETE');
   for(const file of data.files)found.push(checked(file));token=data.nextPageToken||'';
  }while(token);
  if(found.length>1)throw Error('THEME_DUPLICATE_FILES');return found[0]||null;
 }
 async function load(){
  const id=await find();if(!id)return{fileId:null,pref:null};
  const r=await req(API+'/'+encodeURIComponent(id)+'?alt=media');
  if(Number(r.headers.get('content-length')||0)>4096)throw Error('THEME_FILE_SIZE');
  const raw=await r.text();current();if(raw.length>4096)throw Error('THEME_FILE_SIZE');
  const pref=normalizePref(JSON.parse(raw),T);if(!pref)throw Error('THEME_INVALID');
  return{fileId:id,pref};
 }
 async function save(p,expectedFileId){
  const pref=normalizePref(p,T);if(!pref)throw Error('THEME_INVALID');
  // Rediscover before every write; no cached ID from another account, no duplicate
  // creation after a lost response. A separate device creating a file causes a retry.
  const id=await find();if(id!==expectedFileId)throw Error('THEME_FILE_CHANGED');
  const raw=JSON.stringify(pref);
  if(id){
   const r=await req(UPLOAD+'/'+encodeURIComponent(id)+'?uploadType=media&fields=id',{method:'PATCH',headers:{'Content-Type':'application/json; charset=UTF-8'},body:raw});
   const data=await r.json();current();if(data.id!==id)throw Error('THEME_WRITE_ID');return id;
  }
  const boundary='tt-theme-'+globalThis.crypto.randomUUID();
  const metadata={name:NAME,mimeType:'application/json',appProperties:{ttKind:KIND}};
  const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+raw+'\r\n--'+boundary+'--\r\n';
  const r=await req(UPLOAD+'?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
  const data=await r.json();current();if(!/^[A-Za-z0-9_-]{10,200}$/.test(data.id||''))throw Error('THEME_WRITE_ID');return data.id;
 }
 return{load,save};
}
export function attachThemeCloud(manager,auth,T){
 if(!manager||!auth)return;
 let active=null,timer=0;
 const status=s=>{const n=document.getElementById('tt-ui2-theme-cloud-status');if(n)n.textContent=s};
 function still(c){return c===active&&manager.scope()===c.scope&&auth.state().connected&&auth.state().sub===c.sub}
 function schedule(c,ms=900){clearTimeout(timer);timer=setTimeout(()=>void run(c),ms)}
 async function run(c){
  if(!still(c)||c.busy)return;
  c.busy=true;
  try{
   if(!c.loaded){
    const cloud=createThemeCloud({auth,T});const remote=await cloud.load();if(!still(c))return;
    c.fileId=remote.fileId;c.remote=remote.pref?JSON.stringify(remote.pref):'';c.loaded=true;
    if(!c.dirty&&remote.pref)manager.restoreCloud(remote.pref);
    manager.readyCloud();
    status(remote.pref?'Google 테마 불러옴':'Google 테마 저장 준비됨');
   }
   if(c.dirty&&still(c)){
    const p=manager.pref(),key=JSON.stringify(p);if(key===c.remote){c.dirty=false;status('Google 테마 저장됨');return}
    const cloud=createThemeCloud({auth,T});c.fileId=await cloud.save(p,c.fileId);if(!still(c))return;
    c.remote=key;c.dirty=JSON.stringify(manager.pref())!==key;status('Google 테마 저장됨');
   }
  }catch(e){
   if(!still(c))return;
   c.loaded=false;manager.readyCloud();status('Google 테마 저장 확인 필요 · 현재 화면 유지');
   c.busy=false;schedule(c,30000);return;
  }finally{c.busy=false}
  if(still(c)&&c.dirty)schedule(c);
 }
 function syncAuth(){
  const a=auth.state(),scope=manager.scope();
  if(a.mode!=='normal'||!a.connected||scope!=='normal:'+a.sub){
   active=null;clearTimeout(timer);manager.readyCloud();
   status(a.mode==='normal'?'Google 로그인 후 테마 동기화':'EASY · 현재 브라우저에만 저장');return;
  }
  if(active?.scope===scope&&active.generation===a.generation)return;
  clearTimeout(timer);
  const c={scope,sub:a.sub,generation:a.generation,loaded:false,dirty:false,busy:false,fileId:null,remote:''};active=c;status('Google 테마 불러오는 중…');void run(c);
 }
 window.addEventListener('tt-normal-auth-change',syncAuth);
 window.addEventListener('tt-manager-theme-pref',event=>{
  const c=active;if(!c||!still(c)||event.detail?.scope!==c.scope)return;
  c.dirty=true;if(!c.busy)schedule(c);
 });
 window.addEventListener('focus',()=>{if(active&&still(active)&&(!active.loaded||active.dirty))void run(active)});
 syncAuth();
}
