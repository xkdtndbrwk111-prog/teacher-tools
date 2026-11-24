// Read-only diagnostic of the actual public Canva viewer. No authentication,
// legal/cookie consent, design modification or captured book content.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 try{
  for(const [kind,target] of [['non-embed-view','https://www.canva.com/design/DAHbOZ_XOJI/h3UEZISrHVAyXQuw06aOTw/view']]){
  for(const locale of ['en-US','ko-KR']){
   const context=await browser.newContext({locale,viewport:{width:1500,height:850}});
   const page=await context.newPage();
   await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
   function safeUrl(raw){const u=new URL(raw);return {host:u.host,path:u.pathname.replace(/\/design\/([^/]+)\/[^/]+\//,'/design/$1/[share-token]/'),queryKeys:[...u.searchParams.keys()]}}
   for(let i=0;i<2;i++){
    await page.waitForTimeout(2500);
    const controls=await page.evaluate(()=>{
     const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
     const meta=e=>({tag:e.tagName,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),title:e.getAttribute('title'),test:e.getAttribute('data-testid'),text:(e.innerText||'').trim().slice(0,70)});
     return {dialogs:[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis).map(e=>({label:e.getAttribute('aria-label'),head:e.querySelector('h1,h2,h3')?.innerText?.slice(0,80)})),buttons:[...document.querySelectorAll('button,[role=button]')].filter(vis).map(meta).filter(e=>/present|full.?screen|play|발표|프레젠테이션|전체.?화면|재생|cookie|쿠키|consent|동의|next page|previous page|다음 페이지|이전 페이지/i.test([e.label,e.title,e.text,e.test].join(' '))).slice(0,25),fullscreen:!!document.fullscreenElement,documentTitle:document.title.slice(0,80),visibleButtonCount:[...document.querySelectorAll('button,[role=button]')].filter(vis).length,sliders:[...document.querySelectorAll('[role=slider]')].filter(vis).map(e=>({label:e.getAttribute('aria-label'),max:e.getAttribute('aria-valuemax')}))};
    });
    console.log('VIEW_PROBE '+JSON.stringify({kind,locale,url:safeUrl(page.url()),...controls}));
   }
   // Only click an exact unambiguous official full-screen presentation control.
   // Never click consent, close a consent prompt, or act on editable design content.
   const hasDialog=await page.locator('[role=dialog]:visible,[aria-modal=true]:visible').count();
   const control=page.getByRole('button',{name:/^(present full screen|present fullscreen|full screen|fullscreen|enter full screen|enter fullscreen|present|전체 화면으로 전환|전체 화면으로 발표|전체 화면 발표|전체 화면|전체화면|발표|프레젠테이션)$/i});
   if(!hasDialog&&await control.count()===1&&await control.isVisible()){
    console.log('PRESENT_ACTION '+locale);
    await control.click({timeout:5000});
    await page.waitForTimeout(3500);
    console.log('AFTER_PRESENT '+JSON.stringify({kind,locale,url:safeUrl(page.url()),fullscreen:await page.evaluate(()=>!!document.fullscreenElement),controls:await page.getByRole('button',{name:/exit full.?screen|전체.?화면.*종료|전체.?화면.*해제/i}).count()}));
    // Observe rendered changes in memory only. No screenshots, text or content
    // leave this test. Require a stable pre-click image and same page after click.
    const crypto=require('node:crypto');
    const shot=async()=>crypto.createHash('sha256').update(await page.screenshot({clip:{x:150,y:100,width:1200,height:600}})).digest('hex');
    const index=()=>page.evaluate(()=>document.querySelector('[role=slider][aria-valuenow]')?.getAttribute('aria-valuenow')||null);
    const full=await page.evaluate(()=>!!document.fullscreenElement);
    if(full){
     await page.mouse.move(1490,10);
     for(let i=0;i<5;i++){
      await page.waitForTimeout(1500);
      let a=await shot();await page.waitForTimeout(1000);let b=await shot();let before=await index();
      await page.mouse.click(750,400);await page.mouse.move(1490,10);
      await page.waitForTimeout(1500);let after=await shot();let next=await index();
      console.log('CLICK_OBSERVATION '+JSON.stringify({locale,step:i+1,before,next,stableBefore:a===b,changedAfter:b!==after,fullscreen:await page.evaluate(()=>!!document.fullscreenElement)}));
     }
    }
   }
   await context.close();
  }
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.name+': '+e.message.replace(/https:\/\/\S+/g,'[url]'));process.exitCode=1});
