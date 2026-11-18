const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),T=require('../../shared/hoja-theme.js');
const html=fs.readFileSync(path.join(__dirname,'../../runtime-src/system/dashboard.html'),'utf8');
const script=html.match(/<script id="tt-board-theme-bridge-v1">([\s\S]*?)<\/script>/)[1];
(async()=>{
 const data=new Map([['class-theme','green'],['class-font',JSON.stringify('맑은 고딕')],['class-custom-themes',JSON.stringify([{name:'private label',bg:'#223344',panel:'#334455',text:'#ffffff',accent:'#8866aa'},null,null])],['student-data','secret']]);let heartbeat,body;
 const ctx={localStorage:{getItem:k=>data.get(k)??null},AbortController,setTimeout:()=>1,clearTimeout(){},setInterval:f=>{heartbeat=f},window:{addEventListener(){}},document:{addEventListener(){}},fetch:async(url,opt)=>{assert.equal(url,'/api/theme/publish');assert.equal(opt.method,'POST');body=opt.body;return{ok:true}},Date};
 vm.runInNewContext(script,ctx);await new Promise(setImmediate);
 assert.ok(/^[\x00-\x7f]+$/.test(body));assert.deepEqual(T.normalize(JSON.parse(body)),{version:1,theme:'green',font:'맑은 고딕'});
 data.set('class-theme-custom','0');await heartbeat();assert.deepEqual(JSON.parse(body),{version:1,theme:'custom',font:'맑은 고딕',custom:{bg:'#223344',panel:'#334455',text:'#ffffff',accent:'#8866aa',modal:'#334455'}});
 assert.ok(!body.includes('private label')&&!body.includes('secret'));
 console.log('PASS board committed custom theme, font ASCII transport and design-only allowlist');
})().catch(e=>{console.error(e);process.exitCode=1});
