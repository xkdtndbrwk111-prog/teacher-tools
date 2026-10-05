"use strict";

/*
 * Teacher Tools Hub
 * STEP 3A
 *
 * 역할:
 * - 상단 애플리케이션 런처만 담당
 * - Feedback 데이터 처리는 feedback.js가 담당
 *
 * 보안/구조:
 * - 외부 서비스는 HTTPS Production URL만 허용
 * - 내부 서비스는 현재 repository 하위 상대경로만 허용
 * - development 앱은 URL이 있어도 절대 링크로 만들지 않음
 */

const APPS = [
  {
    id: "mario-game",
    title: "마리오 게임",
    description: "수업 문제를 게임으로 진행하는 퀴즈 게임",
    type: "external",
    status: "active",
    url: "https://script.google.com/macros/s/AKfycbzoonnEeV0UPcaEFM843Ij4t2-1Qk_tl3lGdHwkJM8uIaDeEaLJly5zeLnwHxAX28AeRQ/exec",
    icon: "game",
    color: "coral"
  },

  {
    id: "mario-manager",
    title: "마리오 매니저",
    description: "마리오 게임에서 사용할 문제와 카트리지를 관리",
    type: "external",
    status: "active",
    url: "https://script.google.com/macros/s/AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc/exec",
    icon: "folder",
    color: "amber"
  },

  {
    id: "seating",
    title: "자리배치 매니저",
    description: "학급 조건을 반영해 새로운 자리배치를 생성",
    type: "internal",
    status: "active",
    url: "./seating/",
    icon: "seats",
    color: "green"
  },

  {
    id: "project-c",
    title: "Project C",
    description: "새로운 실시간 수업 게임",
    type: "external",
    status: "development",
    url: null,
    icon: "spark",
    color: "muted"
  },

  {
    id: "role-manager",
    title: "1인1역 배치 매니저",
    description: "학급 역할을 배정하는 도구",
    type: "internal",
    status: "development",
    url: null,
    icon: "people",
    color: "muted"
  }
];

const ICONS = {
  game: `
    <rect x="3" y="7" width="26" height="18" rx="6"/>
    <path d="M8 16h8m-4-4v8m10-6h.01m3 5h.01"/>
  `,

  folder: `
    <path d="M3 10V7a2 2 0 0 1 2-2h7l3 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Z"/>
    <path d="M11 16h10m-10 5h7"/>
  `,

  seats: `
    <rect x="4" y="4" width="9" height="9" rx="2"/>
    <rect x="19" y="4" width="9" height="9" rx="2"/>
    <rect x="4" y="19" width="9" height="9" rx="2"/>
    <rect x="19" y="19" width="9" height="9" rx="2"/>
  `,

  spark: `
    <path d="m16 3 3.5 9.5L29 16l-9.5 3.5L16 29l-3.5-9.5L3 16l9.5-3.5L16 3Z"/>
  `,

  people: `
    <circle cx="12" cy="10" r="5"/>
    <path d="M3 28v-4a9 9 0 0 1 18 0v4M23 6a5 5 0 0 1 0 10m2 4a7 7 0 0 1 4 7"/>
  `
};

function navigationUrl(app) {
  if (
    !app ||
    app.status !== "active" ||
    typeof app.url !== "string" ||
    !app.url.trim()
  ) {
    return null;
  }

  try {
    const resolved = new URL(app.url, document.baseURI);

    if (app.type === "external") {
      return resolved.protocol === "https:"
        ? resolved.href
        : null;
    }

    if (app.type === "internal") {
      const base = new URL("./", document.baseURI);

      const validRelativePath =
        app.url.startsWith("./");

      const sameOrigin =
        resolved.origin === base.origin;

      const insideRepositoryPath =
        resolved.pathname.startsWith(base.pathname);

      if (
        validRelativePath &&
        sameOrigin &&
        insideRepositoryPath
      ) {
        return resolved.href;
      }
    }

    return null;
  } catch (_error) {
    return null;
  }
}

function createIcon(iconName) {
  const wrapper = document.createElement("span");
  wrapper.className = "app-icon";

  /*
   * ICONS는 코드 내부에서만 정의되는 고정 first-party SVG이다.
   * 사용자 입력이나 외부 데이터는 innerHTML로 전달하지 않는다.
   */
  wrapper.innerHTML = `
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${ICONS[iconName] || ""}
    </svg>
  `;

  return wrapper;
}

function createAppCard(app) {
  const href = navigationUrl(app);

  const isDevelopment =
    app.status === "development";

  /*
   * href가 있을 때만 anchor 생성.
   *
   * development 앱은 URL이 실수로 추가되어도
   * navigationUrl()이 null을 반환하므로 article 상태를 유지한다.
   */
  const card = document.createElement(
    href ? "a" : "article"
  );

  card.className = [
    "app-card",
    app.color,
    isDevelopment ? "development" : "",
    href ? "available" : ""
  ]
    .filter(Boolean)
    .join(" ");

  card.dataset.appId = app.id;

  if (href) {
    card.href = href;
    card.setAttribute(
      "aria-label",
      `${app.title} 열기`
    );
  }

  const top = document.createElement("div");
  top.className = "card-top";

  const icon = createIcon(app.icon);

  const badge = document.createElement("span");
  badge.className = "badge";

  if (isDevelopment) {
    badge.textContent = "개발 중";
  } else if (href) {
    badge.textContent = "사용 가능";
  } else {
    badge.textContent = "링크 설정 필요";
  }

  top.append(icon, badge);

  const title = document.createElement("h3");
  title.textContent = app.title;

  const description = document.createElement("p");
  description.textContent = app.description;

  const action = document.createElement("div");
  action.className = "card-action";

  const label = document.createElement("span");

  if (isDevelopment) {
    label.textContent = "준비하고 있어요";
  } else if (href) {
    label.textContent = "도구 열기";
  } else {
    label.textContent = "서비스 주소를 준비하고 있어요";
  }

  action.append(label);

  if (href) {
    const arrow = document.createElement("span");
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    action.append(arrow);
  }

  card.append(
    top,
    title,
    description,
    action
  );

  return card;
}

function renderApps() {
  const grid =
    document.getElementById("app-grid");

  if (!grid) {
    return;
  }

  grid.replaceChildren();

  APPS.forEach(app => {
    grid.append(
      createAppCard(app)
    );
  });
}

renderApps();
