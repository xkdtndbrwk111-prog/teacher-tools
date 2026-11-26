// Isolated logical transfer, never copy login cookies or other origins.
globalThis.ttMigration=(()=>{
 const schemas={'tt-alert-voice':'clips','teacher-tools-dashboard-assets':'media','tt-multimedia-v1':'apps'};
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
 const done=t=>new Promise((ok,no)=>{t.oncomplete=ok;t.onerror=t.onabort=()=>no(t.error||Error('transaction aborted'))});
 const open=(name,store)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);return req(r)};
 const block=4*1024*1024;
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const pack=async(v,writer)=>{
  if(v instanceof Blob){
   const chunks=[];
   for(let p=0;p<v.size;p+=block){
    const bytes=new Uint8Array(await v.slice(p,p+block).arrayBuffer()),sha=await digest(bytes);
    if(writer){let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));await writer(sha,btoa(str))}
    chunks.push({sha,size:bytes.length});
   }
   return {kind:'blob',mime:v.type,size:v.size,chunks};
  }
  if(v===null||['string','boolean','number'].includes(typeof v))return {kind:'scalar',value:v};
  if(Array.isArray(v)){const items=[];for(const x of v)items.push(await pack(x,writer));return {kind:'array',items}}
  if(v&&Object.getPrototypeOf(v)===Object.prototype){const entries=[];for(const k of Object.keys(v).sort())entries.push([k,await pack(v[k],writer)]);return {kind:'object',entries}}
  throw Error('unsupported stored value; preserve original and stop');
 };
 function validateValue(v){
  if(v?.kind==='blob'){
   if(typeof v.mime!=='string'||!Number.isSafeInteger(v.size)||v.size<0||v.size>250*1024*1024||!Array.isArray(v.chunks)||v.chunks.length!==Math.ceil(v.size/block))throw Error('invalid blob manifest');
   let sum=0;for(const c of v.chunks){if(!/^[a-f0-9]{64}$/.test(c.sha)||c.size!==Math.min(block,v.size-sum))throw Error('invalid chunk');sum+=c.size}if(sum!==v.size)throw Error('invalid blob size');return;
  }
  if(v?.kind==='scalar'&&(v.value===null||['string','boolean','number'].includes(typeof v.value)))return;
  if(v?.kind==='array'&&Array.isArray(v.items)){for(const x of v.items)validateValue(x);return}
  if(v?.kind==='object'&&Array.isArray(v.entries)){const keys=new Set();for(const [k,x] of v.entries){if(typeof k!=='string'||keys.has(k))throw Error('invalid object key');keys.add(k);validateValue(x)}return}
  throw Error('invalid transfer value');
 }
 const unpack=async v=>{
  if(v.kind==='blob'){
   const parts=[];
   for(const c of v.chunks){
    const response=await fetch('/__lab_migration/blob/'+c.sha,{cache:'no-store'});
    if(!response.ok)throw Error('missing blob chunk');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength!==c.size||await digest(bytes)!==c.sha)throw Error('blob chunk hash mismatch');
    parts.push(new Blob([bytes]));
   }
   return new Blob(parts,{type:v.mime});
  }
  if(v.kind==='scalar')return v.value;
  if(v.kind==='array'){const out=[];for(const x of v.items)out.push(await unpack(x));return out}
  const entries=[];for(const [k,x] of v.entries)entries.push([k,await unpack(x)]);return Object.fromEntries(entries);
 };
 async function snapshot(writer=null){
  const values=[];for(const k of Object.keys(localStorage).sort())values.push([k,localStorage.getItem(k)]);
  const dbs=[];for(const info of (await indexedDB.databases()).sort((a,b)=>a.name.localeCompare(b.name))){
   if(!own(schemas,info.name)||info.version!==1)throw Error('unsupported database '+info.name);
   const store=schemas[info.name],db=await open(info.name,store);
   try{
    if(db.objectStoreNames.length!==1||!db.objectStoreNames.contains(store))throw Error('unsupported database schema');
    const tx=db.transaction(store,'readonly'),end=done(tx),os=tx.objectStore(store);
    const [keys,items]=await Promise.all([req(os.getAllKeys()),req(os.getAll())]);await end;
    const records=[];for(let i=0;i<keys.length;i++){if(typeof keys[i]!=='string')throw Error('unsupported key');records.push([keys[i],await pack(items[i],writer)])}
    dbs.push({name:info.name,store,records});
   }finally{db.close()}
  }
  return {format:'hoja-lab-browser-transfer',version:2,values,dbs};
 }
 async function restore(data){
  if(data?.format!=='hoja-lab-browser-transfer'||data.version!==2||!Array.isArray(data.values)||!Array.isArray(data.dbs))throw Error('invalid transfer');
  if(localStorage.length||(await indexedDB.databases()).length)throw Error('target profile already has data');
  const keys=new Set(),names=new Set();
  for(const [k,v] of data.values){if(typeof k!=='string'||typeof v!=='string'||keys.has(k))throw Error('invalid local key');keys.add(k)}
  for(const d of data.dbs){if(!own(schemas,d.name)||schemas[d.name]!==d.store||names.has(d.name)||!Array.isArray(d.records))throw Error('invalid database');names.add(d.name);const recordKeys=new Set();for(const [k,v] of d.records){if(typeof k!=='string'||recordKeys.has(k))throw Error('invalid record key');recordKeys.add(k);validateValue(v)}}
  for(const [k,v] of data.values)localStorage.setItem(k,v);
  for(const d of data.dbs){const db=await open(d.name,d.store);try{
   // Await network reads before starting an IndexedDB transaction, which auto-closes while idle.
   for(const [k,v] of d.records){const value=await unpack(v);const tx=db.transaction(d.store,'readwrite'),end=done(tx);tx.objectStore(d.store).put(value,k);await end}
  }finally{db.close()}}
  if(JSON.stringify(await snapshot())!==JSON.stringify(data))throw Error('transfer readback mismatch');
  return true;
 }
 async function seed(source){
  const videoSize=source==='chrome'?250*1024*1024:4;
  const videoParts=[];for(let p=0;p<videoSize;p+=block){const bytes=new Uint8Array(Math.min(block,videoSize-p));for(let i=0;i<bytes.length;i++)bytes[i]=(i*29+(i>>>15)*17+(p/block)*19+6)&255;videoParts.push(new Blob([bytes]))}
  localStorage.setItem('class-theme','pink');localStorage.setItem('teacher-class-name','LAB '+source+' 교실');localStorage.setItem('teacher-note','LAB 메모');
  localStorage.setItem('class-drawing-lab','data:image/png;base64,AAECAw==');localStorage.setItem('class-grid-model','square48-v1');
  localStorage.setItem('class-grid-density','2');localStorage.setItem('class-layout',JSON.stringify({weekView:'today',items:{memo:{x:31,y:20,w:12,h:5,off:false,z:4}}}));
  const records=[['tt-alert-voice','clips','lead1',new Blob([new Uint8Array([1,0,255,2])],{type:'audio/webm'})],
    ['teacher-tools-dashboard-assets','media','background',{blob:new Blob([new Uint8Array([5,4,3,2])],{type:'image/webp'}),name:'LAB.webp',savedAt:'2026-11-26'}],
    ['tt-multimedia-v1','apps','meeting',{media:{'1':{kind:'local',file:new Blob(videoParts,{type:'video/mp4'}),name:'LAB.mp4'}}}]];
  for(const [name,store,key,v] of records){const db=await open(name,store);try{const tx=db.transaction(store,'readwrite'),end=done(tx);tx.objectStore(store).put(v,key);await end}finally{db.close()}}
 }
 function comparePersisted(expected,actual){
  const map=new Map(actual.values),diff=[];
  for(const [k,v] of expected.values){
   const a=map.get(k);
   if(k==='class-layout'){
    // Actual dashboard layoutLoad adds missing default widgets and normalizes off/z.
    // Preserve every explicitly seeded widget's coordinates, dimensions and visibility.
    try{
     const e=JSON.parse(v),s=JSON.parse(a);
     if(e.weekView!==s.weekView)diff.push('layout:weekView');
     for(const [id,r] of Object.entries(e.items)){
      const got=s.items?.[id];
      if(!got||['x','y','w','h','off','z'].some(k=>got[k]!==r[k]))diff.push('layout:'+id);
     }
    }catch{diff.push('layout:missing or invalid')}
   }else if(a!==(k==='teacher-note'?'LAB updated after migration':v))diff.push('local:'+k+(a===undefined?':missing':':changed'));
  }
  const actualDbs=new Map(actual.dbs.map(d=>[d.name,d]));
  for(const d of expected.dbs){
   const a=actualDbs.get(d.name);
   if(!a||a.store!==d.store){diff.push('db:'+d.name+':missing/schema');continue}
   const records=new Map(a.records);
   for(const [k,v] of d.records){if(JSON.stringify(records.get(k))!==JSON.stringify(v))diff.push('db:'+d.name+'/'+k+':changed/missing')}
   if(a.records.length!==d.records.length)diff.push('db:'+d.name+':record count');
  }
  for(const a of actual.dbs)if(!expected.dbs.some(d=>d.name===a.name)&&a.records.length)diff.push('db:'+a.name+':unexpected records');
  return diff;
 }
 return {snapshot,restore,seed,comparePersisted};
})();
