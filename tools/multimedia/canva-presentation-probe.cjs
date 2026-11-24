// Read-only diagnostic of the actual public Canva viewer. No authentication,
// legal/cookie consent, design modification or captured book content.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 try{
  for(const locale of ['en-US','ko-KR']){
   const context=await browser.newContext({locale,viewport:{width:1500,height:850}});
   const page=await context.newPage();
   await page.goto('https://canva.link/9qxk3zuhh93ts2s',{waitUntil:'domcontentloaded',timeout:45000});
   function safeUrl(raw){const u=new URL(raw);return {host:u.host,path:u.pathname.replace(/\/design\/([^/]+)\/[^/]+\//,'/design/$1/[share-token]/'),queryKeys:[...u.searchParams.keys()]}}
   for(let i=0;i<3;i++){
    await page.waitForTimeout(2500);
    const controls=await page.evaluate(()=>{
     const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
     const meta=e=>({tag:e.tagName,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),title:e.getAttribute('title'),test:e.getAttribute('data-testid'),text:(e.innerText||'').trim().slice(0,70)});
     return {dialogs:[...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(vis).map(e=>({label:e.getAttribute('aria-label'),head:e.querySelector('h1,h2,h3')?.innerText?.slice(0,80)})),buttons:[...document.querySelectorAll('button,[role=button]')].filter(vis).map(meta).filter(e=>/present|full.?screen|play|발표|프레젠테이션|전체.?화면|재생|cookie|쿠키|consent|동의|next page|previous page|다음 페이지|이전 페이지/i.test([e.label,e.title,e.text,e.test].join(' '))).slice(0,25),fullscreen:!!document.fullscreenElement,sliders:[...document.querySelectorAll('[role=slider]')].filter(vis).map(e=>({label:e.getAttribute('aria-label'),max:e.getAttribute('aria-valuemax')}))};
    });
    console.log('VIEW_PROBE '+JSON.stringify({locale,url:safeUrl(page.url()),...controls}));
   }
   // Only click an exact unambiguous official full-screen presentation control.
   // Never click consent, close a consent prompt, or act on editable design content.
   const hasDialog=await page.locator('[role=dialog]:visible,[aria-modal=true]:visible').count();
   const control=page.getByRole('button',{name:/^(present full screen|present fullscreen|full screen|fullscreen|enter full screen|enter fullscreen|present|전체 화면으로 발표|전체 화면 발표|전체 화면|전체화면|발표|프레젠테이션)$/i});
   if(!hasDialog&&await control.count()===1&&await control.isVisible()){
    console.log('PRESENT_ACTION '+locale);
    await control.click({timeout:5000});
    await page.waitForTimeout(3500);
    console.log('AFTER_PRESENT '+JSON.stringify({locale,url:safeUrl(page.url()),fullscreen:await page.evaluate(()=>!!document.fullscreenElement),controls:await page.getByRole('button',{name:/exit full.?screen|전체.?화면.*종료|전체.?화면.*해제/i}).count()}));
   }
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.name+': '+e.message.replace(/https:\/\/\S+/g,'[url]'));process.exitCode=1});
