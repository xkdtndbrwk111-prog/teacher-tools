"use strict";

// FB-W2A-2B Creator auth bridge (Hub side), FB-HUB-1 persistent session.
// Wire contract source: SUPER MARIO QUIZ MANAGER TEST @372,
// FeedbackAuthBridgeV1.js and FeedbackAuthBridgeV1Client.html.
// Project B owns Creator/OWNER authority and runs every Feedback call. The
// Hub receives only lifecycle messages, availability flags for its UI, an
// opaque Creator fingerprint, and field-whitelisted call results.
(() => {
  // TEST deployment (same deployment id across @370-@372).
  const BRIDGE_EXEC_URL =
    "https://script.google.com/macros/s/AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc/exec";
  // Exact Project B user-frame origin. Compared with === only.
  const BRIDGE_ORIGIN =
    "https://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com";
  // Mirrors SMQ_FEEDBACK_AUTH_BRIDGE_HUB_ORIGINS_V1; Project B re-checks it.
  const HUB_ORIGINS = Object.freeze([
    "http://127.0.0.1:8123",
    "https://xkdtndbrwk111-prog.github.io"
  ]);
  const MODE = "feedback-auth-bridge";
  const ACTION = "SESSION";
  const NONCE = /^[a-f0-9]{48}$/;
  const CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const CREATOR_TAG = /^sha256:[0-9a-f]{32}$/;
  const SAFE_CODE = /^FEEDBACK_[A-Z0-9_]{1,80}$/;
  const TYPES = Object.freeze({
    READY: "SMQ_FEEDBACK_BRIDGE_READY",
    SESSION: "SMQ_FEEDBACK_BRIDGE_SESSION",
    AUTH_REQUIRED: "SMQ_FEEDBACK_BRIDGE_AUTH_REQUIRED",
    NAVIGATING: "SMQ_FEEDBACK_BRIDGE_NAVIGATING",
    CALL: "SMQ_FEEDBACK_BRIDGE_CALL",
    RESULT: "SMQ_FEEDBACK_BRIDGE_RESULT",
    CLOSED: "SMQ_FEEDBACK_BRIDGE_CLOSED",
    ERROR: "SMQ_FEEDBACK_BRIDGE_ERROR"
  });
  const CREATOR_CODES = new Set([
    "CREATOR_BLOCKED",
    "CREATOR_NOT_APPROVED",
    "CREATOR_SESSION_REQUIRED"
  ]);
  const OPS = new Set([
    "SESSION",
    "CAPABILITIES",
    "OWNER_CONTEXT",
    "OWNER_QUEUE",
    "CREATE_POST",
    "UPDATE_POST",
    "DELETE_POST",
    "CREATE_COMMENT",
    "UPDATE_COMMENT",
    "DELETE_COMMENT",
    "MODERATE_POST",
    "MODERATE_COMMENT"
  ]);
  const STATES = Object.freeze({
    IDLE: "IDLE",
    WAIT_READY: "WAIT_READY",
    BOUND: "BOUND",
    CONNECTED: "CONNECTED",
    AUTH_REQUIRED: "AUTH_REQUIRED",
    REBIND_EXPECTED: "REBIND_EXPECTED",
    CLOSED: "CLOSED",
    STALE: "STALE",
    FAILED: "FAILED"
  });
  const TERMINAL = new Set([
    STATES.IDLE, STATES.CLOSED, STATES.STALE, STATES.FAILED
  ]);
  const CALLABLE = new Set([
    STATES.BOUND, STATES.CONNECTED, STATES.AUTH_REQUIRED
  ]);
  // A popup that never reports READY expires with the @370 marker lifetime.
  const WAIT_READY_MAX_MS = 10 * 60 * 1000;
  const DEFAULT_CALL_TIMEOUT_MS = 60 * 1000;

  let session = null;
  let snapshot = freeze(STATES.IDLE, null, "");

  function freeze(state, target, safeCode) {
    return Object.freeze({
      state,
      creator: Boolean(target && target.creator),
      owner: Boolean(target && target.owner),
      creatorTag: target && target.creator ? target.creatorTag : "",
      creatorCode: target ? target.creatorCode : "",
      safeCode
    });
  }

  function freshNonce() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }

  function setState(target, state, safeCode = "") {
    target.state = state;
    if (target !== session) return;
    snapshot = freeze(state, target, safeCode);
    if (typeof target.onState === "function") {
      try {
        target.onState(snapshot);
      } catch {
        // UI callbacks never change bridge trust.
      }
    }
  }

  function failCalls(target, code) {
    const calls = target.calls;
    target.calls = new Map();
    calls.forEach(call => {
      clearTimeout(call.timer);
      call.reject(code);
    });
  }

  // Ends trust in a session. The popup window is never inspected or closed:
  // after cross-origin OAuth navigation it may sit in another browsing
  // context group (COOP), and trust must not depend on it.
  function teardown(target, state, safeCode = "") {
    clearTimeout(target.expiryTimer);
    target.bridgeSource = null;
    target.creator = false;
    target.owner = false;
    target.creatorTag = "";
    failCalls(target, "FEEDBACK_BRIDGE_DISCONNECTED");
    setState(target, state, safeCode);
  }

  function bind(target, source) {
    clearTimeout(target.expiryTimer);
    target.bridgeSource = source;
    setState(target, STATES.BOUND);
  }

  function applySession(target, data) {
    target.creator = data.creator === true;
    target.owner = data.owner === true;
    target.creatorTag = target.creator && CREATOR_TAG.test(String(data.creatorTag || ""))
      ? data.creatorTag
      : "";
    if (target.creator && !target.creatorTag) target.creator = false;
    target.creatorCode = CREATOR_CODES.has(data.creatorCode) ? data.creatorCode : "";
    setState(
      target,
      target.creator || target.owner ? STATES.CONNECTED : STATES.AUTH_REQUIRED
    );
  }

  function applyResult(target, data) {
    const call = target.calls.get(data.callId);
    if (!call) return;
    target.calls.delete(data.callId);
    clearTimeout(call.timer);
    if (data.ok === true) {
      call.resolve(data.value);
    } else {
      call.reject(SAFE_CODE.test(String(data.safeCode || ""))
        ? data.safeCode
        : "FEEDBACK_MUTATION_TRANSPORT_UNKNOWN");
    }
  }

  function onMessage(event) {
    // Reject the origin before looking at the source or the payload.
    if (event.origin !== BRIDGE_ORIGIN) return;
    const target = session;
    if (!target || TERMINAL.has(target.state)) return;

    const data = event.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return;
    if (data.bridgeNonce !== target.nonce || data.action !== ACTION) return;
    if (!event.source) return;

    if (target.state === STATES.WAIT_READY || target.state === STATES.REBIND_EXPECTED) {
      // REBIND_EXPECTED is armed only by a trusted NAVIGATING from the bound source.
      if (data.type === TYPES.READY) bind(target, event.source);
      return;
    }

    if (event.source !== target.bridgeSource) {
      // Same origin + same nonce from an untrusted source: a manual reload or a
      // foreign frame. Never rebind; drop trust and require a fresh session.
      if (data.type === TYPES.READY) teardown(target, STATES.STALE);
      return;
    }

    if (data.type === TYPES.READY) return; // duplicate READY is a no-op

    if (data.type === TYPES.SESSION) {
      applySession(target, data);
    } else if (data.type === TYPES.AUTH_REQUIRED) {
      if (!target.creator && !target.owner) setState(target, STATES.AUTH_REQUIRED);
    } else if (data.type === TYPES.NAVIGATING) {
      failCalls(target, "FEEDBACK_BRIDGE_DISCONNECTED");
      target.creator = false;
      target.owner = false;
      target.creatorTag = "";
      setState(target, STATES.REBIND_EXPECTED);
    } else if (data.type === TYPES.RESULT) {
      if (CALL_ID.test(String(data.callId || ""))) applyResult(target, data);
    } else if (data.type === TYPES.CLOSED) {
      teardown(target, STATES.CLOSED);
    } else if (data.type === TYPES.ERROR) {
      const code = SAFE_CODE.test(String(data.safeCode || ""))
        ? data.safeCode
        : "FEEDBACK_BRIDGE_ERROR";
      setState(target, target.state, code);
    }
  }

  function disconnect(reason = STATES.CLOSED) {
    const target = session;
    if (!target) return;
    if (!TERMINAL.has(target.state)) teardown(target, reason);
  }

  // Must be called synchronously from a user action (popup blocker).
  function connect(onState) {
    disconnect(STATES.CLOSED);

    const nonce = freshNonce();
    const target = {
      nonce,
      onState,
      bridgeSource: null,
      expiryTimer: 0,
      calls: new Map(),
      creator: false,
      owner: false,
      creatorTag: "",
      creatorCode: "",
      state: STATES.IDLE
    };
    session = target;

    if (!NONCE.test(nonce)) {
      setState(target, STATES.FAILED, "NONCE_UNAVAILABLE");
      return snapshot;
    }
    if (HUB_ORIGINS.indexOf(location.origin) < 0) {
      setState(target, STATES.FAILED, "HUB_ORIGIN_NOT_ALLOWED");
      return snapshot;
    }

    const url = new URL(BRIDGE_EXEC_URL);
    url.searchParams.set("mode", MODE);
    url.searchParams.set("action", ACTION);
    url.searchParams.set("bridgeNonce", nonce);
    url.searchParams.set("hubOrigin", location.origin);

    let popup = null;
    try {
      popup = window.open(
        url.toString(),
        "teacher-tools-feedback-auth",
        "popup,width=520,height=720"
      );
    } catch {
      popup = null;
    }
    if (!popup) {
      setState(target, STATES.FAILED, "POPUP_BLOCKED");
      return snapshot;
    }

    setState(target, STATES.WAIT_READY);
    target.expiryTimer = setTimeout(() => {
      if (target.state === STATES.WAIT_READY) teardown(target, STATES.STALE);
    }, WAIT_READY_MAX_MS);

    return snapshot;
  }

  function newCallId() {
    const id = String(crypto.randomUUID()).toLowerCase();
    if (!CALL_ID.test(id)) throw new Error("FEEDBACK_REQUEST_ID_INVALID");
    return id;
  }

  // Resolves with the bridge's whitelisted value; rejects with a safe code
  // string. A disconnect or timeout leaves the server outcome unknown.
  function call(op, args, options = {}) {
    const target = session;
    if (!OPS.has(op)) return Promise.reject("FEEDBACK_MUTATION_NOT_ALLOWED");
    if (!target || !CALLABLE.has(target.state) || !target.bridgeSource) {
      return Promise.reject("FEEDBACK_BRIDGE_NOT_CONNECTED");
    }
    const callId = newCallId();
    const timeoutMs = Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : DEFAULT_CALL_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (target.calls.delete(callId)) reject("FEEDBACK_BRIDGE_TIMEOUT");
      }, timeoutMs);
      target.calls.set(callId, { resolve, reject, timer });
      target.bridgeSource.postMessage({
        type: TYPES.CALL,
        action: ACTION,
        bridgeNonce: target.nonce,
        callId,
        op,
        args: JSON.parse(JSON.stringify(args || {}))
      }, BRIDGE_ORIGIN);
    });
  }

  window.addEventListener("message", onMessage);

  window.TeacherToolsFeedbackAuthBridge = Object.freeze({
    STATES,
    connect,
    disconnect,
    call,
    snapshot: () => snapshot
  });
})();
