// Feedback Board adapter harness (in-page, deterministic).
//
// Replaces window.TeacherToolsFeedbackAuthBridge with a mock that records
// every CALL the ported board would send to Project B and answers with
// fixed receipts. Public reads still go to the TEST Supabase project; a fetch
// seam only appends one ACTIVE fixture comment (and optionally overrides the
// thread product) so comment/product paths can be exercised. Nothing is
// written anywhere.
//
// Usage: await window.runFeedbackBoardHarness({owner:true, threadProduct:null})
// Returns {results:[{name,pass,detail}], calls:[{op,args}]}.
window.runFeedbackBoardHarness = async function runFeedbackBoardHarness(opts = {}) {
  const results = [];
  const calls = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? "" });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms = 10000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      try { const v = fn(); if (v) return v; } catch {}
      await sleep(50);
    }
    return null;
  };
  const $ = id => document.getElementById(id);
  const visible = id => { const el = $(id); return !!el && !el.hidden && el.offsetParent !== null; };
  const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FIXTURE_COMMENT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const HIDDEN_POST = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
  const FORBIDDEN = /actor|author_?id|email|owner_?id|isowner|moderator|service_role|secret|hmac|jwt|token/i;
  const keys = o => Object.keys(o || {}).sort().join(",");
  const lastCall = op => [...calls].reverse().find(c => c.op === op);
  const setInput = (id, value) => {
    const el = $(id);
    el.value = value;
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  };

  // ---------- seams ----------
  const realFetch = window.__harnessRealFetch || window.fetch;
  window.__harnessRealFetch = realFetch;
  window.fetch = async (url, init) => {
    const res = await realFetch(url, init);
    if (!String(url).endsWith("/rpc/feedback_get_thread_v3")) return res;
    const data = await res.json();
    if (data && data.post) {
      if (opts.threadProduct) data.post.product = opts.threadProduct;
      data.comments = (data.comments || []).filter(c => c.commentId !== FIXTURE_COMMENT).concat([{
        commentId: FIXTURE_COMMENT, postId: data.post.postId, status: "ACTIVE",
        createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z",
        revision: 1, authorDisplayName: "하네스", body: "하네스 댓글"
      }]);
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const realBridge = window.__harnessRealBridge || window.TeacherToolsFeedbackAuthBridge;
  window.__harnessRealBridge = realBridge;
  const snap = {
    state: "CONNECTED", creator: true, owner: false,
    creatorTag: "sha256:" + "ab".repeat(16), creatorCode: "", safeCode: ""
  };
  let failNext = null;
  let postId = "";
  const receipt = (entityId, revision = 4) => ({ ok: true, replay: false, entityId, revision });
  function answer(op, a) {
    switch (op) {
      case "CAPABILITIES":
        return {
          ok: true,
          post: { canEdit: true, canDelete: true, revision: 3 },
          comments: Object.fromEntries((a.commentIds || []).map(id => [id, { canEdit: true, canDelete: true, revision: 2 }]))
        };
      case "OWNER_CONTEXT":
        return {
          ok: true,
          post: { postId: a.postId, revision: 3, status: "ACTIVE", isNotice: true },
          comments: Object.fromEntries((a.commentIds || []).map(id => [id, { commentId: id, postId: a.postId, revision: 2, status: "ACTIVE" }]))
        };
      case "OWNER_QUEUE":
        return {
          ok: true,
          posts: [{ postId: HIDDEN_POST, createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z", revision: 4, authorDisplayName: "하네스", title: "숨김 하네스 글", body: "숨김 본문", status: "HIDDEN", isNotice: false }],
          comments: []
        };
      case "CREATE_POST": return receipt(postId);
      case "UPDATE_POST": case "DELETE_POST": case "MODERATE_POST": return receipt(a.postId);
      default: return receipt(a.commentId || a.postId);
    }
  }
  window.TeacherToolsFeedbackAuthBridge = Object.freeze({
    STATES: realBridge.STATES,
    snapshot: () => Object.freeze({ ...snap }),
    connect() {},
    disconnect() {},
    call(op, args) {
      calls.push({ op, args: JSON.parse(JSON.stringify(args || {})) });
      if (failNext) { const code = failNext; failNext = null; return Promise.reject(code); }
      return Promise.resolve(answer(op, args || {}));
    }
  });
  const realConfirm = window.confirm;
  window.confirm = () => true;
  try { sessionStorage.clear(); } catch {}

  const openPost = async () => {
    const item = await waitFor(() => document.querySelector("#feedbackBoardList .feedback-board-list-item.is-notice"));
    postId = item.dataset.postId;
    const before = calls.length;
    item.click();
    await waitFor(() => visible("feedbackThreadContent") && calls.slice(before).some(c => c.op === "CAPABILITIES"));
    await sleep(150);
  };
  const submitEditor = async op => {
    const before = calls.length;
    $("feedbackEditorSubmitBtn").click();
    await waitFor(() => calls.slice(before).some(c => c.op === op));
    await sleep(600);
    return lastCall(op);
  };

  try {
    await sleep(700); // board auth-epoch observer picks up the mock session
    await openPost();

    // ---------- Creator capabilities ----------
    const cap = lastCall("CAPABILITIES");
    check("H1 CAPABILITIES args {commentIds,postId}; ACTIVE comments only",
      cap && keys(cap.args) === "commentIds,postId" && cap.args.postId === postId &&
      cap.args.commentIds.includes(FIXTURE_COMMENT), cap && cap.args);
    check("H2 own post/comment edit+delete controls shown from capability",
      visible("feedbackEditPostBtn") && visible("feedbackDeletePostBtn") &&
      !!document.querySelector(`[data-feedback-comment-actions="${FIXTURE_COMMENT}"]:not([hidden])`));
    check("H3 product shown in detail", /^\[.+\]$/.test($("feedbackThreadProduct").textContent),
      $("feedbackThreadProduct").textContent);

    // ---------- Create post with 문의 대상 ----------
    $("feedbackWritePostBtn").click();
    await waitFor(() => visible("feedbackEditorShell"));
    const select = $("feedbackEditorProductSelect");
    const optionKeys = [...select.options].map(o => o.value);
    const registry = await window.TeacherToolsFeedbackTransport.loadProducts();
    check("H4 create selector = placeholder + active registry products in sort order",
      visible("feedbackEditorProductField") && optionKeys[0] === "" &&
      optionKeys.slice(1).join() === registry.active.map(p => p.key).join(), optionKeys.join());
    check("H5 selector labels are registry display_name",
      [...select.options].slice(1).every(o => o.textContent === registry.get(o.value).displayName));
    setInput("feedbackEditorTitleInput", "하네스 제목");
    setInput("feedbackEditorBodyInput", "하네스 본문");
    check("H6 문의 대상 required: blank selection keeps submit disabled",
      select.value === "" && $("feedbackEditorSubmitBtn").disabled === true);
    setInput("feedbackEditorProductSelect", "HANJA");
    check("H7 selecting HANJA enables submit", $("feedbackEditorSubmitBtn").disabled === false);
    const create = await submitEditor("CREATE_POST");
    check("H8 CREATE_POST args exact {body,product,requestId,title} with product HANJA",
      create && keys(create.args) === "body,product,requestId,title" &&
      create.args.product === "HANJA" && UUID4.test(create.args.requestId) &&
      create.args.title === "하네스 제목", create && create.args);
    check("H9 create completes and closes editor", !visible("feedbackEditorShell") &&
      /완료/.test($("feedbackEditorMessage").textContent), $("feedbackEditorMessage").textContent);

    // ---------- Update post keeps product ----------
    await openPost();
    $("feedbackEditPostBtn").click();
    await waitFor(() => visible("feedbackEditorShell"));
    const expected = opts.threadProduct || select.value;
    check("H10 edit preselects the post's current product (no reset/default)",
      !!select.value && select.value === expected, select.value);
    setInput("feedbackEditorTitleInput", "하네스 수정 제목");
    const update = await submitEditor("UPDATE_POST");
    check("H11 UPDATE_POST args exact and product preserved",
      update && keys(update.args) === "body,expectedRevision,postId,product,requestId,title" &&
      update.args.product === expected && update.args.expectedRevision === 3 &&
      update.args.postId === postId, update && update.args);

    // ---------- Comments ----------
    await openPost();
    $("feedbackWriteCommentBtn").click();
    await waitFor(() => visible("feedbackEditorShell"));
    check("H12 comment editor has no 문의 대상 field", !visible("feedbackEditorProductField"));
    setInput("feedbackEditorBodyInput", "하네스 댓글 작성");
    const cc = await submitEditor("CREATE_COMMENT");
    check("H13 CREATE_COMMENT args exact {body,postId,requestId}",
      cc && keys(cc.args) === "body,postId,requestId" && cc.args.postId === postId, cc && cc.args);

    await openPost();
    document.querySelector(`[data-feedback-comment-edit="${FIXTURE_COMMENT}"]`).click();
    await waitFor(() => visible("feedbackEditorShell"));
    setInput("feedbackEditorBodyInput", "하네스 댓글 수정");
    const uc = await submitEditor("UPDATE_COMMENT");
    check("H14 UPDATE_COMMENT args exact {body,commentId,expectedRevision,requestId}",
      uc && keys(uc.args) === "body,commentId,expectedRevision,requestId" &&
      uc.args.commentId === FIXTURE_COMMENT && uc.args.expectedRevision === 2, uc && uc.args);

    await openPost();
    let before = calls.length;
    document.querySelector(`[data-feedback-comment-delete="${FIXTURE_COMMENT}"]`).click();
    await waitFor(() => calls.slice(before).some(c => c.op === "DELETE_COMMENT"));
    const dc = lastCall("DELETE_COMMENT");
    check("H15 DELETE_COMMENT args exact {commentId,expectedRevision,requestId}",
      dc && keys(dc.args) === "commentId,expectedRevision,requestId", dc && dc.args);
    await sleep(600);

    await openPost();
    before = calls.length;
    $("feedbackDeletePostBtn").click();
    await waitFor(() => calls.slice(before).some(c => c.op === "DELETE_POST"));
    const dp = lastCall("DELETE_POST");
    check("H16 DELETE_POST args exact {expectedRevision,postId,requestId}",
      dp && keys(dp.args) === "expectedRevision,postId,requestId" && dp.args.postId === postId, dp && dp.args);
    await sleep(800);

    // ---------- Unauthorized / unknown outcomes ----------
    await openPost();
    $("feedbackWriteCommentBtn").click();
    await waitFor(() => visible("feedbackEditorShell"));
    setInput("feedbackEditorBodyInput", "거부될 댓글");
    failNext = "FEEDBACK_MUTATION_NOT_ALLOWED";
    await submitEditor("CREATE_COMMENT");
    check("H17 unauthorized mutation surfaces safe code and clears pending",
      /FEEDBACK_MUTATION_NOT_ALLOWED/.test($("feedbackEditorMessage").textContent) &&
      !sessionStorage.getItem("SMQ_FEEDBACK_PENDING_UNKNOWN_V3"), $("feedbackEditorMessage").textContent);

    failNext = "FEEDBACK_BRIDGE_TIMEOUT";
    const unknown = await submitEditor("CREATE_COMMENT");
    const pending = JSON.parse(sessionStorage.getItem("SMQ_FEEDBACK_PENDING_UNKNOWN_V3") || "null");
    check("H18 bridge timeout -> PENDING_UNKNOWN with same request preserved",
      visible("feedbackPendingActions") && pending && pending.status === "PENDING_UNKNOWN" &&
      pending.requestId === unknown.args.requestId, pending && pending.status);
    before = calls.length;
    $("feedbackPendingRetryBtn").click();
    await waitFor(() => calls.length > before);
    await sleep(600);
    const retried = calls[before];
    check("H19 retry replays the identical requestId/payload",
      retried.op === "CREATE_COMMENT" && retried.args.requestId === unknown.args.requestId &&
      retried.args.body === unknown.args.body, retried.args);

    // ---------- OWNER ----------
    if (opts.owner) {
      snap.owner = true;
      await sleep(700);
      await openPost();
      await waitFor(() => calls.some(c => c.op === "OWNER_CONTEXT"));
      await sleep(200);
      const oc = lastCall("OWNER_CONTEXT");
      check("H20 OWNER_CONTEXT args exact {commentIds,postId}",
        oc && keys(oc.args) === "commentIds,postId" && oc.args.postId === postId, oc && oc.args);
      check("H21 OWNER notice/hide/admin-delete controls shown (notice -> 공지 해제)",
        visible("feedbackOwnerPostModerationV3") && visible("feedbackOwnerUnpinPostV3") &&
        !visible("feedbackOwnerPinPostV3") && visible("feedbackOwnerHidePostV3") &&
        visible("feedbackOwnerDeletePostV3") && visible("feedbackOwnerRecoveryOpenV3"));

      before = calls.length;
      $("feedbackOwnerUnpinPostV3").click();
      await waitFor(() => calls.slice(before).some(c => c.op === "MODERATE_POST"));
      const unpin = lastCall("MODERATE_POST");
      check("H22 OWNER notice control -> MODERATE_POST UNPIN exact args",
        unpin && keys(unpin.args) === "expectedRevision,moderation,postId,requestId" &&
        unpin.args.moderation === "UNPIN" && unpin.args.expectedRevision === 3, unpin && unpin.args);
      await sleep(800);

      await openPost();
      await waitFor(() => visible("feedbackOwnerHidePostV3"));
      before = calls.length;
      $("feedbackOwnerHidePostV3").click();
      await waitFor(() => calls.slice(before).some(c => c.op === "MODERATE_POST"));
      check("H23 OWNER hide -> MODERATE_POST HIDE", lastCall("MODERATE_POST").args.moderation === "HIDE");
      await sleep(800);

      await openPost();
      await waitFor(() => document.querySelector(`[data-feedback-owner-comment-actions="${FIXTURE_COMMENT}"]:not([hidden])`));
      before = calls.length;
      document.querySelector(`[data-feedback-owner-comment-delete="${FIXTURE_COMMENT}"]`).click();
      await waitFor(() => calls.slice(before).some(c => c.op === "MODERATE_COMMENT"));
      const mc = lastCall("MODERATE_COMMENT");
      check("H24 OWNER admin-delete comment -> MODERATE_COMMENT DELETE exact args",
        mc && keys(mc.args) === "commentId,expectedRevision,moderation,requestId" &&
        mc.args.moderation === "DELETE" && mc.args.commentId === FIXTURE_COMMENT, mc && mc.args);
      await sleep(800);

      $("feedbackOwnerRecoveryOpenV3").click();
      await waitFor(() => calls.some(c => c.op === "OWNER_QUEUE") &&
        document.querySelector("#feedbackOwnerHiddenPostsV3 [data-feedback-owner-restore]"));
      const q = lastCall("OWNER_QUEUE");
      check("H25 hidden management loads OWNER_QUEUE {limit:50} and lists hidden post",
        q && keys(q.args) === "limit" && q.args.limit === 50 &&
        /숨김 하네스 글/.test($("feedbackOwnerHiddenPostsV3").textContent));
      before = calls.length;
      document.querySelector("#feedbackOwnerHiddenPostsV3 [data-feedback-owner-restore]").click();
      await waitFor(() => calls.slice(before).some(c => c.op === "MODERATE_POST"));
      const restore = lastCall("MODERATE_POST");
      check("H26 OWNER restore -> MODERATE_POST UNHIDE on hidden post",
        restore.args.moderation === "UNHIDE" && restore.args.postId === HIDDEN_POST &&
        restore.args.expectedRevision === 4, restore.args);
      await sleep(800);
      before = calls.length;
      document.querySelector("#feedbackOwnerHiddenPostsV3 [data-feedback-owner-delete]").click();
      await waitFor(() => calls.slice(before).some(c => c.op === "MODERATE_POST"));
      check("H27 OWNER admin-delete from hidden management -> MODERATE_POST DELETE",
        lastCall("MODERATE_POST").args.moderation === "DELETE");
      await sleep(600);
      $("feedbackOwnerRecoveryCloseV3").click();
    }

    // ---------- Authority boundary ----------
    const leaked = calls.filter(c => Object.keys(c.args).some(k => FORBIDDEN.test(k)));
    check("H28 no call carries actor/author/email/owner/secret/token fields", leaked.length === 0, leaked);
    check("H29 every mutation carries a UUID v4 requestId",
      calls.filter(c => !["CAPABILITIES", "OWNER_CONTEXT", "OWNER_QUEUE"].includes(c.op))
        .every(c => UUID4.test(c.args.requestId)));
  } catch (error) {
    check("HARNESS_ERROR", false, String(error && error.stack || error));
  } finally {
    window.fetch = realFetch;
    window.TeacherToolsFeedbackAuthBridge = realBridge;
    window.confirm = realConfirm;
    try { sessionStorage.clear(); } catch {}
  }
  return { results, calls };
};
