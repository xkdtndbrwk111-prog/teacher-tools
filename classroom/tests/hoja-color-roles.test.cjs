const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),T=require('../../shared/hoja-theme.js');
test('shared manager CSS uses declared color roles; no ad-hoc literal colors except named semantic tokens',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../../shared/hoja-manager-theme.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 const literal=[...css.matchAll(/(?:^|[;{])\s*(?:color|background(?:-color)?|border-color|outline-color)\s*:\s*(#[\da-f]{3,8}|rgba?\()/gim)];
 assert.deepEqual(literal.map(m=>m[0]),[]);
 for(const role of ['primary','secondary','accent','alert','on-fill'])assert.match(css,new RegExp('--text-'+role+'\\s*:'));
});
test('five text roles use contrast-safe ink on five presets and extreme custom themes',()=>{
 const variants=[...Object.keys(T.PRESETS).map(theme=>({version:1,theme,font:''})),...['#000000','#ffffff','#ff0000','#808080'].map(c=>({version:1,theme:'custom',font:'',custom:{bg:c,panel:c,text:c,accent:c,modal:c}}))];
 for(const p of variants){const t=T.tokens(p);
  for(const role of ['body','panel','surface','modal','control','accent','today']){
   const bg=t['--cm-'+(role==='body'?'bg':role)];
   for(const ink of ['ink','sub','emphasis','alert'])assert.ok(T.contrast(bg,t['--cm-'+role+'-'+ink])>=4.5,role+' '+ink);
  }
  for(const ink of ['ink','sub','emphasis','alert'])assert.ok(T.contrast(t['--cm-work-paper'],t['--cm-work-'+ink])>=4.5);
 }
});
