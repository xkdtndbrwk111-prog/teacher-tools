const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..'),port=18142,origin='http://127.0.0.1:'+port;
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(port)],{stdio:'ignore'});let browser;
 try{
  await new Promise(r=>setTimeout(r,600));browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{
   let original,now={mode:'easy',connected:false,sub:'',email:'',generation:0};
   const fake={state:()=>({...now}),session:()=>{if(!now.connected)throw Error('not connected');return{...now,accessToken:'fake-'+now.sub,key:now.sub+'|'+now.generation,expiresAt:Date.now()+60000}},openSettings:()=>original?.openSettings?.()};
   Object.defineProperty(window,'__TT_NORMAL_AUTH',{configurable:true,get:()=>fake,set(v){original=v}});
   window.__themeTestLogin=(sub,generation)=>{now=sub?{mode:'normal',connected:true,sub,email:sub+'@example.invalid',generation}:{mode:'easy',connected:false,sub:'',email:'',generation};window.dispatchEvent(new CustomEvent('tt-normal-auth-change',{detail:now}))};
  });
  const aPref={version:1,automatic:true,theme:{version:1,theme:'custom',font:'맑은 고딕',custom:{bg:'#283945',panel:'#445566',text:'#ffffff',accent:'#80b0a0',modal:'#223344'}}};
  const bPref={version:1,automatic:false,theme:{version:1,theme:'sky',font:''}};
  const data={A:aPref,B:bPref};let live=null,writes=[],reads=[];
  await ctx.route('http://127.0.0.1:17439/api/theme',r=>live?r.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify(live)}):r.abort());
  await ctx.route('https://www.googleapis.com/**',async r=>{
   const req=r.request(),url=new URL(req.url()),sub=req.headers().authorization?.replace('Bearer fake-','');
   if(!['A','B'].includes(sub))return r.abort();
   const id='theme_profile_'+sub;
   if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'GET,PATCH,POST,OPTIONS'}});
   const headers={'Access-Control-Allow-Origin':origin};
   let response;
   if(url.pathname==='/drive/v3/files'){reads.push(sub);response={files:[{id,name:'Theme',mimeType:'application/json',trashed:false,ownedByMe:true,owners:[{emailAddress:sub+'@example.invalid'}],appProperties:{ttKind:'teacher-tools-theme-v1'},shared:false}]}}
   else if(url.searchParams.get('alt')==='media'){assert.equal(url.pathname,'/drive/v3/files/'+id);response=data[sub]}
   else if(url.searchParams.get('uploadType')==='media'){assert.equal(url.pathname,'/upload/drive/v3/files/'+id);data[sub]=JSON.parse(req.postData());writes.push(sub);response={id}}
   else throw Error('Unexpected theme request '+req.url());
   await r.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(response)});
  });
  await p.goto(origin+'/seating/');await p.waitForFunction(()=>window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting'));
  await p.waitForFunction(()=>document.getElementById('tt-ui2-theme-cloud-status')?.textContent.includes('EASY'));
  assert.equal(reads.length,0);
  await p.evaluate(()=>window.__themeTestLogin('A',1));
  await p.waitForFunction(()=>window.__TT_MANAGER_THEME.get().theme==='custom');
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.get().custom.modal),'#223344');
  assert.deepEqual(writes,[]);
  live={version:1,theme:'pink',font:''};
  await p.evaluate(()=>window.__TT_MANAGER_THEME.checkBoard());await p.waitForFunction(()=>window.__TT_MANAGER_THEME.get().theme==='pink');
  await p.waitForFunction(()=>document.getElementById('tt-ui2-theme-cloud-status').textContent==='Google 테마 저장됨');
  assert.equal(data.A.theme.theme,'pink');assert.deepEqual(writes,['A']);
  live=null;
  await p.evaluate(()=>window.__themeTestLogin('B',2));
  await p.waitForFunction(()=>window.__TT_MANAGER_THEME.get().theme==='sky');
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.isAutomatic()),false);
  assert.equal(data.B.theme.theme,'sky');assert.deepEqual(writes,['A']);
  await p.evaluate(()=>window.__themeTestLogin(null,3));
  await p.waitForFunction(()=>window.__TT_MANAGER_THEME.scope()==='easy');
  const initialReads=reads.length;
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.get().theme),'dark');
  await p.evaluate(()=>window.__TT_MANAGER_THEME.setAutomatic(false));
  await p.evaluate(()=>window.__TT_MANAGER_THEME.set({version:1,theme:'black',font:''}));
  await p.waitForTimeout(1500);
  assert.equal(reads.length,initialReads);assert.deepEqual(writes,['A']);
  // Clear account A cache to simulate a different device; restore from Drive.
  await p.reload();await p.waitForFunction(()=>window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting'));
  await p.evaluate(()=>{localStorage.removeItem('tt.classroom.ui2.theme.local.v1.normal%3AA');window.__themeTestLogin('A',4)});
  await p.waitForFunction(()=>window.__TT_MANAGER_THEME.get().theme==='pink');
  assert.equal(await p.evaluate(()=>window.__TT_MANAGER_THEME.scope()),'normal:A');
  assert.deepEqual(writes,['A']);
  console.log('PASS simulated NORMAL Google restore, school board change, account switch, EASY no Google, home cache-independent restore');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
