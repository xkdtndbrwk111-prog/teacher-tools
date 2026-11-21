/* 역사보리꼬리 공작소 — 도구 전시관 (Vanilla JS, 의존성 없음) */
(function () {
  "use strict";

  const { PRODUCTS, NODES, EDGES, ONE_MORE } = window.EXHIBIT_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const productById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const nodesOf = (pid) => NODES.filter((n) => n.product === pid).sort((a, b) => a.grid.row - b.grid.row);
  const edgesOf = (nid) => EDGES.filter((e) => e.from === nid || e.to === nid);

  /* ── 레이아웃 상수 ───────────────────────────── */
  const L = { PAD: 90, TOP: 150, COLW: 470, ISLAND_GAP: 120, HERO_GAP: 150, ROW: 104, NUDGE: 30 };
  const colX = (col) => L.PAD + col * L.COLW + (col >= 4 ? L.ISLAND_GAP : 0);

  /* ── 내비게이션 ──────────────────────────────── */
  const navList = $("#navList");
  PRODUCTS.forEach((p) => {
    const li = el("li");
    li.innerHTML = `<a href="#/product/${p.id}" data-nav="${p.id}" style="--accent:${p.color}">${esc(p.navName)}</a>`;
    navList.appendChild(li);
  });
  function setActiveNav(id) {
    navList.querySelectorAll("a").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === id ? "true" : "false"));
    const cur = navList.querySelector(`a[data-nav="${id}"]`);
    if (cur && navList.scrollWidth > navList.clientWidth) cur.scrollIntoView({ block: "nearest", inline: "center" });
  }

  /* ── 기능 지도 렌더링 ────────────────────────── */
  const viewport = $("#viewport");
  const world = $("#world");
  const nodesLayer = $("#nodes");
  const svg = $("#edges");
  const SVGNS = "http://www.w3.org/2000/svg";
  const nodeEls = {};
  const geo = {}; // id → {x,y,w,h}
  let WORLD = { w: 0, h: 0 };
  const regions = {};

  function renderMap() {
    // 영역(제품 배경)
    PRODUCTS.forEach((p) => {
      const r = el("div", "region" + (p.island ? " is-island" : ""));
      r.style.setProperty("--accent", p.color);
      r.innerHTML = `<div class="region-label">${esc(p.name)}<small>${p.island ? "독립 프로그램" : "단독 사용 · 연동 선택"}</small></div>`;
      nodesLayer.appendChild(r);
      regions[p.id] = { el: r };
    });

    // 노드
    const ported = {};
    EDGES.forEach((e) => { ported[e.from] = true; ported[e.to] = true; });
    NODES.forEach((n) => {
      const p = productById[n.product];
      const b = el("button", "node" + (n.size === "hero" ? " is-hero" : "") + (ported[n.id] ? " is-linked" : ""));
      b.type = "button";
      b.dataset.id = n.id;
      b.style.setProperty("--accent", p.color);
      b.innerHTML =
        (n.size === "hero" ? `<span class="node-kicker">${esc(p.name)}</span>` : "") +
        `<span class="node-title">${esc(n.title)}</span><span class="node-sum">${esc(n.summary)}</span>`;
      b.setAttribute("aria-label", `${p.name}: ${n.title}. ${n.summary}`);
      nodesLayer.appendChild(b);
      nodeEls[n.id] = b;
    });
  }

  function layoutMap() {
    NODES.forEach((n) => {
      const b = nodeEls[n.id];
      const w = b.offsetWidth;
      const x = colX(n.grid.col) + (L.COLW - w) / 2 + n.grid.x * L.NUDGE;
      const y = L.TOP + (n.grid.row === 0 ? 0 : L.HERO_GAP + (n.grid.row - 1) * L.ROW);
      b.style.left = x + "px";
      b.style.top = y + "px";
      geo[n.id] = { x, y, w, h: b.offsetHeight };
    });
    let maxB = 0;
    PRODUCTS.forEach((p) => {
      const g = nodesOf(p.id).map((n) => geo[n.id]);
      const minX = Math.min(...g.map((r) => r.x)) - 28;
      const maxX = Math.max(...g.map((r) => r.x + r.w)) + 28;
      const minY = Math.min(...g.map((r) => r.y)) - 28;
      const maxY = Math.max(...g.map((r) => r.y + r.h)) + 28;
      Object.assign(regions[p.id], { x: minX, y: minY, w: maxX - minX, h: maxY - minY });
      Object.assign(regions[p.id].el.style, { left: minX + "px", top: minY + "px", width: maxX - minX + "px", height: maxY - minY + "px" });
      maxB = Math.max(maxB, maxY);
    });
    WORLD = { w: colX(4) + L.COLW + L.PAD, h: maxB + L.PAD };
    world.style.width = WORLD.w + "px";
    world.style.height = WORLD.h + "px";
    drawEdges();
  }

  const badgeEls = {};
  function drawEdges() {
    svg.setAttribute("width", WORLD.w);
    svg.setAttribute("height", WORLD.h);
    svg.innerHTML = "";
    nodesLayer.querySelectorAll(".edge-badge, .port").forEach((x) => x.remove());
    const defs = document.createElementNS(SVGNS, "defs");
    svg.appendChild(defs);

    EDGES.forEach((e) => {
      const a = geo[e.from], b = geo[e.to];
      const ca = productById[nodeById[e.from].product].color;
      const cb = productById[nodeById[e.to].product].color;
      const aRight = a.x + a.w / 2 < b.x + b.w / 2;
      const p1 = { x: aRight ? a.x + a.w : a.x, y: a.y + a.h / 2 };
      const p2 = { x: aRight ? b.x : b.x + b.w, y: b.y + b.h / 2 };
      const dx = Math.max(60, Math.abs(p2.x - p1.x) * 0.5) * (aRight ? 1 : -1);
      const c1 = { x: p1.x + dx, y: p1.y }, c2 = { x: p2.x - dx, y: p2.y };
      const d = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;

      const gid = "g-" + e.id.replace(/\W/g, "");
      defs.insertAdjacentHTML("beforeend",
        `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${p1.x}" y1="0" x2="${p2.x}" y2="0">` +
        `<stop offset="0" stop-color="${ca}"/><stop offset="1" stop-color="${cb}"/></linearGradient>` +
        `<marker id="m-${gid}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
        `<path d="M0,0 L10,5 L0,10 z" fill="${cb}"/></marker>`);

      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "edge-group kind-" + e.kind);
      g.dataset.edge = e.id;
      g.innerHTML =
        `<path class="edge-glow" d="${d}" stroke="url(#${gid})"/>` +
        `<path class="edge kind-${e.kind}" d="${d}" stroke="url(#${gid})" ${e.kind === "theme" ? "" : `marker-end="url(#m-${gid})"`}/>` +
        (reduceMotion ? "" : `<path class="edge-flow" d="${d}" stroke="#fff"/>`);
      svg.appendChild(g);

      // 포트
      [[e.from, aRight ? "right" : "left", ca], [e.to, aRight ? "left" : "right", cb]].forEach(([nid, side]) => {
        const r = geo[nid];
        if (nodesLayer.querySelector(`.port[data-n="${nid}"][data-side="${side}"]`)) return;
        const port = el("span", "port " + side);
        port.dataset.n = nid; port.dataset.side = side;
        port.style.setProperty("--accent", productById[nodeById[nid].product].color);
        port.style.left = (side === "left" ? r.x - 7 : r.x + r.w - 5) + "px";
        port.style.top = r.y + r.h / 2 + "px";
        port.style.position = "absolute";
        nodesLayer.appendChild(port);
      });

      // 연결 표시(클릭 시 카메라 이동)
      const mx = 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x;
      const my = 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y;
      const bd = el("button", "edge-badge");
      bd.type = "button";
      bd.dataset.edge = e.id;
      bd.style.left = mx + "px";
      bd.style.top = my + "px";
      bd.style.setProperty("--accent", e.kind === "theme" ? cb : ca);
      const icon = e.kind === "coin" ? "🪙" : e.kind === "theme" ? "🎨" : "👥";
      bd.innerHTML = `${icon} ${esc(e.label)}<span class="arrow">${e.kind === "theme" ? "⇠ 가져오기" : "→"}</span>`;
      bd.title = e.description;
      bd.setAttribute("aria-label", `${e.description}. 눌러서 연결된 기능으로 이동`);
      nodesLayer.appendChild(bd);
      badgeEls[e.id] = bd;
    });
  }

  function lightEdge(eid, on) {
    const e = EDGES.find((x) => x.id === eid);
    if (!e) return;
    nodeEls[e.from].classList.toggle("is-lit", on);
    nodeEls[e.to].classList.toggle("is-lit", on);
    svg.querySelector(`g[data-edge="${eid}"]`)?.classList.toggle("is-hot", on);
  }
  function lightNode(nid, on) {
    edgesOf(nid).forEach((e) => lightEdge(e.id, on));
  }

  /* ── 카메라 ───────────────────────────────────── */
  const cam = { x: 0, y: 0, s: 1 };
  const S_MIN = 0.18, S_MAX = 1.8;
  function applyCam() {
    world.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.s})`;
    const z = cam.s < 0.5 ? "far" : cam.s < 0.95 ? "mid" : "near";
    if (viewport.dataset.zoom !== z) viewport.dataset.zoom = z;
  }
  let animTimer = 0;
  function setCam(x, y, s, animate) {
    cam.s = clamp(s, S_MIN, S_MAX);
    cam.x = x; cam.y = y;
    if (animate && !reduceMotion) {
      world.classList.add("animating");
      clearTimeout(animTimer);
      animTimer = setTimeout(() => world.classList.remove("animating"), 800);
    } else {
      world.classList.remove("animating");
    }
    applyCam();
  }
  function focusRect(r, maxS, animate = true, pad = 40) {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const s = clamp(Math.min((vw - pad * 2) / r.w, (vh - pad * 2) / r.h), S_MIN, maxS);
    setCam(vw / 2 - (r.x + r.w / 2) * s, vh / 2 - (r.y + r.h / 2) * s, s, animate);
  }
  function fitAll(animate = true) {
    // 영역 라벨(위쪽)을 포함하도록 상단 여유
    focusRect({ x: 0, y: L.TOP - 120, w: WORLD.w, h: WORLD.h - L.TOP + 120 }, 1, animate, 16);
  }
  function focusProduct(pid, animate = true) {
    const r = regions[pid];
    // 인접 제품 일부가 보이도록 좌우 여유
    focusRect({ x: r.x - 90, y: r.y - 70, w: r.w + 180, h: r.h + 90 }, 1.15, animate, 10);
    setChip(pid);
  }
  function focusNode(nid, animate = true) {
    const g = geo[nid];
    focusRect({ x: g.x - 120, y: g.y - 90, w: g.w + 240, h: g.h + 180 }, 1.35, animate);
    setChip(nodeById[nid].product);
  }
  function zoomAt(factor, px, py, animate) {
    const s2 = clamp(cam.s * factor, S_MIN, S_MAX);
    const k = s2 / cam.s;
    setCam(px - (px - cam.x) * k, py - (py - cam.y) * k, s2, animate);
  }

  // 지도 칩
  const chips = $("#mapChips");
  PRODUCTS.forEach((p) => {
    const b = el("button", null, `<i></i>${esc(p.name)}`);
    b.type = "button";
    b.dataset.p = p.id;
    b.style.setProperty("--accent", p.color);
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => focusProduct(p.id));
    chips.appendChild(b);
  });
  function setChip(pid) {
    chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === pid ? "true" : "false"));
  }
  $("#zoomIn").addEventListener("click", () => zoomAt(1.3, viewport.clientWidth / 2, viewport.clientHeight / 2, true));
  $("#zoomOut").addEventListener("click", () => zoomAt(1 / 1.3, viewport.clientWidth / 2, viewport.clientHeight / 2, true));
  $("#zoomFit").addEventListener("click", () => { fitAll(); setChip(null); });

  // 드래그·핀치 (포인터 이벤트)
  const pointers = new Map();
  let drag = null, moved = false, pinch = null;
  viewport.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    world.classList.remove("animating");
    if (pointers.size === 1) {
      drag = { sx: ev.clientX, sy: ev.clientY, cx: cam.x, cy: cam.y, id: ev.pointerId };
      moved = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s };
      drag = null;
    }
  });
  viewport.addEventListener("pointermove", (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const rect = viewport.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - rect.left, my = (a.y + b.y) / 2 - rect.top;
      const target = pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
      zoomAt(target / cam.s, mx, my, false);
      moved = true;
      return;
    }
    if (!drag) return;
    const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if (!moved && Math.hypot(dx, dy) > 5) {
      moved = true;
      viewport.classList.add("dragging");
      try { viewport.setPointerCapture(ev.pointerId); } catch (_) {}
    }
    if (moved) setCam(drag.cx + dx, drag.cy + dy, cam.s, false);
  });
  const endPointer = (ev) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { drag = null; viewport.classList.remove("dragging"); }
  };
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);
  // 드래그 직후의 클릭은 무시
  viewport.addEventListener("click", (ev) => { if (moved) { ev.stopPropagation(); ev.preventDefault(); moved = false; } }, true);

  // 휠: 일반 스크롤은 페이지로 넘기고, Ctrl/⌘(+트랙패드 핀치)일 때만 확대
  const hint = $("#mapHint");
  if (/Mac|iPhone|iPad/.test(navigator.platform)) hint.innerHTML = hint.innerHTML.replace("<kbd>Ctrl</kbd>/", "");
  viewport.addEventListener("wheel", (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-ev.deltaY * 0.0022), ev.clientX - rect.left, ev.clientY - rect.top, false);
  }, { passive: false });

  // 키보드
  viewport.addEventListener("keydown", (ev) => {
    const k = ev.key, step = 90;
    const cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2;
    if (k === "ArrowLeft") setCam(cam.x + step, cam.y, cam.s, true);
    else if (k === "ArrowRight") setCam(cam.x - step, cam.y, cam.s, true);
    else if (k === "ArrowUp") setCam(cam.x, cam.y + step, cam.s, true);
    else if (k === "ArrowDown") setCam(cam.x, cam.y - step, cam.s, true);
    else if (k === "+" || k === "=") zoomAt(1.3, cx, cy, true);
    else if (k === "-" || k === "_") zoomAt(1 / 1.3, cx, cy, true);
    else if (k === "0") fitAll();
    else return;
    ev.preventDefault();
  });
  // 노드에 키보드 포커스가 가면 카메라가 따라감
  nodesLayer.addEventListener("focusin", (ev) => {
    const b = ev.target.closest(".node");
    if (b && !viewport.matches(":hover") && ev.target.matches(":focus-visible")) focusNode(b.dataset.id);
  });

  // 노드·연결 표시 상호작용
  nodesLayer.addEventListener("click", (ev) => {
    const badge = ev.target.closest(".edge-badge");
    if (badge) {
      const e = EDGES.find((x) => x.id === badge.dataset.edge);
      // 현재 화면 중심에서 더 먼 쪽 끝으로 이동
      const center = { x: (viewport.clientWidth / 2 - cam.x) / cam.s, y: (viewport.clientHeight / 2 - cam.y) / cam.s };
      const dist = (id) => { const g = geo[id]; return Math.hypot(g.x + g.w / 2 - center.x, g.y + g.h / 2 - center.y); };
      const target = dist(e.to) >= dist(e.from) ? e.to : e.from;
      focusNode(target);
      pulse(target);
      return;
    }
    const node = ev.target.closest(".node");
    if (node) go("#/node/" + node.dataset.id);
  });
  nodesLayer.addEventListener("pointerover", (ev) => {
    const badge = ev.target.closest(".edge-badge");
    if (badge) lightEdge(badge.dataset.edge, true);
    const node = ev.target.closest(".node");
    if (node) lightNode(node.dataset.id, true);
  });
  nodesLayer.addEventListener("pointerout", (ev) => {
    const badge = ev.target.closest(".edge-badge");
    if (badge) lightEdge(badge.dataset.edge, false);
    const node = ev.target.closest(".node");
    if (node) lightNode(node.dataset.id, false);
  });
  nodesLayer.addEventListener("focusin", (ev) => { const b = ev.target.closest(".edge-badge"); if (b) lightEdge(b.dataset.edge, true); });
  nodesLayer.addEventListener("focusout", (ev) => { const b = ev.target.closest(".edge-badge"); if (b) lightEdge(b.dataset.edge, false); });

  function pulse(nid) {
    const b = nodeEls[nid];
    b.classList.add("is-lit");
    setTimeout(() => b.classList.remove("is-lit"), 1600);
  }

  /* ── 기능 상세 ─────────────────────────────────── */
  const detail = $("#detail");
  const card = $("#detailCard");
  const track = $("#detailTrack");
  let dPages = [], dIndex = 0, lastFocus = null;

  function mediaHTML(n, active) {
    const p = productById[n.product];
    const m = n.media || p.media;
    const cap = n.media ? "" : `<figcaption>${esc(p.name)} 대표 화면</figcaption>`;
    if (m.video) {
      return `<video ${active ? `src="${m.video}" autoplay` : `data-src="${m.video}"`} poster="${m.poster}" muted loop playsinline preload="none"></video>${cap}`;
    }
    return `<img src="${m.poster}" alt="${esc(p.name)} 화면" loading="lazy" decoding="async">${cap}`;
  }
  function pageHTML(n, active) {
    const p = productById[n.product];
    const links = edgesOf(n.id).map((e) => {
      const other = e.from === n.id ? e.to : e.from;
      const o = nodeById[other];
      const dir = e.kind === "theme"
        ? (e.to === n.id ? "테마를 가져옴 ←" : "테마를 제공 →")
        : (e.from === n.id ? "보내기 →" : "받기 ←");
      return `<button type="button" data-go="${other}" style="--accent:${productById[o.product].color}">${esc(productById[o.product].name)} · ${esc(o.title)} <small>(${dir})</small></button>`;
    }).join("");
    const launch = n.launch || p.launch;
    const launchBtn = launch.url
      ? `<a class="btn-launch" href="${launch.url}" target="_blank" rel="noopener">${esc(launch.label)} ↗</a>`
      : `<span class="btn-launch" aria-disabled="true">${esc(launch.label)}</span>`;
    return `<article class="detail-page" data-id="${n.id}" style="--accent:${p.color}" aria-label="${esc(n.title)}">
      <figure class="detail-media" style="margin:0">${mediaHTML(n, active)}</figure>
      <div class="detail-body">
        <p class="detail-kicker">${esc(p.name)}</p>
        <h3 ${active ? 'id="detailTitle"' : ""}>${esc(n.title)}</h3>
        <p class="lead">${esc(n.summary)}</p>
        ${n.situation ? `<h4>이럴 때 활용해요</h4><p style="margin:0">${esc(n.situation)}</p>` : ""}
        ${n.usage.length ? `<h4>사용 방법</h4><ul>${n.usage.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
        ${links ? `<h4>연결된 기능 (선택 연동)</h4><div class="detail-links">${links}</div>` : ""}
        <div class="detail-actions">${launchBtn}</div>
      </div>
    </article>`;
  }

  function openDetail(nid) {
    const n = nodeById[nid];
    if (!n) return;
    const wasOpen = !detail.hidden;
    dPages = nodesOf(n.product);
    dIndex = dPages.findIndex((x) => x.id === nid);
    track.innerHTML = dPages.map((x, i) => pageHTML(x, i === dIndex)).join("");
    card.style.setProperty("--accent", productById[n.product].color);
    if (!wasOpen) {
      lastFocus = document.activeElement;
      detail.hidden = false;
      // 노드 위치에서 카드가 펼쳐지는 느낌
      const nb = nodeEls[nid].getBoundingClientRect();
      const cb = card.getBoundingClientRect();
      card.style.setProperty("--ox", nb.left + nb.width / 2 - cb.left + "px");
      card.style.setProperty("--oy", nb.top + nb.height / 2 - cb.top + "px");
      void card.offsetWidth;
      detail.classList.add("is-open");
      document.body.style.overflow = "hidden";
      setTimeout(() => $("#detailClose").focus({ preventScroll: true }), 60);
    }
    track.scrollTo({ left: dIndex * track.clientWidth, behavior: "instant" });
    updatePager();
    setActiveNav(n.product);
  }
  function closeDetail() {
    if (detail.hidden) return;
    detail.classList.remove("is-open");
    document.body.style.overflow = "";
    track.querySelectorAll("video").forEach((v) => v.pause());
    setTimeout(() => { detail.hidden = true; track.innerHTML = ""; }, reduceMotion ? 0 : 450);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function updatePager() {
    $("#detailCount").textContent = `${dIndex + 1} / ${dPages.length}`;
    $("#detailPrev").disabled = dIndex === 0;
    $("#detailNext").disabled = dIndex === dPages.length - 1;
    track.querySelectorAll(".detail-page").forEach((pg, i) => {
      const v = pg.querySelector("video");
      if (!v) return;
      if (Math.abs(i - dIndex) <= 1 && v.dataset.src) { v.src = v.dataset.src; delete v.dataset.src; }
      if (i === dIndex) v.play().catch(() => {}); else v.pause();
    });
  }
  function showPage(i) {
    dIndex = clamp(i, 0, dPages.length - 1);
    track.scrollTo({ left: dIndex * track.clientWidth, behavior: reduceMotion ? "instant" : "smooth" });
  }
  let scrollT = 0;
  track.addEventListener("scroll", () => {
    clearTimeout(scrollT);
    scrollT = setTimeout(() => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i !== dIndex || location.hash !== "#/node/" + dPages[i].id) {
        dIndex = i;
        updatePager();
        history.replaceState(null, "", "#/node/" + dPages[i].id);
        focusNode(dPages[i].id, false);
      }
    }, 120);
  });
  $("#detailPrev").addEventListener("click", () => showPage(dIndex - 1));
  $("#detailNext").addEventListener("click", () => showPage(dIndex + 1));
  $("#detailClose").addEventListener("click", () => go("#/map"));
  detail.addEventListener("click", (ev) => {
    if (ev.target === detail) { go("#/map"); return; }
    const b = ev.target.closest("[data-go]");
    if (b) jumpToNode(b.dataset.go);
  });
  document.addEventListener("keydown", (ev) => {
    if (detail.hidden) return;
    if (ev.key === "Escape") go("#/map");
    else if (ev.key === "ArrowLeft") showPage(dIndex - 1);
    else if (ev.key === "ArrowRight") showPage(dIndex + 1);
    else if (ev.key === "Tab") {
      const f = [...card.querySelectorAll("button:not([disabled]), a[href]")].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (ev.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); ev.preventDefault(); }
      else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); ev.preventDefault(); }
    }
  });

  // 다른 프로그램의 연결 기능으로: 상세를 닫고 → 카메라가 지도 위로 이동 → 도착한 노드 열기
  function jumpToNode(nid) {
    closeDetail();
    scrollToMap();
    setTimeout(() => {
      focusNode(nid);
      pulse(nid);
      setTimeout(() => go("#/node/" + nid), reduceMotion ? 0 : 850);
    }, reduceMotion ? 0 : 380);
  }

  /* ── 제품 소개 + One More Thing ─────────────────── */
  const productsRoot = $("#products");
  PRODUCTS.forEach((p) => {
    const hero = nodesOf(p.id).find((n) => n.size === "hero");
    const feats = nodesOf(p.id).filter((n) => n.size !== "hero");
    const sec = el("section", "product");
    sec.id = "product-" + p.id;
    sec.dataset.product = p.id;
    sec.style.setProperty("--accent", p.color);
    const m = p.media;
    const media = m.video
      ? `<video data-src="${m.video}" poster="${m.poster}" muted loop playsinline preload="none" aria-label="${esc(p.name)} 화면 미리보기"></video>`
      : `<img src="${m.poster}" alt="${esc(p.name)} 화면" loading="lazy" decoding="async">`;
    const launch = p.launch.url
      ? `<a class="btn-launch" href="${p.launch.url}" target="_blank" rel="noopener">${esc(p.launch.label)} ↗</a>`
      : `<span class="btn-launch" aria-disabled="true">${esc(p.launch.label)}</span>`;
    let omt = "";
    const o = ONE_MORE[p.id];
    if (o) {
      const tp = productById[nodeById[o.target].product];
      omt = `<div class="omt" style="--accent:${tp.color}">
        <p class="omt-eyebrow">One more thing</p>
        ${o.lines.map((l) => `<p class="omt-line">${esc(l)}</p>`).join("")}
        <div class="omt-link" style="--a1:${p.color};--a2:${tp.color}">
          <span class="omt-pill" style="--a:${p.color}">${esc(p.name)}</span><span class="omt-wire"></span><span class="omt-pill" style="--a:${tp.color}">${esc(tp.name)}</span>
        </div>
        <a class="btn-launch" href="#/node/${o.target}">${esc(o.cta)} →</a>
      </div>`;
    }
    sec.innerHTML = `
      <p class="product-kicker">${esc(p.name)}</p>
      <h2>${esc(hero.title)}</h2>
      <p class="product-tag">${esc(p.tagline)}</p>
      <div class="product-media">${media}</div>
      <ul class="product-feats">${feats.map((n) => `<li><button type="button" data-node="${n.id}"><strong>${esc(n.title)}</strong><span>${esc(n.summary)}</span></button></li>`).join("")}</ul>
      <div class="product-actions">${launch}<button type="button" class="btn-ghost" data-mapfocus="${p.id}">기능 지도에서 보기</button></div>
      <p class="standalone-note">${p.island ? "다른 프로그램과 데이터를 주고받지 않는 독립 프로그램입니다." : "단독으로 사용할 수 있습니다. 다른 프로그램과의 연동은 선택 사항입니다."}</p>
      ${omt}`;
    productsRoot.appendChild(sec);
  });
  productsRoot.addEventListener("click", (ev) => {
    const f = ev.target.closest("[data-node]");
    if (f) { go("#/node/" + f.dataset.node); return; }
    const mf = ev.target.closest("[data-mapfocus]");
    if (mf) { scrollToMap(); setTimeout(() => focusProduct(mf.dataset.mapfocus), 300); }
  });

  // 등장 효과·영상 지연 로딩·활성 내비
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const t = en.target;
      if (t.matches(".product-feats li, .omt")) { if (en.isIntersecting) t.classList.add("in"); return; }
      if (t.tagName === "VIDEO") {
        if (en.isIntersecting) { if (t.dataset.src) { t.src = t.dataset.src; delete t.dataset.src; } t.play().catch(() => {}); }
        else t.pause();
      }
    });
  }, { threshold: 0.25 });
  productsRoot.querySelectorAll(".product-feats li, .omt, video").forEach((x) => io.observe(x));
  productsRoot.querySelectorAll(".product-feats li").forEach((li, i) => { li.querySelector("button").style.transitionDelay = (i % 9) * 60 + "ms"; });

  const navIO = new IntersectionObserver((entries) => {
    if (!detail.hidden) return;
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = en.target.dataset.product || (en.target.id === "hero" ? "home" : null);
      if (id) setActiveNav(id);
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  productsRoot.querySelectorAll(".product").forEach((s) => navIO.observe(s));
  navIO.observe($("#hero"));

  /* ── 첫 화면: 궤도 → 그리드 ─────────────────────── */
  const heroSec = $("#hero");
  const orbit = $("#orbit");
  const orbitCards = PRODUCTS.map((p, i) => {
    const b = el("button", "orbit-card" + (p.island ? " is-island" : ""));
    b.type = "button";
    b.style.setProperty("--accent", p.color);
    b.innerHTML = `<img src="${p.media.poster}" alt="" decoding="async"><span class="oc-label"><i class="oc-dot"></i>${esc(p.name)}${p.island ? " · 독립" : ""}</span>`;
    b.setAttribute("aria-label", `${p.name} 소개로 이동`);
    b.addEventListener("click", () => go("#/product/" + p.id));
    orbit.appendChild(b);
    return { el: b, p, i };
  });
  let angle = 0, lastT = 0, heroP = 0;
  function heroProgress() {
    const r = heroSec.getBoundingClientRect();
    const span = heroSec.offsetHeight - window.innerHeight;
    return span > 0 ? clamp(-r.top / span, 0, 1) : 1;
  }
  function renderHero(t) {
    const dt = lastT ? Math.min(64, t - lastT) : 16;
    lastT = t;
    heroP = heroProgress();
    heroSec.style.setProperty("--p", heroP.toFixed(3));
    const e = heroP < 0.15 ? 0 : (heroP - 0.15) / 0.75; // 정렬 진행도
    const ease = e >= 1 ? 1 : 1 - Math.pow(1 - clamp(e, 0, 1), 3);
    angle += dt * 0.00018 * (1 - ease);
    const vw = window.innerWidth;
    const cw = orbitCards[0].el.offsetWidth || 260;
    const R = Math.min(vw * 0.3, 400);
    const linked = orbitCards.filter((c) => !c.p.island);
    const spacing = Math.min((vw - 32) / 5, 300);
    const gs = (spacing * 0.92) / cw;
    orbitCards.forEach((c) => {
      let ox, oy, os, ob, oz;
      if (c.p.island) {
        // 호자게임은 궤도 밖의 독립된 섬
        ox = Math.min(vw * 0.4, 560); oy = -40 + Math.sin(t * 0.0008) * 8; os = 0.55; ob = 0.9; oz = 0;
        if (vw < 760) { ox = 0; oy = -150; os = 0.45; }
      } else {
        const k = linked.indexOf(c);
        const th = angle + (k * Math.PI) / 2;
        const z = Math.cos(th);
        ox = Math.sin(th) * R; oy = z * R * 0.16 + 10; os = 0.62 + 0.38 * (z + 1) / 2; ob = 0.5 + 0.5 * (z + 1) / 2; oz = Math.round(z * 100);
      }
      const gx = (c.i - 2) * spacing, gy = 0;
      const x = lerp(ox, gx, ease), y = lerp(oy, gy, ease), s = lerp(os, gs, ease), b = lerp(ob, 1, ease);
      c.el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
      c.el.style.filter = `brightness(${b.toFixed(3)})`;
      c.el.style.zIndex = String(ease > 0.5 ? 10 : 100 + oz);
      c.el.tabIndex = 0;
    });
  }
  function heroLoop(t) {
    const r = heroSec.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) renderHero(t);
    else lastT = 0;
    requestAnimationFrame(heroLoop);
  }
  if (!reduceMotion) requestAnimationFrame(heroLoop);

  // 제품 화면 스크롤 확대
  const medias = [...productsRoot.querySelectorAll(".product-media")];
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking || reduceMotion) return;
    ticking = true;
    requestAnimationFrame(() => {
      const vh = window.innerHeight;
      medias.forEach((m) => {
        const r = m.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const p = clamp(1 - (r.top + r.height / 2 - vh / 2) / vh, 0, 1);
        m.style.setProperty("--s", (0.9 + 0.1 * p).toFixed(3));
      });
      ticking = false;
    });
  }, { passive: true });

  /* ── 라우팅(해시, 새로고침 없음 · 뒤로 가기 · 직접 링크) ─ */
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  function scrollToMap() {
    const top = $("#map").getBoundingClientRect().top + window.scrollY + 120;
    if (Math.abs(window.scrollY - top) > 80) window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [kind, id] = h.split("/");
    if (kind === "node" && nodeById[id]) {
      const already = !detail.hidden;
      if (already) { openDetail(id); return; }
      scrollToMap();
      focusNode(id);
      setTimeout(() => openDetail(id), reduceMotion ? 0 : 520);
      return;
    }
    closeDetail();
    if (kind === "product" && productById[id]) {
      focusProduct(id, false);
      setActiveNav(id);
      $("#product-" + id).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    } else if (kind === "map") {
      setActiveNav(null);
    } else if (kind === "" || kind === undefined) {
      if (h === "" && location.hash === "#/") window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      setActiveNav("home");
    }
  }
  window.addEventListener("hashchange", route);

  /* ── 시작 ───────────────────────────────────── */
  renderMap();
  layoutMap();
  fitAll(false);
  let rz = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { layoutMap(); if (!detail.hidden) return; fitAll(false); }, 150);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutMap(); if (!location.hash.startsWith("#/node") && !location.hash.startsWith("#/product")) fitAll(false); });
  if (location.hash && location.hash !== "#/") route(); else setActiveNav("home");

  // 디버그·후속 작업용 공개 API
  window.EXHIBIT = { focusNode, focusProduct, fitAll, openDetail, cam };
})();
