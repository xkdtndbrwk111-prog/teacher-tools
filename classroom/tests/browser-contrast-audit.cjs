// Actual browser audit of visible text, not just palette tokens. Synthetic roster only.
const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..'),port=18149,origin='http://127.0.0.1:'+port;
const themes=['dark','sky','pink','green','black'].map(theme=>({version:1,theme,font:''})).concat([
 {version:1,theme:'custom',font:'',custom:{bg:'#111827',panel:'#172033',text:'#ffffff',accent:'#92b4f4',modal:'#263245'}},
 {version:1,theme:'custom',font:'',custom:{bg:'#f7e5dc',panel:'#fff1df',text:'#f8f8f8',accent:'#c07060',modal:'#fff8ef'}},
 {version:1,theme:'custom',font:'',custom:{bg:'#808080',panel:'#808080',text:'#808080',accent:'#808080',modal:'#808080'}}
]);
function inspect(){
 const parse=s=>{const m=s.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null};
 const blend=(f,b)=>f.slice(0,3).map((v,i)=>v*f[3]+b[i]*(1-f[3])).concat(1);
 const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const visible=e=>{if(!e.getClientRects().length||!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return false;return !e.closest('[hidden],.hidden,[aria-hidden=true],script,style,template,svg,canvas')};
 const name=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(typeof e.className==='string'&&e.className.trim()?'.'+e.className.trim().split(/\s+/).slice(0,4).join('.'):'');
 const issues=new Map(),uncertain=new Set();let checked=0;
 for(const e of document.querySelectorAll('body *')){
  if(!visible(e)||e.closest(':disabled,[aria-disabled=true]'))continue;
  const s=getComputedStyle(e);if(+s.opacity<.99)continue;
  const own=[...e.childNodes].some(n=>n.nodeType===3&&/[\p{L}\p{N}]/u.test(n.textContent||''));
  const control=e.matches('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]):not([type=file]),select,textarea')&&(e.value||e.placeholder);
  if(!own&&!control)continue;
  let fg=parse(control&&!e.value&&e.placeholder?getComputedStyle(e,'::placeholder').color:s.color);if(!fg)continue;
  let bg=[255,255,255,1],layers=[],unc=false;
  for(let n=e;n;n=n.parentElement){let v=getComputedStyle(n);if(v.backgroundImage!=='none'){unc=true;break}let c=parse(v.backgroundColor);if(c&&c[3]>0){layers.push(c);if(c[3]===1)break}}
  if(unc){uncertain.add(name(e));continue}
  for(let i=layers.length-1;i>=0;i--)bg=blend(layers[i],bg);
  fg=blend(fg,bg);let cr=contrast(fg,bg),limit=parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700?3:4.5;
  checked++;if(cr+.001<limit){const key=name(e)+' '+s.color+' / '+bg.slice(0,3).map(Math.round).join(',');const prev=issues.get(key);issues.set(key,{selector:name(e),parent:name(e.parentElement),ratio:+cr.toFixed(2),limit,foreground:s.color,background:bg.slice(0,3).map(Math.round),count:(prev?.count||0)+1})}
 }
 const scrolls=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&e.clientHeight>10&&['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+2).map(e=>({selector:name(e),client:e.clientHeight,scroll:e.scrollHeight,ancestors:[...function*(x){for(let n=x.parentElement;n;n=n.parentElement)if(['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2)yield name(n)}(e)]}));
 return {checked,issues:[...issues.values()].sort((a,b)=>a.ratio-b.ratio),uncertain:uncertain.size,scrolls};
}
(async()=>{
 const server=spawn(process.execPath,[path.join(repo,'classroom/server.mjs'),repo,String(port)],{stdio:'ignore'});let browser;
 try{
  await new Promise(r=>setTimeout(r,600));browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.route(u=>!String(u).startsWith(origin)&&!/^(data|blob):/.test(String(u)),r=>r.abort());
  const p=await ctx.newPage();p.on('dialog',d=>d.dismiss());
  const students=Array.from({length:36},(_,i)=>({id:'audit-'+(i+1),name:'가상학생'+(i+1),gender:'none',balanceLevel:'none',apartFrom:[],fixedSeatId:null,assignmentExcluded:false}));
  await p.goto(origin+'/not-a-page');await p.evaluate(students=>localStorage.setItem('teacher-tools.seating.state.v1',JSON.stringify({version:10,className:'가상 점검 학급',students,layout:{rows:4,cols:9,cells:[]},groups:[],rules:{},assignments:[],history:[]})),students);
  await p.goto(origin+'/seating/');await p.waitForFunction(()=>window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting'));
  let all=[];let themeLabel='';
  async function scan(label,frame=null){
   const x=frame?await frame.locator('html').evaluate(inspect):await p.evaluate(inspect);
   all.push({theme:themeLabel,label,...x});
   console.log('AUDIT '+JSON.stringify({theme:themeLabel,label,checked:x.checked,issues:x.issues.length,uncertain:x.uncertain,scrolls:x.scrolls}));
   for(const issue of x.issues)console.log('CONTRAST '+JSON.stringify({theme:themeLabel,label,...issue}));
  }
  for(let i=0;i<themes.length;i++){
   if(i>0){await p.goto(origin+'/seating/');await p.waitForFunction(()=>window.__TT_MANAGER_HOME&&!document.documentElement.classList.contains('tt-manager-starting'))}
   const t=themes[i];themeLabel=t.theme==='custom'?'custom-'+(i-4):t.theme;
   await p.evaluate(t=>window.__TT_MANAGER_THEME.set(t),t);await p.waitForTimeout(100);
   if(await p.locator('#tt-manager-home-button').isVisible())await p.locator('#tt-manager-home-button').click();
   await p.waitForFunction(()=>window.__TT_MANAGER_HOME.page()==='home');await scan('home');
   await p.locator('[data-tt-ui2-open="seat"]').click();await scan('seating');
   for(const tab of ['student','groups']){const b=p.locator('.dock-tab[data-tab="'+tab+'"]');if(await b.isVisible()){await b.click();await scan('seating-'+tab)}}
   await p.locator('#modePE').click();await scan('pe');
   await p.locator('#tt-seat-subtab').click();
   if(await p.locator('#tt-class-add').isVisible()){await p.locator('#tt-class-add').click();await scan('class-modal');await p.locator('#tt-class-cancel').click()}
   await p.locator('#tt-board-tab').click();await scan('board-link');
   await p.evaluate(()=>window.__TT_SETTINGS.open('general'));
   for(const tab of ['general','cloud','backup','security','privacy','tools']){await p.locator('[data-tt-section="'+tab+'"]').click();await scan('settings-'+tab)}
   await p.locator('#tt-settings-close').click();
   await p.locator('#tt-grade-tab').click();const frame=p.frameLocator('.tt-grade-iframe');
   await frame.locator('html[data-cm-theme="'+t.theme+'"]').waitFor({state:'attached'});
   await frame.locator('.nav[data-page="classes"]').click();await frame.locator('.class-stage-student').first().waitFor();
   await scan('grade-classes',frame);
   await frame.locator('.class-stage-student').first().click();await frame.locator('#student-detail:not(.hidden)').waitFor();await scan('grade-student',frame);
   // Layout stress fixture only: add many cards to the real detail container
   // without changing any grade record. Real app data and normal rendering
   // were scanned immediately above.
   await frame.locator('#personal-results').evaluate(el=>{const list=document.createElement('div');list.className='personal-subject-list';list.id='audit-long-subjects';for(let n=0;n<24;n++){const card=document.createElement('button');card.className='personal-subject-card';card.style.minHeight='120px';card.textContent='가상 교과 '+n;list.append(card)}el.append(list)});
   const geom=await frame.locator('#student-detail').evaluate(el=>{const work=el.closest('.workspace'),list=el.querySelector('#audit-long-subjects'),cs=x=>getComputedStyle(x);el.scrollTop=el.scrollHeight;return {workOverflow:cs(work).overflowY,detailOverflow:cs(el).overflowY,listOverflow:cs(list).overflowY,listHeight:list.clientHeight,listScroll:list.scrollHeight,detailScroll:el.scrollTop}});
   assert.equal(geom.workOverflow,'hidden');assert.equal(geom.detailOverflow,'auto');assert.equal(geom.listOverflow,'visible');assert.ok(geom.listScroll<=geom.listHeight+2);assert.ok(geom.detailScroll>0,'last subject must remain reachable');console.log('SCROLL_PASS '+JSON.stringify({theme:themeLabel,...geom}));
   await frame.locator('#audit-long-subjects').evaluate(el=>el.remove());await frame.locator('#close-student-detail').click();
   for(const v of ['overview','assessments','grades','traits']){await frame.locator('.nav[data-page="'+v+'"]').click();await scan('grade-'+v,frame)}
   await p.locator('#tt-manager-home-button').click();await p.waitForFunction(()=>window.__TT_MANAGER_HOME.page()==='home');
   await p.locator('[data-tt-ui2-open="life"]').click();await p.waitForTimeout(150);await scan('life-entry');
  }
  console.log('AUDIT_SUMMARY '+JSON.stringify({scenes:all.length,checked:all.reduce((s,x)=>s+x.checked,0),findings:all.reduce((s,x)=>s+x.issues.length,0),uncertain:all.reduce((s,x)=>s+x.uncertain,0)}));
  assert.equal(all.length,160,'all 8 palettes and 20 scenes must be tested');
  assert.equal(all.reduce((n,x)=>n+x.issues.length,0),0,'rendered low-contrast text findings remain');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
