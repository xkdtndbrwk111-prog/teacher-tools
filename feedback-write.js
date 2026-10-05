"use strict";

// FB-W2A-1 creates browser-local draft/write-intent state only.
// It intentionally contains no network, authentication, or mutation code.
(() => {
  const ACTION = "CREATE_POST";
  const READY = "READY_FOR_AUTH";
  const TERMINAL_STATES = new Set(["CANCELLED", "SUPERSEDED"]);
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

  function renderIntentState() {
    const button = $("feedback-compose-submit");

    if (pendingIntent) {
      button.disabled = true;
      button.textContent = "인증 연결 준비됨";
      setMessage(
        "compose-status",
        "로그인 및 등록 연결 준비 완료. 아직 게시글은 등록되지 않았습니다."
      );
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
        renderIntentState();
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
      renderIntentState();

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
