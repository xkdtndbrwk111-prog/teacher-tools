"use strict";

/*
 * Teacher Tools Hub — Feedback Board
 *
 * Ported from Project B (SUPER MARIO QUIZ MANAGER) immutable TEST @371,
 * Script.html line 17080 (installFeedbackBoardFb1_). UI, state, rendering and
 * mutation state machine are Project B's. Hub adaptations are limited to:
 * - transport: google.script.run -> TeacherToolsFeedbackTransport
 *   (public Supabase reads + Project B session bridge);
 * - Creator/OWNER availability from the bridge session instead of the
 *   Project B page token / managerAccess;
 * - inline board instead of a dashboard modal (no preview slot);
 * - 문의 대상 (product) from the Feedback product registry.
 */
(function installFeedbackBoardFb1_(){
  const $=id=>document.getElementById(id);
  const transport=window.TeacherToolsFeedbackTransport;

  /* HUB: Creator/OWNER come from the Project B session bridge. The opaque
     creatorTag stands in for Project B's page token everywhere the board
     only compares or fingerprints it; it carries no authority. */
  function feedbackBridgeSnapshotV3_(){
    const bridge=transport&&transport.bridge();
    return bridge?bridge.snapshot():null;
  }
  function creatorSessionTokenV3_(){
    const snap=feedbackBridgeSnapshotV3_();
    return snap&&snap.state==='CONNECTED'&&snap.creator
      ?String(snap.creatorTag||''):'';
  }
  function feedbackOwnerSessionV3_(){
    const snap=feedbackBridgeSnapshotV3_();
    return !!(snap&&snap.state==='CONNECTED'&&snap.owner);
  }
  let boardLoaded=false;
  let boardItems=[];
  let boardNoticesV16=[];
  let boardPageV16=1;
  let boardTotalPagesV16=0;
  let boardTotalCountV16=0;
  const BOARD_PAGE_SIZE_V16=20;
  let selectedPostId='';
  let commentNextCursor='';
  let threadRequestSeq=0;
  let boardListRequestSeq=0;
  let boardFirstPageRefreshPromise=null;
  let feedbackActiveMutationV3=null;
  let feedbackMutationTransportCountV3=0;
  let feedbackLastMutationSummaryV3=null;

  let feedbackOwnerAuthEpochV3=0;
  let feedbackOwnerAvailableSnapshotV3=
    feedbackOwnerSessionV3_();
  let feedbackOwnerContextSeqV3=0;
  let feedbackOwnerContextWaitingSeqV3=0;
  let feedbackOwnerContextV3={post:null,comments:{}};
  let feedbackOwnerRecoverySeqV3=0;
  let feedbackOwnerRecoveryWaitingSeqV3=0;
  let feedbackOwnerRecoveryStateV3={posts:[],comments:[]};
  let feedbackOwnerMutationSeqV3=0;
  let feedbackOwnerMutationTransportCountV3=0;
  let feedbackOwnerActiveMutationV3=null;
  let feedbackOwnerMutationBusyV3=false;

  /* =========================================================
     FB-3B1/B2 — TEST-only UI shell + selected-thread capability smoke.
     Production promotion: client mutation paths are armed.
     The server cutover stage remains the authoritative write boundary.
     ========================================================= */
  const FEEDBACK_WRITE_UI_ENABLED=true;
  /* Client wiring is active; server stage still decides whether a write runs. */
  const FEEDBACK_MUTATION_WIRING_ENABLED=true;
  const FEEDBACK_OWNER_MODERATION_WIRING_ENABLED=true;
  const FEEDBACK_OWNER_PENDING_STORAGE_KEY_V3=
    'SMQ_FEEDBACK_OWNER_PENDING_UNKNOWN_V3';
  const FEEDBACK_DRAFT_TTL_MS_V3=10*60*1000;
  const FEEDBACK_DRAFT_STORAGE_KEY_V3='SMQ_FEEDBACK_DRAFT_V3';
  const FEEDBACK_PENDING_STORAGE_KEY_V3='SMQ_FEEDBACK_PENDING_UNKNOWN_V3';
  const FEEDBACK_PHASE1_ENVELOPE_VERSION_V3=2;
  const FEEDBACK_PHASE1_STATES_V3=new Set([
    'DRAFT','READY','FINGERPRINTING','PERSISTING','IN_FLIGHT',
    'PENDING_UNKNOWN','SUCCESS_RECEIPT','READ_REFRESH_FAILED',
    'REVISION_CONFLICT','FAILED_DETERMINISTIC','ABORTED_AUTH_CONTEXT',
    'NON_REPLAYABLE_AUTH_CONTEXT'
  ]);
  const FEEDBACK_EDITOR_MODES_V3=new Set([
    'READ_THREAD','CREATE_POST','UPDATE_POST',
    'CREATE_COMMENT','UPDATE_COMMENT',
    'PENDING_UNKNOWN','REVISION_CONFLICT'
  ]);
  const FEEDBACK_EDITOR_LIMITS_V3={
    title:120,
    postBody:5000,
    commentBody:1000
  };
  const FEEDBACK_CONFLICT_NOTICE_V3=
    '다른 변경이 먼저 저장되었습니다.\n'+
    '최신 내용을 다시 불러왔습니다.\n'+
    '작성 중인 내용은 보존되어 있으니 확인 후 다시 저장해 주세요.';

  let feedbackAuthEpoch=0;
  let feedbackAuthTokenSnapshot=String(creatorSessionTokenV3_()||'').trim();
  let capabilityRequestSeq=0;
  let threadWaitingSeq=0;
  let capabilityWaitingSeq=0;
  let feedbackCapabilityPendingV3=false;
  let selectedThreadSnapshotV3=null;
  let feedbackCapabilitiesV3={post:null,comments:{}};
  let feedbackDraftRevisionV3=0;
  let feedbackEditorContextSeqV3=0;
  let feedbackEditorStateV3={
    mode:'READ_THREAD',
    targetId:'',
    expectedRevision:null,
    waitingFor:'',
    editorContextId:'',
    draftRevision:0
  };

  function feedbackCodePointLengthV3_(value){
    return Array.from(String(value==null?'':value)).length;
  }

  function feedbackNormalizeTitleV3_(value){
    return String(value==null?'':value)
      .replace(/\r\n?/g,'\n')
      .replace(/\s+/g,' ')
      .trim();
  }

  function feedbackNormalizeBodyV3_(value){
    return String(value==null?'':value).replace(/\r\n?/g,'\n').trim();
  }

  function feedbackUuidV4V3_(){
    if(!window.crypto||typeof window.crypto.randomUUID!=='function'){
      throw new Error('FEEDBACK_UUID_V4_UNAVAILABLE');
    }
    const id=String(window.crypto.randomUUID()).toLowerCase();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)){
      throw new Error('FEEDBACK_REQUEST_ID_INVALID');
    }
    return id;
  }

  function feedbackMemoryStorageV3_(){
    const data={};
    return {
      getItem:key=>Object.prototype.hasOwnProperty.call(data,key)?data[key]:null,
      setItem:(key,value)=>{data[key]=String(value)},
      removeItem:key=>{delete data[key]}
    };
  }

  function writeFeedbackDraftV3_(storage,draft,now){
    const safe={
      version:1,
      action:String(draft&&draft.action||''),
      targetId:String(draft&&draft.targetId||''),
      title:String(draft&&draft.title||''),
      body:String(draft&&draft.body||''),
      product:String(draft&&draft.product||''),
      editorContextId:String(draft&&draft.editorContextId||''),
      draftRevision:Number(draft&&draft.draftRevision||0),
      savedAt:Number(now==null?Date.now():now)
    };
    storage.setItem(FEEDBACK_DRAFT_STORAGE_KEY_V3,JSON.stringify(safe));
    return safe;
  }

  function readFeedbackDraftV3_(storage,action,targetId,now){
    let draft=null;
    try{draft=JSON.parse(storage.getItem(FEEDBACK_DRAFT_STORAGE_KEY_V3)||'null')}catch(_e){}
    if(!draft||draft.version!==1)return null;
    const age=Number(now==null?Date.now():now)-Number(draft.savedAt||0);
    if(age<0||age>FEEDBACK_DRAFT_TTL_MS_V3){
      storage.removeItem(FEEDBACK_DRAFT_STORAGE_KEY_V3);
      return null;
    }
    if(String(draft.action||'')!==String(action||''))return null;
    if(String(draft.targetId||'')!==String(targetId||''))return null;
    return {
      version:1,
      action:String(draft.action||''),
      targetId:String(draft.targetId||''),
      title:String(draft.title||''),
      body:String(draft.body||''),
      product:String(draft.product||''),
      editorContextId:String(draft.editorContextId||''),
      draftRevision:Number(draft.draftRevision||0),
      savedAt:Number(draft.savedAt||0)
    };
  }

  function clearFeedbackDraftV3_(storage,action,targetId){
    const current=readFeedbackDraftV3_(storage,action,targetId,Date.now());
    if(current)storage.removeItem(FEEDBACK_DRAFT_STORAGE_KEY_V3);
  }

  function persistFeedbackPendingV3_(storage,envelope){
    const safe={
      version:1,
      requestId:String(envelope&&envelope.requestId||''),
      operation:String(envelope&&envelope.operation||''),
      targetId:envelope&&envelope.targetId==null?null:String(envelope.targetId),
      expectedRevision:envelope&&envelope.expectedRevision==null
        ?null:Number(envelope.expectedRevision),
      normalizedPayload:JSON.parse(JSON.stringify(
        envelope&&envelope.normalizedPayload||{}
      )),
      createdAt:Number(envelope&&envelope.createdAt||Date.now()),
      status:String(envelope&&envelope.status||'PENDING_UNKNOWN'),
      authFingerprint:String(envelope&&envelope.authFingerprint||'')
    };
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(safe.requestId)){
      throw new Error('FEEDBACK_REQUEST_ID_INVALID');
    }
    if(!['IN_FLIGHT','PENDING_UNKNOWN'].includes(safe.status)){
      throw new Error('FEEDBACK_PENDING_STATUS_INVALID');
    }
    storage.setItem(FEEDBACK_PENDING_STORAGE_KEY_V3,JSON.stringify(safe));
    return safe;
  }

  function loadFeedbackPendingV3_(storage,currentFingerprint){
    let value=null;
    try{value=JSON.parse(storage.getItem(FEEDBACK_PENDING_STORAGE_KEY_V3)||'null')}catch(_e){}
    if(!value||value.version!==1)return null;
    const envelope={
      version:1,
      requestId:String(value.requestId||''),
      operation:String(value.operation||''),
      targetId:value.targetId==null?null:String(value.targetId),
      expectedRevision:value.expectedRevision==null?null:Number(value.expectedRevision),
      normalizedPayload:JSON.parse(JSON.stringify(value.normalizedPayload||{})),
      createdAt:Number(value.createdAt||0),
      status:String(value.status||'PENDING_UNKNOWN'),
      authFingerprint:String(value.authFingerprint||'')
    };
    envelope.replayable=!!currentFingerprint &&
      !!envelope.authFingerprint &&
      String(currentFingerprint)===envelope.authFingerprint;
    if(!envelope.replayable){
      envelope.replayBlockedReason='AUTH_CONTEXT_MISMATCH_OR_UNCERTAIN';
    }
    return envelope;
  }

  async function feedbackAuthFingerprintV3_(token){
    /* HUB: the bridge's creatorTag is already Project B's
       sha256('SMQ_FEEDBACK_SESSION_V3|'+token) fingerprint. */
    const value=String(token||'').trim();
    return /^sha256:[0-9a-f]{32}$/.test(value)?value:'';
  }

  async function prepareFeedbackPendingEnvelopeV3_(operation,targetId,expectedRevision,normalizedPayload){
    const fingerprint=await feedbackAuthFingerprintV3_(creatorSessionTokenV3_());
    if(!fingerprint)throw new Error('FEEDBACK_AUTH_CONTEXT_UNCERTAIN');
    return persistFeedbackPendingV3_(sessionStorage,{
      requestId:feedbackUuidV4V3_(),
      operation:String(operation||''),
      targetId:targetId==null?null:String(targetId),
      expectedRevision:expectedRevision==null?null:Number(expectedRevision),
      normalizedPayload:JSON.parse(JSON.stringify(normalizedPayload||{})),
      createdAt:Date.now(),
      status:'IN_FLIGHT',
      authFingerprint:fingerprint
    });
  }

  function assertFeedbackPendingPersistedBeforeTransmitV3_(storage,envelope){
    /* FB-3B3 contract (not wired here): a mutation may be transmitted only
       after the exact IN_FLIGHT envelope is durably readable from storage.
       Any storage read/write failure must abort before network transmission. */
    let stored=null;
    try{
      stored=JSON.parse(storage.getItem(FEEDBACK_PENDING_STORAGE_KEY_V3)||'null');
    }catch(_e){
      throw new Error('FEEDBACK_PENDING_PERSISTENCE_REQUIRED');
    }
    const exact=!!stored&&!!envelope&&
      String(stored.requestId||'')===String(envelope.requestId||'')&&
      String(stored.operation||'')===String(envelope.operation||'')&&
      String(stored.targetId==null?'':stored.targetId)===
        String(envelope.targetId==null?'':envelope.targetId)&&
      Number(stored.expectedRevision==null?-1:stored.expectedRevision)===
        Number(envelope.expectedRevision==null?-1:envelope.expectedRevision)&&
      String(stored.status||'')==='IN_FLIGHT'&&
      JSON.stringify(stored.normalizedPayload||{})===
        JSON.stringify(envelope.normalizedPayload||{});
    if(!exact)throw new Error('FEEDBACK_PENDING_PERSISTENCE_REQUIRED');
    return true;
  }

  function markFeedbackPendingUnknownV3_(envelope){
    return persistFeedbackPendingV3_(sessionStorage,Object.assign({},envelope,{
      status:'PENDING_UNKNOWN'
    }));
  }

  async function assessStoredFeedbackPendingV3_(){
    const fingerprint=await feedbackAuthFingerprintV3_(creatorSessionTokenV3_());
    let pending=null;
    try{
      const envelope=feedbackPhase1ReadEnvelopeV3_(sessionStorage);
      if(envelope&&['IN_FLIGHT','PENDING_UNKNOWN'].includes(String(envelope.status||''))){
        pending=feedbackPhase1CloneV3_(envelope);
        pending.replayable=!!fingerprint&&
          String(pending.authFingerprint||'')===String(fingerprint);
      }
    }catch(_e){}
    if(!pending)return null;
    if(FEEDBACK_WRITE_UI_ENABLED){
      const notice=$('feedbackMutationStateNotice');
      if(notice){
        notice.className='feedback-mutation-state-notice';
        notice.textContent=pending.replayable
          ?'이 탭에 결과가 확인되지 않은 요청이 보존되어 있습니다.'
          :'이전 요청의 작성자와 현재 로그인 계정이 같은지 안전하게 확인할 수 없어 다시 전송할 수 없습니다.';
        notice.hidden=false;
      }
      setFeedbackEditorModeV3_('PENDING_UNKNOWN',{
        targetId:String(pending.targetId||''),
        expectedRevision:pending.expectedRevision,
        waitingFor:''
      });
    }
    return pending;
  }

  async function feedbackPendingReplayEnvelopeV3_(){
    const fingerprint=await feedbackAuthFingerprintV3_(creatorSessionTokenV3_());
    const pending=loadFeedbackPendingV3_(sessionStorage,fingerprint);
    if(!pending||pending.replayable!==true){
      throw new Error('FEEDBACK_PENDING_REPLAY_NOT_SAFE');
    }
    /* Return the persisted fields unchanged. No UUID or payload is generated. */
    return {
      requestId:pending.requestId,
      operation:pending.operation,
      targetId:pending.targetId,
      expectedRevision:pending.expectedRevision,
      normalizedPayload:JSON.parse(JSON.stringify(pending.normalizedPayload)),
      createdAt:pending.createdAt,
      status:pending.status,
      authFingerprint:pending.authFingerprint
    };
  }

  function feedbackAuthBoundaryPlanV3_(oldToken,newToken){
    const previous=String(oldToken||'').trim();
    const next=String(newToken||'').trim();
    const authenticatedBoundary=
      !!previous&&(!next||previous!==next);
    return {
      changed:previous!==next,
      clearOrdinaryDraft:authenticatedBoundary,
      resetAuthenticatedEditor:authenticatedBoundary,
      preservePendingUnknown:true,
      preservePreAuthDraft:!previous&&!!next
    };
  }

  function executeFeedbackAuthBoundaryTransitionV3_(
    oldToken,newToken,criticalInvalidate,storage
  ){
    const plan=feedbackAuthBoundaryPlanV3_(oldToken,newToken);
    if(!plan.changed){
      return Object.assign({},plan,{storageCleanupOk:true});
    }

    /* Critical state invalidation MUST happen before best-effort storage I/O.
       Do not move sessionStorage work above this callback. */
    criticalInvalidate(plan);

    let storageCleanupOk=true;
    if(plan.clearOrdinaryDraft){
      try{
        storage.removeItem(FEEDBACK_DRAFT_STORAGE_KEY_V3);
      }catch(_e){
        storageCleanupOk=false;
      }
    }
    return Object.assign({},plan,{storageCleanupOk});
  }

  function applyFeedbackAuthBoundaryStorageV3_(storage,oldToken,newToken,editorMode){
    const state={
      authEpoch:0,
      capabilityCleared:false,
      capabilityPending:true,
      editorMode:String(editorMode||'READ_THREAD')
    };
    const result=executeFeedbackAuthBoundaryTransitionV3_(
      oldToken,
      newToken,
      plan=>{
        state.authEpoch+=1;
        state.capabilityCleared=true;
        state.capabilityPending=false;
        if(plan.resetAuthenticatedEditor)state.editorMode='READ_THREAD';
      },
      storage
    );
    return Object.assign({},result,state,{pendingPreserved:true});
  }

  function feedbackCommentLoadMoreEligibleV3_(state){
    return !!(state&&state.nextCursor)&&
      state.capabilityPending!==true&&
      state.threadPending!==true;
  }

  function updateFeedbackCommentLoadMoreV3_(){
    const more=$('feedbackCommentsMoreBtn');
    if(!more)return;
    const eligible=feedbackCommentLoadMoreEligibleV3_({
      nextCursor:commentNextCursor,
      capabilityPending:feedbackCapabilityPendingV3,
      threadPending:feedbackEditorStateV3.waitingFor==='THREAD'
    });
    more.hidden=!commentNextCursor;
    more.disabled=!eligible;
  }

  function feedbackModalOpenV3_(){
    const modal=$('feedbackBoardModal');
    return !!modal&&!modal.hidden&&modal.getAttribute('aria-hidden')==='false';
  }

  function clearFeedbackCapabilityStateV3_(){
    feedbackCapabilitiesV3={post:null,comments:{}};
    capabilityWaitingSeq=++capabilityRequestSeq;
    feedbackCapabilityPendingV3=false;
    const status=$('feedbackCapabilityStatus');
    if(status)status.hidden=true;
    renderFeedbackCapabilitiesV3_();
    updateFeedbackCommentLoadMoreV3_();
  }

  function syncFeedbackAuthEpochV3_(reason){
    const token=String(creatorSessionTokenV3_()||'').trim();
    if(token===feedbackAuthTokenSnapshot)return feedbackAuthEpoch;
    const boundary=executeFeedbackAuthBoundaryTransitionV3_(
      feedbackAuthTokenSnapshot,
      token,
      plan=>{
        feedbackAuthTokenSnapshot=token;
        feedbackAuthEpoch+=1;
        clearFeedbackCapabilityStateV3_();
        if(plan.resetAuthenticatedEditor){
          setFeedbackEditorModeV3_('READ_THREAD');
          const notice=$('feedbackMutationStateNotice');
          const pendingActions=$('feedbackPendingActions');
          const conflictActions=$('feedbackConflictActions');
          if(notice)notice.hidden=true;
          if(pendingActions)pendingActions.hidden=true;
          if(conflictActions)conflictActions.hidden=true;
        }
      },
      sessionStorage
    );
    try{
      console.info('[SMQ Feedback FB-3B auth epoch]',feedbackAuthEpoch,String(reason||'AUTH_CONTEXT_CHANGED'));
      if(!boundary.storageCleanupOk){
        console.warn('[SMQ Feedback draft cleanup skipped] storage unavailable');
      }
    }catch(_e){}
    return feedbackAuthEpoch;
  }

  function feedbackRequestContextV3_(seq,waitingFor){
    syncFeedbackAuthEpochV3_('REQUEST_SNAPSHOT');
    return {
      authEpoch:feedbackAuthEpoch,
      tokenSnapshot:String(creatorSessionTokenV3_()||'').trim(),
      selectedPostId:String(selectedPostId||''),
      seq:Number(seq),
      waitingFor:String(waitingFor||''),
      editorMode:String(feedbackEditorStateV3.mode||'READ_THREAD')
    };
  }

  function feedbackResponseGuardPureV3_(request,current){
    return !!request&&!!current&&
      request.authEpoch===current.authEpoch&&
      request.tokenSnapshot===current.tokenSnapshot&&
      request.selectedPostId===current.selectedPostId&&
      request.seq===current.seq&&
      current.modalOpen===true&&
      request.waitingFor===current.waitingFor&&
      request.editorMode===current.editorMode;
  }

  function canApplyFeedbackResponseV3_(request,kind){
    syncFeedbackAuthEpochV3_('RESPONSE_CHECK');
    const waitingSeq=kind==='CAPABILITY'?capabilityWaitingSeq:threadWaitingSeq;
    return feedbackResponseGuardPureV3_(request,{
      authEpoch:feedbackAuthEpoch,
      tokenSnapshot:String(creatorSessionTokenV3_()||'').trim(),
      selectedPostId:String(selectedPostId||''),
      seq:waitingSeq,
      modalOpen:feedbackModalOpenV3_(),
      waitingFor:String(feedbackEditorStateV3.waitingFor||''),
      editorMode:String(feedbackEditorStateV3.mode||'READ_THREAD')
    });
  }

  function setFeedbackEditorModeV3_(mode,state){
    const next=String(mode||'READ_THREAD');
    if(!FEEDBACK_EDITOR_MODES_V3.has(next)){
      throw new Error('FEEDBACK_EDITOR_MODE_INVALID');
    }
    feedbackEditorStateV3=Object.assign({
      mode:next,targetId:'',expectedRevision:null,waitingFor:'',
      editorContextId:'',draftRevision:0
    },state||{},{mode:next});
    renderFeedbackEditorV3_();
    return feedbackEditorStateV3;
  }

  function feedbackEditorPayloadV3_(){
    const mode=feedbackEditorStateV3.mode;
    const title=feedbackNormalizeTitleV3_($('feedbackEditorTitleInput')?.value||'');
    const body=feedbackNormalizeBodyV3_($('feedbackEditorBodyInput')?.value||'');
    const postMode=mode==='CREATE_POST'||mode==='UPDATE_POST';
    return {
      title:postMode?title:'',
      body,
      product:postMode?String($('feedbackEditorProductSelect')?.value||''):''
    };
  }

  function updateFeedbackEditorCountsV3_(){
    const mode=feedbackEditorStateV3.mode;
    const titleCount=feedbackCodePointLengthV3_($('feedbackEditorTitleInput')?.value||'');
    const bodyCount=feedbackCodePointLengthV3_($('feedbackEditorBodyInput')?.value||'');
    const bodyMax=(mode==='CREATE_COMMENT'||mode==='UPDATE_COMMENT')
      ?FEEDBACK_EDITOR_LIMITS_V3.commentBody
      :FEEDBACK_EDITOR_LIMITS_V3.postBody;
    const titleOut=$('feedbackEditorTitleCount');
    const bodyOut=$('feedbackEditorBodyCount');
    if(titleOut){
      titleOut.textContent=titleCount+' / '+FEEDBACK_EDITOR_LIMITS_V3.title;
      titleOut.classList.toggle('is-over-limit',titleCount>FEEDBACK_EDITOR_LIMITS_V3.title);
    }
    if(bodyOut){
      bodyOut.textContent=bodyCount+' / '+bodyMax;
      bodyOut.classList.toggle('is-over-limit',bodyCount>bodyMax);
    }
    const submit=$('feedbackEditorSubmitBtn');
    if(submit){
      const titleRequired=mode==='CREATE_POST'||mode==='UPDATE_POST';
      const productMissing=titleRequired&&
        !String($('feedbackEditorProductSelect')?.value||'');
      submit.disabled=!FEEDBACK_MUTATION_WIRING_ENABLED||
        bodyCount<1||bodyCount>bodyMax||productMissing||
        (titleRequired&&(titleCount<1||titleCount>FEEDBACK_EDITOR_LIMITS_V3.title));
    }
  }

  function renderFeedbackEditorV3_(){
    const shell=$('feedbackEditorShell');
    if(!shell)return;
    const mode=feedbackEditorStateV3.mode;
    const editing=['CREATE_POST','UPDATE_POST','CREATE_COMMENT','UPDATE_COMMENT'].includes(mode);
    shell.hidden=!FEEDBACK_WRITE_UI_ENABLED||!editing;
    shell.dataset.mode=mode;
    const modeOut=$('feedbackEditorModeLabel');
    if(modeOut)modeOut.textContent=mode;
    const titleField=$('feedbackEditorTitleField');
    const postMode=mode==='CREATE_POST'||mode==='UPDATE_POST';
    if(titleField)titleField.hidden=!postMode;
    const productField=$('feedbackEditorProductField');
    if(productField)productField.hidden=!postMode;
    const heading=$('feedbackEditorTitle');
    if(heading){
      heading.textContent={
        CREATE_POST:'새 글 작성',UPDATE_POST:'게시글 수정',
        CREATE_COMMENT:'댓글 작성',UPDATE_COMMENT:'댓글 수정'
      }[mode]||'피드백 작성';
    }
    const bodyLabel=$('feedbackEditorBodyLabel');
    if(bodyLabel)bodyLabel.textContent=postMode?'본문':'댓글';
    updateFeedbackEditorCountsV3_();
  }

  function saveActiveFeedbackDraftV3_(){
    const mode=feedbackEditorStateV3.mode;
    if(!['CREATE_POST','UPDATE_POST','CREATE_COMMENT','UPDATE_COMMENT'].includes(mode))return null;
    const payload=feedbackEditorPayloadV3_();
    return writeFeedbackDraftV3_(sessionStorage,{
      action:mode,
      targetId:feedbackEditorStateV3.targetId,
      title:payload.title,
      body:payload.body,
      product:payload.product,
      editorContextId:feedbackEditorStateV3.editorContextId,
      draftRevision:feedbackEditorStateV3.draftRevision
    });
  }

  function restoreFeedbackDraftToEditorV3_(action,targetId){
    const draft=readFeedbackDraftV3_(sessionStorage,action,targetId,Date.now());
    if(!draft)return false;
    const title=$('feedbackEditorTitleInput');
    const body=$('feedbackEditorBodyInput');
    if(title)title.value=draft.title;
    if(body)body.value=draft.body;
    if(draft.product)renderFeedbackProductOptionsV3_(draft.product);
    if(draft.editorContextId){
      feedbackEditorStateV3.editorContextId=draft.editorContextId;
    }
    feedbackDraftRevisionV3=Math.max(
      feedbackDraftRevisionV3,
      Number(draft.draftRevision||0)
    );
    feedbackEditorStateV3.draftRevision=feedbackDraftRevisionV3;
    updateFeedbackEditorCountsV3_();
    return true;
  }

  function openFeedbackEditorV3_(mode,targetId,seed){
    if(!FEEDBACK_WRITE_UI_ENABLED)return false;
    const action=String(mode||'').toUpperCase();
    if(!['CREATE_POST','UPDATE_POST','CREATE_COMMENT','UPDATE_COMMENT'].includes(action))return false;
    const target=String(targetId||'');

    if(!String(creatorSessionTokenV3_()||'').trim()){
      writeFeedbackDraftV3_(sessionStorage,{
        action,targetId:target,
        title:String(seed&&seed.title||''),
        body:String(seed&&seed.body||''),
        product:String(seed&&seed.product||''),
        editorContextId:'',
        draftRevision:0
      });
      feedbackConnectSessionV3_({action,targetId:target});
      return false;
    }

    feedbackEditorContextSeqV3+=1;
    feedbackDraftRevisionV3=0;
    setFeedbackEditorModeV3_(action,{
      targetId:target,
      expectedRevision:seed&&seed.expectedRevision==null
        ?null:Number(seed.expectedRevision),
      waitingFor:'',
      editorContextId:'FBEC-'+feedbackAuthEpoch+'-'+feedbackEditorContextSeqV3,
      draftRevision:0
    });
    const title=$('feedbackEditorTitleInput');
    const body=$('feedbackEditorBodyInput');
    if(title)title.value=String(seed&&seed.title||'');
    if(body)body.value=String(seed&&seed.body||'');
    renderFeedbackProductOptionsV3_(String(seed&&seed.product||''));
    restoreFeedbackDraftToEditorV3_(action,target);
    renderFeedbackEditorV3_();
    setTimeout(()=>postModeFocusFeedbackV3_(action),0);
    return true;
  }

  function postModeFocusFeedbackV3_(mode){
    const postMode=mode==='CREATE_POST'||mode==='UPDATE_POST';
    (postMode?$('feedbackEditorTitleInput'):$('feedbackEditorBodyInput'))?.focus();
  }

  function cancelFeedbackEditorV3_(){
    const current=feedbackEditorStateV3;
    clearFeedbackDraftV3_(sessionStorage,current.mode,current.targetId);
    setFeedbackEditorModeV3_('READ_THREAD');
    const notice=$('feedbackMutationStateNotice');
    if(notice)notice.hidden=true;
  }

  function feedbackMutationErrorCodeV3_(err){
    const raw=String(err&&err.message||err||'');
    const match=raw.match(/FEEDBACK_[A-Z0-9_]+/);
    if(match)return match[0];
    if(raw.indexOf('CREATOR')>=0){
      return 'FEEDBACK_CREATOR_SESSION_UNAVAILABLE';
    }
    return raw||'FEEDBACK_MUTATION_TRANSPORT_UNKNOWN';
  }

  function feedbackMutationIsDeterministicV3_(code){
    return /^FEEDBACK_[A-Z0-9_]+$/.test(String(code||''))&&
      code!=='FEEDBACK_MUTATION_TRANSPORT_UNKNOWN';
  }

  function feedbackMutationIsAuthDeniedV3_(code){
    return [
      'FEEDBACK_CREATOR_SESSION_UNAVAILABLE',
      'FEEDBACK_GOOGLE_CREATOR_REQUIRED',
      'FEEDBACK_GOOGLE_EMAIL_REQUIRED',
      'FEEDBACK_CREATOR_NOT_REGISTERED',
      'FEEDBACK_CREATOR_IDENTITY_MISMATCH',
      'FEEDBACK_CREATOR_BLOCKED',
      'FEEDBACK_CREATOR_NOT_APPROVED'
    ].includes(String(code||''));
  }

  function feedbackServerCallV3_(op,args){
    /* HUB: Project B session bridge; errors carry the same
       deterministic/unknownResult flags as the google.script.run path. */
    return transport.call(String(op),args||{});
  }

  function feedbackRelayMutationV3_(envelope,token){
    const operation=String(envelope&&envelope.operation||'');
    const target=String(envelope&&envelope.targetId||'');
    const revision=envelope&&envelope.expectedRevision==null
      ?null:Number(envelope.expectedRevision);
    const payload=feedbackPhase1CloneV3_(
      envelope&&envelope.exactNormalizedPayload||{}
    );
    const requestId=String(envelope&&envelope.requestId||'');
    const creatorToken=String(token||'');
    /* HUB: the Creator token stays in Project B; creatorToken here is only
       the session fingerprint and is not transmitted. */
    void creatorToken;
    const map={
      CREATE_POST:['CREATE_POST',{
        requestId,title:payload.title,body:payload.body,product:payload.product
      }],
      UPDATE_POST:['UPDATE_POST',{
        requestId,postId:target,expectedRevision:revision,
        title:payload.title,body:payload.body,product:payload.product
      }],
      DELETE_POST:['DELETE_POST',{
        requestId,postId:target,expectedRevision:revision
      }],
      CREATE_COMMENT:['CREATE_COMMENT',{
        requestId,postId:target,body:payload.body
      }],
      UPDATE_COMMENT:['UPDATE_COMMENT',{
        requestId,commentId:target,expectedRevision:revision,body:payload.body
      }],
      DELETE_COMMENT:['DELETE_COMMENT',{
        requestId,commentId:target,expectedRevision:revision
      }]
    };
    if(!map[operation]){
      return Promise.reject(new Error('FEEDBACK_MUTATION_NOT_ALLOWED'));
    }
    feedbackMutationTransportCountV3+=1;
    return feedbackServerCallV3_(map[operation][0],map[operation][1]);
  }

  function feedbackMutationAuthContextV3_(){
    syncFeedbackAuthEpochV3_('MUTATION_CONTEXT');
    return {
      authEpoch:feedbackAuthEpoch,
      contextKind:'CREATOR',
      tokenSnapshot:String(creatorSessionTokenV3_()||'').trim()
    };
  }

  async function feedbackMutationAuthStillMatchesV3_(envelope){
    syncFeedbackAuthEpochV3_('MUTATION_RECEIPT');
    const fingerprint=await feedbackAuthFingerprintV3_(creatorSessionTokenV3_());
    return !!envelope&&
      Number(envelope.authEpochAtCapture)===Number(feedbackAuthEpoch)&&
      String(envelope.authContextKind||'CREATOR')==='CREATOR'&&
      !!fingerprint&&
      String(envelope.authFingerprint||'')===String(fingerprint);
  }

  function feedbackMutationInputV3_(operation,targetId,expectedRevision,payload){
    feedbackEditorContextSeqV3+=1;
    const editorContextId=String(feedbackEditorStateV3.editorContextId||'')||
      'FBM-'+feedbackAuthEpoch+'-'+feedbackEditorContextSeqV3;
    return {
      explicitUserSubmission:true,
      operation:String(operation||''),
      targetId:targetId==null?null:String(targetId),
      expectedRevision:expectedRevision==null?null:Number(expectedRevision),
      exactNormalizedPayload:feedbackPhase1CloneV3_(payload||{}),
      createdAt:Date.now(),
      editorContextId,
      draftRevisionAtSubmit:Number(feedbackEditorStateV3.draftRevision||0),
      selectedPostIdAtSubmit:String(selectedPostId||'')
    };
  }

  function feedbackMutationAdaptersV3_(storage){
    let captured=null;
    return {
      storage,
      captureAuthContext:()=>{
        captured=feedbackMutationAuthContextV3_();
        return Object.assign({},captured);
      },
      readAuthContext:()=>feedbackMutationAuthContextV3_(),
      computeFingerprint:context=>
        feedbackAuthFingerprintV3_(context&&context.tokenSnapshot),
      newUuid:feedbackUuidV4V3_,
      transmit:(envelope,context)=>
        feedbackRelayMutationV3_(envelope,context&&context.tokenSnapshot)
    };
  }


  /* =========================================================
     FB-3B3-5 — permanent OWNER moderation client foundation.
     IMPORTANT:
     - Separate from Creator self-edit/delete authority.
     - No browser actor/email/owner flag/HMAC/service secret is transmitted.
     - Permanent wiring exists behind its own gate.
     - Current safe baseline keeps OWNER mutation wiring OFF.
     ========================================================= */
  function feedbackOwnerAvailableV3_(){
    return feedbackOwnerSessionV3_();
  }

  function feedbackOwnerStorageV3_(storage){
    return {
      getItem:key=>storage.getItem(
        String(key)===FEEDBACK_PENDING_STORAGE_KEY_V3
          ?FEEDBACK_OWNER_PENDING_STORAGE_KEY_V3
          :key
      ),
      setItem:(key,value)=>storage.setItem(
        String(key)===FEEDBACK_PENDING_STORAGE_KEY_V3
          ?FEEDBACK_OWNER_PENDING_STORAGE_KEY_V3
          :key,
        value
      ),
      removeItem:key=>storage.removeItem(
        String(key)===FEEDBACK_PENDING_STORAGE_KEY_V3
          ?FEEDBACK_OWNER_PENDING_STORAGE_KEY_V3
          :key
      )
    };
  }

  function feedbackOwnerPendingEnvelopeV3_(){
    try{
      return feedbackPhase1ReadEnvelopeV3_(
        feedbackOwnerStorageV3_(sessionStorage)
      );
    }catch(_e){
      return null;
    }
  }

  function feedbackOwnerRecoveryOpenV3_(){
    const panel=$('feedbackOwnerRecoveryPanelV3');
    return !!panel&&!panel.hidden;
  }

  function closeFeedbackOwnerRecoveryV3_(){
    const panel=$('feedbackOwnerRecoveryPanelV3');
    if(panel)panel.hidden=true;
    feedbackOwnerRecoveryWaitingSeqV3=++feedbackOwnerRecoverySeqV3;
  }

  function clearFeedbackOwnerContextV3_(){
    feedbackOwnerContextV3={post:null,comments:{}};
    feedbackOwnerContextWaitingSeqV3=++feedbackOwnerContextSeqV3;
    renderFeedbackOwnerControlsV3_();
  }

  function syncFeedbackOwnerAuthV3_(reason){
    const current=feedbackOwnerAvailableV3_();
    if(current===feedbackOwnerAvailableSnapshotV3)return feedbackOwnerAuthEpochV3;
    feedbackOwnerAvailableSnapshotV3=current;
    feedbackOwnerAuthEpochV3+=1;
    feedbackOwnerContextV3={post:null,comments:{}};
    feedbackOwnerContextWaitingSeqV3=++feedbackOwnerContextSeqV3;
    if(!current)closeFeedbackOwnerRecoveryV3_();
    renderFeedbackOwnerControlsV3_();
    try{
      console.info(
        '[SMQ Feedback OWNER auth epoch]',
        feedbackOwnerAuthEpochV3,
        String(reason||'OWNER_AUTH_CONTEXT_CHANGED')
      );
    }catch(_e){}
    return feedbackOwnerAuthEpochV3;
  }

  async function feedbackOwnerAuthFingerprintV3_(){
    syncFeedbackOwnerAuthV3_('OWNER_FINGERPRINT');
    if(!feedbackOwnerAvailableV3_())return '';
    const marker='SMQ_FEEDBACK_OWNER_CONTEXT_V3';
    if(!window.crypto||!window.crypto.subtle){
      return 'owner-context-v3';
    }
    const digest=await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(marker)
    );
    return 'sha256:'+Array.from(new Uint8Array(digest))
      .slice(0,16)
      .map(b=>b.toString(16).padStart(2,'0'))
      .join('');
  }

  function feedbackOwnerAuthContextV3_(){
    syncFeedbackOwnerAuthV3_('OWNER_MUTATION_CONTEXT');
    const available=feedbackOwnerAvailableV3_();
    return {
      authEpoch:feedbackOwnerAuthEpochV3,
      contextKind:'OWNER',
      tokenSnapshot:available?'OWNER':''
    };
  }

  async function feedbackOwnerAuthStillMatchesV3_(envelope){
    const current=feedbackOwnerAuthContextV3_();
    const fingerprint=await feedbackOwnerAuthFingerprintV3_();
    return !!envelope&&
      feedbackOwnerAvailableV3_()&&
      Number(envelope.authEpochAtCapture)===Number(current.authEpoch)&&
      String(envelope.authContextKind||'')==='OWNER'&&
      !!fingerprint&&
      String(envelope.authFingerprint||'')===String(fingerprint);
  }

  function feedbackOwnerRelayMutationV3_(envelope){
    const operation=String(envelope&&envelope.operation||'');
    const target=String(envelope&&envelope.targetId||'');
    const revision=envelope&&envelope.expectedRevision==null
      ?null:Number(envelope.expectedRevision);
    const requestId=String(envelope&&envelope.requestId||'');
    const payload=feedbackPhase1CloneV3_(
      envelope&&envelope.exactNormalizedPayload||{}
    );
    const action=String(payload&&payload.action||'').trim().toUpperCase();

    let call=null;
    if(operation==='MODERATE_POST'){
      call=['MODERATE_POST',{
        requestId,postId:target,expectedRevision:revision,moderation:action
      }];
    }else if(operation==='MODERATE_COMMENT'){
      call=['MODERATE_COMMENT',{
        requestId,commentId:target,expectedRevision:revision,moderation:action
      }];
    }else{
      return Promise.reject(new Error('FEEDBACK_MUTATION_NOT_ALLOWED'));
    }

    feedbackOwnerMutationTransportCountV3+=1;
    return feedbackServerCallV3_(call[0],call[1]);
  }

  function feedbackOwnerMutationInputV3_(
    operation,targetId,expectedRevision,action,originPostId
  ){
    feedbackOwnerMutationSeqV3+=1;
    return {
      explicitUserSubmission:true,
      operation:String(operation||''),
      targetId:String(targetId||''),
      expectedRevision:Number(expectedRevision),
      exactNormalizedPayload:{
        action:String(action||'').trim().toUpperCase()
      },
      createdAt:Date.now(),
      editorContextId:
        'FBO-'+feedbackOwnerAuthEpochV3+'-'+feedbackOwnerMutationSeqV3,
      draftRevisionAtSubmit:0,
      selectedPostIdAtSubmit:String(originPostId||'')
    };
  }

  function feedbackOwnerMutationAdaptersV3_(storage){
    return {
      storage,
      captureAuthContext:()=>feedbackOwnerAuthContextV3_(),
      readAuthContext:()=>feedbackOwnerAuthContextV3_(),
      computeFingerprint:()=>feedbackOwnerAuthFingerprintV3_(),
      newUuid:feedbackUuidV4V3_,
      afterPersistAwait:async()=>Promise.resolve(),
      transmit:envelope=>feedbackOwnerRelayMutationV3_(envelope)
    };
  }

  function feedbackOwnerNoticeV3_(text,kind){
    const notice=$('feedbackMutationStateNotice');
    const pendingActions=$('feedbackPendingActions');
    const conflictActions=$('feedbackConflictActions');
    if(conflictActions)conflictActions.hidden=true;
    if(!notice)return;
    notice.className='feedback-mutation-state-notice';
    notice.textContent=String(text||'');
    notice.hidden=!text;
    if(kind==='PENDING_UNKNOWN'){
      if(pendingActions)pendingActions.hidden=false;
    }else if(pendingActions){
      pendingActions.hidden=true;
    }
    if(kind==='CONFLICT')notice.classList.add('is-conflict');
    if(kind==='REFRESH_FAILED')notice.classList.add('is-success-refresh-failed');
  }

  function setFeedbackOwnerMutationBusyV3_(busy){
    feedbackOwnerMutationBusyV3=!!busy;
    [
      'feedbackOwnerPinPostV3',
      'feedbackOwnerUnpinPostV3',
      'feedbackOwnerHidePostV3',
      'feedbackOwnerDeletePostV3',
      'feedbackOwnerRecoveryRefreshV3'
    ].forEach(id=>{
      const el=$(id);
      if(el)el.disabled=feedbackOwnerMutationBusyV3;
    });
    document.querySelectorAll(
      '.feedback-comment-owner-moderation button,'+
      '.feedback-owner-recovery-item-actions button'
    ).forEach(btn=>{btn.disabled=feedbackOwnerMutationBusyV3});
  }

  function feedbackOwnerContextGuardV3_(request){
    syncFeedbackOwnerAuthV3_('OWNER_CONTEXT_RESPONSE');
    return !!request&&
      FEEDBACK_OWNER_MODERATION_WIRING_ENABLED&&
      feedbackOwnerAvailableV3_()&&
      request.ownerEpoch===feedbackOwnerAuthEpochV3&&
      request.seq===feedbackOwnerContextWaitingSeqV3&&
      request.threadSeq===threadWaitingSeq&&
      request.selectedPostId===String(selectedPostId||'')&&
      feedbackModalOpenV3_();
  }

  function requestFeedbackOwnerContextV3_(postId,comments,threadSeq,reset){
    if(
      !FEEDBACK_OWNER_MODERATION_WIRING_ENABLED||
      !feedbackOwnerAvailableV3_()
    ){
      if(reset)clearFeedbackOwnerContextV3_();
      return;
    }

    const id=String(postId||'');
    if(!id)return;

    const commentIds=(comments||[])
      .filter(item=>String(item&&item.status||'ACTIVE').toUpperCase()==='ACTIVE')
      .map(item=>String(item&&item.commentId||''))
      .filter(Boolean)
      .slice(0,50);

    const seq=++feedbackOwnerContextSeqV3;
    feedbackOwnerContextWaitingSeqV3=seq;
    const request={
      ownerEpoch:feedbackOwnerAuthEpochV3,
      seq,
      threadSeq:Number(threadSeq),
      selectedPostId:id
    };

    feedbackServerCallV3_('OWNER_CONTEXT',{postId:id,commentIds})
      .then(result=>{
        if(!feedbackOwnerContextGuardV3_(request))return;
        const incomingComments=
          result&&result.comments&&typeof result.comments==='object'
            ?result.comments:{};
        feedbackOwnerContextV3={
          post:reset
            ?(result&&result.post||null)
            :(feedbackOwnerContextV3.post||result&&result.post||null),
          comments:Object.assign(
            {},
            reset?{}:feedbackOwnerContextV3.comments,
            incomingComments
          )
        };
        renderFeedbackOwnerControlsV3_();
      })
      .catch(()=>{
        if(!feedbackOwnerContextGuardV3_(request))return;
        if(reset)feedbackOwnerContextV3={post:null,comments:{}};
        renderFeedbackOwnerControlsV3_();
      });
  }

  function renderFeedbackOwnerControlsV3_(){
    const allowed=
      FEEDBACK_OWNER_MODERATION_WIRING_ENABLED&&
      feedbackOwnerAvailableV3_();

    const recoveryOpen=$('feedbackOwnerRecoveryOpenV3');
    if(recoveryOpen)recoveryOpen.hidden=!allowed;

    const postActions=$('feedbackOwnerPostModerationV3');
    const postCtx=feedbackOwnerContextV3.post||{};
    const postReady=
      allowed&&
      !!selectedPostId&&
      Number.isSafeInteger(Number(postCtx.revision))&&
      Number(postCtx.revision)>=1&&
      String(postCtx.postId||'')===String(selectedPostId||'')&&
      String(postCtx.status||'ACTIVE')==='ACTIVE';

    if(postActions)postActions.hidden=!postReady;

    const pin=$('feedbackOwnerPinPostV3');
    const unpin=$('feedbackOwnerUnpinPostV3');
    if(pin)pin.hidden=!postReady||postCtx.isNotice===true;
    if(unpin)unpin.hidden=!postReady||postCtx.isNotice!==true;

    document.querySelectorAll(
      '[data-feedback-owner-comment-actions]'
    ).forEach(actions=>{
      const id=String(actions.dataset.feedbackOwnerCommentActions||'');
      const ctx=feedbackOwnerContextV3.comments[id]||{};
      const ready=
        allowed&&
        Number.isSafeInteger(Number(ctx.revision))&&
        Number(ctx.revision)>=1&&
        String(ctx.status||'ACTIVE')==='ACTIVE';
      actions.hidden=!ready;
      actions.querySelectorAll('button').forEach(btn=>{
        btn.disabled=feedbackOwnerMutationBusyV3;
      });
    });

    if(!allowed)closeFeedbackOwnerRecoveryV3_();
  }

  function feedbackOwnerRecoveryGuardV3_(request){
    syncFeedbackOwnerAuthV3_('OWNER_RECOVERY_RESPONSE');
    return !!request&&
      FEEDBACK_OWNER_MODERATION_WIRING_ENABLED&&
      feedbackOwnerAvailableV3_()&&
      request.ownerEpoch===feedbackOwnerAuthEpochV3&&
      request.seq===feedbackOwnerRecoveryWaitingSeqV3&&
      feedbackOwnerRecoveryOpenV3_()&&
      feedbackModalOpenV3_();
  }

  function feedbackOwnerRecoveryPreviewV3_(value,max){
    const text=String(value||'').trim();
    const limit=Math.max(20,Number(max)||320);
    return text.length>limit?text.slice(0,limit)+'…':text;
  }

  function feedbackOwnerRecoveryItemV3_(kind,item){
    const row=document.createElement('article');
    row.className='feedback-owner-recovery-item';

    const head=document.createElement('div');
    head.className='feedback-owner-recovery-item-head';

    const title=document.createElement('strong');
    title.className='feedback-owner-recovery-item-title';
    title.textContent=kind==='POST'
      ?String(item&&item.title||'제목 없음')
      :'댓글 · '+String(item&&item.authorDisplayName||'사용자');

    const badge=document.createElement('span');
    badge.className='feedback-owner-recovery-badge';
    badge.textContent=kind==='POST'?'숨김 글':'숨김 댓글';

    head.append(title,badge);

    const meta=document.createElement('span');
    meta.className='feedback-owner-recovery-item-meta';
    meta.textContent=
      String(item&&item.authorDisplayName||'사용자')+
      (item&&item.updatedAt
        ?' · '+formatFeedbackDateFb1_(item.updatedAt)
        :'')+
      ' · rev '+String(Number(item&&item.revision||0));

    const body=document.createElement('div');
    body.className='feedback-owner-recovery-item-body';
    body.textContent=feedbackOwnerRecoveryPreviewV3_(
      item&&item.body,
      kind==='POST'?420:280
    );

    const actions=document.createElement('div');
    actions.className='feedback-owner-recovery-item-actions';

    const restore=document.createElement('button');
    restore.type='button';
    restore.textContent='복원';
    restore.dataset.feedbackOwnerRestore='1';

    const del=document.createElement('button');
    del.type='button';
    del.textContent='삭제';
    del.dataset.feedbackOwnerDelete='1';

    restore.addEventListener('click',()=>{
      if(feedbackOwnerMutationBusyV3)return;
      const operation=kind==='POST'?'MODERATE_POST':'MODERATE_COMMENT';
      const target=kind==='POST'
        ?String(item&&item.postId||'')
        :String(item&&item.commentId||'');
      const origin=kind==='POST'
        ?String(item&&item.postId||'')
        :String(item&&item.postId||'');
      submitFeedbackOwnerModerationV3_(
        operation,target,Number(item&&item.revision||0),'UNHIDE',origin,'RECOVERY'
      ).catch(()=>{});
    });

    del.addEventListener('click',()=>{
      if(feedbackOwnerMutationBusyV3)return;
      const operation=kind==='POST'?'MODERATE_POST':'MODERATE_COMMENT';
      const target=kind==='POST'
        ?String(item&&item.postId||'')
        :String(item&&item.commentId||'');
      submitFeedbackOwnerModerationV3_(
        operation,target,Number(item&&item.revision||0),'DELETE',
        String(item&&item.postId||''),'RECOVERY'
      ).catch(()=>{});
    });

    actions.append(restore,del);
    row.append(head,meta,body,actions);
    return row;
  }

  function renderFeedbackOwnerRecoveryV3_(data){
    const posts=Array.isArray(data&&data.posts)?data.posts:[];
    const comments=Array.isArray(data&&data.comments)?data.comments:[];
    feedbackOwnerRecoveryStateV3={
      posts:posts.slice(),
      comments:comments.slice()
    };

    const postList=$('feedbackOwnerHiddenPostsV3');
    const commentList=$('feedbackOwnerHiddenCommentsV3');
    const postEmpty=$('feedbackOwnerHiddenPostsEmptyV3');
    const commentEmpty=$('feedbackOwnerHiddenCommentsEmptyV3');

    if(postList){
      clearChildrenFb1_(postList);
      posts.forEach(item=>
        postList.appendChild(feedbackOwnerRecoveryItemV3_('POST',item))
      );
    }
    if(commentList){
      clearChildrenFb1_(commentList);
      comments.forEach(item=>
        commentList.appendChild(feedbackOwnerRecoveryItemV3_('COMMENT',item))
      );
    }
    if(postEmpty)postEmpty.hidden=posts.length!==0;
    if(commentEmpty)commentEmpty.hidden=comments.length!==0;
    setFeedbackOwnerMutationBusyV3_(feedbackOwnerMutationBusyV3);
  }

  function loadFeedbackOwnerRecoveryV3_(){
    if(
      !FEEDBACK_OWNER_MODERATION_WIRING_ENABLED||
      !feedbackOwnerAvailableV3_()||
      !feedbackOwnerRecoveryOpenV3_()
    )return Promise.resolve(false);

    const loading=$('feedbackOwnerRecoveryLoadingV3');
    const error=$('feedbackOwnerRecoveryErrorV3');
    if(loading)loading.hidden=false;
    if(error){error.hidden=true;error.textContent=''}

    const seq=++feedbackOwnerRecoverySeqV3;
    feedbackOwnerRecoveryWaitingSeqV3=seq;
    const request={
      ownerEpoch:feedbackOwnerAuthEpochV3,
      seq
    };

    return new Promise(resolve=>{
      feedbackServerCallV3_('OWNER_QUEUE',{limit:50})
        .then(result=>{
          if(!feedbackOwnerRecoveryGuardV3_(request)){
            resolve(false);
            return;
          }
          if(loading)loading.hidden=true;
          renderFeedbackOwnerRecoveryV3_(result||{});
          resolve(true);
        })
        .catch(err=>{
          if(!feedbackOwnerRecoveryGuardV3_(request)){
            resolve(false);
            return;
          }
          if(loading)loading.hidden=true;
          if(error){
            error.hidden=false;
            error.textContent=
              feedbackMutationErrorCodeV3_(err)||
              '숨김 항목을 불러오지 못했습니다.';
          }
          resolve(false);
        });
    });
  }

  function openFeedbackOwnerRecoveryV3_(){
    syncFeedbackOwnerAuthV3_('OWNER_RECOVERY_OPEN');
    if(
      !FEEDBACK_OWNER_MODERATION_WIRING_ENABLED||
      !feedbackOwnerAvailableV3_()||
      !feedbackModalOpenV3_()
    )return false;
    const panel=$('feedbackOwnerRecoveryPanelV3');
    if(!panel)return false;
    panel.hidden=false;
    loadFeedbackOwnerRecoveryV3_();
    return true;
  }

  async function confirmFeedbackOwnerModerationV3_(operation,action){
    const normalized=String(action||'').toUpperCase();
    if(!['HIDE','DELETE'].includes(normalized))return true;
    const isPost=String(operation)==='MODERATE_POST';
    const deleting=normalized==='DELETE';
    const title=deleting?'관리자 삭제':'숨김 처리';
    const message=deleting
      ?(isPost
        ?'이 게시글을 관리자 권한으로 삭제할까요? 원문과 작성자 닉네임은 숨겨지고 삭제 안내만 남습니다.'
        :'이 댓글을 관리자 권한으로 삭제할까요? 원문과 작성자 닉네임은 숨겨지고 삭제 안내만 남습니다.')
      :(isPost
        ?'이 게시글을 숨길까요? OWNER의 숨김 관리에서 다시 복원할 수 있습니다.'
        :'이 댓글을 숨길까요? OWNER의 숨김 관리에서 다시 복원할 수 있습니다.');
    if(typeof showAppDialog!=='function')return window.confirm(message);
    return !!(await showAppDialog({
      title,
      message,
      tone:deleting?'danger':'warning',
      confirmText:deleting?'삭제':'숨김',
      cancelText:'취소'
    }));
  }

  async function refreshFeedbackAfterOwnerModerationV3_(envelope,receipt){
    const operation=String(envelope&&envelope.operation||'');
    const action=String(
      envelope&&envelope.exactNormalizedPayload&&
      envelope.exactNormalizedPayload.action||''
    ).toUpperCase();
    const target=String(envelope&&envelope.targetId||'');
    const originPostId=String(envelope&&envelope.selectedPostIdAtSubmit||'');

    if(operation==='MODERATE_POST'){
      invalidateFeedbackListCachesV3_();
      const refreshed=await Promise.all([
        refreshFeedbackBoardCurrentPageV16_()
      ]);
      if(refreshed.some(value=>value!==true)){
        throw new Error('FEEDBACK_AUTHORITATIVE_LIST_REFRESH_FAILED');
      }

      if(['HIDE','DELETE'].includes(action)){
        if(String(selectedPostId||'')===target){
          feedbackClearThreadViewV3_();
        }
      }else if(['PIN','UNPIN'].includes(action)){
        if(
          feedbackModalOpenV3_()&&
          String(selectedPostId||'')===target
        ){
          const loaded=await loadThreadFb1_(target,false,true);
          if(loaded!==true){
            throw new Error('FEEDBACK_AUTHORITATIVE_THREAD_REFRESH_FAILED');
          }
        }
      }else if(action==='UNHIDE'){
        /* Public list/preview refresh above is the authoritative recovery readback. */
      }
    }else if(operation==='MODERATE_COMMENT'){
      if(
        originPostId&&
        feedbackModalOpenV3_()&&
        String(selectedPostId||'')===originPostId
      ){
        const loaded=await loadThreadFb1_(originPostId,false,true);
        if(loaded!==true&&action!=='UNHIDE'){
          throw new Error('FEEDBACK_AUTHORITATIVE_THREAD_REFRESH_FAILED');
        }
      }
    }

    if(feedbackOwnerRecoveryOpenV3_()){
      await loadFeedbackOwnerRecoveryV3_();
    }
    renderFeedbackOwnerControlsV3_();
    return true;
  }

  async function feedbackCompleteOwnerMutationV3_(prepared){
    const envelope=prepared&&prepared.envelope;
    const machine=prepared&&prepared.machine;
    const storage=feedbackOwnerStorageV3_(sessionStorage);
    if(!machine)return prepared;

    if(prepared.errorCode){
      const code=feedbackMutationErrorCodeV3_(prepared.errorCode);

      if(machine.state==='PENDING_UNKNOWN'&&envelope){
        feedbackOwnerActiveMutationV3=prepared;
        feedbackOwnerNoticeV3_(
          '관리 작업 결과를 확인하지 못했습니다. 같은 요청 정보가 이 탭에 보존되어 있습니다.',
          'PENDING_UNKNOWN'
        );
        return prepared;
      }

      if(envelope){
        feedbackPhase1ClearPendingIfMatchV3_(
          storage,envelope.submissionId,envelope.requestId
        );
      }

      if(code==='FEEDBACK_REVISION_CONFLICT'){
        feedbackPhase1ApplyOutcomeV3_(
          machine,'REVISION_CONFLICT',{code}
        );
        feedbackOwnerNoticeV3_(
          '다른 변경이 먼저 저장되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도해 주세요.',
          'CONFLICT'
        );
        if(feedbackOwnerRecoveryOpenV3_()){
          loadFeedbackOwnerRecoveryV3_();
        }else if(selectedPostId){
          loadThreadFb1_(selectedPostId,false,true);
        }
      }else{
        feedbackOwnerNoticeV3_(code||'OWNER moderation failed','');
      }
      feedbackOwnerActiveMutationV3=null;
      return prepared;
    }

    if(!envelope)return prepared;

    if(!await feedbackOwnerAuthStillMatchesV3_(envelope)){
      machine.activeEnvelope=feedbackPhase1MarkPendingUnknownV3_(
        storage,envelope
      );
      feedbackPhase1ApplyOutcomeV3_(machine,'PENDING_UNKNOWN',{});
      feedbackOwnerActiveMutationV3=prepared;
      feedbackOwnerNoticeV3_(
        'OWNER 권한 상태가 변경되어 결과 적용을 보류했습니다. 같은 요청 정보는 보존되어 있습니다.',
        'PENDING_UNKNOWN'
      );
      return prepared;
    }

    const receipt=Object.assign({},prepared.receipt,{
      submissionId:envelope.submissionId,
      requestId:envelope.requestId
    });
    const applied=feedbackPhase1ApplyReceiptV3_(
      machine,
      receipt,
      storage,
      {
        editorContextId:envelope.editorContextId,
        draftRevision:envelope.draftRevisionAtSubmit,
        selectedPostId:String(selectedPostId||'')
      }
    );

    if(!applied.applied){
      feedbackOwnerNoticeV3_(
        'OWNER moderation receipt가 현재 요청과 일치하지 않습니다.',
        ''
      );
      return Object.assign(prepared,{applied});
    }

    try{
      await refreshFeedbackAfterOwnerModerationV3_(
        envelope,prepared.receipt
      );
      feedbackOwnerNoticeV3_('관리 작업이 완료되었습니다.','');
    }catch(_err){
      feedbackPhase1ApplyOutcomeV3_(machine,'READ_REFRESH_FAILED',{});
      feedbackOwnerNoticeV3_(
        '관리 작업은 완료됐지만 화면을 새로고침하지 못했습니다.',
        'REFRESH_FAILED'
      );
    }

    feedbackOwnerActiveMutationV3=null;
    return Object.assign(prepared,{applied});
  }

  async function submitFeedbackOwnerModerationV3_(
    operation,targetId,expectedRevision,action,originPostId,source
  ){
    syncFeedbackOwnerAuthV3_('OWNER_SUBMIT');

    if(!FEEDBACK_OWNER_MODERATION_WIRING_ENABLED){
      feedbackOwnerNoticeV3_(
        'OWNER moderation은 현재 TEST feature gate에서 비활성화되어 있습니다.',
        ''
      );
      return false;
    }
    if(!feedbackOwnerAvailableV3_()){
      throw new Error('FEEDBACK_OWNER_REQUIRED');
    }
    if(!feedbackModalOpenV3_()){
      throw new Error('FEEDBACK_OWNER_MODAL_REQUIRED');
    }
    if(feedbackOwnerMutationBusyV3){
      throw new Error('FEEDBACK_OWNER_MUTATION_BUSY');
    }

    const op=String(operation||'').toUpperCase();
    const normalizedAction=String(action||'').toUpperCase();
    const revision=Number(expectedRevision);
    if(!['MODERATE_POST','MODERATE_COMMENT'].includes(op)){
      throw new Error('FEEDBACK_MUTATION_NOT_ALLOWED');
    }
    if(!Number.isSafeInteger(revision)||revision<1){
      throw new Error('FEEDBACK_REVISION_INVALID');
    }

    const recoverySource=String(source||'')==='RECOVERY';
    if(recoverySource&&!feedbackOwnerRecoveryOpenV3_()){
      throw new Error('FEEDBACK_OWNER_RECOVERY_CONTEXT_REQUIRED');
    }

    if(!recoverySource){
      if(op==='MODERATE_POST'){
        const ctx=feedbackOwnerContextV3.post||{};
        if(
          String(targetId||'')!==String(selectedPostId||'')||
          String(ctx.postId||'')!==String(targetId||'')||
          Number(ctx.revision)!==revision
        ){
          throw new Error('FEEDBACK_CAPABILITIES_REFRESH_REQUIRED');
        }
      }else{
        const ctx=feedbackOwnerContextV3.comments[String(targetId||'')]||{};
        if(Number(ctx.revision)!==revision){
          throw new Error('FEEDBACK_CAPABILITIES_REFRESH_REQUIRED');
        }
      }
    }

    const confirmed=await confirmFeedbackOwnerModerationV3_(
      op,normalizedAction
    );
    if(!confirmed)return false;

    const input=feedbackOwnerMutationInputV3_(
      op,targetId,revision,normalizedAction,originPostId
    );
    const storage=feedbackOwnerStorageV3_(sessionStorage);

    setFeedbackOwnerMutationBusyV3_(true);
    try{
      const prepared=await feedbackPhase1PreparePureV3_(
        input,feedbackOwnerMutationAdaptersV3_(storage)
      );
      feedbackOwnerActiveMutationV3=prepared;
      return await feedbackCompleteOwnerMutationV3_(prepared);
    }finally{
      setFeedbackOwnerMutationBusyV3_(false);
      renderFeedbackOwnerControlsV3_();
    }
  }

  async function retryFeedbackOwnerPendingV3_(){
    syncFeedbackOwnerAuthV3_('OWNER_RETRY');
    if(
      !FEEDBACK_OWNER_MODERATION_WIRING_ENABLED||
      !feedbackOwnerAvailableV3_()
    ){
      throw new Error('FEEDBACK_PENDING_REPLAY_NOT_SAFE');
    }

    const storage=feedbackOwnerStorageV3_(sessionStorage);
    const fingerprint=await feedbackOwnerAuthFingerprintV3_();
    const plan=feedbackPhase1ReplayPlanV3_(storage,{
      authFingerprint:fingerprint,
      ownerContextAvailable:true
    });
    if(!plan.replayable)throw new Error('FEEDBACK_PENDING_REPLAY_NOT_SAFE');

    const machine=feedbackPhase1MachineV3_('PENDING_UNKNOWN');
    machine.activeEnvelope=feedbackPhase1CloneV3_(plan.envelope);

    setFeedbackOwnerMutationBusyV3_(true);
    try{
      const receipt=await feedbackOwnerRelayMutationV3_(plan.envelope);
      return await feedbackCompleteOwnerMutationV3_({
        machine,
        envelope:plan.envelope,
        receipt,
        sendCount:1,
        trace:['OWNER_RETRY_TRANSMIT']
      });
    }catch(err){
      const code=feedbackMutationErrorCodeV3_(err);
      const cutoverBlocked=/^FEEDBACK_CUTOVER_/.test(code);

      if(err&&err.unknownResult===true || cutoverBlocked){
        if(cutoverBlocked){
          feedbackPhase1ApplyOutcomeV3_(
            machine,
            'RETRY_AUTH_REJECTED',
            {code,recordedAt:Date.now()}
          );
        }
        feedbackOwnerActiveMutationV3={
          machine,
          envelope:plan.envelope,
          errorCode:code
        };
        feedbackOwnerNoticeV3_(
          cutoverBlocked
            ?'현재 서버 cutover stage에서 재전송이 차단되었습니다. 같은 requestId와 payload는 계속 보존됩니다.'
            :'관리 작업 결과를 아직 확인하지 못했습니다. 같은 requestId가 계속 보존됩니다.',
          'PENDING_UNKNOWN'
        );
      }else{
        feedbackPhase1ClearPendingIfMatchV3_(
          storage,
          plan.envelope.submissionId,
          plan.envelope.requestId
        );
        feedbackOwnerNoticeV3_(code,'');
      }
      throw err;
    }finally{
      setFeedbackOwnerMutationBusyV3_(false);
    }
  }

  function feedbackClearThreadViewV3_(){
    selectedPostId='';
    selectedThreadSnapshotV3=null;
    commentNextCursor='';
    const placeholder=$('feedbackThreadPlaceholder');
    const content=$('feedbackThreadContent');
    const comments=$('feedbackCommentList');
    if(placeholder)placeholder.hidden=false;
    if(content)content.hidden=true;
    if(comments)clearChildrenFb1_(comments);
    setFeedbackEditorModeV3_('READ_THREAD');
    clearFeedbackCapabilityStateV3_();
    clearFeedbackOwnerContextV3_();
    renderBoardListFb1_();
  }

  function invalidateFeedbackListCachesV3_(){
    boardLoaded=false;
  }

  async function refreshFeedbackBoardFirstPageV3_(){
    if(boardFirstPageRefreshPromise)return boardFirstPageRefreshPromise;
    boardFirstPageRefreshPromise=loadBoardPageFb1_(1)
      .finally(()=>{boardFirstPageRefreshPromise=null});
    return boardFirstPageRefreshPromise;
  }

  async function refreshFeedbackBoardCurrentPageV16_(){
    return loadBoardPageFb1_(Math.max(1,Number(boardPageV16)||1));
  }

  async function refreshFeedbackAfterMutationV3_(envelope,receipt,applyToOriginUi){
    const operation=String(envelope&&envelope.operation||'');
    const affectsList=['CREATE_POST','UPDATE_POST','DELETE_POST'].includes(operation);
    if(affectsList){
      invalidateFeedbackListCachesV3_();
      if(operation==='CREATE_POST')boardPageV16=1;
      const refreshed=await Promise.all([
        operation==='CREATE_POST'
          ?refreshFeedbackBoardFirstPageV3_()
          :refreshFeedbackBoardCurrentPageV16_()
      ]);
      if(refreshed.some(value=>value!==true)){
        throw new Error('FEEDBACK_AUTHORITATIVE_LIST_REFRESH_FAILED');
      }
    }

    if(!applyToOriginUi)return true;

    if(operation==='DELETE_POST'){
      feedbackClearThreadViewV3_();
      return true;
    }

    let postId='';
    if(operation==='CREATE_POST')postId=String(receipt&&receipt.entityId||'');
    else if(operation==='UPDATE_POST')postId=String(envelope.targetId||'');
    else if(operation==='CREATE_COMMENT')postId=String(envelope.targetId||'');
    else postId=String(envelope.selectedPostIdAtSubmit||'');

    if(postId){
      const loaded=await loadThreadFb1_(postId,false);
      if(loaded!==true){
        throw new Error('FEEDBACK_AUTHORITATIVE_THREAD_REFRESH_FAILED');
      }
    }
    return true;
  }

  function feedbackMutationMessageV3_(text){
    const message=$('feedbackEditorMessage');
    if(message)message.textContent=String(text||'');
  }

  async function feedbackCompletePreparedMutationV3_(prepared){
    const envelope=prepared&&prepared.envelope;
    const machine=prepared&&prepared.machine;
    if(!envelope||!machine)return prepared;

    if(prepared.errorCode){
      const code=feedbackMutationErrorCodeV3_(prepared.errorCode);
      if(machine.state==='PENDING_UNKNOWN'){
        feedbackActiveMutationV3=prepared;
        showFeedbackFutureStateV3_('PENDING_UNKNOWN');
        feedbackMutationMessageV3_('등록 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
        return prepared;
      }

      feedbackPhase1ClearPendingIfMatchV3_(
        sessionStorage,envelope.submissionId,envelope.requestId
      );
      if(code==='FEEDBACK_REVISION_CONFLICT'){
        feedbackPhase1ApplyOutcomeV3_(machine,'REVISION_CONFLICT',{code});
        showFeedbackFutureStateV3_('REVISION_CONFLICT');
      }else{
        feedbackMutationMessageV3_(code);
      }
      feedbackLastMutationSummaryV3={
        operation:envelope.operation,requestId:envelope.requestId,
        submissionId:envelope.submissionId,state:machine.state,code
      };
      return prepared;
    }

    if(!await feedbackMutationAuthStillMatchesV3_(envelope)){
      machine.activeEnvelope=feedbackPhase1MarkPendingUnknownV3_(
        sessionStorage,envelope
      );
      feedbackPhase1ApplyOutcomeV3_(machine,'PENDING_UNKNOWN',{});
      feedbackActiveMutationV3=prepared;
      return prepared;
    }

    const deleteOperation=String(envelope.operation||'').startsWith('DELETE_');
    const uiState=deleteOperation
      ?{
          editorContextId:envelope.editorContextId,
          draftRevision:envelope.draftRevisionAtSubmit,
          selectedPostId:String(selectedPostId||'')
        }
      :{
          editorContextId:String(feedbackEditorStateV3.editorContextId||''),
          draftRevision:Number(feedbackEditorStateV3.draftRevision||0),
          selectedPostId:String(selectedPostId||'')
        };
    const receipt=Object.assign({},prepared.receipt,{
      submissionId:envelope.submissionId,
      requestId:envelope.requestId
    });
    const applied=feedbackPhase1ApplyReceiptV3_(
      machine,receipt,sessionStorage,uiState
    );
    const pendingUi=String(feedbackEditorStateV3.mode||'')==='PENDING_UNKNOWN';
    const applyToOriginUi=applied.applied===true&&
      String(uiState.selectedPostId||'')===
        String(envelope.selectedPostIdAtSubmit||'')&&
      (deleteOperation||applied.draftCleared===true||pendingUi);

    if((applied.draftCleared||pendingUi)&&!deleteOperation){
      clearFeedbackDraftV3_(
        sessionStorage,envelope.operation,envelope.targetId||''
      );
      setFeedbackEditorModeV3_('READ_THREAD');
    }

    try{
      await refreshFeedbackAfterMutationV3_(
        envelope,prepared.receipt,applyToOriginUi
      );
      feedbackMutationMessageV3_('저장이 완료되었습니다.');
    }catch(_err){
      feedbackPhase1ApplyOutcomeV3_(machine,'READ_REFRESH_FAILED',{});
      showFeedbackFutureStateV3_('COMMITTED_READ_REFRESH_FAILED');
    }

    feedbackActiveMutationV3=null;
    feedbackLastMutationSummaryV3={
      operation:envelope.operation,requestId:envelope.requestId,
      submissionId:envelope.submissionId,
      entityId:String(prepared.receipt&&prepared.receipt.entityId||''),
      revision:Number(prepared.receipt&&prepared.receipt.revision||0),
      state:machine.state,replay:prepared.receipt&&prepared.receipt.replay===true
    };
    return Object.assign(prepared,{applied});
  }

  async function submitFeedbackMutationV3_(input){
    const prepared=await feedbackPhase1PreparePureV3_(
      input,feedbackMutationAdaptersV3_(sessionStorage)
    );
    feedbackActiveMutationV3=prepared;
    return feedbackCompletePreparedMutationV3_(prepared);
  }

  async function retryFeedbackPendingV3_(){
    const fingerprint=await feedbackAuthFingerprintV3_(creatorSessionTokenV3_());
    const plan=feedbackPhase1ReplayPlanV3_(sessionStorage,{
      authFingerprint:fingerprint,ownerContextAvailable:false
    });
    if(!plan.replayable)throw new Error('FEEDBACK_PENDING_REPLAY_NOT_SAFE');

    const machine=feedbackPhase1MachineV3_('PENDING_UNKNOWN');
    machine.activeEnvelope=feedbackPhase1CloneV3_(plan.envelope);
    try{
      const receipt=await feedbackRelayMutationV3_(
        plan.envelope,String(creatorSessionTokenV3_()||'').trim()
      );
      return feedbackCompletePreparedMutationV3_({
        machine,envelope:plan.envelope,receipt,sendCount:1,trace:['RETRY_TRANSMIT']
      });
    }catch(err){
      const code=feedbackMutationErrorCodeV3_(err);
      feedbackPhase1ApplyOutcomeV3_(
        machine,
        code==='FEEDBACK_IDEMPOTENCY_MISMATCH'
          ?'RETRY_IDEMPOTENCY_MISMATCH'
          :'RETRY_AUTH_REJECTED',
        {code,recordedAt:Date.now()}
      );
      feedbackActiveMutationV3={machine,envelope:plan.envelope,errorCode:code};
      showFeedbackFutureStateV3_('PENDING_UNKNOWN');
      throw err;
    }
  }

  async function submitFeedbackDeleteV3_(operation,targetId,expectedRevision){
    if(!FEEDBACK_MUTATION_WIRING_ENABLED){
      showAppNotice(
        '삭제 저장 기능은 현재 TEST feature gate에서 비활성화되어 있습니다.',
        '피드백 삭제','info'
      );
      return false;
    }
    const input=feedbackMutationInputV3_(
      operation,targetId,expectedRevision,{}
    );
    await submitFeedbackMutationV3_(input);
    return true;
  }

  async function submitFeedbackShellV3_(){
    saveActiveFeedbackDraftV3_();
    const message=$('feedbackEditorMessage');
    if(!FEEDBACK_MUTATION_WIRING_ENABLED){
      if(message)message.textContent='현재 단계에서는 저장 기능이 연결되어 있지 않습니다.';
      return false;
    }
    const operation=String(feedbackEditorStateV3.mode||'');
    if(!['CREATE_POST','UPDATE_POST','CREATE_COMMENT','UPDATE_COMMENT'].includes(operation)){
      return false;
    }
    const payload=feedbackEditorPayloadV3_();
    const input=feedbackMutationInputV3_(
      operation,
      feedbackEditorStateV3.targetId||null,
      feedbackEditorStateV3.expectedRevision,
      operation.endsWith('_POST')
        ?{title:payload.title,body:payload.body,product:payload.product}
        :{body:payload.body}
    );
    if(message)message.textContent='저장하는 중...';
    await submitFeedbackMutationV3_(input);
    return true;
  }

  function feedbackMutationStateFromResultV3_(result){
    const code=String(result&&result.code||'');
    if(code==='FEEDBACK_REVISION_CONFLICT')return 'REVISION_CONFLICT';
    if(result&&result.committed===true&&result.readRefreshFailed===true){
      return 'COMMITTED_READ_REFRESH_FAILED';
    }
    if(result&&result.rolledBack===true)return 'DETERMINISTIC_FAILURE';
    if(result&&result.ok===true)return 'DETERMINISTIC_SUCCESS';
    return 'PENDING_UNKNOWN';
  }

  function applyFeedbackFutureResultV3_(result){
    const state=feedbackMutationStateFromResultV3_(result);
    if(state==='DETERMINISTIC_SUCCESS'||state==='COMMITTED_READ_REFRESH_FAILED'){
      clearFeedbackDraftV3_(
        sessionStorage,
        feedbackEditorStateV3.mode,
        feedbackEditorStateV3.targetId
      );
      sessionStorage.removeItem(FEEDBACK_PENDING_STORAGE_KEY_V3);
      setFeedbackEditorModeV3_('READ_THREAD');
    }else if(state==='DETERMINISTIC_FAILURE'){
      sessionStorage.removeItem(FEEDBACK_PENDING_STORAGE_KEY_V3);
    }
    if(['REVISION_CONFLICT','COMMITTED_READ_REFRESH_FAILED','PENDING_UNKNOWN'].includes(state)){
      showFeedbackFutureStateV3_(state);
    }
    return state;
  }

  /* =========================================================
     FB-3B3 Phase 1 — isolated client mutation state machine.
     This block has no google.script.run mutation transport and is not wired
     to submitFeedbackShellV3_. Injected transports exist only for pure tests.
     ========================================================= */
  function feedbackPhase1CloneV3_(value){
    return JSON.parse(JSON.stringify(value==null?null:value));
  }

  function feedbackPhase1AssertUuidV3_(value,label){
    const id=String(value||'').toLowerCase();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)){
      throw new Error(String(label||'FEEDBACK_PHASE1_UUID_INVALID'));
    }
    return id;
  }

  function feedbackPhase1MachineV3_(state){
    const initial=String(state||'DRAFT');
    if(!FEEDBACK_PHASE1_STATES_V3.has(initial)){
      throw new Error('FEEDBACK_PHASE1_STATE_INVALID');
    }
    return {
      state:initial,
      activeEnvelope:null,
      retryOutcomes:[],
      history:[initial],
      preserveDraft:true
    };
  }

  function feedbackPhase1SetStateV3_(machine,state){
    const next=String(state||'');
    if(!machine||!FEEDBACK_PHASE1_STATES_V3.has(next)){
      throw new Error('FEEDBACK_PHASE1_STATE_INVALID');
    }
    machine.state=next;
    machine.history.push(next);
    return machine;
  }

  function feedbackPhase1ReadEnvelopeV3_(storage){
    let value=null;
    try{
      value=JSON.parse(storage.getItem(FEEDBACK_PENDING_STORAGE_KEY_V3)||'null');
    }catch(_e){
      throw new Error('FEEDBACK_PHASE1_STORAGE_READ_FAILED');
    }
    if(!value)return null;
    if(Number(value.version)!==FEEDBACK_PHASE1_ENVELOPE_VERSION_V3){
      return null;
    }
    return feedbackPhase1CloneV3_(value);
  }

  function feedbackPhase1BuildEnvelopeV3_(input,ids,fingerprint,captured){
    const operation=String(input&&input.operation||'').trim().toUpperCase();
    const editorContextId=String(input&&input.editorContextId||'').trim();
    if(!operation)throw new Error('FEEDBACK_PHASE1_OPERATION_REQUIRED');
    if(!editorContextId)throw new Error('FEEDBACK_PHASE1_EDITOR_CONTEXT_REQUIRED');
    const payload=feedbackPhase1CloneV3_(
      input&&input.exactNormalizedPayload||{}
    );
    return {
      version:FEEDBACK_PHASE1_ENVELOPE_VERSION_V3,
      submissionId:feedbackPhase1AssertUuidV3_(
        ids&&ids.submissionId,'FEEDBACK_PHASE1_SUBMISSION_ID_INVALID'
      ),
      requestId:feedbackPhase1AssertUuidV3_(
        ids&&ids.requestId,'FEEDBACK_PHASE1_REQUEST_ID_INVALID'
      ),
      operation,
      targetId:input&&input.targetId==null?null:String(input.targetId),
      expectedRevision:input&&input.expectedRevision==null
        ?null:Number(input.expectedRevision),
      exactNormalizedPayload:payload,
      createdAt:Number(input&&input.createdAt||Date.now()),
      authFingerprint:String(fingerprint||''),
      authEpochAtCapture:Number(captured&&captured.authEpoch||0),
      authContextKind:String(captured&&captured.contextKind||'CREATOR'),
      editorContextId,
      draftRevisionAtSubmit:Number(input&&input.draftRevisionAtSubmit||0),
      selectedPostIdAtSubmit:String(input&&input.selectedPostIdAtSubmit||''),
      status:'IN_FLIGHT'
    };
  }

  function feedbackPhase1PersistFinalEnvelopeV3_(storage,envelope){
    const existing=feedbackPhase1ReadEnvelopeV3_(storage);
    if(existing&&['IN_FLIGHT','PENDING_UNKNOWN'].includes(String(existing.status||''))){
      const same=existing.submissionId===envelope.submissionId&&
        existing.requestId===envelope.requestId&&
        JSON.stringify(existing)===JSON.stringify(envelope);
      if(!same)throw new Error('FEEDBACK_PHASE1_UNRESOLVED_EXISTS');
    }
    try{
      storage.setItem(
        FEEDBACK_PENDING_STORAGE_KEY_V3,
        JSON.stringify(envelope)
      );
    }catch(_e){
      throw new Error('FEEDBACK_PHASE1_STORAGE_WRITE_FAILED');
    }
    const persisted=feedbackPhase1ReadEnvelopeV3_(storage);
    if(!persisted||JSON.stringify(persisted)!==JSON.stringify(envelope)){
      throw new Error('FEEDBACK_PHASE1_FINAL_ENVELOPE_NOT_DURABLE');
    }
    return persisted;
  }

  function feedbackPhase1ClearPendingIfMatchV3_(storage,submissionId,requestId){
    const current=feedbackPhase1ReadEnvelopeV3_(storage);
    if(!current)return false;
    if(
      String(current.submissionId)!==String(submissionId)||
      String(current.requestId)!==String(requestId)
    )return false;
    storage.removeItem(FEEDBACK_PENDING_STORAGE_KEY_V3);
    return true;
  }

  function feedbackPhase1MarkPendingUnknownV3_(storage,envelope){
    const current=feedbackPhase1ReadEnvelopeV3_(storage);
    if(!current||
      current.submissionId!==envelope.submissionId||
      current.requestId!==envelope.requestId){
      throw new Error('FEEDBACK_PHASE1_PENDING_MATCH_REQUIRED');
    }
    const next=Object.assign({},current,{status:'PENDING_UNKNOWN'});
    storage.setItem(FEEDBACK_PENDING_STORAGE_KEY_V3,JSON.stringify(next));
    return feedbackPhase1ReadEnvelopeV3_(storage);
  }

  function feedbackPhase1AuthContextMatchesV3_(captured,current){
    if(!captured||!current)return false;
    return Number(captured.authEpoch)===Number(current.authEpoch)&&
      String(captured.contextKind||'CREATOR')===
        String(current.contextKind||'CREATOR')&&
      String(captured.tokenSnapshot||'')===String(current.tokenSnapshot||'');
  }

  async function feedbackPhase1PreparePureV3_(input,adapters){
    const machine=feedbackPhase1MachineV3_('READY');
    const trace=[];
    let sendCount=0;
    let envelope=null;
    let captured=null;
    try{
      if(!input||input.explicitUserSubmission!==true){
        throw new Error('FEEDBACK_PHASE1_EXPLICIT_SUBMISSION_REQUIRED');
      }
      captured=adapters.captureAuthContext();
      trace.push('CAPTURE_CONTEXT');
      feedbackPhase1SetStateV3_(machine,'FINGERPRINTING');
      const fingerprint=await adapters.computeFingerprint(captured);
      trace.push('COMPUTE_FINGERPRINT');
      if(!fingerprint)throw new Error('FEEDBACK_AUTH_CONTEXT_UNCERTAIN');
      if(!feedbackPhase1AuthContextMatchesV3_(
        captured,adapters.readAuthContext()
      )){
        feedbackPhase1SetStateV3_(machine,'ABORTED_AUTH_CONTEXT');
        return {machine,trace,sendCount,envelope:null};
      }
      trace.push('RECHECK_AUTH');
      feedbackPhase1SetStateV3_(machine,'PERSISTING');
      const ids={
        submissionId:adapters.newUuid(),
        requestId:adapters.newUuid()
      };
      envelope=feedbackPhase1BuildEnvelopeV3_(
        input,ids,fingerprint,captured
      );
      trace.push('BUILD_FINAL_ENVELOPE');
      envelope=feedbackPhase1PersistFinalEnvelopeV3_(
        adapters.storage,envelope
      );
      machine.activeEnvelope=feedbackPhase1CloneV3_(envelope);
      trace.push('PERSIST_FINAL_ENVELOPE');

      if(typeof adapters.afterPersistAwait==='function'){
        await adapters.afterPersistAwait();
        if(!feedbackPhase1AuthContextMatchesV3_(
          captured,adapters.readAuthContext()
        )){
          feedbackPhase1ClearPendingIfMatchV3_(
            adapters.storage,envelope.submissionId,envelope.requestId
          );
          feedbackPhase1SetStateV3_(machine,'ABORTED_AUTH_CONTEXT');
          return {machine,trace,sendCount,envelope};
        }
        trace.push('RECHECK_AUTH_AFTER_AWAIT');
      }

      feedbackPhase1SetStateV3_(machine,'IN_FLIGHT');
      trace.push('TRANSMIT');
      sendCount+=1;
      const receipt=await adapters.transmit(
        feedbackPhase1CloneV3_(envelope),captured
      );
      return {machine,trace,sendCount,envelope,receipt};
    }catch(err){
      if(err&&err.unknownResult===true&&envelope){
        machine.activeEnvelope=feedbackPhase1MarkPendingUnknownV3_(
          adapters.storage,envelope
        );
        feedbackPhase1SetStateV3_(machine,'PENDING_UNKNOWN');
      }else if(machine.state!=='ABORTED_AUTH_CONTEXT'){
        feedbackPhase1SetStateV3_(machine,'FAILED_DETERMINISTIC');
      }
      return {
        machine,trace,sendCount,envelope,
        errorCode:String(err&&err.message||err)
      };
    }
  }

  function feedbackPhase1ReplayPlanV3_(storage,currentAuth){
    const envelope=feedbackPhase1ReadEnvelopeV3_(storage);
    if(!envelope||String(envelope.status)!=='PENDING_UNKNOWN'){
      return {state:'FAILED_DETERMINISTIC',replayable:false,envelope:null};
    }
    if(
      envelope.authContextKind==='OWNER'&&
      (!currentAuth||currentAuth.ownerContextAvailable!==true)
    ){
      return {
        state:'NON_REPLAYABLE_AUTH_CONTEXT',
        replayable:false,envelope
      };
    }
    if(
      !currentAuth||
      String(currentAuth.authFingerprint||'')!==
        String(envelope.authFingerprint||'')
    ){
      return {
        state:'NON_REPLAYABLE_AUTH_CONTEXT',
        replayable:false,envelope
      };
    }
    return {
      state:'PENDING_UNKNOWN',
      replayable:true,
      envelope:feedbackPhase1CloneV3_(envelope)
    };
  }

  function feedbackPhase1ApplyOutcomeV3_(machine,outcome,detail){
    const event=String(outcome||'');
    const terminalSuccess=['SUCCESS_RECEIPT','READ_REFRESH_FAILED']
      .includes(machine.state);
    if(terminalSuccess&&[
      'FAILED_DETERMINISTIC','REVISION_CONFLICT',
      'RETRY_AUTH_REJECTED','RETRY_IDEMPOTENCY_MISMATCH'
    ].includes(event)){
      return machine;
    }
    if(
      machine.state==='PENDING_UNKNOWN'&&
      ['RETRY_AUTH_REJECTED','RETRY_IDEMPOTENCY_MISMATCH'].includes(event)
    ){
      machine.retryOutcomes.push({
        outcome:event,
        code:String(detail&&detail.code||''),
        recordedAt:Number(detail&&detail.recordedAt||0)
      });
      return machine;
    }
    if(event==='PENDING_UNKNOWN'){
      return feedbackPhase1SetStateV3_(machine,'PENDING_UNKNOWN');
    }
    if(event==='SUCCESS_RECEIPT'){
      machine.preserveDraft=false;
      return feedbackPhase1SetStateV3_(machine,'SUCCESS_RECEIPT');
    }
    if(event==='READ_REFRESH_FAILED'){
      return feedbackPhase1SetStateV3_(machine,'READ_REFRESH_FAILED');
    }
    if(event==='REVISION_CONFLICT'){
      machine.preserveDraft=true;
      return feedbackPhase1SetStateV3_(machine,'REVISION_CONFLICT');
    }
    if(event==='FAILED_DETERMINISTIC'){
      return feedbackPhase1SetStateV3_(machine,'FAILED_DETERMINISTIC');
    }
    throw new Error('FEEDBACK_PHASE1_OUTCOME_INVALID');
  }

  function feedbackPhase1ApplyReceiptV3_(machine,receipt,storage,uiState){
    const envelope=machine&&machine.activeEnvelope;
    const matched=!!envelope&&!!receipt&&
      String(receipt.submissionId||'')===String(envelope.submissionId||'')&&
      String(receipt.requestId||'')===String(envelope.requestId||'');
    const result={
      applied:false,
      pendingCleared:false,
      draftCleared:false,
      selectedPostId:String(uiState&&uiState.selectedPostId||''),
      state:machine&&machine.state
    };
    if(!matched)return result;
    result.applied=true;
    if(receipt.ok===true){
      feedbackPhase1ApplyOutcomeV3_(machine,'SUCCESS_RECEIPT',receipt);
      result.pendingCleared=feedbackPhase1ClearPendingIfMatchV3_(
        storage,envelope.submissionId,envelope.requestId
      );
      result.draftCleared=
        String(uiState&&uiState.editorContextId||'')===
          String(envelope.editorContextId||'')&&
        Number(uiState&&uiState.draftRevision)===
          Number(envelope.draftRevisionAtSubmit);
    }
    result.state=machine.state;
    return result;
  }

  function showFeedbackFutureStateV3_(state){
    const notice=$('feedbackMutationStateNotice');
    if(!notice)return;
    const pendingActions=$('feedbackPendingActions');
    const conflictActions=$('feedbackConflictActions');
    if(pendingActions)pendingActions.hidden=true;
    if(conflictActions)conflictActions.hidden=true;
    notice.className='feedback-mutation-state-notice';
    if(state==='REVISION_CONFLICT'){
      const conflicted=Object.assign({},feedbackEditorStateV3);
      saveActiveFeedbackDraftV3_();
      notice.textContent=FEEDBACK_CONFLICT_NOTICE_V3;
      notice.classList.add('is-conflict');
      notice.hidden=false;
      setFeedbackEditorModeV3_('REVISION_CONFLICT',{
        targetId:conflicted.targetId,
        expectedRevision:conflicted.expectedRevision,
        waitingFor:'',
        conflictAction:conflicted.mode
      });
      if(conflictActions)conflictActions.hidden=!FEEDBACK_WRITE_UI_ENABLED;
      if(selectedPostId)loadThreadFb1_(selectedPostId,false,true);
      return;
    }
    if(state==='COMMITTED_READ_REFRESH_FAILED'){
      notice.textContent='저장은 완료됐지만 새로고침하지 못했습니다.';
      notice.classList.add('is-success-refresh-failed');
      notice.hidden=false;
      return;
    }
    if(state==='PENDING_UNKNOWN'){
      notice.textContent='등록 결과를 확인하지 못했습니다. 같은 요청 정보가 이 탭에 보존되어 있습니다.';
      notice.hidden=false;
      setFeedbackEditorModeV3_('PENDING_UNKNOWN');
      if(pendingActions)pendingActions.hidden=!FEEDBACK_WRITE_UI_ENABLED;
    }
  }

  function renderFeedbackCapabilitiesV3_(){
    const uiEnabled=FEEDBACK_WRITE_UI_ENABLED;
    const writePost=$('feedbackWritePostBtn');
    const writeComment=$('feedbackWriteCommentBtn');
    const ownerActions=$('feedbackPostOwnerActions');
    if(writePost)writePost.hidden=!uiEnabled;
    if(writeComment)writeComment.hidden=!uiEnabled||!selectedPostId;
    if(ownerActions){
      const cap=feedbackCapabilitiesV3.post||{};
      ownerActions.hidden=!uiEnabled||!(cap.canEdit||cap.canDelete);
      const edit=$('feedbackEditPostBtn');
      const del=$('feedbackDeletePostBtn');
      if(edit)edit.hidden=!uiEnabled||cap.canEdit!==true;
      if(del)del.hidden=!uiEnabled||cap.canDelete!==true;
    }
    document.querySelectorAll('[data-feedback-comment-actions]').forEach(actions=>{
      const id=String(actions.dataset.feedbackCommentActions||'');
      const cap=feedbackCapabilitiesV3.comments[id]||{};
      actions.hidden=!uiEnabled||!(cap.canEdit||cap.canDelete);
      const edit=actions.querySelector('[data-feedback-comment-edit]');
      const del=actions.querySelector('[data-feedback-comment-delete]');
      if(edit)edit.hidden=!uiEnabled||cap.canEdit!==true;
      if(del)del.hidden=!uiEnabled||cap.canDelete!==true;
    });
  }

  function requestFeedbackCapabilitiesV3_(postId,comments,threadSeq,reset){
    if(reset)clearFeedbackCapabilityStateV3_();
    if(!FEEDBACK_WRITE_UI_ENABLED){
      feedbackCapabilityPendingV3=false;
      updateFeedbackCommentLoadMoreV3_();
      return;
    }
    const token=String(creatorSessionTokenV3_()||'').trim();
    if(!token){
      feedbackCapabilityPendingV3=false;
      updateFeedbackCommentLoadMoreV3_();
      return;
    }
    const ids=(comments||[])
      .filter(item=>String(item&&item.status||'ACTIVE').toUpperCase()==='ACTIVE')
      .map(item=>String(item&&item.commentId||''))
      .filter(Boolean)
      .slice(0,50);
    const seq=++capabilityRequestSeq;
    capabilityWaitingSeq=seq;
    feedbackCapabilityPendingV3=true;
    feedbackEditorStateV3.waitingFor='CAPABILITY';
    updateFeedbackCommentLoadMoreV3_();
    const context=feedbackRequestContextV3_(seq,'CAPABILITY');
    context.selectedPostId=String(postId||'');
    const status=$('feedbackCapabilityStatus');
    if(status){status.textContent='수정 권한을 확인하는 중...';status.hidden=false}

    feedbackServerCallV3_('CAPABILITIES',{postId:String(postId||''),commentIds:ids})
      .then(result=>{
        if(!canApplyFeedbackResponseV3_(context,'CAPABILITY'))return;
        if(Number(threadSeq)!==Number(threadWaitingSeq))return;
        feedbackEditorStateV3.waitingFor='';
        feedbackCapabilityPendingV3=false;
        feedbackCapabilitiesV3={
          post:result&&result.post||feedbackCapabilitiesV3.post||null,
          comments:Object.assign(
            {},
            reset?{}:feedbackCapabilitiesV3.comments,
            result&&result.comments&&typeof result.comments==='object'
              ?result.comments:{}
          )
        };
        if(status)status.hidden=true;
        renderFeedbackCapabilitiesV3_();
        updateFeedbackCommentLoadMoreV3_();
      })
      .catch(()=>{
        if(!canApplyFeedbackResponseV3_(context,'CAPABILITY'))return;
        if(Number(threadSeq)!==Number(threadWaitingSeq))return;
        feedbackEditorStateV3.waitingFor='';
        feedbackCapabilityPendingV3=false;
        if(reset)feedbackCapabilitiesV3={post:null,comments:{}};
        if(status){
          status.textContent='수정 권한을 확인하지 못했습니다. 글을 새로고침해 주세요.';
          status.hidden=false;
        }
        renderFeedbackCapabilitiesV3_();
        updateFeedbackCommentLoadMoreV3_();
      });
  }

  function feedbackAuthContinuationPlanV3_(intent){
    const action=String(intent&&intent.action||'').toUpperCase();
    const targetId=String(intent&&intent.targetId||'');
    const valid=['CREATE_POST','UPDATE_POST','CREATE_COMMENT','UPDATE_COMMENT'].includes(action);
    return {
      valid,
      action,
      targetId,
      restoreEditor:valid,
      restoreDraft:valid,
      submit:false
    };
  }

  function restoreFeedbackAuthContinuationV3_(intent){
    const plan=feedbackAuthContinuationPlanV3_(intent);
    if(!FEEDBACK_WRITE_UI_ENABLED||!plan.valid){
      return {restored:false,submitted:false};
    }
    const restored=openFeedbackEditorV3_(plan.action,plan.targetId,{});
    return {restored,submitted:plan.submit};
  }

  function formatFeedbackDateFb1_(value){
    if(!value)return '';
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '';
    try{
      return d.toLocaleString('ko-KR',{
        year:'numeric',month:'2-digit',day:'2-digit',
        hour:'2-digit',minute:'2-digit'
      });
    }catch(_e){
      return d.toLocaleString('ko-KR');
    }
  }

  function clearChildrenFb1_(el){
    if(!el)return;
    while(el.firstChild)el.removeChild(el.firstChild);
  }

  function feedbackErrorTextFb1_(err,fallback){
    const raw=String(err&&err.message||err||'').trim();
    if(raw.includes('FEEDBACK_NOT_CONFIGURED'))
      return '피드백 게시판 저장소가 아직 준비되지 않았습니다.';
    if(raw.includes('FEEDBACK_NOT_FOUND'))
      return '게시글을 찾을 수 없습니다.';
    if(raw.includes('FEEDBACK_SCHEMA'))
      return '피드백 게시판 저장 구조를 확인해야 합니다.';
    return raw||fallback||'피드백을 불러오지 못했습니다.';
  }

  /* =========================================================
     FB-2 READ SPIKE — Supabase direct anonymous READ
     - Google Sheet fallback remains disabled by its explicit client gate.
     - Publishable key is intentionally browser-safe; RLS + column grants
       enforce the public read boundary.
     - Server service credentials are never present in client code.
     ========================================================= */
  function encodeFeedbackCursorV2_(obj){
    if(!obj||typeof obj!=='object')return '';
    try{
      const json=JSON.stringify(obj);
      const bytes=new TextEncoder().encode(json);
      let binary='';
      bytes.forEach(b=>binary+=String.fromCharCode(b));
      return btoa(binary);
    }catch(_e){
      return '';
    }
  }

  function decodeFeedbackCursorV2_(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    try{
      const binary=atob(raw);
      const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
      const obj=JSON.parse(new TextDecoder().decode(bytes));
      return obj&&typeof obj==='object'?obj:null;
    }catch(_e){
      return null;
    }
  }

  async function supabaseFeedbackRpcV2_(fn,payload){
    return transport.rpc(fn,payload);
  }

  async function rpcBoardPageV16_(page,pageSize){
    const data=await supabaseFeedbackRpcV2_(
      'feedback_list_posts_page_v3',
      {
        p_page:Math.max(1,Math.floor(Number(page)||1)),
        p_page_size:Math.max(
          1,
          Math.min(20,Math.floor(Number(pageSize)||BOARD_PAGE_SIZE_V16))
        )
      }
    );

    if(data&&data.ok===false){
      throw new Error(String(data.error||'FEEDBACK_BOARD_PAGE_FAILED'));
    }

    return {
      ok:true,
      notices:Array.isArray(data&&data.notices)?data.notices:[],
      items:Array.isArray(data&&data.items)?data.items:[],
      page:Math.max(1,Number(data&&data.page)||1),
      pageSize:Math.max(1,Number(data&&data.pageSize)||BOARD_PAGE_SIZE_V16),
      totalCount:Math.max(0,Number(data&&data.totalCount)||0),
      totalPages:Math.max(0,Number(data&&data.totalPages)||0),
      transport:'SUPABASE_V3_PAGE'
    };
  }

  async function rpcThreadFb1_(postId,commentCursor,commentLimit){
    const parsed=decodeFeedbackCursorV2_(commentCursor);
    const data=await supabaseFeedbackRpcV2_(
      'feedback_get_thread_v3',
      {
        p_post_id:String(postId||''),
        p_comment_limit:Math.max(1,Math.min(50,Number(commentLimit||50))),
        p_cursor_created_at:
          parsed&&parsed.createdAt
            ? String(parsed.createdAt)
            : null,
        p_cursor_comment_id:
          parsed&&parsed.commentId
            ? String(parsed.commentId)
            : null
      }
    );

    if(data&&data.ok===false){
      throw new Error(String(data.error||'FEEDBACK_NOT_FOUND'));
    }

    return {
      ok:true,
      post:data&&data.post||null,
      comments:Array.isArray(data&&data.comments)?data.comments:[],
      nextCommentCursor:encodeFeedbackCursorV2_(
        data&&data.nextCommentCursor
      ),
      transport:'SUPABASE_V2'
    };
  }

  function feedbackDeletedLabelV16_(item,comment){
    const by=String(item&&item.deletedBy||'').toUpperCase();
    if(by==='OWNER'){
      return comment
        ?'관리자에 의해서 삭제된 댓글입니다.'
        :'관리자에 의해서 삭제되었습니다.';
    }
    if(by==='AUTHOR'){
      return comment
        ?'작성자에 의해서 삭제된 댓글입니다.'
        :'작성자에 의해서 삭제되었습니다.';
    }
    return comment?'삭제된 댓글입니다.':'삭제되었습니다.';
  }

  function feedbackBoardVisibleItemsV16_(){
    return (boardPageV16===1?boardNoticesV16:[]).concat(boardItems||[]);
  }

  function renderFeedbackBoardPaginationV16_(){
    const nav=$('feedbackBoardPaginationV16');
    if(!nav)return;
    clearChildrenFb1_(nav);

    const total=Math.max(0,Number(boardTotalPagesV16)||0);
    const current=Math.max(1,Number(boardPageV16)||1);
    if(total<=1){
      nav.hidden=true;
      return;
    }

    nav.hidden=false;

    const makeBtn=(label,page,disabled,currentPage)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='feedback-board-page-btn-v16';
      btn.textContent=label;
      btn.dataset.feedbackBoardPage=String(page);
      btn.disabled=!!disabled;
      if(currentPage){
        btn.classList.add('is-current');
        btn.setAttribute('aria-current','page');
      }
      return btn;
    };

    nav.appendChild(
      makeBtn('‹ 이전',Math.max(1,current-1),current<=1,false)
    );

    const windowSize=5;
    let start=Math.max(1,current-Math.floor(windowSize/2));
    let end=Math.min(total,start+windowSize-1);
    start=Math.max(1,end-windowSize+1);

    for(let p=start;p<=end;p++){
      nav.appendChild(makeBtn(String(p),p,false,p===current));
    }

    nav.appendChild(
      makeBtn('다음 ›',Math.min(total,current+1),current>=total,false)
    );
  }

  function appendFeedbackBoardListItemV16_(list,item){
    const deleted=String(item&&item.status||'ACTIVE').toUpperCase()==='DELETED';

    if(deleted){
      const tomb=document.createElement('div');
      tomb.className='feedback-board-list-item is-deleted-v16';
      tomb.dataset.postId=String(item&&item.postId||'');

      const message=document.createElement('strong');
      message.className='feedback-deleted-message-v16';
      message.textContent=feedbackDeletedLabelV16_(item,false);

      tomb.appendChild(message);
      list.appendChild(tomb);
      return;
    }

    const btn=document.createElement('button');
    btn.type='button';
    btn.className='feedback-board-list-item';
    btn.classList.toggle('active',String(item.postId)===String(selectedPostId));
    btn.dataset.postId=String(item.postId||'');

    const titleRow=document.createElement('div');
    titleRow.className='feedback-board-list-title-row';

    if(item&&item.isNotice){
      const tag=document.createElement('span');
      tag.className='feedback-notice-tag';
      tag.textContent='공지';
      titleRow.appendChild(tag);
      btn.classList.add('is-notice');
    }

    const productTag=makeFeedbackProductTagV3_(item.product);
    if(productTag)titleRow.appendChild(productTag);

    const title=document.createElement('strong');
    title.textContent=String(item.title||'제목 없음');
    titleRow.appendChild(title);

    const meta=document.createElement('span');
    const author=String(item.authorDisplayName||'사용자');
    const date=formatFeedbackDateFb1_(item.createdAt);
    meta.textContent=author+(date?' · '+date:'');

    btn.appendChild(titleRow);
    btn.appendChild(meta);
    btn.addEventListener('click',()=>loadThreadFb1_(String(item.postId||''),false));
    list.appendChild(btn);
  }

  function appendFeedbackBoardSectionLabelV16_(list,text){
    const label=document.createElement('div');
    label.className='feedback-board-section-label-v16';
    label.textContent=String(text||'');
    list.appendChild(label);
  }

  function renderBoardListFb1_(){
    const list=$('feedbackBoardList');
    const empty=$('feedbackBoardListEmpty');
    if(!list)return;

    clearChildrenFb1_(list);

    const notices=boardPageV16===1?(boardNoticesV16||[]):[];
    const items=boardItems||[];

    if(!notices.length&&!items.length){
      list.hidden=true;
      if(empty)empty.hidden=false;
      renderFeedbackBoardPaginationV16_();
      return;
    }

    if(empty)empty.hidden=true;

    if(notices.length){
      appendFeedbackBoardSectionLabelV16_(list,'공지');
      notices.forEach(item=>appendFeedbackBoardListItemV16_(list,item));
    }

    if(items.length){
      if(notices.length)appendFeedbackBoardSectionLabelV16_(list,'게시글');
      items.forEach(item=>appendFeedbackBoardListItemV16_(list,item));
    }

    list.hidden=false;
    renderFeedbackBoardPaginationV16_();
  }

  async function loadBoardPageFb1_(page){
    const requestSeq=++boardListRequestSeq;
    const loading=$('feedbackBoardListLoading');
    const error=$('feedbackBoardListError');
    const nav=$('feedbackBoardPaginationV16');

    if(error)error.hidden=true;
    if(loading)loading.hidden=false;
    if(nav){
      nav.querySelectorAll('button').forEach(btn=>{btn.disabled=true});
    }

    try{
      const requested=Math.max(1,Math.floor(Number(page)||1));
      const data=await rpcBoardPageV16_(requested,BOARD_PAGE_SIZE_V16);
      if(requestSeq!==boardListRequestSeq)return false;

      boardItems=Array.isArray(data&&data.items)?data.items:[];
      boardNoticesV16=Array.isArray(data&&data.notices)?data.notices:[];
      boardPageV16=Math.max(1,Number(data&&data.page)||1);
      boardTotalPagesV16=Math.max(0,Number(data&&data.totalPages)||0);
      boardTotalCountV16=Math.max(0,Number(data&&data.totalCount)||0);
      boardLoaded=true;

      renderBoardListFb1_();
      return true;
    }catch(err){
      if(requestSeq!==boardListRequestSeq)return false;
      if(error){
        error.hidden=false;
        error.textContent=feedbackErrorTextFb1_(err,'게시글 목록을 불러오지 못했습니다.');
      }
      return false;
    }finally{
      if(requestSeq===boardListRequestSeq){
        if(loading)loading.hidden=true;
        renderFeedbackBoardPaginationV16_();
      }
    }
  }

  function renderCommentFb1_(item){
    const row=document.createElement('article');
    row.className='feedback-comment-item';

    const deleted=String(item&&item.status||'ACTIVE').toUpperCase()==='DELETED';
    if(deleted){
      row.classList.add('is-deleted-v16');
      const message=document.createElement('div');
      message.className='feedback-comment-deleted-message-v16';
      message.textContent=feedbackDeletedLabelV16_(item,true);
      row.appendChild(message);
      return row;
    }

    const headRow=document.createElement('div');
    headRow.className='feedback-comment-head';

    const head=document.createElement('div');
    head.className='feedback-comment-meta';
    const author=String(item&&item.authorDisplayName||'사용자');
    const date=formatFeedbackDateFb1_(item&&item.createdAt);
    head.textContent=author+(date?' · '+date:'');

    const commentId=String(item&&item.commentId||'');
    const actions=document.createElement('div');
    actions.className='feedback-comment-actions';
    actions.dataset.feedbackCommentActions=commentId;
    actions.hidden=true;

    const edit=document.createElement('button');
    edit.type='button';
    edit.textContent='수정';
    edit.dataset.feedbackCommentEdit=commentId;
    edit.addEventListener('click',()=>{
      const cap=feedbackCapabilitiesV3.comments[commentId]||{};
      if(cap.canEdit!==true)return;
      openFeedbackEditorV3_('UPDATE_COMMENT',commentId,{
        body:String(item&&item.body||''),
        expectedRevision:cap.revision
      });
    });

    const del=document.createElement('button');
    del.type='button';
    del.textContent='삭제';
    del.dataset.feedbackCommentDelete=commentId;
    del.addEventListener('click',()=>{
      const cap=feedbackCapabilitiesV3.comments[commentId]||{};
      if(!FEEDBACK_WRITE_UI_ENABLED||cap.canDelete!==true)return;
      submitFeedbackDeleteV3_(
        'DELETE_COMMENT',commentId,cap.revision
      ).catch(err=>feedbackMutationMessageV3_(
        feedbackMutationErrorCodeV3_(err)
      ));
    });
    actions.append(edit,del);

    const ownerModeration=document.createElement('div');
    ownerModeration.className='feedback-comment-owner-moderation';
    ownerModeration.dataset.feedbackOwnerCommentActions=commentId;
    ownerModeration.hidden=true;

    const ownerHide=document.createElement('button');
    ownerHide.type='button';
    ownerHide.textContent='숨김';
    ownerHide.dataset.feedbackOwnerCommentHide=commentId;
    ownerHide.addEventListener('click',()=>{
      const ctx=feedbackOwnerContextV3.comments[commentId]||{};
      if(!Number.isSafeInteger(Number(ctx.revision)))return;
      submitFeedbackOwnerModerationV3_(
        'MODERATE_COMMENT',
        commentId,
        Number(ctx.revision),
        'HIDE',
        String(selectedPostId||''),
        'ACTIVE'
      ).catch(err=>feedbackOwnerNoticeV3_(
        feedbackMutationErrorCodeV3_(err),
        ''
      ));
    });

    const ownerDelete=document.createElement('button');
    ownerDelete.type='button';
    ownerDelete.textContent='관리자 삭제';
    ownerDelete.dataset.feedbackOwnerCommentDelete=commentId;
    ownerDelete.addEventListener('click',()=>{
      const ctx=feedbackOwnerContextV3.comments[commentId]||{};
      if(!Number.isSafeInteger(Number(ctx.revision)))return;
      submitFeedbackOwnerModerationV3_(
        'MODERATE_COMMENT',
        commentId,
        Number(ctx.revision),
        'DELETE',
        String(selectedPostId||''),
        'ACTIVE'
      ).catch(err=>feedbackOwnerNoticeV3_(
        feedbackMutationErrorCodeV3_(err),
        ''
      ));
    });

    ownerModeration.append(ownerHide,ownerDelete);
    headRow.append(head,actions,ownerModeration);

    const body=document.createElement('div');
    body.className='feedback-comment-body';
    body.textContent=String(item&&item.body||'');

    row.appendChild(headRow);
    row.appendChild(body);
    return row;
  }

  function setSelectedBoardItemFb1_(postId){
    selectedPostId=String(postId||'');
    document.querySelectorAll('.feedback-board-list-item').forEach(el=>{
      el.classList.toggle('active',String(el.dataset.postId||'')===selectedPostId);
    });
  }

  async function loadThreadFb1_(postId,appendComments,preserveEditorState){
    const id=String(postId||'').trim();
    if(!id)return;

    const seq=++threadRequestSeq;
    const placeholder=$('feedbackThreadPlaceholder');
    const loading=$('feedbackThreadLoading');
    const error=$('feedbackThreadError');
    const content=$('feedbackThreadContent');
    const comments=$('feedbackCommentList');
    const commentEmpty=$('feedbackCommentEmpty');
    const more=$('feedbackCommentsMoreBtn');

    if(!appendComments){
      if(!preserveEditorState){
        saveActiveFeedbackDraftV3_();
        setFeedbackEditorModeV3_('READ_THREAD');
      }
      setSelectedBoardItemFb1_(id);
      clearFeedbackCapabilityStateV3_();
      selectedThreadSnapshotV3=null;
      commentNextCursor='';
      if(placeholder)placeholder.hidden=true;
      if(content)content.hidden=true;
      if(comments)clearChildrenFb1_(comments);
      if(commentEmpty)commentEmpty.hidden=true;
    }

    if(loading)loading.hidden=false;
    if(error)error.hidden=true;
    if(more)more.disabled=true;

    threadWaitingSeq=seq;
    feedbackEditorStateV3.waitingFor='THREAD';
    const requestContext=feedbackRequestContextV3_(seq,'THREAD');
    requestContext.selectedPostId=id;

    try{
      const data=await rpcThreadFb1_(id,appendComments?commentNextCursor:'',50);
      if(!canApplyFeedbackResponseV3_(requestContext,'THREAD'))return;

      const post=data&&data.post||{};
      const page=Array.isArray(data&&data.comments)?data.comments:[];

      selectedThreadSnapshotV3=appendComments&&selectedThreadSnapshotV3
        ?{
            post:selectedThreadSnapshotV3.post,
            comments:selectedThreadSnapshotV3.comments.concat(page)
          }
        :{post,comments:page.slice()};

      if(!appendComments){
        const title=$('feedbackThreadTitle');
        const meta=$('feedbackThreadMeta');
        const body=$('feedbackThreadBody');

        if(title){
          title.textContent='';
          if(post&&post.isNotice){
            const tag=document.createElement('span');
            tag.className='feedback-notice-tag feedback-notice-tag-detail';
            tag.textContent='공지';
            title.appendChild(tag);
            title.appendChild(document.createTextNode(' '));
          }
          title.appendChild(document.createTextNode(String(post.title||'제목 없음')));
        }
        const product=$('feedbackThreadProduct');
        if(product){
          product.textContent=feedbackProductBracketV3_(post.product);
          product.hidden=!product.textContent;
        }
        if(meta){
          const author=String(post.authorDisplayName||'사용자');
          const date=formatFeedbackDateFb1_(post.createdAt);
          meta.textContent=author+(date?' · '+date:'');
        }
        if(body)body.textContent=String(post.body||'');
      }

      page.forEach(item=>comments&&comments.appendChild(renderCommentFb1_(item)));

      commentNextCursor=String(data&&data.nextCommentCursor||'');
      if(commentEmpty)commentEmpty.hidden=!!(comments&&comments.children.length);
      if(content)content.hidden=false;
      if(more)more.hidden=!commentNextCursor;
      feedbackEditorStateV3.waitingFor='';
      requestFeedbackCapabilitiesV3_(id,page,seq,!appendComments);
      requestFeedbackOwnerContextV3_(id,page,seq,!appendComments);
      return true;
    }catch(err){
      if(!canApplyFeedbackResponseV3_(requestContext,'THREAD'))return false;
      feedbackEditorStateV3.waitingFor='';
      if(error){
        error.hidden=false;
        error.textContent=feedbackErrorTextFb1_(err,'게시글을 불러오지 못했습니다.');
      }
      if(!appendComments && content)content.hidden=true;
      if(String(err&&err.message||err).includes('FEEDBACK_NOT_FOUND')){
        boardItems=boardItems.filter(item=>String(item&&item.postId||'')!==id);
        selectedPostId='';
        selectedThreadSnapshotV3=null;
        commentNextCursor='';
        if(comments)clearChildrenFb1_(comments);
        setFeedbackEditorModeV3_('READ_THREAD');
        clearFeedbackCapabilityStateV3_();
        clearFeedbackOwnerContextV3_();
        renderBoardListFb1_();
      }
      return false;
    }finally{
      if(seq===threadWaitingSeq && loading)loading.hidden=true;
      updateFeedbackCommentLoadMoreV3_();
    }
  }

  function feedbackBoardOpenPlanV3_(loaded,items,wantedPostId){
    const wanted=String(wantedPostId||'').trim();
    const present=!!wanted&&(items||[]).some(
      item=>String(item&&item.postId||'')===wanted
    );
    return {
      wanted,
      refreshFirstPage:loaded!==true||!!wanted&&!present,
      directThreadLoad:!!wanted,
      presentBeforeRefresh:present
    };
  }

  async function openBoardFb1_(postId){
    const modal=$('feedbackBoardModal');
    if(!modal)return;

    /* HUB: inline board; never locks page scroll. */
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    syncFeedbackAuthEpochV3_('BOARD_OPEN');
    renderFeedbackCapabilitiesV3_();
    assessStoredFeedbackPendingV3_().catch(()=>{});

    const plan=feedbackBoardOpenPlanV3_(
      boardLoaded,
      feedbackBoardVisibleItemsV16_(),
      postId
    );
    const wanted=plan.wanted;

    if(plan.refreshFirstPage){
      await refreshFeedbackBoardFirstPageV3_();
    }

    if(wanted){
      if(!feedbackBoardVisibleItemsV16_().some(
        x=>String(x&&x.postId||'')===wanted
      )){
        /* A real item may fall outside the first board page. The single
           authoritative refresh above fixes stale first-page caches while
           direct thread loading still supports older pages. */
      }
      await loadThreadFb1_(wanted,false);
    }else if(selectedPostId){
      await loadThreadFb1_(selectedPostId,false);
    }
  }

  function bindFb1_(){
    $('feedbackSessionConnectBtn')?.addEventListener('click',()=>{
      feedbackConnectSessionV3_(null);
    });
    $('feedbackSessionDisconnectBtn')?.addEventListener('click',()=>{
      transport.bridge()?.disconnect();
    });
    $('feedbackEditorProductSelect')?.addEventListener('change',()=>{
      feedbackDraftRevisionV3+=1;
      feedbackEditorStateV3.draftRevision=feedbackDraftRevisionV3;
      updateFeedbackEditorCountsV3_();
      saveActiveFeedbackDraftV3_();
    });
    $('feedbackBoardRefreshBtn')?.addEventListener('click',async()=>{
      threadWaitingSeq=++threadRequestSeq;
      capabilityWaitingSeq=++capabilityRequestSeq;
      const refreshPage=Math.max(1,Number(boardPageV16)||1);
      boardLoaded=false;
      boardItems=[];
      boardNoticesV16=[];
      boardTotalPagesV16=0;
      boardTotalCountV16=0;
      selectedPostId='';
      selectedThreadSnapshotV3=null;
      commentNextCursor='';
      setFeedbackEditorModeV3_('READ_THREAD');
      clearFeedbackCapabilityStateV3_();
      const placeholder=$('feedbackThreadPlaceholder');
      const content=$('feedbackThreadContent');
      if(placeholder)placeholder.hidden=false;
      if(content)content.hidden=true;
      await loadBoardPageFb1_(refreshPage);
      loadFeedbackProductsV3_(true);
      clearFeedbackOwnerContextV3_();
      if(feedbackOwnerRecoveryOpenV3_()){
        loadFeedbackOwnerRecoveryV3_();
      }else{
        renderFeedbackOwnerControlsV3_();
      }
    });
    $('feedbackBoardPaginationV16')?.addEventListener('click',event=>{
      const btn=event&&event.target&&typeof event.target.closest==='function'
        ?event.target.closest('[data-feedback-board-page]')
        :null;
      if(!btn||btn.disabled)return;
      const page=Math.max(1,Math.floor(Number(btn.dataset.feedbackBoardPage)||1));
      if(page===boardPageV16)return;
      loadBoardPageFb1_(page);
    });
    $('feedbackCommentsMoreBtn')?.addEventListener('click',()=>{
      const eligible=feedbackCommentLoadMoreEligibleV3_({
        nextCursor:commentNextCursor,
        capabilityPending:feedbackCapabilityPendingV3,
        threadPending:feedbackEditorStateV3.waitingFor==='THREAD'
      });
      if(selectedPostId&&eligible)loadThreadFb1_(selectedPostId,true);
    });

    $('feedbackOwnerRecoveryOpenV3')?.addEventListener(
      'click',
      openFeedbackOwnerRecoveryV3_
    );
    $('feedbackOwnerRecoveryRefreshV3')?.addEventListener(
      'click',
      ()=>loadFeedbackOwnerRecoveryV3_()
    );
    $('feedbackOwnerRecoveryCloseV3')?.addEventListener(
      'click',
      closeFeedbackOwnerRecoveryV3_
    );

    $('feedbackOwnerPinPostV3')?.addEventListener('click',()=>{
      const ctx=feedbackOwnerContextV3.post||{};
      submitFeedbackOwnerModerationV3_(
        'MODERATE_POST',
        String(selectedPostId||''),
        Number(ctx.revision),
        'PIN',
        String(selectedPostId||''),
        'ACTIVE'
      ).catch(err=>feedbackOwnerNoticeV3_(
        feedbackMutationErrorCodeV3_(err),
        ''
      ));
    });

    $('feedbackOwnerUnpinPostV3')?.addEventListener('click',()=>{
      const ctx=feedbackOwnerContextV3.post||{};
      submitFeedbackOwnerModerationV3_(
        'MODERATE_POST',
        String(selectedPostId||''),
        Number(ctx.revision),
        'UNPIN',
        String(selectedPostId||''),
        'ACTIVE'
      ).catch(err=>feedbackOwnerNoticeV3_(
        feedbackMutationErrorCodeV3_(err),
        ''
      ));
    });

    $('feedbackOwnerHidePostV3')?.addEventListener('click',()=>{
      const ctx=feedbackOwnerContextV3.post||{};
      submitFeedbackOwnerModerationV3_(
        'MODERATE_POST',
        String(selectedPostId||''),
        Number(ctx.revision),
        'HIDE',
        String(selectedPostId||''),
        'ACTIVE'
      ).catch(err=>feedbackOwnerNoticeV3_(
        feedbackMutationErrorCodeV3_(err),
        ''
      ));
    });

    $('feedbackOwnerDeletePostV3')?.addEventListener('click',()=>{
      const ctx=feedbackOwnerContextV3.post||{};
      submitFeedbackOwnerModerationV3_(
        'MODERATE_POST',
        String(selectedPostId||''),
        Number(ctx.revision),
        'DELETE',
        String(selectedPostId||''),
        'ACTIVE'
      ).catch(err=>feedbackOwnerNoticeV3_(
        feedbackMutationErrorCodeV3_(err),
        ''
      ));
    });

    $('feedbackWritePostBtn')?.addEventListener('click',()=>{
      openFeedbackEditorV3_('CREATE_POST','',{});
    });
    $('feedbackWriteCommentBtn')?.addEventListener('click',()=>{
      if(selectedPostId)openFeedbackEditorV3_('CREATE_COMMENT',selectedPostId,{});
    });
    $('feedbackEditPostBtn')?.addEventListener('click',()=>{
      const cap=feedbackCapabilitiesV3.post||{};
      const post=selectedThreadSnapshotV3&&selectedThreadSnapshotV3.post||{};
      if(cap.canEdit!==true)return;
      openFeedbackEditorV3_('UPDATE_POST',selectedPostId,{
        title:String(post.title||''),
        body:String(post.body||''),
        product:String(post.product||''),
        expectedRevision:cap.revision
      });
    });
    $('feedbackDeletePostBtn')?.addEventListener('click',()=>{
      const cap=feedbackCapabilitiesV3.post||{};
      if(!FEEDBACK_WRITE_UI_ENABLED||cap.canDelete!==true)return;
      submitFeedbackDeleteV3_(
        'DELETE_POST',selectedPostId,cap.revision
      ).catch(err=>feedbackMutationMessageV3_(
        feedbackMutationErrorCodeV3_(err)
      ));
    });
    $('feedbackEditorTitleInput')?.addEventListener('input',()=>{
      feedbackDraftRevisionV3+=1;
      feedbackEditorStateV3.draftRevision=feedbackDraftRevisionV3;
      updateFeedbackEditorCountsV3_();
      saveActiveFeedbackDraftV3_();
    });
    $('feedbackEditorBodyInput')?.addEventListener('input',()=>{
      feedbackDraftRevisionV3+=1;
      feedbackEditorStateV3.draftRevision=feedbackDraftRevisionV3;
      updateFeedbackEditorCountsV3_();
      saveActiveFeedbackDraftV3_();
    });
    $('feedbackEditorCancelBtn')?.addEventListener('click',cancelFeedbackEditorV3_);
    $('feedbackEditorSubmitBtn')?.addEventListener('click',()=>{
      submitFeedbackShellV3_().catch(err=>{
        feedbackMutationMessageV3_(feedbackMutationErrorCodeV3_(err));
      });
    });
    $('feedbackPendingRetryBtn')?.addEventListener('click',async()=>{
      const notice=$('feedbackMutationStateNotice');
      try{
        const ownerPending=feedbackOwnerPendingEnvelopeV3_();
        const creatorPending=feedbackPhase1ReadEnvelopeV3_(sessionStorage);

        if(ownerPending&&creatorPending){
          throw new Error('FEEDBACK_MULTIPLE_PENDING_CONTEXTS');
        }

        if(ownerPending){
          if(!FEEDBACK_OWNER_MODERATION_WIRING_ENABLED){
            throw new Error('FEEDBACK_OWNER_MODERATION_WIRING_DISABLED');
          }
          await retryFeedbackOwnerPendingV3_();
        }else{
          if(!FEEDBACK_MUTATION_WIRING_ENABLED){
            throw new Error('FEEDBACK_MUTATION_WIRING_DISABLED');
          }
          await retryFeedbackPendingV3_();
        }

        if(notice){
          notice.textContent='같은 requestId로 결과를 확인했습니다.';
          notice.hidden=false;
        }
      }catch(err){
        if(notice){
          const ownerPending=feedbackOwnerPendingEnvelopeV3_();
          const liveGate=ownerPending
            ?FEEDBACK_OWNER_MODERATION_WIRING_ENABLED
            :FEEDBACK_MUTATION_WIRING_ENABLED;
          notice.textContent=liveGate
            ?'이전 요청은 보존되어 있습니다: '+feedbackMutationErrorCodeV3_(err)
            :'같은 requestId와 payload가 보존되어 있습니다. 현재 TEST gate에서는 전송하지 않습니다.';
          notice.hidden=false;
        }
      }
    });
    $('feedbackPendingLaterBtn')?.addEventListener('click',()=>{
      const notice=$('feedbackMutationStateNotice');
      const actions=$('feedbackPendingActions');
      if(notice)notice.hidden=true;
      if(actions)actions.hidden=true;
      /* Deliberately keep sessionStorage pending data. */
    });
    $('feedbackConflictEditAgainBtn')?.addEventListener('click',()=>{
      const action=String(feedbackEditorStateV3.conflictAction||'');
      const target=String(feedbackEditorStateV3.targetId||'');
      const post=selectedThreadSnapshotV3&&selectedThreadSnapshotV3.post||{};
      const comment=(selectedThreadSnapshotV3&&selectedThreadSnapshotV3.comments||[])
        .find(item=>String(item&&item.commentId||'')===target)||{};
      const cap=action==='UPDATE_POST'
        ?feedbackCapabilitiesV3.post||{}
        :feedbackCapabilitiesV3.comments[target]||{};
      const opened=openFeedbackEditorV3_(action,target,{
        title:String(post.title||''),
        product:action==='UPDATE_POST'?String(post.product||''):'',
        body:action==='UPDATE_POST'?String(post.body||''):String(comment.body||''),
        expectedRevision:cap.revision
      });
      if(opened){
        const notice=$('feedbackMutationStateNotice');
        const actions=$('feedbackConflictActions');
        if(notice)notice.hidden=true;
        if(actions)actions.hidden=true;
      }
    });

    renderFeedbackEditorV3_();
    renderFeedbackCapabilitiesV3_();
    syncFeedbackOwnerAuthV3_('OWNER_BIND');
    renderFeedbackOwnerControlsV3_();
    bindAppDialogV3_();
    renderFeedbackSessionV3_();
    loadFeedbackProductsV3_(false);
    openBoardFb1_('');
  }

  /* =========================================================
     HUB — Project B @371 app dialog (Script.html line 2807), so OWNER
     confirmations do not depend on a native window.confirm.
     ========================================================= */
  let appDialogResolver=null;
  function closeAppDialog(result){
    const modal=document.getElementById('appDialog');
    if(!modal)return;
    modal.hidden=true;modal.setAttribute('aria-hidden','true');
    const resolve=appDialogResolver;appDialogResolver=null;
    if(resolve)resolve(!!result);
  }
  function showAppDialog(options={}){
    const modal=document.getElementById('appDialog');
    const card=modal.querySelector('.app-dialog-card');
    const title=document.getElementById('appDialogTitle');
    const message=document.getElementById('appDialogMessage');
    const cancel=document.getElementById('appDialogCancel');
    const confirm=document.getElementById('appDialogConfirm');
    card.classList.remove('danger','warning','info','smq-wide');
    card.classList.add(options.tone||'warning');
    if(options.wide)card.classList.add('smq-wide');
    title.textContent=options.title||'확인';
    message.textContent=options.message||'';
    confirm.textContent=options.confirmText||'확인';
    cancel.textContent=options.cancelText||'취소';
    cancel.hidden=options.cancelable===false;
    modal.hidden=false;modal.setAttribute('aria-hidden','false');
    requestAnimationFrame(()=>confirm.focus());
    return new Promise(resolve=>{appDialogResolver=resolve});
  }
  function showAppNotice(message,title='알림',tone='info'){
    return showAppDialog({title,message:String(message||''),tone,cancelable:false,confirmText:'확인'});
  }
  function bindAppDialogV3_(){
    document.getElementById('appDialogCancel')?.addEventListener('click',()=>closeAppDialog(false));
    document.getElementById('appDialogConfirm')?.addEventListener('click',()=>closeAppDialog(true));
    document.getElementById('appDialog')?.addEventListener('click',e=>{if(e.target.id==='appDialog')closeAppDialog(false)});
    document.addEventListener('keydown',e=>{
      const modal=document.getElementById('appDialog');
      if(modal&&!modal.hidden&&e.key==='Escape'){e.preventDefault();closeAppDialog(false)}
    });
  }

  /* =========================================================
     HUB — Project B session connection + 문의 대상 (product registry)
     ========================================================= */
  let feedbackProductsV3=null;
  let feedbackProductsErrorV3=false;
  let feedbackAuthContinuationV3=null;

  function feedbackProductLabelV3_(key){
    const value=String(key||'');
    if(!value)return '';
    const entry=feedbackProductsV3&&feedbackProductsV3.get(value);
    return entry?entry.displayName:value;
  }

  function feedbackProductBracketV3_(key){
    const label=feedbackProductLabelV3_(key);
    return label?'['+label+']':'';
  }

  function makeFeedbackProductTagV3_(key){
    const text=feedbackProductBracketV3_(key);
    if(!text)return null;
    const tag=document.createElement('span');
    tag.className='feedback-product-tag';
    tag.dataset.product=String(key||'');
    tag.textContent=text;
    return tag;
  }

  function renderFeedbackProductOptionsV3_(currentKey){
    const select=$('feedbackEditorProductSelect');
    if(!select)return;
    const current=String(currentKey==null?select.value:(currentKey||''));
    clearChildrenFb1_(select);

    const placeholder=document.createElement('option');
    placeholder.value='';
    placeholder.textContent=feedbackProductsV3
      ?'문의 대상을 선택하세요'
      :(feedbackProductsErrorV3
        ?'문의 대상을 불러오지 못했습니다'
        :'문의 대상을 불러오는 중...');
    select.appendChild(placeholder);

    const options=feedbackProductsV3?feedbackProductsV3.active.slice():[];
    /* An existing post keeps its product even after it becomes inactive. */
    if(current&&!options.some(item=>item.key===current)){
      const historic=feedbackProductsV3&&feedbackProductsV3.get(current);
      options.push({
        key:current,
        displayName:historic?historic.displayName:current
      });
    }
    options.forEach(item=>{
      const option=document.createElement('option');
      option.value=item.key;
      option.textContent=item.displayName;
      select.appendChild(option);
    });
    select.value=current;
    updateFeedbackEditorCountsV3_();
  }

  async function loadFeedbackProductsV3_(force){
    try{
      feedbackProductsV3=await transport.loadProducts(force);
      feedbackProductsErrorV3=false;
    }catch(_e){
      feedbackProductsErrorV3=true;
    }
    renderFeedbackProductOptionsV3_(null);
    if(boardLoaded)renderBoardListFb1_();
    const product=$('feedbackThreadProduct');
    const post=selectedThreadSnapshotV3&&selectedThreadSnapshotV3.post;
    if(product&&post){
      product.textContent=feedbackProductBracketV3_(post.product);
      product.hidden=!product.textContent;
    }
    return !feedbackProductsErrorV3;
  }

  function renderFeedbackSessionV3_(){
    const snap=feedbackBridgeSnapshotV3_();
    const state=snap?snap.state:'IDLE';
    const connected=state==='CONNECTED';
    const waiting=['WAIT_READY','BOUND','REBIND_EXPECTED'].includes(state);
    const status=$('feedbackSessionStatus');
    const connect=$('feedbackSessionConnectBtn');
    const disconnect=$('feedbackSessionDisconnectBtn');
    if(status){
      status.textContent=
        connected&&snap.creator&&snap.owner?'Creator · OWNER 연결됨':
        connected&&snap.creator?'Creator 연결됨':
        connected&&snap.owner?'OWNER 연결됨 · 글쓰기는 Creator 인증 필요':
        waiting?'Google 확인 창에서 연결을 기다리는 중...':
        state==='AUTH_REQUIRED'?'Google 확인 창에서 Creator 인증을 완료해 주세요.':
        state==='FAILED'&&snap.safeCode==='POPUP_BLOCKED'
          ?'팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 연결해 주세요.':
        state==='FAILED'?'연결할 수 없습니다.':
        state==='STALE'?'연결이 만료되었습니다. 다시 연결해 주세요.':
        '글·댓글 작성은 Google Creator 연결 후 가능합니다.';
    }
    if(connect){
      connect.hidden=connected&&snap.creator;
      connect.textContent=
        waiting||state==='AUTH_REQUIRED'||state==='STALE'?'다시 연결':'Creator 연결';
    }
    if(disconnect){
      disconnect.hidden=!(connected||waiting||state==='AUTH_REQUIRED');
    }
  }

  function onFeedbackSessionStateV3_(snap){
    syncFeedbackAuthEpochV3_('BRIDGE_SESSION');
    syncFeedbackOwnerAuthV3_('BRIDGE_SESSION');
    renderFeedbackSessionV3_();
    renderFeedbackCapabilitiesV3_();
    if(snap.state!=='CONNECTED')return;
    if(snap.creator&&feedbackAuthContinuationV3){
      const intent=feedbackAuthContinuationV3;
      feedbackAuthContinuationV3=null;
      restoreFeedbackAuthContinuationV3_(intent);
    }else if(!['CREATE_POST','UPDATE_POST','CREATE_COMMENT','UPDATE_COMMENT']
      .includes(feedbackEditorStateV3.mode)){
      /* A request preserved as PENDING_UNKNOWN is offered again only when the
         reconnected Creator matches its fingerprint (Project B replay rule). */
      assessStoredFeedbackPendingV3_().then(pending=>{
        const actions=$('feedbackPendingActions');
        if(actions&&pending&&pending.replayable)actions.hidden=false;
      }).catch(()=>{});
    }
    /* Authenticated thread context arrives only after the session binds. */
    const thread=selectedThreadSnapshotV3;
    if(selectedPostId&&thread){
      requestFeedbackCapabilitiesV3_(selectedPostId,thread.comments,threadWaitingSeq,true);
      requestFeedbackOwnerContextV3_(selectedPostId,thread.comments,threadWaitingSeq,true);
    }
  }

  /* Must run synchronously inside a user action (popup blocker). */
  function feedbackConnectSessionV3_(intent){
    feedbackAuthContinuationV3=intent&&intent.action
      ?{action:String(intent.action),targetId:String(intent.targetId||'')}
      :null;
    const bridge=transport.bridge();
    if(!bridge)return false;
    bridge.connect(onFeedbackSessionStateV3_);
    renderFeedbackSessionV3_();
    return true;
  }

  window.TeacherToolsFeedbackBoard=Object.freeze({
    openBoard:openBoardFb1_,
    reloadProducts:()=>loadFeedbackProductsV3_(true),
    getState:()=>({
      selectedPostId:String(selectedPostId||''),
      editorMode:feedbackEditorStateV3.mode,
      authEpoch:feedbackAuthEpoch,
      ownerAvailable:feedbackOwnerAvailableV3_(),
      ownerAuthEpoch:feedbackOwnerAuthEpochV3,
      creatorConnected:!!creatorSessionTokenV3_(),
      productsLoaded:!!feedbackProductsV3,
      activeProducts:feedbackProductsV3
        ?feedbackProductsV3.active.map(item=>item.key):[],
      mutationTransportCount:feedbackMutationTransportCountV3,
      ownerMutationTransportCount:feedbackOwnerMutationTransportCountV3,
      lastMutation:feedbackPhase1CloneV3_(feedbackLastMutationSummaryV3)
    })
  });

  setInterval(()=>{
    syncFeedbackAuthEpochV3_('AUTH_CONTEXT_OBSERVER');
    syncFeedbackOwnerAuthV3_('OWNER_AUTH_CONTEXT_OBSERVER');
  },500);

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bindFb1_,{once:true});
  }else{
    bindFb1_();
  }
})();
