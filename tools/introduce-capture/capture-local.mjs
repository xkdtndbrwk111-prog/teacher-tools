/*
 * 실제 로컬 프로그램을 격리된 Chromium 프로필에서 촬영한다.
 * 이 파일은 전시관 자산을 만드는 도구일 뿐, 제품 동작을 바꾸지 않는다.
 * 실행: node tools/introduce-capture/capture-local.mjs http://127.0.0.1:4173
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const base = process.argv[2] || "http://127.0.0.1:4173";
const assets = path.join(root, "introduce", "assets");
// 실학생과 혼동되지 않도록, 촬영용 명단은 한국 역사 인물 이름만 사용한다.
const virtualNames = ["세종", "이순신", "신사임당", "장영실", "허준", "유관순", "김구", "안중근", "정약용", "광개토대왕"];

async function shot(page, relative) {
  const destination = path.join(assets, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await page.screenshot({ path: destination, type: "png" });
  console.log(`CAPTURED ${relative}`);
  return destination;
}

async function seedClassroom(page) {
  await page.goto(`${base}/seating/?section=seating`, { waitUntil: "domcontentloaded" });
  await page.locator("#modeClassroom").waitFor({ state: "visible" });
  await page.locator("#studentCards .student-card").first().waitFor();
  // 이 컨텍스트에서만 쓰는 앱의 기존 저장 API로 예시 데이터를 바꾼다.
  // 캡처 이후 화면은 같은 제품 UI이며, 운영·실사용 명단에는 전혀 쓰지 않는다.
  await page.evaluate((names) => {
    classState.students.forEach((student, index) => {
      student.name = names[index] || `역사인물 ${index + 1}`;
      student.gender = index % 2 ? "female" : "male";
    });
    saveState();
    const stage = window.__TT_STAGE031_CLASS;
    const registry = JSON.parse(window.__TT_STORE.getItem(stage.registryKey));
    const current = registry.classes.find(item => item.id === stage.activeId);
    if (current) current.name = "6학년 1반";
    window.__TT_STORE.setItem(stage.registryKey, JSON.stringify(registry));
  }, virtualNames);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#tt-ui2-open-seating").waitFor({ state: "visible" });
  // 앱의 시작 카드가 같은 UI 액션으로 노출하는 작업 공간을 연다.
  await page.evaluate(() => document.getElementById("tt-ui2-open-seating").click());
  await page.locator("#studentCards .student-card").first().waitFor();
}

async function classroom(page) {
  await seedClassroom(page);
  await shot(page, "classroom/classroom-roster.png");

  await page.evaluate(() => document.querySelector('.dock-tab[data-tab="rules"]').click());
  await page.locator('.dock-panel[data-panel="rules"] input').first().waitFor();
  await shot(page, "classroom/classroom-rules.png");

  await page.evaluate(() => document.getElementById("modePE").click());
  await page.locator("#peBoard").waitFor();
  await page.evaluate(() => document.querySelector('[data-team-count="4"]').click());
  await shot(page, "classroom/classroom-pe.png");

  await page.evaluate(() => document.getElementById("tt-grade-tab").click());
  const grade = page.frameLocator(".tt-grade-iframe");
  await grade.locator('.nav[data-page="assessments"]').waitFor();
  await grade.locator('.nav[data-page="assessments"]').click();
  await shot(page, "classroom/classroom-grades.png");

  await page.evaluate(() => document.getElementById("tt-board-tab").click());
  await page.locator("#tt-board-root").waitFor();
  await shot(page, "classroom/classroom-board-link.png");
}

async function hanja(page) {
  await page.goto(`${base}/hanja/`, { waitUntil: "domcontentloaded" });
  await page.locator("#entryForm").waitFor();
  const entries = [["山", "메 산", "산"], ["水", "물 수", "수"], ["火", "불 화", "화"], ["木", "나무 목", "목"]];
  for (const [hanzi, meaning, reading] of entries) {
    await page.locator("#hanzi").fill(hanzi);
    await page.locator("#meaning").fill(meaning);
    await page.locator("#reading").fill(reading);
    await page.locator("#entryForm button[type=submit]").click();
  }
  await shot(page, "hanja/hanja-characters.png");
  await page.locator('[data-type="word"]').click();
  for (const [hanzi, meaning, reading] of [["山水", "산과 물", "산수"], ["火山", "불을 뿜는 산", "화산"]]) {
    await page.locator("#hanzi").fill(hanzi);
    await page.locator("#meaning").fill(meaning);
    await page.locator("#reading").fill(reading);
    await page.locator("#entryForm button[type=submit]").click();
  }
  await shot(page, "hanja/hanja-words.png");
  await page.locator('[data-panel="questions"]').click();
  await page.locator("#target").selectOption("single");
  await page.locator("#perStudent").fill("2");
  await shot(page, "hanja/hanja-question-manager.png");
  await page.locator(".hanja-student").first().click();
  await page.locator("#start").click();
  await page.locator("#game").waitFor({ state: "visible" });
  await shot(page, "hanja/hanja-question-play.png");
}

async function run() {
  await fs.mkdir(assets, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await classroom(page);
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await hanja(page);
    if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
