"use strict";

// FB-W2A-1 creates browser-local draft/write-intent state only.
// FB-W2A-2B adds a user-action hand-off of an unchanged pending intent to
// feedback-auth-bridge.js. FB-W2A-2C completes that intent only after the
// trusted bridge reports the sanitized Project B CREATE result.
(() => {
  const ACTION = "CREATE_POST";
  const READY = "READY_FOR_AUTH";
  const TERMINAL_STATES = new Set(["CANCELLED", "SUPERSEDED", "COMPLETED"]);
  const PRODUCTS = Object.freeze([
    "HUB",
    "PROJECT_A",
    "PROJECT_B",
    "SEATING",
    "PROJECT_C",
    "ROLE_MANAGER",
    "OTHER"
  ]);
  const PRODUCT_SET = new Set(PRODUCTS);
  const STORAGE_KEYS = Object.freeze({
    draft: "teacher-tools.feedback.compose-draft.v1",
    pending: "teacher-tools.feedback.pending-write-intent.v1",
    terminal: "teacher-tools.feedback.terminal-write-intents.v1"
  });
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const $ = id => document.getElementById(id);

  let draft = readDraft();
  let pendingIntent = readPendingIntent();
  let creatingIntent = false;
  let lastFocused = null;
  let bridgeState = null;
  let composeCompleted = false;

  function codePointLength(value) {
    return Array.from(String(value ?? "")).length;
  }

  function normalizeTitle(value) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeBody(value) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  function blankDraft() {
    return { product: "", title: "", body: "" };
  }

  function readJson(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function removeStored(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // In-memory state remains available for the current page.
    }
  }

  function readDraft() {
    const value = readJson(STORAGE_KEYS.draft, null);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return blankDraft();
    }

    const product =
      typeof value.product === "string" &&
      (value.product === "" || PRODUCT_SET.has(value.product))
        ? value.product
        : "";
    const title = typeof value.title === "string" ? value.title.slice(0, 20000) : "";
    const body = typeof value.body === "string" ? value.body.slice(0, 50000) : "";

    return { product, title, body };
  }

  function readPendingIntent() {
    const value = readJson(STORAGE_KEYS.pending, null);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const requestId = String(value.requestId || "");
    if (
      value.action !== ACTION ||
      value.state !== READY ||
      !UUID_V4.test(requestId)
    ) {
      return null;
    }
    const isTerminal = terminalIntents().some(
      intent =>
        String(intent.requestId) === requestId &&
        TERMINAL_STATES.has(intent.state)
    );
    if (isTerminal) {
      removeStored(STORAGE_KEYS.pending);
      return null;
    }
    if (
      !PRODUCT_SET.has(value.product) ||
      typeof value.title !== "string" ||
      typeof value.body !== "string"
    ) {
      return null;
    }
    if (codePointLength(value.title) < 1 || codePointLength(value.title) > 120) return null;
    if (codePointLength(value.body) < 1 || codePointLength(value.body) > 5000) return null;
    if (Number.isNaN(new Date(value.createdAt).getTime())) return null;

    return {
      action: ACTION,
      requestId,
      product: value.product,
      title: value.title,
      body: value.body,
      state: READY,
      createdAt: value.createdAt
    };
  }

  function formDraft() {
    return {
      product: $("compose-product").value,
      title: $("compose-title").value,
      body: $("compose-body").value
    };
  }

  function normalizedDraft(value) {
    return {
      product: String(value.product || ""),
      title: normalizeTitle(value.title),
      body: normalizeBody(value.body)
    };
  }

  function sameIntent(intent, value) {
    return Boolean(intent) &&
      intent.product === value.product &&
      intent.title === value.title &&
      intent.body === value.body;
  }

  function persistDraft(value) {
    draft = {
      product: value.product,
      title: value.title,
      body: value.body
    };
    writeJson(STORAGE_KEYS.draft, {
      ...draft,
      updatedAt: new Date().toISOString()
    });
  }

  function terminalIntents() {
    const values = readJson(STORAGE_KEYS.terminal, []);
    return Array.isArray(values)
      ? values.filter(value => value && UUID_V4.test(String(value.requestId || "")))
      : [];
  }

  function endIntent(intent, state) {
    if (!intent) return;

    const ended = {
      action: ACTION,
      requestId: intent.requestId,
      state,
      createdAt: intent.createdAt,
      endedAt: new Date().toISOString()
    };
    const previous = terminalIntents().filter(
      value => value.requestId !== intent.requestId
    );

    writeJson(STORAGE_KEYS.terminal, [ended, ...previous]);
    removeStored(STORAGE_KEYS.pending);
    pendingIntent = null;
    stopBridge();
  }

  function authBridge() {
    return window.TeacherToolsFeedbackAuthBridge || null;
  }

  function pendingSnapshot() {
    return pendingIntent
      ? Object.freeze({
          action: pendingIntent.action,
          requestId: pendingIntent.requestId,
          product: pendingIntent.product,
          title: pendingIntent.title,
          body: pendingIntent.body
        })
      : null;
  }

  function onBridgeState(state) {
    bridgeState = state;
    if (
      state &&
      state.state === "SUCCEEDED" &&
      pendingIntent &&
      state.requestId === pendingIntent.requestId &&
      state.success === true
    ) {
      completeIntent();
      return;
    }
    renderIntentState();
  }

  function completeIntent() {
    const completed = pendingIntent;
    endIntent(completed, "COMPLETED");
    removeStored(STORAGE_KEYS.draft);
    draft = blankDraft();
    composeCompleted = true;
    fillForm(draft);
    clearValidation();
    renderIntentState();
    setMessage("compose-status", "등록되었습니다.");

    if (typeof window.feedbackRefresh === "function") {
      Promise.resolve(window.feedbackRefresh()).catch(() => {
        // The create already succeeded. Public read refresh failure is handled
        // by the existing Feedback reader and must not resurrect the intent.
      });
    }
  }

  function stopBridge() {
    const bridge = authBridge();
    if (bridge) bridge.stop();
    bridgeState = null;
  }

  // Runs synchronously inside the submit handler so the popup is user-initiated.
  function startBridge() {
    const bridge = authBridge();
    const snapshot = pendingSnapshot();
    if (!bridge || !snapshot) {
      bridgeState = {
        state: "FAILED",
        requestId: pendingIntent ? pendingIntent.requestId : "",
        safeCode: "BRIDGE_UNAVAILABLE"
      };
      renderIntentState();
      return;
    }
    bridgeState = bridge.start(snapshot, onBridgeState);
    renderIntentState();
  }

  function uuidV4() {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(
      bytes,
      value => value.toString(16).padStart(2, "0")
    );

    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function setMessage(id, text) {
    $(id).textContent = text;
  }

  function clearValidation() {
    ["compose-product", "compose-title", "compose-body"].forEach(
      id => $(id).removeAttribute("aria-invalid")
    );
    setMessage("compose-error", "");
  }

  function invalidate(id, message) {
    $(id).setAttribute("aria-invalid", "true");
    setMessage("compose-error", message);
    $(id).focus();
    return null;
  }

  function validate(value) {
    clearValidation();

    if (!PRODUCT_SET.has(value.product)) {
      return invalidate("compose-product", "문의 대상을 선택해 주세요.");
    }

    const titleLength = codePointLength(value.title);
    if (titleLength < 1) {
      return invalidate("compose-title", "제목을 입력해 주세요.");
    }
    if (titleLength > 120) {
      return invalidate("compose-title", "제목은 120자 이하로 입력해 주세요.");
    }

    const bodyLength = codePointLength(value.body);
    if (bodyLength < 1) {
      return invalidate("compose-body", "내용을 입력해 주세요.");
    }
    if (bodyLength > 5000) {
      return invalidate("compose-body", "내용은 5000자 이하로 입력해 주세요.");
    }

    return value;
  }

  function updateCounters() {
    $("compose-title-count").textContent =
      `${codePointLength($("compose-title").value)} / 120`;
    $("compose-body-count").textContent =
      `${codePointLength($("compose-body").value)} / 5000`;
  }

  function bridgeMessage(state) {
    const notPosted = "\n아직 게시글은 등록되지 않았습니다.";
    switch (state && state.state) {
      case "WAIT_READY":
      case "BOUND":
      case "AUTHENTICATING":
        return "Google Creator 확인 창과 연결하고 있습니다." + notPosted;
      case "AUTH_REQUIRED":
        return (state.safeCode
          ? `확인 창에서 작성 권한을 확인하지 못했습니다. (${state.safeCode})`
          : "확인 창에서 Google 계정 확인을 진행해 주세요.") + notPosted;
      case "REBIND_EXPECTED":
        return "Google 로그인 후 확인 창이 다시 연결되기를 기다리고 있습니다." + notPosted;
      case "AUTHENTICATED":
      case "MUTATING":
        return "Google Creator 확인이 완료되었습니다. 게시글을 등록하고 있습니다.";
      case "SUCCEEDED":
        return "등록되었습니다.";
      case "CLOSED":
        return "확인 창이 닫혔습니다. 작성 내용과 요청 번호는 그대로 유지됩니다.";
      case "STALE":
        return "확인 창 연결이 만료되었습니다. 창을 다시 열어 주세요. 작성 내용과 요청 번호는 그대로 유지됩니다.";
      case "FAILED":
        return state.safeCode === "POPUP_BLOCKED"
          ? "확인 창이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요. 작성 내용과 요청 번호는 그대로 유지됩니다."
          : `확인 창을 열 수 없습니다. (${state.safeCode})`;
      default:
        return "로그인 및 등록 연결 준비 완료. 아직 게시글은 등록되지 않았습니다.";
    }
  }

  function renderIntentState() {
    const button = $("feedback-compose-submit");

    if (composeCompleted) {
      button.disabled = true;
      button.textContent = "등록 완료";
      setMessage("compose-status", "등록되었습니다.");
      return;
    }

    if (pendingIntent) {
      const state = bridgeState && bridgeState.requestId === pendingIntent.requestId
        ? bridgeState
        : null;
      const mutating = Boolean(state) && state.state === "MUTATING";
      button.disabled = mutating;
      button.textContent = mutating
        ? "등록 중"
        : state && state.state !== "IDLE"
          ? "확인 창 다시 열기"
          : "Google 확인 창 열기";
      setMessage("compose-status", bridgeMessage(state));
    } else {
      button.disabled = false;
      button.textContent = "등록";
      if (!$("compose-error").textContent) {
        setMessage("compose-status", "");
      }
    }
  }

  function fillForm(value) {
    $("compose-product").value = value.product;
    $("compose-title").value = value.title;
    $("compose-body").value = value.body;
    updateCounters();
  }

  function onDraftInput() {
    const value = formDraft();
    let superseded = false;

    composeCompleted = false;
    persistDraft(value);
    if (pendingIntent && !sameIntent(pendingIntent, normalizedDraft(value))) {
      endIntent(pendingIntent, "SUPERSEDED");
      superseded = true;
    }

    clearValidation();
    updateCounters();
    renderIntentState();

    if (superseded) {
      setMessage("compose-status", "내용이 변경되어 새 등록 의도가 필요합니다.");
    }
  }

  function openCompose() {
    composeCompleted = false;
    lastFocused = document.activeElement;
    fillForm(pendingIntent || draft);
    clearValidation();
    renderIntentState();
    $("feedback-compose-overlay").hidden = false;
    document.body.classList.add("feedback-compose-open");
    (pendingIntent || draft.product
      ? $("compose-title")
      : $("compose-product")
    ).focus();
  }

  function closeCompose(save = true) {
    if (save) persistDraft(formDraft());
    $("feedback-compose-overlay").hidden = true;
    document.body.classList.remove("feedback-compose-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function cancelCompose() {
    composeCompleted = false;
    if (pendingIntent) endIntent(pendingIntent, "CANCELLED");
    removeStored(STORAGE_KEYS.draft);
    removeStored(STORAGE_KEYS.pending);
    draft = blankDraft();
    pendingIntent = null;
    fillForm(draft);
    clearValidation();
    setMessage("compose-status", "");
    renderIntentState();
    closeCompose(false);
  }

  function createWriteIntent(event) {
    event.preventDefault();
    if (creatingIntent) return;

    creatingIntent = true;
    $("feedback-compose-submit").disabled = true;

    try {
      const value = normalizedDraft(formDraft());

      if (pendingIntent && sameIntent(pendingIntent, value)) {
        startBridge();
        return;
      }
      if (pendingIntent) endIntent(pendingIntent, "SUPERSEDED");
      if (!validate(value)) {
        renderIntentState();
        return;
      }

      const intent = {
        action: ACTION,
        requestId: uuidV4(),
        product: value.product,
        title: value.title,
        body: value.body,
        state: READY,
        createdAt: new Date().toISOString()
      };

      pendingIntent = intent;
      persistDraft(value);
      fillForm(value);
      const persisted = writeJson(STORAGE_KEYS.pending, intent);
      startBridge();

      if (!persisted) {
        setMessage(
          "compose-status",
          "등록 의도는 이 화면에만 보존되었습니다. 브라우저 임시 저장을 사용할 수 없습니다."
        );
      }
    } finally {
      creatingIntent = false;
    }
  }

  function keepFocusInside(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCompose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      $("feedback-compose-overlay").querySelectorAll(
        "button:not(:disabled), select, input, textarea"
      )
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (pendingIntent) {
    draft = {
      product: pendingIntent.product,
      title: pendingIntent.title,
      body: pendingIntent.body
    };
    persistDraft(draft);
  }

  $("feedback-compose-open").addEventListener("click", openCompose);
  $("feedback-compose-close").addEventListener("click", () => closeCompose());
  $("feedback-compose-cancel").addEventListener("click", cancelCompose);
  $("feedback-compose-form").addEventListener("submit", createWriteIntent);
  $("feedback-compose-overlay").addEventListener("keydown", keepFocusInside);
  ["compose-product", "compose-title", "compose-body"].forEach(id => {
    $(id).addEventListener(
      id === "compose-product" ? "change" : "input",
      onDraftInput
    );
  });
})();
