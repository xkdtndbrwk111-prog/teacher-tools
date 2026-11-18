const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),T=require('../../shared/hoja-theme.js');
test('exact five HojaBoard source palettes, not approximate clones',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../runtime-src/system/dashboard.html'),'utf8');
 for(const [name,palette] of Object.entries(T.PRESETS)){
  const pattern=name==='dark'?/body\{(--bg:#151a2b;[^}]+)\}/:new RegExp('body\\[data-theme='+name+'\\]\\{([^}]+)\\}');
  const m=html.match(pattern);assert.ok(m,name);
  for(const [key,v] of Object.entries(palette)){const x=m[1].match(new RegExp('--'+key+':(#[0-9a-f]+)(?=;|$)','i'));assert.ok(x,key);const actual=x[1].length===4?'#'+[...x[1].slice(1)].map(c=>c+c).join(''):x[1];assert.equal(v,actual,name+': '+key)}
 }
});
test('custom formula, strict font/colors, contrast across surfaces',()=>{
 const custom={version:1,theme:'custom',font:'맑은 고딕',custom:{bg:'#ffffff',panel:'#ffffff',text:'#ffffff',accent:'#ffffff',modal:'#000000'}};
 const t=T.tokens(custom);assert.equal(t['--cm-panel'],'#ffffff');assert.equal(t['--cm-panel-ink'],'#000000');assert.equal(t['--cm-modal-ink'],'#ffffff');
 for(const theme of [...Object.keys(T.PRESETS),'custom']){
  const v=theme==='custom'?custom:{version:1,theme,font:''},p=T.resolve(v),tokens=T.tokens(v);
  for(const [role,bg] of Object.entries({body:p.bg,panel:p.panel,surface:p.surface,modal:p.modal,control:p.control,accent:p.accent,today:p.today}))assert.ok(T.contrast(bg,tokens['--cm-'+role+'-ink'])>=4.5);
 }
 assert.equal(T.normalize({...custom,font:'x";url(evil)'}),null);
 assert.equal(T.normalize({...custom,custom:{...custom.custom,accent:'red'}}),null);
 assert.deepEqual(T.normalize({...custom,student:'never forwarded'}),custom);
});
