"use strict";

// FB-W2A-2B Creator auth bridge (Hub side).
// Wire contract source: SUPER MARIO QUIZ MANAGER immutable version 370,
// FeedbackAuthBridgeV1.js and FeedbackAuthBridgeV1Client.html.
// This module only confirms the Creator session inside Project B. It never
// calls a Feedback mutation and never receives identity data.
(() => {
  // TEST deployment @370 (live deployment listing, 2026-10-07).
  const BRIDGE_EXEC_URL =
    "https://script.google.com/macros/s/AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc/exec";
  // Exact @370 user-frame origin. Compared with === only.
  const BRIDGE_ORIGIN =
    "https://n-tmrid42qu3svum6iclzmekeicegv7qtnxbt4hly-0lu-script.googleusercontent.com";
  // Mirrors SMQ_FEEDBACK_AUTH_BRIDGE_HUB_ORIGINS_V1; Project B re-checks it.
  const HUB_ORIGINS = Object.freeze([
    "http://127.0.0.1:8123",
    "https://xkdtndbrwk111-prog.github.io"
  ]);
  const MODE = "feedback-auth-bridge";
  const ACTION = "CREATE_POST";
  const NONCE = /^[a-f0-9]{48}$/;
  const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const PRODUCTS = new Set([
    "HUB", "PROJECT_A", "PROJECT_B", "SEATING", "PROJECT_C", "ROLE_MANAGER", "OTHER"
  ]);
  const TYPES = Object.freeze({
    READY: "SMQ_FEEDBACK_BRIDGE_READY",
    INTENT: "SMQ_FEEDBACK_BRIDGE_INTENT",
    AUTH_REQUIRED: "SMQ_FEEDBACK_BRIDGE_AUTH_REQUIRED",
    NAVIGATING: "SMQ_FEEDBACK_BRIDGE_NAVIGATING",
    AUTHENTICATED: "SMQ_FEEDBACK_BRIDGE_AUTHENTICATED",
    ERROR: "SMQ_FEEDBACK_BRIDGE_ERROR"
  });
  const SAFE_CODES = new Set([
    "CREATOR_BLOCKED",
    "CREATOR_NOT_APPROVED",
    "CREATOR_SESSION_REQUIRED",
    "CREATOR_CONFIRMATION_FAILED",
    "BRIDGE_STORAGE_UNAVAILABLE"
  ]);
  const STATES = Object.freeze({
    IDLE: "IDLE",
    WAIT_READY: "WAIT_READY",
    BOUND: "BOUND",
    AUTHENTICATING: "AUTHENTICATING",
    AUTH_REQUIRED: "AUTH_REQUIRED",
    REBIND_EXPECTED: "REBIND_EXPECTED",
    AUTHENTICATED: "AUTHENTICATED",
    CLOSED: "CLOSED",
    STALE: "STALE",
    FAILED: "FAILED"
  });
  const TERMINAL = new Set([
    STATES.IDLE, STATES.AUTHENTICATED, STATES.CLOSED, STATES.STALE, STATES.FAILED
  ]);
  // Matches the @370 return-marker lifetime (MARKER_MAX_AGE_MS).
  const SESSION_MAX_AGE_MS = 10 * 60 * 1000;

  let session = null;
  let snapshot = Object.freeze({ state: STATES.IDLE, requestId: "", safeCode: "" });

  function freshNonce() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }

  function codePointLength(value) {
    return Array.from(String(value ?? "")).length;
  }

  function validIntent(intent) {
    return Boolean(intent) &&
      intent.action === ACTION &&
      REQUEST_ID.test(String(intent.requestId || "")) &&
      PRODUCTS.has(intent.product) &&
      typeof intent.title === "string" &&
      typeof intent.body === "string" &&
      codePointLength(intent.title) >= 1 && codePointLength(intent.title) <= 120 &&
      codePointLength(intent.body) >= 1 && codePointLength(intent.body) <= 5000;
  }

  function setState(target, state, safeCode = "") {
    target.state = state;
    if (target !== session) return;
    snapshot = Object.freeze({ state, requestId: target.requestId, safeCode });
    if (typeof target.onState === "function") {
      try {
        target.onState(snapshot);
      } catch {
        // UI callbacks never change bridge trust.
      }
    }
  }

  // Ends trust in a session. The popup window is never inspected or closed:
  // after cross-origin OAuth navigation it may sit in another browsing
  // context group (COOP), and trust must not depend on it. A popup that is
  // still visible keeps no trust once its session is ended here.
  function teardown(target, state, safeCode = "") {
    clearTimeout(target.expiryTimer);
    target.bridgeSource = null;
    setState(target, state, safeCode);
  }

  function sendIntent(target) {
    // Exact INTENT shape accepted by @370 validIntent(); nothing else is sent.
    target.bridgeSource.postMessage({
      type: TYPES.INTENT,
      action: ACTION,
      bridgeNonce: target.nonce,
      requestId: target.requestId,
      product: target.intent.product,
      title: target.intent.title,
      body: target.intent.body
    }, BRIDGE_ORIGIN);
    setState(target, STATES.AUTHENTICATING);
  }

  function bind(target, source) {
    target.bridgeSource = source;
    setState(target, STATES.BOUND);
    sendIntent(target);
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

    if (target.state === STATES.WAIT_READY) {
      if (data.type === TYPES.READY) bind(target, event.source);
      return;
    }

    if (target.state === STATES.REBIND_EXPECTED) {
      // Armed only by a trusted NAVIGATING from the bound source.
      if (data.type === TYPES.READY) bind(target, event.source);
      return;
    }

    if (event.source !== target.bridgeSource) {
      // Same origin + same nonce from an untrusted source: a manual reload or a
      // foreign frame. Never rebind; drop trust and require a fresh session.
      if (data.type === TYPES.READY) {
        teardown(target, STATES.STALE);
      }
      return;
    }

    if (data.type === TYPES.READY) return; // duplicate READY is a no-op

    if (data.requestId !== target.requestId) return;

    if (data.type === TYPES.AUTH_REQUIRED) {
      setState(target, STATES.AUTH_REQUIRED);
    } else if (data.type === TYPES.NAVIGATING) {
      setState(target, STATES.REBIND_EXPECTED);
    } else if (data.type === TYPES.AUTHENTICATED) {
      if (data.creatorConfirmed !== true) return;
      teardown(target, STATES.AUTHENTICATED);
    } else if (data.type === TYPES.ERROR) {
      const code = SAFE_CODES.has(data.safeCode)
        ? data.safeCode
        : "CREATOR_CONFIRMATION_FAILED";
      // The popup keeps its login button visible; the session stays bound.
      setState(target, STATES.AUTH_REQUIRED, code);
    }
  }

  function stop(reason = STATES.CLOSED) {
    const target = session;
    if (!target) return;
    if (!TERMINAL.has(target.state)) {
      teardown(target, reason);
    }
  }

  // Must be called synchronously from a user action (popup blocker).
  function start(intent, onState) {
    stop(STATES.CLOSED);

    const nonce = freshNonce();
    const target = {
      nonce,
      requestId: intent && intent.requestId,
      intent: intent && Object.freeze({
        product: intent.product,
        title: intent.title,
        body: intent.body
      }),
      onState,
      bridgeSource: null,
      expiryTimer: 0,
      state: STATES.IDLE
    };
    session = target;

    if (!validIntent(intent)) {
      setState(target, STATES.FAILED, "INTENT_INVALID");
      return snapshot;
    }
    if (!NONCE.test(nonce) || nonce === target.requestId) {
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

    // Physical popup closure is not tracked. A manually closed popup leaves
    // the pending intent untouched; the user retries, which ends this session.
    setState(target, STATES.WAIT_READY);

    target.expiryTimer = setTimeout(() => {
      if (!TERMINAL.has(target.state)) {
        teardown(target, STATES.STALE);
      }
    }, SESSION_MAX_AGE_MS);

    return snapshot;
  }

  window.addEventListener("message", onMessage);

  window.TeacherToolsFeedbackAuthBridge = Object.freeze({
    STATES,
    start,
    stop,
    snapshot: () => snapshot
  });
})();
