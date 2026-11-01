// Grades share the classroom store (classroom/host/class-store.js). Resolve only on transaction COMPLETE.
const DB='tt-classroom-v1',STORE='kv';
function openDb(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(Error('INDEXEDDB_UNAVAILABLE'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transact(method,key,value){const db=await openDb();try{return await new Promise((resolve,reject)=>{let settled=false;const fail=err=>{if(!settled){settled=true;reject(err||Error('IDB_TRANSACTION_ABORTED'));}};const tx=db.transaction(STORE,method==='get'?'readonly':'readwrite');let result;tx.oncomplete=()=>{if(!settled){settled=true;resolve(result);}};tx.onabort=()=>fail(tx.error);tx.onerror=()=>fail(tx.error);const req=method==='get'?tx.objectStore(STORE).get(key):method==='put'?tx.objectStore(STORE).put(value,key):tx.objectStore(STORE).delete(key);req.onsuccess=()=>{result=req.result};req.onerror=()=>fail(req.error);});}finally{db.close();}}
export const loadDraft=key=>transact('get',String(key));
export const writeDraft=async(key,data)=>{await transact('put',String(key),data);try{const c=new BroadcastChannel('tt-classroom-changes');c.postMessage({key:String(key)});c.close()}catch{}};
export const deleteDraft=key=>transact('delete',String(key));

// STAGE04: enumerate only this installation's draft keys for all school years.
export async function listDrafts(prefix){
 const db=await openDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),out=[];let failed=false;
  tx.oncomplete=()=>{if(!failed)resolve(out)};
  tx.onerror=()=>{failed=true;reject(tx.error||Error('IDB_LIST_ERROR'))};
  tx.onabort=()=>{failed=true;reject(tx.error||Error('IDB_LIST_ABORTED'))};
  const req=tx.objectStore(STORE).openCursor();
  req.onsuccess=()=>{const cur=req.result;if(!cur)return;if(typeof cur.key==='string'&&cur.key.startsWith(prefix))out.push({key:cur.key,value:cur.value});cur.continue()};
  req.onerror=()=>{failed=true;reject(req.error||Error('IDB_CURSOR_ERROR'))};
 })}finally{db.close()}
}
