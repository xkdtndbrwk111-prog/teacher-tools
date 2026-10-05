"use strict";

/*
 * Teacher Tools Hub
 * STEP 3A — visual card prototype
 *
 * 역할:
 * - 상단 애플리케이션 런처만 담당
 * - Feedback 데이터 처리는 feedback.js가 담당
 *
 * 카드 미디어:
 * - 정지 상태는 preview 영상의 첫 프레임 poster
 * - pointer hover가 가능한 환경에서만 영상 재생
 * - mouseleave 시 0초로 되돌려 poster와 자연스럽게 연결
 * - 모바일/터치 및 reduced-motion 환경에서는 정지 이미지 유지
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
    color: "coral",
    media: {
      poster: "./assets/hub/cards/mario-game-hover-poster-v2.webp",
      video: "./assets/hub/cards/mario-game-hover-preview-v2.mp4"
    }
  },

  {
    id: "mario-manager",
    title: "마리오 매니저",
    description: "마리오 게임에서 사용할 문제와 카트리지를 관리",
    type: "external",
    status: "active",
    url: "https://script.google.com/macros/s/AKfycbx4DE5eCrJ4kc_vuyOnQew7g7M39SktECR2KekMuriDsKa8ujRpVPMH-tQHiOQUCvc/exec",
    icon: "folder",
    color: "amber",
    media: null
  },

  {
    id: "seating",
    title: "자리배치 매니저",
    description: "학급 조건을 반영해 새로운 자리배치를 생성",
    type: "internal",
    status: "active",
    url: "./seating/",
    icon: "seats",
    color: "green",
    media: null
  },

  {
    id: "project-c",
    title: "Project C",
    description: "새로운 실시간 수업 게임",
    type: "external",
    status: "development",
    url: null,
    icon: "spark",
    color: "muted",
    media: null
  },

  {
    id: "role-manager",
    title: "1인1역 배치 매니저",
    description: "학급 역할을 배정하는 도구",
    type: "internal",
    status: "development",
    url: null,
    icon: "people",
    color: "muted",
    media: null
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

function createMedia(app, badgeText) {
  const media = document.createElement("div");
  media.className = "app-media";

  const fallback = document.createElement("div");
  fallback.className = "app-media-fallback";
  fallback.append(createIcon(app.icon));
  media.append(fallback);

  if (
    app.media &&
    typeof app.media.poster === "string" &&
    typeof app.media.video === "string"
  ) {
    media.classList.add("has-preview");

    const video = document.createElement("video");
    video.className = "app-preview-video";
    video.poster = app.media.poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    video.setAttribute("aria-hidden", "true");

    let sourceAttached = false;

    function attachSourceOnce() {
      if (sourceAttached) {
        return;
      }

      const source = document.createElement("source");
      source.src = app.media.video;
      source.type = "video/mp4";
      video.append(source);

      sourceAttached = true;
      video.load();
    }

    const canHover = window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    );

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    if (canHover.matches && !reduceMotion.matches) {
      media.addEventListener("mouseenter", () => {
        attachSourceOnce();
        video.play().catch(() => {});
      });

      media.addEventListener("mouseleave", () => {
        video.pause();

        try {
          video.currentTime = 0;
        } catch (_error) {
          /* metadata가 아직 준비되지 않은 경우 무시 */
        }
      });
    }

    media.append(video);
  }

  const shade = document.createElement("span");
  shade.className = "app-media-shade";
  shade.setAttribute("aria-hidden", "true");

  const badge = document.createElement("span");
  badge.className = "badge media-badge";
  badge.textContent = badgeText;

  media.append(shade, badge);

  return media;
}

function createAppCard(app) {
  const href = navigationUrl(app);

  const isDevelopment =
    app.status === "development";

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

  let badgeText = "링크 설정 필요";

  if (isDevelopment) {
    badgeText = "개발 중";
  } else if (href) {
    badgeText = "사용 가능";
  }

  const media = createMedia(app, badgeText);

  const content = document.createElement("div");
  content.className = "app-card-content";

  const titleRow = document.createElement("div");
  titleRow.className = "app-title-row";

  const title = document.createElement("h3");
  title.textContent = app.title;
  titleRow.append(title);

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

  content.append(
    titleRow,
    description,
    action
  );

  card.append(
    media,
    content
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
