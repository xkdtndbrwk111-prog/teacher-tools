"use strict";

(() => {
  const CONFIG = Object.freeze({
    supabaseUrl: "https://rhtyktjebiunkchddxvg.supabase.co",
    publishableKey: "sb_publishable_SD1BpBEMqvj3Qv34ymUNFw_sqrgLwao",
    requestTimeoutMs: 8000
  });

  const ALLOWED_APPS = new Set(["SEATING", "HANJA"]);
  const script = document.currentScript;
  const usageApp = String(script?.dataset.usageApp || "").trim().toUpperCase();
  const displayTargetId = String(script?.dataset.usageDisplay || "").trim();

  async function rpc(name, payload = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);

    try {
      const response = await fetch(
        CONFIG.supabaseUrl + "/rest/v1/rpc/" + encodeURIComponent(name),
        {
          method: "POST",
          mode: "cors",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            apikey: CONFIG.publishableKey,
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        throw new Error("USAGE_RPC_" + response.status);
      }

      const raw = await response.text();
      return raw ? JSON.parse(raw) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function recordLaunch(appKey) {
    if (!ALLOWED_APPS.has(appKey)) return;

    const sessionKey = "teacher-tools.usage.counted.v1." + appKey;

    try {
      if (sessionStorage.getItem(sessionKey) === "1") return;
    } catch (_error) {
      // Counting still works when sessionStorage is unavailable.
    }

    try {
      await rpc("record_app_usage_v1", { p_app_key: appKey });
      try {
        sessionStorage.setItem(sessionKey, "1");
      } catch (_error) {
        // The server count succeeded; storage failure must not affect the app.
      }
    } catch (_error) {
      // Usage counting is best-effort and must never block the app.
    }
  }

  async function renderTotals(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;

    try {
      const rows = await rpc("get_app_usage_totals_v1");
      const totals = { SEATING: 0, HANJA: 0 };

      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = String(row?.app_key || "").toUpperCase();
        if (!ALLOWED_APPS.has(key)) return;
        const count = Number(row?.launch_count);
        if (Number.isSafeInteger(count) && count >= 0) {
          totals[key] = count;
        }
      });

      target.textContent =
        "누적 실행 · 자리배치 " +
        totals.SEATING.toLocaleString("ko-KR") +
        "회 · 한자 " +
        totals.HANJA.toLocaleString("ko-KR") +
        "회";
      target.hidden = false;
    } catch (_error) {
      target.hidden = true;
    }
  }

  if (usageApp) {
    recordLaunch(usageApp);
  }

  if (displayTargetId) {
    renderTotals(displayTargetId);
  }
})();
