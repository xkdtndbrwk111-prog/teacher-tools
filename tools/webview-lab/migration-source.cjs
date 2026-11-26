const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{execFileSync}=require('child_process');
const [rootArg,source]=process.argv.slice(2);
const root=path.resolve(rootArg);
assert(path.basename(root).startsWith('hoja-webview-lab-'));
const legacy=path.join(root,'migration-legacy');
const origin='http://127.0.0.1:17439'; // intercepted in browser; never contacts the production listener
const script=fs.readFileSync(path.join(__dirname,'migration-transfer.js'),'utf8');
const profileFor=s=>path.join(legacy,s==='chrome'?'ChromeProfile':'EdgeProfile');
const pin=path.join(legacy,'browser.txt');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function pick(){
 const present=['chrome','edge'].filter(s=>fs.existsSync(path.join(profileFor(s),'Default','Local Storage')));
 const pinned=fs.existsSync(pin)?fs.readFileSync(pin,'utf8').trim():'';
 if(pinned){if(!present.includes(pinned))throw Error('pinned profile missing or invalid');return pinned}
 if(present.length!==1)throw Error('ambiguous or missing profile');
 return present[0];
}
function browserActive(profile){
 const ps=String.raw`$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | ForEach-Object {$_.CommandLine}) | ConvertTo-Json -Compress`;
 const exe=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const text=execFileSync(exe,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{encoding:'utf8',timeout:15000}).trim();
 const lines=text?JSON.parse(text):[];
 return [].concat(lines).some(x=>typeof x==='string'&&x.toLowerCase().includes(profile.toLowerCase()));
}
function hashTree(dir){
 const out={};
 function walk(d){
  for(const entry of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const f=path.join(d,entry.name),stat=fs.lstatSync(f);
   if(stat.isSymbolicLink())throw Error('linked source path rejected');
   if(stat.isDirectory())walk(f);
   else if(stat.isFile())out[path.relative(dir,f)]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
   else throw Error('unsupported source file');
  }
 }
 walk(dir);return out;
}
function copyStorage(profile,stage){
 if(browserActive(profile))throw Error('source profile active');
 if(fs.existsSync(stage))throw Error('staging profile already exists');
 const d=path.join(profile,'Default'),dest=path.join(stage,'Default');
 // Hash the entire synthetic original before/after; copy only storage required for export.
 const before=hashTree(profile);
 fs.mkdirSync(dest,{recursive:true});
 fs.cpSync(path.join(d,'Local Storage'),path.join(dest,'Local Storage'),{recursive:true,errorOnExist:true,force:false});
 const idb=path.join(d,'IndexedDB'),out=path.join(dest,'IndexedDB');
 fs.mkdirSync(out,{recursive:true});
 const wanted=fs.readdirSync(idb).filter(n=>/^http_127\.0\.0\.1_17439\.indexeddb\.(leveldb|blob)$/.test(n));
 assert(wanted.some(n=>n.endsWith('.leveldb')),'board database not found');
 for(const name of wanted)fs.cpSync(path.join(idb,name),path.join(out,name),{recursive:true,errorOnExist:true,force:false});
 assert.deepEqual(hashTree(profile),before,'source changed during copy');
 assert(!fs.existsSync(path.join(dest,'Network'))&&!fs.existsSync(path.join(dest,'Cookies')));
 return before;
}
async function exportChunks(page,filename){
 let data;
 if(filename){
  const dir=path.join(root,'migration-'+source+'-blobs');fs.mkdirSync(dir);
  await page.exposeFunction('__writeMigrationChunk',(sha,b64)=>{
   assert(/^[a-f0-9]{64}$/.test(sha));assert(b64.length<=6*1024*1024);
   const bytes=Buffer.from(b64,'base64');assert(bytes.length<=4*1024*1024);
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),sha);
   const target=path.join(dir,sha+'.bin');
   if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});
   else assert.deepEqual(fs.readFileSync(target),bytes);
  });
  data=await page.evaluate(()=>ttMigration.snapshot(globalThis.__writeMigrationChunk));
 }else data=await page.evaluate(()=>ttMigration.snapshot());
 const serialized=JSON.stringify(data);
 assert(serialized.length<=16*1024*1024,'metadata exceeds research envelope');
 if(filename)fs.writeFileSync(filename,serialized,{flag:'wx',encoding:'utf16le'});
 return {length:serialized.length,sha:crypto.createHash('sha256').update(serialized,'utf16le').digest('hex')};
}
async function open(profile,channel){
 const ctx=await chromium.launchPersistentContext(profile,{channel,headless:true,args:['--no-first-run','--disable-background-networking']});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());return (u.origin===origin||u.origin==='http://127.0.0.1:17448')?r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>isolated transfer</title>'}):r.abort()});
 return ctx;
}
(async()=>{
 const channel=source==='chrome'?'chrome':source==='edge'?'msedge':null;assert(channel);
 fs.mkdirSync(legacy,{recursive:true});const profile=profileFor(source),stage=path.join(root,'migration-copy-'+source);
 let expected;
 const ctx=await open(profile,channel);
 try{
  const page=ctx.pages()[0]||await ctx.newPage();
  await page.goto('http://127.0.0.1:17448/');await page.evaluate(()=>{localStorage.setItem('other-origin-secret','must-not-copy')});
  await page.goto(origin+'/__lab_migration');await page.addScriptTag({content:script});await page.evaluate(s=>ttMigration.seed(s),source);
  expected=await exportChunks(page,null);
  assert.throws(()=>copyStorage(profile,stage),/source profile active/);assert(!fs.existsSync(stage));
  console.log('PASS '+source+' active profile refused before copying');
 }finally{await ctx.close()}
 for(let i=0;i<15&&browserActive(profile);i++)await delay(200);
 fs.writeFileSync(pin,source);
 assert.equal(pick(),source);
 fs.unlinkSync(pin);
 if(source==='edge')assert.throws(()=>pick(),/ambiguous/);else assert.equal(pick(),source);
 fs.writeFileSync(pin,'invalid');assert.throws(()=>pick(),/invalid/);
 fs.writeFileSync(pin,source);assert.equal(pick(),source);
 const before=copyStorage(profile,stage);
 let copy;
 try{
  copy=await open(stage,channel);
  const page=copy.pages()[0]||await copy.newPage();
  await page.goto(origin+'/__lab_migration');await page.addScriptTag({content:script});
  const file=path.join(root,'migration-'+source+'.json');
  const actual=await exportChunks(page,file);
  assert.deepEqual(actual,expected);
  const data=JSON.parse(fs.readFileSync(file,'utf16le'));
  assert.equal(data.values.length,7);assert.equal(data.dbs.length,3);assert(!JSON.stringify(data.values).includes('must-not-copy'));
  const video=data.dbs.find(d=>d.name==='tt-multimedia-v1').records[0][1].entries.find(([k])=>k==='media')[1].entries[0][1].entries.find(([k])=>k==='file')[1];
  const byteLength=video.chunks.reduce((sum,c)=>sum+c.size,0);
  assert.equal(byteLength,source==='chrome'?250*1024*1024:4);assert.equal(byteLength,video.size);
  console.log('PASS '+source+' separate binary export, media bytes='+byteLength+', blob chunks='+video.chunks.length+', envelope chars='+actual.length);
  console.log('PASS '+source+' closed profile copy export matches original at old board origin, other origin excluded');
 }finally{
  if(copy)await copy.close();
  fs.rmSync(stage,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
 assert.deepEqual(hashTree(profile),before,'original profile changed');
 assert(!fs.existsSync(stage));
 console.log('PASS '+source+' pinned profile selection, original hashes unchanged, temporary copy removed');
})().catch(e=>{console.error(e);process.exit(1)});
