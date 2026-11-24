// Isolated read-only research. No sign-in, terms acceptance, editing, or book content logging.
const {chromium}=require('playwright');
const crypto=require('node:crypto');
const emit=(label,x)=>console.log(label+' '+JSON.stringify(x));
const publicView='https://www.canva.com/design/DAHbOZ_XOJI/h3UEZISrHVAyXQuw06aOTw/view';
const modes=[['embed',publicView+'?embed'],['public',publicView],['original','https://canva.link/9qxk3zuhh93ts2s']];
const present=/^(present|present full screen|present fullscreen|enter full screen|enter fullscreen|전체 화면으로 전환|전체 화면으로 발표|전체 화면 발표|발표|프레젠테이션)$/i;
async function button(p,re){const b=p.getByRole('button',{name:re,exact:true});if(await b.count()!==1||!await b.isVisible()||!await b.isEnabled())return false;await b.click({timeout:4000});return true;}
async function cookies(p){
 if(await button(p,/^(manage cookies|쿠키 관리)$/i)){
  await p.waitForTimeout(750);
  if(await button(p,/^(reject all|reject all cookies|reject optional cookies|모두 거부|선택적 쿠키 거부|필수 쿠키만 허용)$/i)){
   await p.waitForTimeout(750);
   await button(p,/^(save & close|save and close|저장 및 닫기)$/i);
   await p.waitForTimeout(1200);
  }
 }
}
async function inspect(p){return await p.evaluate(()=>{
 const visible=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
 const dialogs=[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(visible).length;
 const sliders=[...document.querySelectorAll('[role=slider][aria-valuenow][aria-valuemax]')].filter(e=>visible(e)&&e.getAttribute('aria-valuemin')==='1').map(e=>({page:Number(e.getAttribute('aria-valuenow')),total:Number(e.getAttribute('aria-valuemax'))})).filter(e=>Number.isInteger(e.page)&&e.page>=1&&e.page<=e.total&&e.total<=4095);
 const labels=[...document.querySelectorAll('[aria-current],[aria-selected=true],[aria-label]')].filter(visible).map(e=>({label:e.getAttribute('aria-label')||'',selected:e.getAttribute('aria-selected')==='true'||['page','true','step'].includes(e.getAttribute('aria-current'))})).filter(e=>/^(?:(?:page|slide|페이지|슬라이드)\s*)\d{1,4}(?:\s*(?:\/|of|중)\s*\d{1,4})?$/i.test(e.label)).slice(0,30);
 const page=sliders.length===1?sliders[0].page:null;
 const center=document.elementFromPoint(innerWidth*.5,innerHeight*.45);
 const unsafe=!center||center.isContentEditable||!!center.closest('input,textarea,select,button,[role=button],a,[contenteditable=true],[role=textbox]');
 const full=document.fullscreenElement;
 return {route:location.pathname.endsWith('/edit')?'edit':location.pathname.endsWith('/view')?'view':'other',registered:location.hostname==='www.canva.com'&&location.pathname.startsWith('/design/DAHbOZ_XOJI/'),dialogs,full:!!full,stage:!!(full&&center&&full.contains(center)),unsafe,sliders,labels,page};
});}
async function frame(p){return crypto.createHash('sha256').update(await p.screenshot({clip:{x:200,y:120,width:1000,height:550},timeout:8000})).digest('hex');}
async function step(p,mode,target){
 const s=await inspect(p);if(!s.registered||s.dialogs||s.unsafe||(s.route==='edit'&&(!s.full||!s.stage)))return false;
 const a=await frame(p);await p.waitForTimeout(750);const b=await frame(p);const before=await inspect(p);
 if(!before.registered||before.dialogs||before.unsafe||(before.route==='edit'&&(!before.full||!before.stage)))return false;
 await p.mouse.click(700,380);await p.mouse.move(1390,8);await p.waitForTimeout(1300);
 const c=await frame(p),after=await inspect(p);
 emit('CLICK',{mode,target,before,after,stable:a===b,changed:b!==c,samePage:before.page!==null&&before.page===after.page});
 return before.page===after.page;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 try{
 for(const [mode,url] of modes){
  const ctx=await browser.newContext({locale:'en-US',viewport:{width:1400,height:800}});
  try{
   const p=await ctx.newPage();await p.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await p.waitForTimeout(4500);await cookies(p);
   let s=await inspect(p);emit('BASELINE',{mode,...s});
   if(!s.registered||s.dialogs){emit('BLOCKED',{mode,reason:'dialog-or-route'});continue;}
   if(mode!=='embed'&&await button(p,present)){await p.waitForTimeout(2500);s=await inspect(p);if(!s.full&&!s.dialogs&&s.route==='edit'&&await button(p,present)){await p.waitForTimeout(2500);s=await inspect(p);}}
   emit('PRESENT',{mode,...s});
   if(s.route==='edit'){
    if(!s.full||!s.stage||s.dialogs){emit('BLOCKED',{mode,reason:'no-confirmed-presentation'});continue;}
    for(let i=0;i<8;i++)await step(p,mode,i+1);
   }else{
    for(const target of [6,12,20,40]){
     const slider=p.locator('[role=slider][aria-valuenow][aria-valuemax]').filter({visible:true});
     s=await inspect(p);if(s.dialogs||s.page===null||await slider.count()!==1){emit('SEEK_UNAVAILABLE',{mode,target});break;}
     await slider.focus({timeout:3000});
     for(let i=0;i<Math.abs(target-s.page);i++)await slider.press(target>s.page?'ArrowRight':'ArrowLeft',{timeout:3000});
     await slider.evaluate(e=>e.blur());await p.mouse.move(1390,8);await p.waitForTimeout(1200);
     s=await inspect(p);emit('SEEK',{mode,target,...s});if(s.page!==target)continue;
     for(let i=0;i<3;i++)if(!await step(p,mode,target))break;
    }
   }
  }catch(e){emit('MODE_ERROR',{mode,type:e.name});}finally{await ctx.close();}
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.name);process.exitCode=1});
