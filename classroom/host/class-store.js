// All classroom data lives in one IndexedDB store, so a restore or class deletion is one transaction.
// The seating code is synchronous, so it works on a memory copy; each write also goes to a short
// localStorage journal until IndexedDB confirms it, which survives a crash between the two.
(()=>{
 'use strict';
 const DB='tt-classroom-v1',STORE='kv',INSTALL='meta.install-id';
 const JOURNAL='tt.classroom.wal.',ROSTER='tt.classroom.active-roster',LOCK='tt-classroom-manager';
 const OLD_INSTALL='tt.classroom.install-id',OLD_DB='tt-integrated-mount-stage03-ISOLATED-v01',OLD_STORE='workspaces';
 const LEGACY_SEATING=['teacher-tools.seating.state.v1','classroom-seating-integrated-v6_7','classroom-seating-integrated-v6_4','classroom-seating-integrated-v6','classroom-seating-integrated-v5','classroom-seating-integrated-v4'];
 const LEGACY_PE='teacher-tools.seating.pe-prototype.v2';
 const memory=new Map();
 let db=null,prefix='',rosterKey=null,pending=0,waiters=[];

 const openDb=(name=DB,version=1)=>new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB)return reject(Error('이 브라우저는 IndexedDB를 사용할 수 없습니다.'));
  const r=indexedDB.open(name,version);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
 const finished=tx=>new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onabort=()=>reject(tx.error||Error('저장이 중단되었습니다.'));
  tx.onerror=()=>reject(tx.error||Error('저장에 실패했습니다.'));
 });
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 function reportError(error){
  console.error('교실 자료 저장 실패',error);
  window.dispatchEvent(new CustomEvent('tt-store-error',{detail:error}));
 }
 function settle(){
  if(--pending===0){const w=waiters;waiters=[];w.forEach(resolve=>resolve())}
 }
 function publishRoster(key,raw){
  if(key!==rosterKey||raw===null)return;
  try{
   const state=JSON.parse(raw);
   localStorage.setItem(ROSTER,JSON.stringify({className:state.className,students:(state.students||[]).map(s=>({id:s.id,name:s.name,gender:s.gender,visual:s.visual}))}));
  }catch(error){console.warn('명단 공유 실패',error)}
 }
 function write(key,value){
  pending++;
  try{localStorage.setItem(JOURNAL+key,JSON.stringify(value))}catch(error){console.warn('임시 기록 실패',error)}
  try{
   const tx=db.transaction(STORE,'readwrite');
   if(value===null)tx.objectStore(STORE).delete(key);else tx.objectStore(STORE).put(value,key);
   finished(tx).then(()=>{
    if((memory.has(key)?memory.get(key):null)===value)localStorage.removeItem(JOURNAL+key);
   }).catch(reportError).finally(settle);
  }catch(error){reportError(error);settle()}
 }
 const flush=()=>pending?new Promise(resolve=>waiters.push(resolve)):Promise.resolve();
 const api={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem(key,value){const raw=String(value);if(memory.get(key)===raw)return;memory.set(key,raw);write(key,raw);publishRoster(key,raw);api.onChange?.()},
  removeItem(key){if(!memory.has(key))return;memory.delete(key);write(key,null);api.onChange?.()},
  keys:start=>[...memory.keys()].filter(k=>k.startsWith(start)),
  flush,
  // Everything in one transaction: all of it is saved, or none of it.
  async commit({put=new Map(),del=[],quiet=false}){
   await flush();
   const tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE);
   const done=finished(tx);
   try{
    for(const key of del)os.delete(key);
    for(const [key,value] of put)os.put(value,key);
   }catch(error){try{tx.abort()}catch{};await done.catch(()=>{});throw error}
   await done;
   for(const key of del)memory.delete(key);
   for(const [key,value] of put)if(key.startsWith(prefix)){memory.set(key,value);publishRoster(key,value)}
   if(!quiet)api.onChange?.();
  },
  read:async key=>request(db.transaction(STORE).objectStore(STORE).get(key)),
  async list(start){
   const out=[];
   await new Promise((resolve,reject)=>{
    const r=db.transaction(STORE).objectStore(STORE).openCursor();
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const c=r.result;if(!c)return resolve();if(typeof c.key==='string'&&c.key.startsWith(start))out.push({key:c.key,value:c.value});c.continue()};
   });
   return out;
  }
 };
 const oldKeys=()=>Object.keys(localStorage).filter(k=>k===OLD_INSTALL||k===LEGACY_PE||LEGACY_SEATING.includes(k)||k.startsWith('tt.stage031.'));
 const hasOldDb=async()=>Boolean(indexedDB.databases&&(await indexedDB.databases()).some(d=>d.name===OLD_DB));
 api.oldData=async()=>({keys:oldKeys().length,grades:await hasOldDb()});
 api.removeOldData=async()=>{
  await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(OLD_DB);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('이전 성적 자료를 쓰는 탭을 닫아 주세요.'))});
  oldKeys().forEach(k=>localStorage.removeItem(k));
 };
 async function replayJournal(){
  const entries=Object.keys(localStorage).filter(k=>k.startsWith(JOURNAL));
  if(!entries.length)return;
  const tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE),done=finished(tx);
  for(const entry of entries){
   let value;try{value=JSON.parse(localStorage.getItem(entry))}catch{continue}
   const key=entry.slice(JOURNAL.length);
   if(value===null)os.delete(key);else os.put(value,key);
  }
  await done;
  entries.forEach(entry=>localStorage.removeItem(entry));
 }
 async function oldGrades(start){
  if(!indexedDB.databases||!(await indexedDB.databases()).some(d=>d.name===OLD_DB))return[];
  const old=await new Promise((resolve,reject)=>{const r=indexedDB.open(OLD_DB);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  try{
   if(!old.objectStoreNames.contains(OLD_STORE))return[];
   const os=old.transaction(OLD_STORE).objectStore(OLD_STORE),keys=await request(os.getAllKeys()),rows=[];
   for(const key of keys)if(typeof key==='string'&&key.startsWith(start))rows.push([key,await request(os.get(key))]);
   return rows;
  }finally{old.close()}
 }
 // First run only. The old copies stay where they are.
 async function migrate(){
  const put=new Map();
  let installId=localStorage.getItem(OLD_INSTALL);
  if(installId&&localStorage.getItem(`tt.stage031.${installId}.classes`)!==null){
   const start=`tt.stage031.${installId}.`;
   Object.keys(localStorage).filter(k=>k.startsWith(start)).forEach(k=>put.set(k,localStorage.getItem(k)));
   (await oldGrades(`TT_STAGE03_${installId}_`)).forEach(([k,v])=>put.set(k,v));
  }else{
   installId=crypto.randomUUID();
   const id=crypto.randomUUID(),base=`tt.stage031.${installId}`;
   const key=LEGACY_SEATING.find(k=>localStorage.getItem(k)!==null);
   let name='우리 반';
   if(key){
    const existing=localStorage.getItem(key);
    try{const parsed=JSON.parse(existing);if(Array.isArray(parsed.students))name=String(parsed.className||name).slice(0,30)}catch{}
    put.set(`${base}.${id}.seating`,existing);
   }
   const pe=localStorage.getItem(LEGACY_PE);
   if(pe!==null)put.set(`${base}.${id}.pe`,pe);
   put.set(`${base}.classes`,JSON.stringify({version:1,activeId:id,classes:[{id,name}],createdAt:new Date().toISOString()}));
  }
  put.set(INSTALL,installId);
  const tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE),done=finished(tx);
  for(const [k,v] of put)os.put(v,k);
  await done;
  return installId;
 }
 const onlyOneTab=()=>new Promise((resolve,reject)=>{
  if(!navigator.locks)return resolve();
  navigator.locks.request(LOCK,{signal:AbortSignal.timeout(3000)},()=>{resolve();return new Promise(()=>{})})
   .catch(error=>reject(error?.name==='TimeoutError'||error?.name==='AbortError'?Object.assign(Error('교실 매니저가 다른 탭에서 이미 열려 있습니다. 그 탭을 쓰거나, 닫은 뒤 이 탭을 새로고침해 주세요.'),{otherTab:true}):error));
 });
 async function prepare(){
  await onlyOneTab();
  db=await openDb();
  await replayJournal();
  const installId=await api.read(INSTALL)||await migrate();
  prefix=`tt.stage031.${installId}`;
  (await api.list(prefix+'.')).forEach(r=>memory.set(r.key,r.value));
  return{installId,prefix};
 }
 // The board view shows data sent from the manager and must leave nothing behind in this browser.
 const publicView=new URLSearchParams(location.search).get('view');
 if(publicView==='board'||publicView==='student'){
  prefix=publicView==='student'?'tt.student':'tt.board';
  memory.set(prefix+'.classes',JSON.stringify({version:1,activeId:'board',classes:[{id:'board',name:'칠판'}]}));
  api.setItem=(key,value)=>{memory.set(key,String(value))};
  api.removeItem=key=>{memory.delete(key)};
  api.ready=Promise.resolve({installId:publicView,prefix,board:publicView==='board',student:publicView==='student'});
  api.setRosterSource=()=>{};
  window.__TT_STORE=api;
  return;
 }
 api.ready=prepare();
 api.setRosterSource=key=>{rosterKey=key;publishRoster(key,api.getItem(key))};
 window.__TT_STORE=api;
})();
