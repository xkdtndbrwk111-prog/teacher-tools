const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const [root,source]=process.argv.slice(2);
(async()=>{
 const channel=source==='chrome'?'chrome':source==='edge'?'msedge':null;
 assert(channel);
 const profile=path.join(root,'migration-source-'+source),origin='http://127.0.0.1:17449';
 const script=fs.readFileSync(path.join(__dirname,'migration-transfer.js'),'utf8');
 const ctx=await chromium.launchPersistentContext(profile,{channel,headless:true,args:['--no-first-run','--disable-background-networking']});
 try{
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());return (u.origin===origin||u.origin==='http://127.0.0.1:17448')?r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>isolated transfer</title>'}):r.abort()});
  const page=ctx.pages()[0]||await ctx.newPage();
  await page.goto('http://127.0.0.1:17448/');await page.evaluate(()=>{localStorage.setItem('other-origin-secret','must-not-copy')});
  await page.goto(origin+'/__lab_migration');await page.addScriptTag({content:script});
  await page.evaluate(s=>ttMigration.seed(s),source);
  const data=await page.evaluate(()=>ttMigration.snapshot());
  assert.equal(data.values.length,7);assert.equal(data.dbs.length,3);assert(!JSON.stringify(data).includes('must-not-copy'));
  fs.writeFileSync(path.join(root,'migration-'+source+'.json'),JSON.stringify(data));
  assert.deepEqual(await page.evaluate(()=>ttMigration.snapshot()),data);
  console.log('PASS '+source+' source logical export, local keys and 3 IndexedDB blobs, unrelated origin excluded');
 }finally{await ctx.close()}
})().catch(e=>{console.error(e);process.exit(1)});
