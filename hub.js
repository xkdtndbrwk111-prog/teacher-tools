"use strict";

// External Production URLs are configured only here. Missing URLs stay null.
// Development cards remain non-interactive even if a URL is accidentally set.
const APPS = [
  { id: "mario-game", title: "마리오 게임", description: "수업 문제를 게임으로 진행하는 퀴즈 게임", type: "external", status: "active", url: null, icon: "game", color: "coral" },
  { id: "mario-manager", title: "마리오 매니저", description: "마리오 게임에서 사용할 문제와 카트리지를 관리", type: "external", status: "active", url: null, icon: "folder", color: "amber" },
  { id: "seating", title: "자리배치 매니저", description: "학급 조건을 반영해 새로운 자리배치를 생성", type: "internal", status: "active", url: "./seating/", icon: "seats", color: "green" },
  { id: "hanja", title: "한자 학습 매니저", description: "우리 반 학생들과 한자·한자어 문제를 풀어요", type: "internal", status: "active", url: "./hanja/", icon: "folder", color: "amber" },
  { id: "feedback", title: "피드백", description: "Teacher Tools의 오류와 개선 의견 전달", type: "external", status: "active", url: null, icon: "message", color: "blue" },
  { id: "project-c", title: "Project C", description: "새로운 실시간 수업 게임", type: "external", status: "development", url: null, icon: "spark", color: "muted" },
  { id: "role-manager", title: "1인1역 배치 매니저", description: "학급 역할을 배정하는 도구", type: "internal", status: "development", url: null, icon: "people", color: "muted" }
];

const ICONS = {
  game: '<rect x="3" y="7" width="26" height="18" rx="6"/><path d="M8 16h8m-4-4v8m10-6h.01m3 5h.01"/>',
  folder: '<path d="M3 10V7a2 2 0 0 1 2-2h7l3 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Z"/><path d="M11 16h10m-10 5h7"/>',
  seats: '<rect x="4" y="4" width="9" height="9" rx="2"/><rect x="19" y="4" width="9" height="9" rx="2"/><rect x="4" y="19" width="9" height="9" rx="2"/><rect x="19" y="19" width="9" height="9" rx="2"/>',
  message: '<path d="M7 5h18a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H13l-8 5v-7a4 4 0 0 1-2-3V9a4 4 0 0 1 4-4Z"/><path d="M9 12h14M9 18h9"/>',
  spark: '<path d="m16 3 3.5 9.5L29 16l-9.5 3.5L16 29l-3.5-9.5L3 16l9.5-3.5L16 3Z"/>',
  people: '<circle cx="12" cy="10" r="5"/><path d="M3 28v-4a9 9 0 0 1 18 0v4M23 6a5 5 0 0 1 0 10m2 4a7 7 0 0 1 4 7"/>'
};

function navigationUrl(app) {
  if (app.status !== "active" || typeof app.url !== "string" || !app.url.trim()) return null;
  try {
    const url = new URL(app.url, document.baseURI);
    if (app.type === "external") return url.protocol === "https:" ? url.href : null;
    const base = new URL("./", document.baseURI);
    return app.url.startsWith("./") && url.origin === base.origin && url.pathname.startsWith(base.pathname) ? url.href : null;
  } catch { return null; }
}

const grid = document.getElementById("app-grid");
APPS.forEach(app => {
  const href = navigationUrl(app);
  const development = app.status === "development";
  const card = document.createElement(href ? "a" : "article");
  card.className = `app-card ${app.color}${development ? " development" : ""}${href ? " available" : ""}`;
  card.dataset.appId = app.id;
  if (href) card.href = href;
  const top = document.createElement("div");
  top.className = "card-top";
  const icon = document.createElement("span");
  icon.className = "app-icon";
  // SVG content is fixed first-party artwork, never URL or user input.
  icon.innerHTML = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[app.icon]}</svg>`;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = development ? "개발 중" : href ? "사용 가능" : "링크 설정 필요";
  top.append(icon, badge);
  const title = document.createElement("h3");
  title.textContent = app.title;
  const description = document.createElement("p");
  description.textContent = app.description;
  const action = document.createElement("div");
  action.className = "card-action";
  const label = document.createElement("span");
  label.textContent = development ? "준비하고 있어요" : href ? "도구 열기" : "서비스 주소를 준비하고 있어요";
  action.append(label);
  if (href) {
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    action.append(arrow);
  }
  card.append(top, title, description, action);
  grid.append(card);
});
