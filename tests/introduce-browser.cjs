"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { chromium } = require("playwright");

(async () => {
  const root = path.join(__dirname, "..");
  const port = 18875;
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", root], { stdio: "ignore" });
  const base = `http://127.0.0.1:${port}/introduce/`;
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (server.exitCode !== null) throw new Error("HTTP server exited early");
      try { const r = await fetch(base); if (r.ok) { ready = true; break; } } catch (_) {}
      await delay(100);
    }
    assert.ok(ready, "local preview server did not start");
    browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".node").first().waitFor();
    assert.equal(await page.locator(".region").count(), 5);
    assert.equal(await page.locator(".edge-badge").count(), 4);
    assert.ok(await page.locator(".node").count() >= 25);
    assert.equal(await page.locator(".orbit-card").count(), 5);
    assert.ok((await page.locator(".edge-badge[data-edge='e.theme.board']").getAttribute("title")).includes("교실매니저가 호자보드의 테마"));
    assert.equal(await page.locator(".topnav-list a[data-nav]").count(), 6);

    // Direct deep link must open the correct feature without a page reload.
    await page.goto(base + "#/node/class.theme", { waitUntil: "domcontentloaded" });
    await page.locator("#detail.is-open").waitFor({ timeout: 10000 });
    assert.ok((await page.locator("#detail").innerText()).includes("호자보드의 테마를 가져오고"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.getElementById("detail").hidden, { timeout: 10000 });
    await page.goto(base + "#/product/board", { waitUntil: "domcontentloaded" });
    await page.locator("#product-board").waitFor();
    assert.equal(await page.locator(".topnav-list a[data-nav='board']").getAttribute("aria-current"), "true");

    // Narrow viewport and motion-reduced fallback must keep the document usable.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".node").first().waitFor();
    const bounds = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      mapWidth: document.getElementById("viewport").clientWidth
    }));
    assert.ok(bounds.documentWidth <= bounds.viewportWidth + 1, "mobile horizontal overflow: " + JSON.stringify(bounds));
    assert.ok(bounds.mapWidth > 200);
    await page.goto(base + "#/node/mini.coins", { waitUntil: "domcontentloaded" });
    await page.locator("#detail.is-open").waitFor({ timeout: 10000 });
    assert.ok((await page.locator("#detail").innerText()).includes("호자보드"));
    assert.deepEqual(pageErrors, []);
    console.log("Exhibition browser smoke PASS (desktop, deep links, detail, mobile, reduced motion)");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
