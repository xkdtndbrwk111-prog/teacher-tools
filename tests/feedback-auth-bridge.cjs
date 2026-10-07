// FB-HUB-1 Feedback Board + session bridge verification.
// Runs the two in-page harnesses (tests/feedback-auth-bridge-harness.js,
// tests/feedback-board-harness.js) plus origin/expiry checks that need a
// second origin or a fake clock.
//
// Bridge checks make no Project B / Google request (window.open is faked).
// Board checks read the TEST Feedback dataset through public Supabase RPCs
// only; every Project B call goes to an in-page mock. Nothing is written.
//
// Requires two static servers of the repository parent:
//   python3 -m http.server 8123 --bind 127.0.0.1 --directory ..   (allowed Hub origin)
//   python3 -m http.server 8876 --bind 127.0.0.1 --directory ..   (non-allowed origin)
const {chromium}=require('playwright');
const assert=require('assert/strict');

const BASE=process.env.FEEDBACK_TEST_BASE||'http://127.0.0.1:8123/teacher-tools/';
const OTHER_BASE=process.env.FEEDBACK_TEST_OTHER_BASE||'http://127.0.0.1:8876/teacher-tools/';
const TEST_SUPABASE='https://gjvmnzldisachojkdmid.supabase.co/';

let passed=0;
const report=results=>{
  for(const r of results){
    if(r.pass){passed++;console.log('PASS',r.name)}
    else{console.error('FAIL',r.name,JSON.stringify(r.detail));process.exitCode=1}
  }
};

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const external=[];
  const errors=[];

  async function newPage(){
    const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
    await ctx.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith('http://127.0.0.1:')||url.startsWith(TEST_SUPABASE))return route.continue();
      external.push(url);
      return route.abort();
    });
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    return page;
  }
  const load=(page,file)=>page.addScriptTag({url:'./tests/'+file});

  try{
    const page=await newPage();
    await page.goto(BASE);
    await page.waitForFunction(()=>window.TeacherToolsFeedbackBoard&&
      window.TeacherToolsFeedbackBoard.getState().productsLoaded);
    await load(page,'feedback-auth-bridge-harness.js');
    report((await page.evaluate(()=>window.runFeedbackAuthBridgeHarness())).results);

    await page.reload();
    await page.waitForFunction(()=>window.TeacherToolsFeedbackBoard&&
      window.TeacherToolsFeedbackBoard.getState().productsLoaded);
    await load(page,'feedback-board-harness.js');
    report((await page.evaluate(()=>window.runFeedbackBoardHarness({owner:true}))).results);

    // Non-allowed Hub origin never opens the bridge.
    const other=await newPage();
    await other.goto(OTHER_BASE);
    const otherState=await other.evaluate(()=>{
      window.__opens=0;
      window.open=()=>{window.__opens++;return {}};
      return window.TeacherToolsFeedbackAuthBridge.connect(()=>{});
    });
    assert.equal(otherState.state,'FAILED');
    assert.equal(otherState.safeCode,'HUB_ORIGIN_NOT_ALLOWED');
    assert.equal(await other.evaluate(()=>window.__opens),0);
    passed++;console.log('PASS O1 Hub origin outside allowlist never opens the bridge');

    // A popup that never reports READY expires; a late READY is rejected.
    const timed=await newPage();
    await timed.clock.install();
    await timed.goto(BASE);
    const nonce=await timed.evaluate(()=>{
      window.open=url=>{window.__url=url;return {}};
      window.TeacherToolsFeedbackAuthBridge.connect(()=>{});
      return new URL(window.__url).searchParams.get('bridgeNonce');
    });
    await timed.clock.runFor(10*60*1000+1000);
    const expired=await timed.evaluate(n=>{
      const before=window.TeacherToolsFeedbackAuthBridge.snapshot().state;
      const f=document.createElement('iframe');document.body.append(f);
      window.dispatchEvent(new MessageEvent('message',{
        data:{type:'SMQ_FEEDBACK_BRIDGE_READY',bridgeNonce:n,action:'SESSION'},
        origin:'https://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com',
        source:f.contentWindow
      }));
      return [before,window.TeacherToolsFeedbackAuthBridge.snapshot().state];
    },nonce);
    assert.deepEqual(expired,['STALE','STALE']);
    passed++;console.log('PASS O2 WAIT_READY older than 10 minutes -> STALE; late READY rejected');

    // Static: no popup inspection, polling of the popup, or unload hooks.
    const source=require('fs').readFileSync(require('path').join(__dirname,'..','feedback-auth-bridge.js'),'utf8')
      .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
    assert(!/\.closed\b|\.close\(|setInterval|beforeunload|pagehide|unload|\.location\b|\.document\b/.test(source));
    passed++;console.log('PASS O3 bridge source never reads popup.closed/close()/location/document or polls');

    assert.deepEqual(external,[]);
    assert.deepEqual(errors,[]);
    passed++;console.log('PASS N1 only local + TEST Supabase public requests; no page errors');
  }catch(error){
    console.error(error);
    process.exitCode=1;
  }finally{
    await browser.close();
    console.log(`${passed} checks passed`);
  }
})();
