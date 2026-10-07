// FB-W2A-2B Hub bridge local verification. No Project B, Supabase or Google
// call is made: every non-127.0.0.1 request is aborted, window.open returns a
// fake popup and bridge messages come from same-origin mock frames.
// Requires two static servers of the repository parent:
//   python3 -m http.server 8123 --bind 127.0.0.1 --directory ..   (allowed Hub origin)
//   python3 -m http.server 8876 --bind 127.0.0.1 --directory ..   (non-allowed origin)
const {chromium}=require('playwright');
const assert=require('assert/strict');

const BRIDGE_ORIGIN='https://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com';
const EXEC_URL='https://script.google.com/macros/s/AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc/exec';
const BASE=process.env.FEEDBACK_TEST_BASE||'http://127.0.0.1:8123/teacher-tools/';
const OTHER_BASE=process.env.FEEDBACK_TEST_OTHER_BASE||'http://127.0.0.1:8876/teacher-tools/';
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEYS={
  draft:'teacher-tools.feedback.compose-draft.v1',
  pending:'teacher-tools.feedback.pending-write-intent.v1',
  terminal:'teacher-tools.feedback.terminal-write-intents.v1'
};

const results=[];
const pass=name=>{results.push(name);console.log('PASS',name)};

// Fake popup + mock bridge frames, installed before any page script runs.
function initScript(){
  window.__opens=[];
  window.__popups=[];
  window.__blockPopup=false;
  window.open=function(url,name,features){
    window.__opens.push({url:String(url),name,features});
    if(window.__blockPopup)return null;
    const popup={gone:false};
    window.__closedReads=window.__closedReads||0;
    window.__closeCalls=window.__closeCalls||0;
    Object.defineProperty(popup,'closed',{get(){window.__closedReads++;return popup.gone}});
    popup.close=()=>{window.__closeCalls++;popup.gone=true};
    window.__popups.push(popup);
    return popup;
  };
  window.__frames={};
  window.__sent=[];
  window.__mkFrame=name=>{
    const frame=document.createElement('iframe');
    frame.src='about:blank';
    frame.hidden=true;
    document.body.append(frame);
    const win=frame.contentWindow;
    win.postMessage=(message,targetOrigin)=>{
      window.__sent.push({frame:name,message:JSON.parse(JSON.stringify(message)),targetOrigin});
    };
    window.__frames[name]=win;
  };
  window.__emit=(frameName,data,origin)=>{
    window.dispatchEvent(new MessageEvent('message',{
      data,
      origin,
      source:frameName?window.__frames[frameName]:null
    }));
  };
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const external=[];
  const errors=[];

  async function newPage(){
    const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
    await ctx.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith('http://127.0.0.1:'))return route.continue();
      external.push(url);
      return route.abort();
    });
    await ctx.addInitScript(initScript);
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    return page;
  }

  const state=page=>page.evaluate(()=>window.TeacherToolsFeedbackAuthBridge.snapshot());
  const pending=page=>page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)||'null'),KEYS.pending);
  const terminal=page=>page.evaluate(k=>JSON.parse(sessionStorage.getItem(k)||'[]'),KEYS.terminal);
  const opens=page=>page.evaluate(()=>window.__opens);
  const sent=page=>page.evaluate(()=>window.__sent);
  const lastNonce=async page=>{
    const list=await opens(page);
    return new URL(list[list.length-1].url).searchParams.get('bridgeNonce');
  };
  const emit=(page,frame,data,origin=BRIDGE_ORIGIN)=>page.evaluate(
    ([f,d,o])=>window.__emit(f,d,o),[frame,data,origin]
  );
  const ready=nonce=>({type:'SMQ_FEEDBACK_BRIDGE_READY',bridgeNonce:nonce,action:'CREATE_POST'});

  async function compose(page,title='브리지 테스트',body='로컬 검증 본문'){
    await page.locator('#feedback-compose-open').click();
    await page.locator('#compose-product').selectOption('HUB');
    await page.locator('#compose-title').fill(title);
    await page.locator('#compose-body').fill(body);
    await page.locator('#feedback-compose-submit').click();
  }

  try{
    // ---------- Storage / pending intent ----------
    const page=await newPage();
    await page.goto(BASE);
    await page.evaluate(()=>['A','B','C'].forEach(window.__mkFrame));

    await compose(page);
    const first=await pending(page);
    assert.equal(first.action,'CREATE_POST');
    assert.equal(first.state,'READY_FOR_AUTH');
    assert.match(first.requestId,UUID_V4);
    assert.equal(first.product,'HUB');
    pass('S1 valid pending intent created with UUID v4 requestId');

    let list=await opens(page);
    assert.equal(list.length,1);
    const url=new URL(list[0].url);
    assert.equal(url.origin+url.pathname,EXEC_URL);
    assert.deepEqual([...url.searchParams.keys()].sort(),['action','bridgeNonce','hubOrigin','mode']);
    assert.equal(url.searchParams.get('mode'),'feedback-auth-bridge');
    assert.equal(url.searchParams.get('action'),'CREATE_POST');
    assert.equal(url.searchParams.get('hubOrigin'),'http://127.0.0.1:8123');
    const nonce1=url.searchParams.get('bridgeNonce');
    assert.match(nonce1,/^[a-f0-9]{48}$/);
    assert.notEqual(nonce1,first.requestId);
    assert(!list[0].url.includes(first.requestId));
    pass('S2 popup opened from submit with exact @370 query (no requestId/title/body in URL)');
    assert.equal((await state(page)).state,'WAIT_READY');

    // ---------- State machine: bind ----------
    for(const origin of [
      'https://evil.example',
      'https://script.google.com',
      'https://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com.evil.example',
      'https://other-0lu-script.googleusercontent.com',
      'http://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com'
    ]){
      await emit(page,'A',ready(nonce1),origin);
    }
    assert.equal((await state(page)).state,'WAIT_READY');
    assert.equal((await sent(page)).length,0);
    pass('T1 wrong / look-alike / wildcard-family origins rejected before bind');

    await emit(page,'A',ready('0'.repeat(48)));
    await emit(page,'A',{...ready(nonce1),action:'UPDATE_POST'});
    await emit(page,'A',{type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',bridgeNonce:nonce1,action:'CREATE_POST',requestId:first.requestId,creatorConfirmed:true});
    await emit(page,null,ready(nonce1));
    assert.equal((await state(page)).state,'WAIT_READY');
    assert.equal((await sent(page)).length,0);
    pass('T2 wrong nonce, wrong action, non-READY and source-less messages rejected in WAIT_READY');

    await emit(page,'A',ready(nonce1));
    let out=await sent(page);
    assert.equal(out.length,1);
    assert.equal(out[0].frame,'A');
    assert.equal(out[0].targetOrigin,BRIDGE_ORIGIN);
    assert.deepEqual(out[0].message,{
      type:'SMQ_FEEDBACK_BRIDGE_INTENT',
      action:'CREATE_POST',
      bridgeNonce:nonce1,
      requestId:first.requestId,
      product:'HUB',
      title:'브리지 테스트',
      body:'로컬 검증 본문'
    });
    assert.equal((await state(page)).state,'AUTHENTICATING');
    pass('T3 exact origin+nonce+READY binds event.source and sends exact INTENT shape to exact targetOrigin');

    await emit(page,'A',ready(nonce1));
    await emit(page,'A',ready(nonce1));
    assert.equal((await sent(page)).length,1);
    assert.equal((await state(page)).state,'AUTHENTICATING');
    pass('T4 duplicate READY from bound source is a no-op (no second INTENT/transition)');

    const authRequired={type:'SMQ_FEEDBACK_BRIDGE_AUTH_REQUIRED',bridgeNonce:nonce1,action:'CREATE_POST',requestId:first.requestId};
    await emit(page,'B',authRequired);
    await emit(page,'B',{...authRequired,type:'SMQ_FEEDBACK_BRIDGE_NAVIGATING'});
    assert.equal((await state(page)).state,'AUTHENTICATING');
    await emit(page,'A',{...authRequired,requestId:'00000000-0000-4000-8000-000000000000'});
    assert.equal((await state(page)).state,'AUTHENTICATING');
    await emit(page,'A',authRequired);
    assert.equal((await state(page)).state,'AUTH_REQUIRED');
    pass('T5 steady state: wrong source / wrong requestId ignored; untrusted NAVIGATING cannot arm rebind');

    // Manual reload: same origin + nonce READY from a new source without NAVIGATING.
    await emit(page,'C',ready(nonce1));
    assert.equal((await state(page)).state,'STALE');
    assert.equal((await sent(page)).length,1);
    assert.equal((await pending(page)).requestId,first.requestId);
    await emit(page,'C',ready(nonce1));
    await emit(page,'A',{...authRequired,type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',creatorConfirmed:true});
    assert.equal((await state(page)).state,'STALE');
    pass('T6 manual reload (untrusted READY) rejected fail-closed: STALE, trust dropped, pending/requestId kept');

    // Fresh-session recovery by user action.
    await page.locator('#feedback-compose-submit').click();
    const nonce2=await lastNonce(page);
    assert.notEqual(nonce2,nonce1);
    assert.equal((await opens(page)).length,2);
    assert.equal((await pending(page)).requestId,first.requestId);
    await emit(page,'C',ready(nonce1));
    assert.equal((await state(page)).state,'WAIT_READY');
    await emit(page,'C',ready(nonce2));
    out=await sent(page);
    assert.equal(out.length,2);
    assert.equal(out[1].frame,'C');
    assert.equal(out[1].message.bridgeNonce,nonce2);
    assert.equal(out[1].message.requestId,first.requestId);
    pass('T7 recovery: user action -> fresh nonce, same requestId, old nonce ignored, new secure bind');

    // Trusted navigation rebind.
    const nav={type:'SMQ_FEEDBACK_BRIDGE_NAVIGATING',bridgeNonce:nonce2,action:'CREATE_POST',requestId:first.requestId};
    await emit(page,'C',nav);
    assert.equal((await state(page)).state,'REBIND_EXPECTED');
    await emit(page,'A',{...nav,type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',creatorConfirmed:true});
    await emit(page,'A',ready(nonce1));
    assert.equal((await state(page)).state,'REBIND_EXPECTED');
    await emit(page,'A',ready(nonce2));
    assert.equal((await state(page)).state,'AUTHENTICATING');
    out=await sent(page);
    assert.equal(out.length,3);
    assert.equal(out[2].frame,'A');
    await emit(page,'C',{...nav,type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',creatorConfirmed:true});
    assert.equal((await state(page)).state,'AUTHENTICATING');
    pass('T8 trusted NAVIGATING arms REBIND_EXPECTED; only READY with same nonce rebinds; previous source no longer trusted');

    const authed={type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',bridgeNonce:nonce2,action:'CREATE_POST',requestId:first.requestId};
    await emit(page,'A',{...authed,creatorConfirmed:false});
    await emit(page,'A',{...authed,creatorConfirmed:'true'});
    await emit(page,'A',{...authed,requestId:'00000000-0000-4000-8000-000000000000',creatorConfirmed:true});
    assert.equal((await state(page)).state,'AUTHENTICATING');
    await emit(page,'A',{...authed,creatorConfirmed:true,email:'x@example.com',actor_id:'a',isOwner:true});
    const done=await state(page);
    assert.deepEqual(Object.keys(done).sort(),['postId','requestId','safeCode','state','success']);
    assert.equal(done.state,'MUTATING');
    assert.equal(done.success,null);
    assert.equal(await page.locator('#feedback-compose-submit').isDisabled(),true);
    assert.equal((await pending(page)).state,'READY_FOR_AUTH');
    const stored=await page.evaluate(()=>JSON.stringify({...sessionStorage})+JSON.stringify({...localStorage}));
    assert(!stored.includes('x@example.com')&&!stored.includes('actor_id'));
    await emit(page,'A',ready(nonce2));
    assert.equal((await sent(page)).length,3);
    pass('T9 AUTHENTICATED needs creatorConfirmed===true + requestId; identity fields never stored; bridge waits for CREATE result');

    // Close / reopen / reload / supersede / cancel.
    await page.reload();
    await page.evaluate(()=>['A','B','C'].forEach(window.__mkFrame));
    assert.equal((await opens(page)).length,0);
    assert.equal((await pending(page)).requestId,first.requestId);
    assert.equal((await state(page)).state,'IDLE');
    pass('S3 reload keeps same requestId and never auto-opens a popup');

    await page.locator('#feedback-compose-open').click();
    await page.locator('#feedback-compose-submit').click();
    const nonce3=await lastNonce(page);
    await emit(page,'A',ready(nonce3));
    assert.equal((await sent(page)).length,1);
    const pendingBefore=await page.evaluate(k=>sessionStorage.getItem(k),KEYS.pending);
    await page.evaluate(()=>{window.__popups[0].gone=true});
    await page.waitForTimeout(2500);
    assert.equal((await state(page)).state,'AUTHENTICATING');
    assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),KEYS.pending),pendingBefore);
    pass('COOP-B manual popup disappearance is not observed and does not mutate pending intent');

    await page.locator('#feedback-compose-submit').click();
    const nonce4=await lastNonce(page);
    assert.notEqual(nonce4,nonce3);
    assert.match(nonce4,/^[a-f0-9]{48}$/);
    assert.equal((await pending(page)).requestId,first.requestId);
    assert.equal((await state(page)).state,'WAIT_READY');
    pass('COOP-C/D/E explicit retry ends old session, new nonce, same requestId');

    const oldNav={type:'SMQ_FEEDBACK_BRIDGE_NAVIGATING',bridgeNonce:nonce3,action:'CREATE_POST',requestId:first.requestId};
    await emit(page,'A',oldNav);
    await emit(page,'A',{...oldNav,type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',creatorConfirmed:true});
    await emit(page,'A',ready(nonce3));
    assert.equal((await state(page)).state,'WAIT_READY');
    assert.equal((await sent(page)).length,1);
    await emit(page,'B',ready(nonce4));
    out=await sent(page);
    assert.equal(out.length,2);
    assert.equal(out[1].frame,'B');
    assert.equal(out[1].message.bridgeNonce,nonce4);
    await emit(page,'A',{...oldNav,bridgeNonce:nonce4,type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',creatorConfirmed:true});
    assert.equal((await state(page)).state,'AUTHENTICATING');
    pass('COOP-F old source/old nonce cannot affect the new session');

    await page.locator('#compose-title').fill('브리지 테스트 수정');
    let ended=await terminal(page);
    assert.equal(ended[0].requestId,first.requestId);
    assert.equal(ended[0].state,'SUPERSEDED');
    assert.equal(await pending(page),null);
    assert.equal((await state(page)).state,'CLOSED');
    await emit(page,'B',{type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',bridgeNonce:nonce4,action:'CREATE_POST',requestId:first.requestId,creatorConfirmed:true});
    assert.equal((await state(page)).state,'CLOSED');
    await page.locator('#feedback-compose-submit').click();
    const second=await pending(page);
    assert.match(second.requestId,UUID_V4);
    assert.notEqual(second.requestId,first.requestId);
    assert.equal(second.title,'브리지 테스트 수정');
    assert.equal((await opens(page)).length,3);
    pass('S5 content change -> SUPERSEDED, bridge stopped, new submit gets new requestId');

    await page.locator('#feedback-compose-cancel').click();
    ended=await terminal(page);
    assert.equal(ended[0].requestId,second.requestId);
    assert.equal(ended[0].state,'CANCELLED');
    assert.equal(await pending(page),null);
    assert.equal((await state(page)).state,'CLOSED');
    pass('S6 cancel -> CANCELLED, pending removed, bridge session closed');

    // ERROR mapping and popup blocked.
    await compose(page,'오류 테스트','본문');
    const third=await pending(page);
    const nonce5=await lastNonce(page);
    await emit(page,'B',ready(nonce5));
    await emit(page,'B',{type:'SMQ_FEEDBACK_BRIDGE_ERROR',bridgeNonce:nonce5,action:'CREATE_POST',requestId:third.requestId,safeCode:'<img src=x>'});
    let snap=await state(page);
    assert.equal(snap.state,'AUTH_REQUIRED');
    assert.equal(snap.safeCode,'CREATOR_CONFIRMATION_FAILED');
    await emit(page,'B',{type:'SMQ_FEEDBACK_BRIDGE_ERROR',bridgeNonce:nonce5,action:'CREATE_POST',requestId:third.requestId,safeCode:'CREATOR_NOT_APPROVED'});
    assert.equal((await state(page)).safeCode,'CREATOR_NOT_APPROVED');
    pass('T10 ERROR keeps session bound and only whitelisted safeCodes surface');

    await page.evaluate(()=>{window.__blockPopup=true});
    await page.locator('#feedback-compose-submit').click();
    snap=await state(page);
    assert.equal(snap.state,'FAILED');
    assert.equal(snap.safeCode,'POPUP_BLOCKED');
    assert.equal((await pending(page)).requestId,third.requestId);
    assert.match(await page.locator('#compose-status').textContent(),/차단/);
    pass('T11 popup blocked -> FAILED(POPUP_BLOCKED) with pending/requestId kept and recovery message');

    // Non-allowed Hub origin never opens a popup.
    const other=await newPage();
    await other.goto(OTHER_BASE);
    await compose(other);
    snap=await state(other);
    assert.equal(snap.state,'FAILED');
    assert.equal(snap.safeCode,'HUB_ORIGIN_NOT_ALLOWED');
    assert.equal((await opens(other)).length,0);
    pass('T12 Hub origin outside @370 allowlist never opens the bridge');

    // Session expiry.
    const timed=await newPage();
    await timed.clock.install();
    await timed.goto(BASE);
    await compose(timed);
    assert.equal((await state(timed)).state,'WAIT_READY');
    await timed.clock.runFor(10*60*1000+1000);
    assert.equal((await state(timed)).state,'STALE');
    const timedNonce=await lastNonce(timed);
    await timed.evaluate(()=>window.__mkFrame('A'));
    await emit(timed,'A',ready(timedNonce));
    assert.equal((await state(timed)).state,'STALE');
    assert.match((await pending(timed)).requestId,UUID_V4);
    assert.equal(await timed.evaluate(()=>window.__closedReads||0),0);
    pass('T13/COOP-G session older than 10 minutes -> STALE, late READY rejected, pending kept');

    // Sanitized CREATE success completes the local intent and invokes the
    // existing public Feedback refresh behavior.
    const created=await newPage();
    await created.goto(BASE);
    await created.evaluate(()=>{
      window.__mkFrame('A');
      window.__refreshCalls=0;
      window.feedbackRefresh=()=>{window.__refreshCalls++;return Promise.resolve()};
    });
    await compose(created,'CREATE 성공','성공 본문');
    const createPending=await pending(created);
    const createNonce=await lastNonce(created);
    await emit(created,'A',ready(createNonce));
    await emit(created,'A',{
      type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',
      bridgeNonce:createNonce,
      action:'CREATE_POST',
      requestId:createPending.requestId,
      creatorConfirmed:true
    });
    assert.equal((await state(created)).state,'MUTATING');
    const postId='11111111-2222-4333-8444-555555555555';
    await emit(created,'A',{
      type:'SMQ_FEEDBACK_BRIDGE_CREATE_RESULT',
      bridgeNonce:createNonce,
      action:'CREATE_POST',
      requestId:createPending.requestId,
      success:true,
      postId,
      email:'must-not-store@example.com',
      actor_id:'must-not-store'
    });
    let createState=await state(created);
    assert.equal(createState.state,'SUCCEEDED');
    assert.equal(createState.success,true);
    assert.equal(createState.postId,postId);
    assert.equal(await pending(created),null);
    assert.equal(await created.evaluate(k=>sessionStorage.getItem(k),KEYS.draft),null);
    assert.equal((await terminal(created))[0].state,'COMPLETED');
    assert.equal(await created.locator('#compose-status').textContent(),'등록되었습니다.');
    assert.equal(await created.evaluate(()=>window.__refreshCalls),1);
    assert.equal(await created.locator('#feedback-compose-submit').textContent(),'등록 완료');
    assert.equal(await created.locator('#feedback-compose-submit').isDisabled(),true);
    const successStored=await created.evaluate(()=>JSON.stringify({...sessionStorage})+JSON.stringify({...localStorage}));
    assert(!successStored.includes('must-not-store@example.com')&&!successStored.includes('must-not-store'));
    pass('C1 sanitized CREATE success clears pending/draft, records COMPLETED, shows success and invokes existing refresh');

    // Safe failure preserves the full retry material and requestId.
    const failed=await newPage();
    await failed.goto(BASE);
    await failed.evaluate(()=>window.__mkFrame('A'));
    await compose(failed,'CREATE 실패','실패 보존 본문');
    const failedPending=await pending(failed);
    const failedDraft=await failed.evaluate(k=>sessionStorage.getItem(k),KEYS.draft);
    const failedNonce=await lastNonce(failed);
    await emit(failed,'A',ready(failedNonce));
    await emit(failed,'A',{
      type:'SMQ_FEEDBACK_BRIDGE_AUTHENTICATED',bridgeNonce:failedNonce,
      action:'CREATE_POST',requestId:failedPending.requestId,creatorConfirmed:true
    });
    await emit(failed,'A',{
      type:'SMQ_FEEDBACK_BRIDGE_CREATE_RESULT',bridgeNonce:failedNonce,
      action:'CREATE_POST',requestId:failedPending.requestId,
      success:false,safeCode:'FEEDBACK_CUTOVER_CANARY_ACTOR_DENIED',
      rawError:'must-not-surface'
    });
    let failedState=await state(failed);
    assert.equal(failedState.state,'FAILED');
    assert.equal(failedState.safeCode,'FEEDBACK_CUTOVER_CANARY_ACTOR_DENIED');
    assert.equal((await pending(failed)).requestId,failedPending.requestId);
    assert.equal(await failed.evaluate(k=>sessionStorage.getItem(k),KEYS.draft),failedDraft);
    assert(!String(await failed.locator('#compose-status').textContent()).includes('must-not-surface'));
    await failed.locator('#feedback-compose-submit').click();
    assert.equal((await pending(failed)).requestId,failedPending.requestId);
    assert.notEqual(await lastNonce(failed),failedNonce);
    pass('C2 safe CREATE failure preserves pending/draft/same requestId and explicit retry uses a fresh nonce');

    // A malformed success payload or unknown failure code cannot complete or
    // expose data.
    const malformedNonce=await lastNonce(failed);
    await failed.evaluate(()=>window.__mkFrame('B'));
    await emit(failed,'B',ready(malformedNonce));
    await emit(failed,'B',{
      type:'SMQ_FEEDBACK_BRIDGE_CREATE_RESULT',bridgeNonce:malformedNonce,
      action:'CREATE_POST',requestId:failedPending.requestId,
      success:true,postId:'not-a-uuid'
    });
    assert.equal((await state(failed)).state,'AUTHENTICATING');
    await emit(failed,'B',{
      type:'SMQ_FEEDBACK_BRIDGE_CREATE_RESULT',bridgeNonce:malformedNonce,
      action:'CREATE_POST',requestId:failedPending.requestId,
      success:false,safeCode:'raw database secret'
    });
    failedState=await state(failed);
    assert.equal(failedState.state,'FAILED');
    assert.equal(failedState.safeCode,'FEEDBACK_CREATE_FAILED');
    assert.equal((await pending(failed)).requestId,failedPending.requestId);
    pass('C3 malformed success rejected and unknown failure collapses to safe fallback');

    assert.equal(await page.evaluate(()=>window.__closedReads||0),0);
    assert.equal(await page.evaluate(()=>window.__closeCalls||0),0);
    const source=require('fs').readFileSync(require('path').join(__dirname,'..','feedback-auth-bridge.js'),'utf8')
      .replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
    assert(!/\.closed\b|\.close\(|setInterval|beforeunload|pagehide|unload|\.location\b|\.document\b/.test(source));
    pass('COOP-A no popup.closed/close()/polling/unload/location access (runtime count 0 + static)');

    // Network boundary. Every non-local request was aborted above; the only
    // attempts allowed are the unchanged feedback.js public list read.
    const forbidden=external.filter(u=>!/\/rest\/v1\/rpc\/feedback_list_posts_v2$/.test(u));
    assert.deepEqual(forbidden,[]);
    assert.deepEqual(errors,[]);
    pass('N1 no Apps Script/Google auth/mutation request attempted (public list read only, aborted); no page errors');
    console.log('Blocked non-local requests:',JSON.stringify([...new Set(external.map(u=>new URL(u).origin))]));
  }catch(error){
    console.error(error);
    process.exitCode=1;
  }finally{
    await browser.close();
    console.log(`${results.length} checks passed`);
  }
})();
