// Hub session-bridge security regression (in-page, deterministic).
//
// window.open returns a fake popup; bridge messages are dispatched as
// MessageEvents whose source is a mock frame. No Project B, Google or
// Supabase request is made. Must run on an allowed Hub origin.
//
// Usage: await window.runFeedbackAuthBridgeHarness()
window.runFeedbackAuthBridgeHarness = async function runFeedbackAuthBridgeHarness() {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? "" });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const bridge = window.TeacherToolsFeedbackAuthBridge;
  const ORIGIN = "https://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com";
  const EXEC = "https://script.google.com/macros/s/AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc/exec";
  const TAG = "sha256:" + "cd".repeat(16);
  const realOpen = window.open;
  const opens = [];
  const sent = [];
  let blockPopup = false;
  let closedReads = 0;
  window.open = (url, name, features) => {
    opens.push({ url: String(url), name, features });
    if (blockPopup) return null;
    const popup = { close() { throw new Error("close() must not be called"); } };
    Object.defineProperty(popup, "closed", { get() { closedReads++; return false; } });
    return popup;
  };
  const frames = {};
  const mkFrame = name => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    document.body.append(frame);
    frame.contentWindow.postMessage = (message, targetOrigin) => {
      sent.push({ frame: name, message: JSON.parse(JSON.stringify(message)), targetOrigin });
    };
    frames[name] = { win: frame.contentWindow, el: frame };
  };
  ["A", "B", "C"].forEach(mkFrame);
  const emit = (frame, data, origin = ORIGIN) => window.dispatchEvent(new MessageEvent("message", {
    data, origin, source: frame ? frames[frame].win : null
  }));
  const state = () => bridge.snapshot();
  const nonceOf = () => new URL(opens[opens.length - 1].url).searchParams.get("bridgeNonce");
  const msg = (type, nonce, extra) => Object.assign({ type, bridgeNonce: nonce, action: "SESSION" }, extra || {});
  const T = {
    READY: "SMQ_FEEDBACK_BRIDGE_READY",
    SESSION: "SMQ_FEEDBACK_BRIDGE_SESSION",
    AUTH_REQUIRED: "SMQ_FEEDBACK_BRIDGE_AUTH_REQUIRED",
    NAVIGATING: "SMQ_FEEDBACK_BRIDGE_NAVIGATING",
    RESULT: "SMQ_FEEDBACK_BRIDGE_RESULT",
    CLOSED: "SMQ_FEEDBACK_BRIDGE_CLOSED",
    ERROR: "SMQ_FEEDBACK_BRIDGE_ERROR"
  };

  try {
    bridge.connect(() => {});
    const url = new URL(opens[0].url);
    const nonce = url.searchParams.get("bridgeNonce");
    check("B1 popup opens exact exec URL with only mode/action/bridgeNonce/hubOrigin",
      url.origin + url.pathname === EXEC &&
      [...url.searchParams.keys()].sort().join() === "action,bridgeNonce,hubOrigin,mode" &&
      url.searchParams.get("action") === "SESSION" &&
      url.searchParams.get("hubOrigin") === location.origin &&
      /^[a-f0-9]{48}$/.test(nonce) && state().state === "WAIT_READY", url.toString());

    for (const o of [
      "https://evil.example", "https://script.google.com",
      ORIGIN + ".evil.example", "https://other-0lu-script.googleusercontent.com",
      ORIGIN.replace("https:", "http:")
    ]) emit("A", msg(T.READY, nonce), o);
    check("B2 wrong / look-alike origins rejected before bind", state().state === "WAIT_READY");

    emit("A", msg(T.READY, "0".repeat(48)));
    emit("A", Object.assign(msg(T.READY, nonce), { action: "CREATE_POST" }));
    emit("A", msg(T.SESSION, nonce, { creator: true, creatorTag: TAG }));
    emit(null, msg(T.READY, nonce));
    check("B3 wrong nonce / wrong action / non-READY / source-less rejected in WAIT_READY",
      state().state === "WAIT_READY" && !state().creator);

    emit("A", msg(T.READY, nonce));
    check("B4 exact READY binds (BOUND), sends nothing by itself", state().state === "BOUND" && sent.length === 0);
    emit("A", msg(T.READY, nonce));
    check("B5 duplicate READY from bound source is a no-op", state().state === "BOUND");

    emit("B", msg(T.SESSION, nonce, { creator: true, owner: true, creatorTag: TAG }));
    check("B6 SESSION from untrusted source ignored", state().state === "BOUND" && !state().creator);
    emit("A", msg(T.SESSION, nonce, { creator: true, owner: false, creatorTag: "not-a-tag" }));
    check("B7 creator without a valid fingerprint is not trusted", state().state === "AUTH_REQUIRED" && !state().creator);
    emit("A", msg(T.SESSION, nonce, {
      creator: true, owner: true, creatorTag: TAG, creatorCode: "<b>x</b>",
      email: "x@example.com", actor_id: "a1"
    }));
    const snap = state();
    check("B8 SESSION -> CONNECTED; snapshot exposes only whitelisted fields",
      snap.state === "CONNECTED" && snap.creator && snap.owner && snap.creatorTag === TAG &&
      snap.creatorCode === "" &&
      Object.keys(snap).sort().join() === "creator,creatorCode,creatorTag,owner,safeCode,state", snap);

    const p1 = bridge.call("CAPABILITIES", { postId: "p", commentIds: [] }, { timeoutMs: 5000 });
    const out = sent[sent.length - 1];
    check("B9 CALL goes to the bound source at the exact origin with exact shape",
      out.frame === "A" && out.targetOrigin === ORIGIN &&
      Object.keys(out.message).sort().join() === "action,args,bridgeNonce,callId,op,type" &&
      out.message.type === "SMQ_FEEDBACK_BRIDGE_CALL" && out.message.bridgeNonce === nonce &&
      /^[0-9a-f-]{36}$/.test(out.message.callId), out.message);

    emit("B", msg(T.RESULT, nonce, { callId: out.message.callId, ok: true, value: { forged: true } }));
    emit("A", msg(T.RESULT, nonce, { callId: "11111111-2222-4333-8444-555555555555", ok: true, value: {} }));
    emit("A", msg(T.RESULT, nonce, { callId: out.message.callId, ok: true, value: { post: null } }));
    const v1 = await p1;
    check("B10 RESULT matched by callId from bound source only (forged/unknown ignored)",
      v1 && v1.post === null && !v1.forged, v1);

    const p2 = bridge.call("DELETE_POST", { requestId: "r" }, { timeoutMs: 5000 });
    const c2 = sent[sent.length - 1].message.callId;
    emit("A", msg(T.RESULT, nonce, { callId: c2, ok: false, safeCode: "raw database secret" }));
    const e2 = await p2.then(() => "", e => e);
    const p3 = bridge.call("DELETE_POST", { requestId: "r" }, { timeoutMs: 5000 });
    const c3 = sent[sent.length - 1].message.callId;
    emit("A", msg(T.RESULT, nonce, { callId: c3, ok: false, safeCode: "FEEDBACK_REVISION_CONFLICT" }));
    const e3 = await p3.then(() => "", e => e);
    check("B11 failure codes whitelisted; unknown collapses to transport-unknown",
      e2 === "FEEDBACK_MUTATION_TRANSPORT_UNKNOWN" && e3 === "FEEDBACK_REVISION_CONFLICT", [e2, e3]);

    const bad = await bridge.call("DROP_TABLE", {}).then(() => "", e => e);
    check("B12 op outside allowlist never sent", bad === "FEEDBACK_MUTATION_NOT_ALLOWED");

    // Trusted navigation (Google sign-in inside the popup) and rebind.
    const p5 = bridge.call("CREATE_POST", { requestId: "r" }, { timeoutMs: 5000 });
    emit("B", msg(T.NAVIGATING, nonce));
    check("B14 untrusted NAVIGATING cannot arm rebind", state().state === "CONNECTED");
    emit("A", msg(T.NAVIGATING, nonce));
    const e5 = await p5.then(() => "", e => e);
    check("B15 trusted NAVIGATING -> REBIND_EXPECTED, flags dropped, in-flight call unknown",
      state().state === "REBIND_EXPECTED" && !state().creator && !state().owner &&
      e5 === "FEEDBACK_BRIDGE_DISCONNECTED", e5);
    emit("C", msg(T.READY, "f".repeat(48)));
    check("B16 READY with other nonce cannot rebind", state().state === "REBIND_EXPECTED");
    emit("C", msg(T.READY, nonce));
    emit("A", msg(T.SESSION, nonce, { creator: true, creatorTag: TAG }));
    check("B17 READY rebinds to new source; previous source no longer trusted",
      state().state === "BOUND" && !state().creator);
    emit("C", msg(T.SESSION, nonce, { creator: true, creatorTag: TAG }));
    check("B18 SESSION from rebound source connects", state().state === "CONNECTED" && state().creator);

    // Manual reload: READY from an untrusted source without NAVIGATING.
    emit("B", msg(T.READY, nonce));
    check("B19 untrusted READY (manual reload/foreign frame) -> STALE, trust dropped",
      state().state === "STALE" && !state().creator);
    emit("C", msg(T.SESSION, nonce, { creator: true, creatorTag: TAG }));
    const afterStale = await bridge.call("SESSION", {}).then(() => "", e => e);
    check("B20 STALE ignores further messages and refuses calls",
      state().state === "STALE" && afterStale === "FEEDBACK_BRIDGE_NOT_CONNECTED");

    // Fresh session by user action; old nonce/source cannot affect it.
    bridge.connect(() => {});
    const nonce2 = nonceOf();
    emit("C", msg(T.READY, nonce));
    check("B21 reconnect uses a fresh nonce; old nonce ignored",
      nonce2 !== nonce && state().state === "WAIT_READY");
    emit("B", msg(T.READY, nonce2));
    emit("B", msg(T.SESSION, nonce2, { creator: false, owner: false, creatorCode: "CREATOR_NOT_APPROVED" }));
    check("B22 non-creator session -> AUTH_REQUIRED with whitelisted creatorCode",
      state().state === "AUTH_REQUIRED" && state().creatorCode === "CREATOR_NOT_APPROVED");
    emit("B", msg(T.ERROR, nonce2, { safeCode: "<img src=x>" }));
    check("B23 ERROR keeps binding; unsafe code collapses", state().state === "AUTH_REQUIRED" &&
      state().safeCode === "FEEDBACK_BRIDGE_ERROR");
    emit("B", msg(T.CLOSED, nonce2));
    check("B24 CLOSED from bound source ends the session", state().state === "CLOSED");

    // An unanswered call (popup gone without CLOSED) times out and ends trust.
    bridge.connect(() => {});
    const n4 = nonceOf();
    emit("A", msg(T.READY, n4));
    emit("A", msg(T.SESSION, n4, { creator: true, creatorTag: TAG }));
    const p4 = bridge.call("CREATE_POST", { requestId: "r" }, { timeoutMs: 150 });
    const e4 = await p4.then(() => "", e => e);
    check("B13 unanswered call -> FEEDBACK_BRIDGE_TIMEOUT and session STALE (reconnect required)",
      e4 === "FEEDBACK_BRIDGE_TIMEOUT" && state().state === "STALE" &&
      state().safeCode === "FEEDBACK_BRIDGE_TIMEOUT" && !state().creator);
    emit("A", msg(T.SESSION, n4, { creator: true, creatorTag: TAG }));
    check("B13b late SESSION after timeout cannot revive the session", state().state === "STALE");

    blockPopup = true;
    bridge.connect(() => {});
    check("B25 blocked popup -> FAILED(POPUP_BLOCKED)", state().state === "FAILED" && state().safeCode === "POPUP_BLOCKED");
    blockPopup = false;

    // Board integration: 글쓰기 without a session keeps the draft, opens the
    // bridge from the click, and resumes the editor once a Creator binds.
    bridge.disconnect();
    const before = opens.length;
    document.getElementById("feedbackWritePostBtn").click();
    const draft = JSON.parse(sessionStorage.getItem("SMQ_FEEDBACK_DRAFT_V3") || "null");
    check("B27 글쓰기 without session saves CREATE_POST draft and opens the bridge",
      opens.length === before + 1 && state().state === "WAIT_READY" &&
      draft && draft.action === "CREATE_POST" &&
      document.getElementById("feedbackEditorShell").hidden === true);
    const n3 = nonceOf();
    emit("A", msg(T.READY, n3));
    emit("A", msg(T.SESSION, n3, { creator: true, creatorTag: TAG }));
    await sleep(100);
    check("B28 Creator SESSION resumes the CREATE_POST editor with 문의 대상 field",
      document.getElementById("feedbackEditorShell").hidden === false &&
      document.getElementById("feedbackEditorShell").dataset.mode === "CREATE_POST" &&
      document.getElementById("feedbackEditorProductField").hidden === false &&
      /Creator 연결됨/.test(document.getElementById("feedbackSessionStatus").textContent));
    document.getElementById("feedbackEditorCancelBtn").click();

    check("B26 popup.closed never read, close() never called", closedReads === 0);
  } catch (error) {
    check("HARNESS_ERROR", false, String(error && error.stack || error));
  } finally {
    bridge.disconnect();
    window.open = realOpen;
    Object.values(frames).forEach(f => f.el.remove());
    await sleep(0);
  }
  return { results };
};
