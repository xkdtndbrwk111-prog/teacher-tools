"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "introduce/data.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: "introduce/data.js" });
const { PRODUCTS, NODES, EDGES, ONE_MORE } = sandbox.window.EXHIBIT_DATA;
const products = new Map(PRODUCTS.map((p) => [p.id, p]));
const nodes = new Map(NODES.map((n) => [n.id, n]));

test("product sequence and independent Hoja Quiz are preserved", () => {
  assert.deepEqual(Array.from(PRODUCTS, (p) => p.id), ["mini", "board", "class", "hanja", "quiz"]);
  assert.equal(products.get("quiz").island, true);
  assert.equal(products.get("board").launch.url, null);
  assert.equal(products.get("board").linked, true);
  assert.equal(EDGES.filter((e) => nodes.get(e.from).product === "quiz" || nodes.get(e.to).product === "quiz").length, 0);
});

test("nodes have unique IDs, valid ownership, positions and real local media", () => {
  assert.equal(nodes.size, NODES.length);
  for (const n of NODES) {
    assert.ok(products.has(n.product), n.id);
    assert.equal(n.grid.col, PRODUCTS.findIndex((p) => p.id === n.product), n.id);
    assert.ok(Number.isFinite(n.grid.row) && n.grid.row >= 0, n.id);
    assert.ok(Array.isArray(n.usage), n.id);
  }
  for (const p of PRODUCTS) {
    assert.ok(nodes.has(p.id === "quiz" ? "quiz.arcade" : p.id + ".hero"), p.id);
    for (const key of ["poster", "video"]) {
      if (!p.media[key]) continue;
      const target = path.resolve(root, "introduce", p.media[key]);
      assert.ok(target.startsWith(root + path.sep), "outside repository: " + target);
      assert.ok(fs.existsSync(target), "missing asset: " + target);
    }
  }
});

test("link directions agree with runtime; each connection has real endpoints", () => {
  const expected = {
    "e.coin": ["board.coins", "mini.coins"],
    "e.roster.board": ["class.roster", "board.roster"],
    "e.theme.board": ["board.theme", "class.theme"],
    "e.roster.hanja": ["class.roster", "hanja.roster"]
  };
  assert.deepEqual(Array.from(EDGES, (e) => e.id).sort(), Object.keys(expected).sort());
  for (const e of EDGES) {
    assert.ok(nodes.has(e.from) && nodes.has(e.to), e.id);
    assert.deepEqual([e.from, e.to], expected[e.id], e.id);
  }
  for (const o of Object.values(ONE_MORE)) assert.ok(nodes.has(o.target));
});

test("hub points to exhibition without enabling launch metrics or installer", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const intro = fs.readFileSync(path.join(root, "introduce/index.html"), "utf8");
  const config = fs.readFileSync(path.join(root, "launch-metrics-config.js"), "utf8");
  assert.match(html, /href="\.\/introduce\/"/);
  assert.match(intro, /data\.js\?v=/);
  assert.match(intro, /introduce\.js\?v=/);
  assert.match(config, /enabled:\s*false/);
  assert.equal(products.get("board").launch.url, null);
});
