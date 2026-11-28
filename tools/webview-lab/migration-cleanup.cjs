// Research cleanup only: never operate on a real installation.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const [rootArg,source]=process.argv.slice(2);
try{
 const root=path.resolve(rootArg);
 assert(path.basename(root).startsWith('hoja-webview-lab-'));
 assert(['chrome','edge'].includes(source));
 const prefix='native-migration-'+source+'-';
 const valid=s=>new RegExp('^'+prefix+'[a-f0-9]{32}$').test(s);
 const read=n=>fs.readFileSync(path.join(root,n),'utf8').trim();
 const chosen=read('migration-'+source+'.done'),abandoned=read('migration-'+source+'.interrupted');
 assert(valid(chosen)&&valid(abandoned)&&chosen!==abandoned,'invalid profile selection');
 const keep=path.join(root,chosen),discard=path.join(root,abandoned);
 const sourceDir=path.join(root,'migration-legacy',source==='chrome'?'ChromeProfile':'EdgeProfile');
 const manifest=path.join(root,'migration-'+source+'.json'),blobs=path.join(root,'migration-'+source+'-blobs');
 function inspect(f){const st=fs.lstatSync(f);assert(!st.isSymbolicLink(),'linked path rejected');if(st.isDirectory())for(const child of fs.readdirSync(f))inspect(path.join(f,child));else assert(st.isFile());}
 assert(fs.statSync(keep).isDirectory()&&fs.statSync(sourceDir).isDirectory());
 assert(read('migration-'+source+'.result')==='PASS repeated launch preserves user edit and IndexedDB blobs','unverified profile');
 const targets=[discard,manifest,blobs];
 for(const f of targets)if(fs.existsSync(f))inspect(f);
 const before=crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceDir,'Default','Local Storage','leveldb','CURRENT'))).digest('hex');
 // Only remove exact, validated research artifacts after both processes have exited.
 for(const f of targets)fs.rmSync(f,{recursive:true,force:true,maxRetries:10,retryDelay:250});
 assert(fs.existsSync(keep)&&fs.existsSync(sourceDir));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceDir,'Default','Local Storage','leveldb','CURRENT'))).digest('hex'),before);
 console.log('PASS '+source+' verified cleanup, selected and legacy profiles preserved');
}catch(e){console.error(e.message);process.exitCode=1}
