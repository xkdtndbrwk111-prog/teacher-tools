import assert from 'node:assert/strict';import test from 'node:test';import {webcrypto} from 'node:crypto';import T from '../../shared/hoja-theme.js';import {createThemeCloud,normalizePref} from '../host/manager-theme-cloud.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const pref={version:1,automatic:true,theme:{version:1,theme:'custom',font:'맑은 고딕',custom:{bg:'#123456',panel:'#334455',text:'#ffffff',accent:'#8899aa',modal:'#112233'}}};
const file={id:'generated_theme_id',name:'Theme',mimeType:'application/json',trashed:false,ownedByMe:true,owners:[{emailAddress:'a@example.invalid'}],appProperties:{ttKind:'teacher-tools-theme-v1'},shared:false};
test('owned design-only file create and restore; nothing from students',async()=>{
 let files=[],raw='',session={sub:'A',email:'a@example.invalid',generation:1,key:'one',accessToken:'fake'};
 const fetcher=async(url,opts)=>{
  assert.equal(opts.headers.Authorization,'Bearer fake');const u=new URL(url);
  if(u.pathname==='/drive/v3/files')return Response.json({files});
  if(u.searchParams.get('uploadType')==='multipart'){assert.equal(opts.method,'POST');assert.match(opts.body,/ttKind/);assert.ok(!opts.body.includes('studentName'));raw=opts.body.split('\r\n\r\n')[2].split('\r\n--')[0];files=[file];return Response.json({id:file.id})}
  if(u.searchParams.get('alt')==='media')return new Response(raw,{headers:{'content-type':'application/json'}});
  if(u.searchParams.get('uploadType')==='media'){assert.equal(opts.method,'PATCH');raw=opts.body;return Response.json({id:file.id})}
  throw Error(url);
 };
 const c=createThemeCloud({auth:{session:()=>session},T,fetcher});
 assert.deepEqual(await c.load(),{fileId:null,pref:null});
 assert.equal(await c.save({...pref,studentName:'private'},null),file.id);
 assert.deepEqual(await c.load(),{fileId:file.id,pref});
 const changed={...pref,automatic:false};await c.save(changed,file.id);assert.deepEqual((await c.load()).pref,changed);
 session={...session,sub:'B',key:'two'};await assert.rejects(c.load(),/THEME_AUTH_CHANGED/);
});
test('duplicate, foreign and unvalidated data are not written',async()=>{
 const auth={session:()=>({sub:'A',email:'a@example.invalid',generation:1,key:'one',accessToken:'fake'})};let files=[file,file],writes=0;
 const c=createThemeCloud({auth,T,fetcher:async(url,o)=>{if(o.method)writes++;return Response.json({files})}});
 await assert.rejects(c.load(),/DUPLICATE/);files=[{...file,owners:[{emailAddress:'b@example.invalid'}]}];await assert.rejects(c.save(pref,file.id),/IDENTITY/);assert.equal(writes,0);
 assert.equal(normalizePref({...pref,theme:{...pref.theme,font:'bad;CSS'}},T),null);
});
