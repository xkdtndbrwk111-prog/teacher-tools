"use strict";

// Teacher Tools Hub — Feedback transport adapter.
// Separates the ported Project B board UI/state from its host:
// - public reads: browser -> Supabase public RPC / registry (publishable key);
// - authenticated reads + mutations: Project B session bridge.
// The browser never supplies actor/author/owner identity or any secret.
(() => {
  // TEST qualification: Hub and Project B read the same TEST dataset.
  const CONFIG = Object.freeze({
    environment: "TEST",
    supabaseUrl: "https://gjvmnzldisachojkdmid.supabase.co",
    publishableKey: "sb_publishable_DoNpsinAl8cUUOb7pKE37A_Efsu6Xk9",
    requestTimeoutMs: 15000
  });

  async function publicFetch(path, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);
    try {
      const res = await fetch(CONFIG.supabaseUrl + path, Object.assign({
        mode: "cors",
        cache: "no-store",
        signal: controller.signal
      }, init));
      const raw = await res.text();
      if (!res.ok) {
        throw new Error("FEEDBACK_SUPABASE_READ_" + res.status);
      }
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error("FEEDBACK_SUPABASE_JSON_INVALID");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  function rpc(fn, payload) {
    return publicFetch("/rest/v1/rpc/" + encodeURIComponent(fn), {
      method: "POST",
      headers: {
        apikey: CONFIG.publishableKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload || {})
    });
  }

  // ---------- Product registry (feedback_products) ----------
  let registry = null;
  let registryPromise = null;

  function buildRegistry(rows) {
    const byKey = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = String(row && row.product_key || "");
      const name = String(row && row.display_name || "").trim();
      if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(key) || !name) return;
      byKey.set(key, Object.freeze({
        key,
        displayName: name,
        sortOrder: Number(row.sort_order) || 0,
        active: row.active === true
      }));
    });
    const all = Array.from(byKey.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
    return Object.freeze({
      all: Object.freeze(all),
      active: Object.freeze(all.filter(item => item.active)),
      get: key => byKey.get(String(key || "")) || null
    });
  }

  function loadProducts(force) {
    if (registry && !force) return Promise.resolve(registry);
    if (registryPromise) return registryPromise;
    registryPromise = publicFetch(
      "/rest/v1/feedback_products" +
        "?select=product_key,display_name,sort_order,active" +
        "&order=sort_order.asc",
      {
        method: "GET",
        headers: { apikey: CONFIG.publishableKey, Accept: "application/json" }
      }
    ).then(rows => {
      registry = buildRegistry(rows);
      return registry;
    }).finally(() => {
      registryPromise = null;
    });
    return registryPromise;
  }

  // ---------- Bridge ----------
  function bridge() {
    return window.TeacherToolsFeedbackAuthBridge || null;
  }

  // Mirrors Project B feedbackMutationIsDeterministicV3_: a FEEDBACK_* code
  // other than transport-unknown means the server answered deterministically.
  const UNKNOWN_CODES = new Set([
    "FEEDBACK_MUTATION_TRANSPORT_UNKNOWN",
    "FEEDBACK_BRIDGE_TIMEOUT",
    "FEEDBACK_BRIDGE_DISCONNECTED"
  ]);

  function call(op, args, options) {
    const b = bridge();
    if (!b) return Promise.reject(transportError("FEEDBACK_BRIDGE_NOT_CONNECTED"));
    return b.call(op, args, options).catch(code => {
      throw transportError(String(code || "FEEDBACK_MUTATION_TRANSPORT_UNKNOWN"));
    });
  }

  function transportError(code) {
    const err = new Error(code);
    err.deterministic = /^FEEDBACK_[A-Z0-9_]+$/.test(code) && !UNKNOWN_CODES.has(code);
    err.unknownResult = !err.deterministic;
    return err;
  }

  window.TeacherToolsFeedbackTransport = Object.freeze({
    config: CONFIG,
    rpc,
    loadProducts,
    call,
    bridge
  });
})();
