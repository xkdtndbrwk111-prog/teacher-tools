const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),{test}=require('node:test');
const code=fs.readFileSync(path.join(__dirname,'dashboard-bridge.js'),'utf8');
test('old cached ready retries once, then blocks; V3 ready resumes; every open uses fresh URL',()=>{
 const el={},listeners={},win={};
 const box=id=>el[id]??=( {hidden:false,textContent:'',open:false,contentWindow:{},focus(){this.focused=true},showModal(){this.open=true},close(){this.open=false},removeAttribute(){this.src=''},addEventListener(){}});
 const ctx={ $:id=>box(id.slice(1)),window:{addEventListener:(n,f)=>listeners[n]=f},document:{fullscreenElement:true},navigator:{},setTimeout:()=>1,clearTimeout(){},Date,console};
 vm.runInNewContext(code,ctx);
 box('openMiniGames').onclick();const f=box('miniFrame'),first=f.src;
 const send=(type,sessionId,origin='https://xkdtndbrwk111-prog.github.io',source=f.contentWindow)=>listeners.message({origin,source,data:{type,sessionId}});
 send('hoja-ready',undefined,'https://evil.example');assert.equal(f.src,first);
 send('hoja-ready');const second=f.src;assert.notEqual(second,first);assert.equal(box('miniNotice').hidden,false);
 send('hoja-ready');assert.equal(f.src,second);assert.equal(box('miniRetry').hidden,false);
 send('hoja-ready','aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');assert.equal(box('miniNotice').hidden,true);
 send('hoja-close');assert.equal(box('miniGames').open,false);
 box('openMiniGames').onclick();assert.notEqual(f.src,second);assert.match(f.src,/coin=3&fresh=/);
});
