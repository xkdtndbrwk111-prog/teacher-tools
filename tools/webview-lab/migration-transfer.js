// Isolated logical transfer, never copy login cookies or other origins.
globalThis.ttMigration=(()=>{
 const schemas={'tt-alert-voice':'clips','teacher-tools-dashboard-assets':'media','tt-multimedia-v1':'apps'};
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
 const done=t=>new Promise((ok,no)=>{t.oncomplete=ok;t.onerror=t.onabort=()=>no(t.error||Error('transaction aborted'))});
 const open=(name,store)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);return req(r)};
 const pack=async v=>{
  if(v instanceof Blob){
   // Divisible by three so all non-final Base64 chunks have no padding.
   const parts=[],block=3*256*1024;
   for(let p=0;p<v.size;p+=block){
    const bytes=new Uint8Array(await v.slice(p,p+block).arrayBuffer());let a='';
    for(let i=0;i<bytes.length;i+=8192)a+=String.fromCharCode(...bytes.subarray(i,i+8192));
    parts.push(btoa(a));
   }
   return {kind:'blob',mime:v.type,bytes:parts.join('')}
  }
  if(v===null||['string','boolean','number'].includes(typeof v))return {kind:'scalar',value:v};
  if(Array.isArray(v))return {kind:'array',items:await Promise.all(v.map(pack))};
  if(v&&Object.getPrototypeOf(v)===Object.prototype){const entries=[];for(const k of Object.keys(v).sort())entries.push([k,await pack(v[k])]);return {kind:'object',entries}}
  throw Error('unsupported stored value; preserve original and stop');
 };
 const unpack=v=>{
  if(v?.kind==='blob'){
   if(typeof v.bytes!=='string'||typeof v.mime!=='string'||v.bytes.length%4!==0)throw Error('invalid blob');
   const parts=[],block=1024*1024;
   for(let p=0;p<v.bytes.length;p+=block){
    const raw=atob(v.bytes.slice(p,p+block)),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    parts.push(bytes);
   }
   return new Blob(parts,{type:v.mime});
  }
  if(v?.kind==='scalar'&&(v.value===null||['string','boolean','number'].includes(typeof v.value)))return v.value;
  if(v?.kind==='array')return v.items.map(unpack);
  if(v?.kind==='object')return Object.fromEntries(v.entries.map(([k,x])=>[k,unpack(x)]));
  throw Error('invalid transfer value');
 };
 async function snapshot(){
  const values=[];for(const k of Object.keys(localStorage).sort())values.push([k,localStorage.getItem(k)]);
  const dbs=[];for(const info of (await indexedDB.databases()).sort((a,b)=>a.name.localeCompare(b.name))){
   if(!own(schemas,info.name)||info.version!==1)throw Error('unsupported database '+info.name);
   const store=schemas[info.name],db=await open(info.name,store);
   try{
    if(db.objectStoreNames.length!==1||!db.objectStoreNames.contains(store))throw Error('unsupported database schema');
    const tx=db.transaction(store,'readonly'),end=done(tx),os=tx.objectStore(store);
    const [keys,items]=await Promise.all([req(os.getAllKeys()),req(os.getAll())]);await end;
    const records=[];for(let i=0;i<keys.length;i++){if(typeof keys[i]!=='string')throw Error('unsupported key');records.push([keys[i],await pack(items[i])])}
    dbs.push({name:info.name,store,records});
   }finally{db.close()}
  }
  return {format:'hoja-lab-browser-transfer',version:1,values,dbs};
 }
 async function restore(data){
  if(data?.format!=='hoja-lab-browser-transfer'||data.version!==1||!Array.isArray(data.values)||!Array.isArray(data.dbs))throw Error('invalid transfer');
  if(localStorage.length||(await indexedDB.databases()).length)throw Error('target profile already has data');
  const keys=new Set(),names=new Set();
  for(const [k,v] of data.values){if(typeof k!=='string'||typeof v!=='string'||keys.has(k))throw Error('invalid local key');keys.add(k)}
  for(const d of data.dbs){if(!own(schemas,d.name)||schemas[d.name]!==d.store||names.has(d.name)||!Array.isArray(d.records))throw Error('invalid database');names.add(d.name);const recordKeys=new Set();for(const [k,v] of d.records){if(typeof k!=='string'||recordKeys.has(k))throw Error('invalid record key');recordKeys.add(k);unpack(v)}}
  for(const [k,v] of data.values)localStorage.setItem(k,v);
  for(const d of data.dbs){const db=await open(d.name,d.store);try{const tx=db.transaction(d.store,'readwrite'),end=done(tx),os=tx.objectStore(d.store);for(const [k,v] of d.records)os.put(unpack(v),k);await end}finally{db.close()}}
  if(JSON.stringify(await snapshot())!==JSON.stringify(data))throw Error('transfer readback mismatch');
  return true;
 }
 async function seed(source){
  const videoSize=source==='chrome'?36*1024*1024:4;
  const videoBytes=new Uint8Array(videoSize);for(let i=0;i<videoSize;i++)videoBytes[i]=(i*29+(i>>>15)*17+6)&255;
  localStorage.setItem('class-theme','pink');localStorage.setItem('teacher-class-name','LAB '+source+' 교실');localStorage.setItem('teacher-note','LAB 메모');
  localStorage.setItem('class-drawing-lab','data:image/png;base64,AAECAw==');localStorage.setItem('class-grid-model','square48-v1');
  localStorage.setItem('class-grid-density','2');localStorage.setItem('class-layout',JSON.stringify({weekView:'today',items:{memo:{x:31,y:20,w:12,h:5,off:false,z:4}}}));
  const records=[['tt-alert-voice','clips','lead1',new Blob([new Uint8Array([1,0,255,2])],{type:'audio/webm'})],
    ['teacher-tools-dashboard-assets','media','background',{blob:new Blob([new Uint8Array([5,4,3,2])],{type:'image/webp'}),name:'LAB.webp',savedAt:'2026-11-26'}],
    ['tt-multimedia-v1','apps','meeting',{media:{'1':{kind:'local',file:new Blob([videoBytes],{type:'video/mp4'}),name:'LAB.mp4'}}}]];
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
