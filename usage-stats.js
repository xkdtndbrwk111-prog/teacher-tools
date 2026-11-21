"use strict";

(() => {
  // Public-launch preparation: OFF by default. Absolutely no RPC, UI or
  // counter increment is allowed before the owner's launch-day approval.
  if (window.TT_LAUNCH_METRICS?.enabled !== true) return;
  if (location.hostname !== "xkdtndbrwk111-prog.github.io") return;
  if (new URLSearchParams(location.search).get("view") === "board") return;

  const CONFIG = Object.freeze({
    url: "https://rhtyktjebiunkchddxvg.supabase.co",
    publishableKey: "sb_publishable_SD1BpBEMqvj3Qv34ymUNFw_sqrgLwao",
    requestTimeoutMs: 8000
  });
  const script = document.currentScript;
  const app = String(script?.dataset.usageApp || "").toUpperCase();
  const displayTargetId = String(script?.dataset.usageDisplay || "");

  async function rpc(name, payload = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CONFIG.requestTimeoutMs);
    try {
      const r = await fetch(CONFIG.url + "/rest/v1/rpc/" + encodeURIComponent(name), {
        method: "POST", mode: "cors", cache: "no-store", keepalive: true,
        signal: abort.signal,
        headers: {apikey: CONFIG.publishableKey, "Content-Type": "application/json", Accept: "application/json"},
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error("LAUNCH_METRIC_HTTP_" + r.status);
      const text = await r.text();
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function sendMetric(metric) {
    // Allowed only after both the site launch flag and server flag/grants
    // have been separately activated. Never allow browser reports for updates.
    if (metric !== "classroom_visit" && metric !== "hoja_download") return false;
    try { return await rpc("record_public_launch_v2", {p_metric: metric}) === true; }
    catch { return false; } // Statistics must never break a classroom tool.
  }

  async function recordClassroomVisit() {
    const key = "teacher-tools.launch-metrics.v2.classroom.session";
    try { if (sessionStorage.getItem(key) === "1") return; } catch {}
    if (await sendMetric("classroom_visit")) {
      try { sessionStorage.setItem(key, "1"); } catch {}
    }
  }

  // Called only by the official Hoja Board download card when the final
  // installer URL exists. This records a request, not a verified file transfer.
  window.TTLaunchMetrics = Object.freeze({
    recordOfficialDownload: () => sendMetric("hoja_download")
  });

  function safeCount(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n.toLocaleString("ko-KR") : "0";
  }

  async function renderLaunchCounters() {
    const target = document.getElementById(displayTargetId);
    if (!target) return;
    try {
      const result = await rpc("get_launch_metrics_v2");
      const metrics = Array.isArray(result) ? result[0] : result;
      if (!metrics?.enabled) return; // Hidden until launch in BOTH systems.
      target.textContent =
        "교실매니저 TODAY " + safeCount(metrics.classroom_today) +
        " · TOTAL " + safeCount(metrics.classroom_total) +
        " | 호자보드 다운로드 " + safeCount(metrics.hoja_downloads) +
        " · 자동 업데이트 " + safeCount(metrics.hoja_updates);
      target.hidden = false;
    } catch { target.hidden = true; }
  }

  if (app === "SEATING") recordClassroomVisit();
  // Legacy HANJA usage is intentionally NOT carried into launch metrics.
  if (displayTargetId) renderLaunchCounters();
})();
