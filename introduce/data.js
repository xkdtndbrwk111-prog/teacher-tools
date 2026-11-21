/*
 * 역사보리꼬리 공작소 — 인터랙티브 도구 전시관 데이터
 *
 * 레이아웃 좌표와 연결 정보는 모두 여기서 관리한다. HTML에는 하드코딩하지 않는다.
 *  - PRODUCTS: 고정 순서(미니게임 | 호자보드 | 교실매니저 | 한자매니저 | 호자게임 2.0)
 *  - NODES: 기능 노드. grid.col = 제품 열 번호, grid.row = 세로 위치,
 *           grid.x = 열 안의 가로 치우침(-1 왼쪽 가장자리 … 0 가운데 … 1 오른쪽 가장자리)
 *  - EDGES: 프로그램 사이의 실제 연동 관계. from → to 가 데이터가 흐르는 방향.
 *
 * 노드를 추가할 때는 NODES 배열에 객체 하나만 추가하면 지도·상세·내비게이션에 자동 반영된다.
 * 확인되지 않은 기능은 추가하지 않는다(운영판에 실제 배포된 기능만).
 */
(function () {
  "use strict";

  const CARD = "../assets/hub/cards/";

  const PRODUCTS = [
    {
      id: "mini",
      name: "호자 미니게임",
      navName: "미니게임",
      tagline: "전자칠판과 태블릿에서 터치로 함께 즐기는 교실 놀이",
      color: "#d9792b",
      tint: "#fff1e4",
      launch: { url: "https://xkdtndbrwk111-prog.github.io/hoja-minigames/", label: "미니게임 실행" },
      media: { poster: CARD + "hoja-minigames-poster-v1.webp" },
      linked: true
    },
    {
      id: "board",
      name: "호자보드",
      navName: "호자보드",
      tagline: "시간표와 급식, 자리표, 수업 도구를 전자칠판 한 화면에",
      color: "#2f6fb4",
      tint: "#e7f0fa",
      // 공식 다운로드 비활성 상태: 실행·다운로드 링크를 만들지 않는다.
      launch: { url: null, label: "정식판 준비 중" },
      media: { poster: CARD + "dashboard-poster-v1.jpg" },
      linked: true
    },
    {
      id: "class",
      name: "교실매니저",
      navName: "교실매니저",
      tagline: "자리배치와 성적, 학생 명단을 한곳에서 관리",
      color: "#2e7a4f",
      tint: "#e6f3ea",
      launch: { url: "../seating/", label: "교실매니저 실행" },
      media: { poster: CARD + "seating-hover-poster-v1.webp", video: CARD + "seating-hover-preview-v1.mp4" },
      linked: true
    },
    {
      id: "hanja",
      name: "한자매니저",
      navName: "한자매니저",
      tagline: "우리 반 학생들과 한자·한자어 문제를 풀어요",
      color: "#a87a1e",
      tint: "#fbf2dc",
      launch: { url: "../hanja/", label: "한자매니저 실행" },
      media: { poster: CARD + "hanja-manager-hover-poster-v1.webp", video: CARD + "hanja-manager-hover-preview-v1.mp4" },
      linked: true
    },
    {
      id: "quiz",
      name: "호자게임 2.0",
      navName: "호자게임",
      tagline: "달리고 점프하며 퀴즈를 푸는 횡스크롤 아케이드",
      color: "#d0574a",
      tint: "#fdeae6",
      launch: {
        url: "https://script.google.com/macros/s/AKfycbzoonnEeV0UPcaEFM843Ij4t2-1Qk_tl3lGdHwkJM8uIaDeEaLJly5zeLnwHxAX28AeRQ/exec",
        label: "호자게임 실행"
      },
      media: { poster: CARD + "hoja-game-hover-poster-v1.webp", video: CARD + "hoja-game-hover-preview-v1.mp4" },
      linked: false, // 독립 프로그램: 데이터 연동선 없음
      island: true
    }
  ];

  // n(): 노드 생성 헬퍼. media를 생략하면 제품 대표 화면을 사용한다(가짜 화면을 만들지 않는다).
  function n(id, product, col, row, x, title, summary, detail, extra) {
    return Object.assign(
      {
        id,
        product,
        title,
        summary,
        situation: detail.situation || "",
        usage: detail.usage || [],
        media: null,
        grid: { col, row, x },
        size: "normal",
        launch: null // null이면 제품 실행 링크를 사용
      },
      extra || {}
    );
  }

  const NODES = [
    /* ── 제1열: 호자 미니게임 ───────────────────────────── */
    n("mini.hero", "mini", 0, 0, 0, "함께 즐기는 교실 놀이",
      "전자칠판·태블릿에서 터치로 함께 즐기는 미니게임 모음",
      {
        situation: "쉬는 시간, 보상 활동, 모둠 대항전처럼 반 전체가 화면 앞에 모일 때 사용합니다.",
        usage: ["브라우저에서 바로 실행하며 설치가 필요 없습니다.", "게임은 장르별로 골라 시작합니다.", "다른 프로그램 없이 단독으로 사용할 수 있습니다."]
      }, { size: "hero" }),
    n("mini.hockey", "mini", 0, 1, 0, "에어하키",
      "두 사람이 마주 보고 즐기는 터치 대전",
      { situation: "전자칠판 양쪽에서 두 학생이 동시에 겨룰 때.", usage: ["화면 양쪽을 각각 터치해 퍽을 쳐냅니다."] }),
    n("mini.stairs", "mini", 0, 2, 0, "무한의 계단",
      "리듬감 있게 계단을 오르는 순발력 게임",
      { situation: "짧은 시간에 집중력을 끌어올리고 싶을 때.", usage: ["방향을 바꾸며 계단을 끝없이 올라갑니다."] }),
    n("mini.bungeo", "mini", 0, 3, 0, "붕어빵 가게",
      "주문에 맞춰 붕어빵을 굽는 경영 놀이",
      { situation: "협동과 순서 감각을 기르는 활동으로.", usage: ["손님 주문에 맞춰 반죽·속·굽기를 진행합니다."] }),
    n("mini.board", "mini", 0, 4, 0, "보드게임",
      "칠판 앞에서 함께 두는 보드게임 장르",
      { situation: "모둠끼리 차례를 정해 겨룰 때.", usage: ["개별 게임은 미니게임 안의 보드게임 장르에서 고릅니다."] }),
    n("mini.party", "mini", 0, 5, 0, "파티게임",
      "여러 명이 한 화면에서 즐기는 파티 장르",
      { situation: "반 전체가 함께 웃으며 즐기는 시간에.", usage: ["개별 게임은 미니게임 안의 파티게임 장르에서 고릅니다."] }),
    n("mini.rhythm", "mini", 0, 6, 0, "리듬게임",
      "박자에 맞춰 터치하는 리듬 장르",
      { situation: "음악과 함께 분위기를 바꾸고 싶을 때.", usage: ["박자에 맞춰 화면을 터치합니다."] }),
    n("mini.coins", "mini", 0, 7, 1, "명예의 전당과 코인",
      "기록을 남기고 학생 코인을 활용",
      {
        situation: "게임 결과를 기록하고 학급 보상과 이어가고 싶을 때.",
        usage: ["명예의 전당에서 우수 기록을 확인합니다.", "호자보드와 함께 쓰면 호자보드에서 관리하는 학생 코인을 활용할 수 있습니다(선택)."]
      }),

    /* ── 제2열: 호자보드 ─────────────────────────────── */
    n("board.hero", "board", 1, 0, 0, "우리 반 전자칠판 대시보드",
      "교실 전자칠판 한 화면에 하루를 담는 대시보드",
      {
        situation: "아침 조회부터 하교까지 전자칠판에 띄워 두고 사용합니다.",
        usage: ["위젯을 원하는 위치에 배치합니다.", "단독으로 사용할 수 있으며 다른 프로그램 연동은 선택입니다.", "공식 다운로드는 정식판 준비 중입니다."]
      }, { size: "hero" }),
    n("board.widgets", "board", 1, 1, 0, "대시보드와 위젯 배치",
      "필요한 위젯만 골라 자유롭게 배치",
      { situation: "학급마다 다른 화면 구성이 필요할 때.", usage: ["위젯을 추가·이동·크기 조절합니다."] }),
    n("board.schedule", "board", 1, 2, 0, "시간표·급식·날씨",
      "오늘의 시간표와 급식, 날씨를 한눈에",
      { situation: "아침마다 오늘 일정을 학생들과 확인할 때.", usage: ["시간표·급식·날씨 위젯을 대시보드에 둡니다."] }),
    n("board.tools", "board", 1, 3, 0, "수업 보조 도구",
      "수업 중 바로 꺼내 쓰는 보조 도구",
      { situation: "타이머 등 수업 진행 도구가 필요할 때.", usage: ["대시보드에서 도구를 바로 실행합니다."] }),
    n("board.season", "board", 1, 4, 0, "사계절 배경과 호자 캐릭터",
      "계절에 따라 바뀌는 배경과 호자 캐릭터",
      { situation: "교실 화면에 계절감과 친근함을 더하고 싶을 때.", usage: ["계절 배경과 호자 캐릭터가 화면을 꾸밉니다."] }),
    n("board.media", "board", 1, 5, 0, "멀티미디어",
      "영상과 음악을 대시보드에서 재생",
      { situation: "수업 자료 영상이나 배경 음악을 틀 때.", usage: ["멀티미디어 위젯으로 재생합니다."] }),
    n("board.grape", "board", 1, 6, 0, "포도알 칭찬판",
      "칭찬이 쌓일수록 채워지는 포도알",
      { situation: "학급 전체의 긍정 행동을 시각적으로 모을 때.", usage: ["칭찬할 때마다 포도알을 채웁니다."] }),
    n("board.coins", "board", 1, 7, -1, "학생 코인 관리",
      "학생별 코인을 호자보드에서 관리",
      {
        situation: "학급 보상으로 학생 코인을 운영할 때.",
        usage: ["학생별 코인을 지급·차감합니다.", "미니게임과 함께 쓰면 이 코인을 미니게임에서 활용할 수 있습니다(선택)."]
      }),
    n("board.roster", "board", 1, 8, 1, "학생 명단·자리표 연동",
      "교실매니저의 명단과 자리표를 그대로 활용",
      {
        situation: "교실매니저에서 이미 만든 명단·자리표를 다시 입력하지 않고 쓰고 싶을 때.",
        usage: ["교실매니저의 학생 명단·자리표를 가져옵니다.", "연동하지 않아도 호자보드는 단독으로 동작합니다."]
      }),
    n("board.theme", "board", 1, 9, 1, "테마 설정",
      "화면 테마를 고르고 교실매니저 테마와 맞추기",
      {
        situation: "두 프로그램의 화면 분위기를 맞추고 싶을 때.",
        usage: ["호자보드 테마를 직접 고를 수 있습니다.", "교실매니저의 테마를 가져와 함께 사용할 수 있습니다(선택)."]
      }),

    /* ── 제3열: 교실매니저 ───────────────────────────── */
    n("class.hero", "class", 2, 0, 0, "학급 운영의 중심",
      "자리배치와 성적, 학생 명단을 한곳에서",
      {
        situation: "새 학기 명단 정리부터 자리 바꾸기, 평가 기록까지.",
        usage: ["브라우저에서 바로 실행합니다.", "학급 데이터는 사용자의 브라우저에 저장됩니다.", "JSON 내보내기로 백업할 수 있습니다."]
      }, { size: "hero" }),
    n("class.seating", "class", 2, 1, 0, "교실 자리배치",
      "교실 모양에 맞춘 자리배치와 애니메이션",
      { situation: "자리를 바꾸는 날, 반 전체가 화면을 보며 결과를 확인할 때.", usage: ["교실 배치를 정하고 자리를 섞습니다."] }),
    n("class.rules", "class", 2, 2, 0, "자리배치 규칙",
      "함께 앉거나 떨어져야 할 조건을 지정",
      { situation: "학생 사이의 배려가 필요한 자리배치에.", usage: ["규칙을 지정하면 배치에 반영됩니다."] }),
    n("class.pe", "class", 2, 3, 0, "체육 모둠",
      "균형 잡힌 체육 모둠 편성",
      { situation: "체육 시간에 고르게 팀을 나눌 때.", usage: ["학생 명단으로 모둠을 편성합니다."] }),
    n("class.grades", "class", 2, 4, 0, "성적·평가 관리",
      "평가 기록을 학생별로 정리",
      { situation: "수행평가 결과를 기록하고 정리할 때.", usage: ["학생별 평가를 입력·확인합니다."] }),
    n("class.life", "class", 2, 5, 0, "학급생활·설문",
      "학급생활 기록과 간단한 설문",
      { situation: "학생 의견을 모으거나 생활 기록을 남길 때.", usage: ["설문을 만들고 결과를 확인합니다."] }),
    n("class.roster", "class", 2, 8, -1, "학생 명단 관리",
      "모든 연동의 출발점이 되는 학생 명단",
      {
        situation: "학기 초 명단을 한 번 정리해 두고 여러 곳에서 쓰고 싶을 때.",
        usage: ["학생 명단을 등록·수정합니다.", "호자보드와 한자매니저에서 이 명단을 활용할 수 있습니다(선택)."]
      }, { ports: ["left", "right"] }),
    n("class.theme", "class", 2, 9, -1, "저장·백업·테마",
      "브라우저 저장과 백업, 화면 테마",
      {
        situation: "기기를 바꾸거나 데이터를 안전하게 보관할 때.",
        usage: ["JSON 내보내기·가져오기로 백업합니다.", "선택한 테마는 호자보드에서 가져가 함께 쓸 수 있습니다."]
      }),

    /* ── 제4열: 한자매니저 ───────────────────────────── */
    n("hanja.hero", "hanja", 3, 0, 0, "우리 반 한자 학습",
      "한자·한자어 문제를 반 학생들과 함께",
      {
        situation: "한자 수업 시간에 전자칠판으로 문제를 함께 풀 때.",
        usage: ["브라우저에서 바로 실행합니다.", "명단 연동 없이도 사용할 수 있습니다."]
      }, { size: "hero" }),
    n("hanja.chars", "hanja", 3, 1, 0, "단일 한자 등록·관리",
      "수업에 쓸 한자를 등록하고 관리",
      { situation: "단원별 학습 한자를 준비할 때.", usage: ["한자를 직접 등록하거나 엑셀 양식으로 가져옵니다."] }),
    n("hanja.words", "hanja", 3, 2, 0, "한자어 등록·관리",
      "한자어를 등록하고 관리",
      { situation: "한자어 중심 수업을 준비할 때.", usage: ["한자어를 등록·수정합니다."] }),
    n("hanja.quiz", "hanja", 3, 3, 0, "문제 매니저",
      "등록한 한자로 문제를 구성",
      { situation: "수업용 문제 세트를 미리 만들 때.", usage: ["문제를 만들고 관리합니다."] }),
    n("hanja.perStudent", "hanja", 3, 4, 0, "학생별 문제 출제",
      "학생 한 명 한 명에게 문제를 출제",
      { situation: "돌아가며 한 명씩 문제를 풀게 할 때.", usage: ["학생을 선택해 문제를 출제합니다."] }),
    n("hanja.roster", "hanja", 3, 8, -1, "수업 진행과 학생 명단",
      "교실매니저 명단으로 수업 진행",
      {
        situation: "교실매니저에 저장된 명단으로 바로 수업을 시작하고 싶을 때.",
        usage: ["같은 사이트에 저장된 교실매니저 명단을 읽어 옵니다(읽기 전용).", "수업 진행 상태는 세션 동안만 유지됩니다."]
      }),

    /* ── 제5열: 호자게임 2.0 (독립 섬) ────────────────── */
    n("quiz.arcade", "quiz", 4, 0, 0, "달리고 점프하며 퀴즈를 푸는 아케이드",
      "횡스크롤 아케이드와 퀴즈의 결합",
      {
        situation: "게임처럼 즐기며 복습하고 싶을 때.",
        usage: ["브라우저에서 바로 실행하는 독립 프로그램입니다.", "다른 공작소 프로그램과 데이터를 주고받지 않습니다."]
      }, { size: "hero" }),
    n("quiz.cartridge", "quiz", 4, 1, 0, "카트리지 선택",
      "문제 묶음(카트리지)을 골라 시작",
      { situation: "단원에 맞는 문제 묶음으로 플레이할 때.", usage: ["카트리지를 선택해 게임을 시작합니다."] }),
    n("quiz.single", "quiz", 4, 2, 0, "싱글 아케이드",
      "혼자 달리고 점프하는 아케이드 플레이",
      { situation: "개인 복습 시간에.", usage: ["장애물을 피하며 스테이지를 진행합니다."] }),
    n("quiz.solve", "quiz", 4, 3, 0, "퀴즈 풀이",
      "달리는 도중 등장하는 퀴즈 풀기",
      { situation: "게임 흐름 속에서 문제를 풀 때.", usage: ["등장하는 문제에 답하며 진행합니다."] }),
    n("quiz.review", "quiz", 4, 4, 0, "오답 복습",
      "틀린 문제를 다시 확인",
      { situation: "플레이 후 약한 부분을 복습할 때.", usage: ["오답을 모아 다시 확인합니다."] }),
    n("quiz.rank", "quiz", 4, 5, 0, "점수·랭킹",
      "점수와 랭킹으로 동기 부여",
      { situation: "기록 경쟁으로 참여를 높일 때.", usage: ["플레이 점수와 랭킹을 확인합니다."] })
  ];

  /*
   * 연동선: from → to = 데이터가 흐르는 방향.
   * kind: coin | roster | theme. 같은 두 프로그램 사이라도 종류가 다르면 별도의 선으로 그린다.
   */
  const EDGES = [
    {
      id: "e.coin",
      from: "board.coins",
      to: "mini.coins",
      kind: "coin",
      label: "학생 코인",
      description: "호자보드에서 관리하는 학생 코인을 미니게임에서 활용"
    },
    {
      id: "e.roster.board",
      from: "class.roster",
      to: "board.roster",
      kind: "roster",
      label: "명단·자리표 전달",
      description: "교실매니저의 학생 명단·자리표를 호자보드로 전달"
    },
    {
      id: "e.theme.board",
      from: "class.theme",
      to: "board.theme",
      kind: "theme",
      label: "테마 공유",
      description: "호자보드가 교실매니저의 테마를 가져와 사용"
    },
    {
      id: "e.roster.hanja",
      from: "class.roster",
      to: "hanja.roster",
      kind: "roster",
      label: "학생 명단",
      description: "교실매니저의 학생 명단을 한자매니저에서 활용(읽기 전용)"
    }
  ];

  /* One More Thing: 실제로 구현된 연동만. */
  const ONE_MORE = {
    mini: {
      lines: ["게임을 즐기는 것에서 끝나지 않습니다.", "학생 코인은 호자보드에서 관리할 수 있습니다."],
      target: "board.coins",
      cta: "호자보드 코인 관리 보기"
    },
    board: {
      lines: ["교실매니저에서 만든 학생 명단을 그대로 활용할 수 있습니다.", "테마도 함께 사용할 수 있습니다."],
      target: "class.roster",
      cta: "교실매니저 학생 명단 보기"
    },
    class: {
      lines: ["학생 명단은 한자매니저에서도 활용할 수 있습니다."],
      target: "hanja.roster",
      cta: "한자매니저로 이어가기"
    }
  };

  window.EXHIBIT_DATA = Object.freeze({ PRODUCTS, NODES, EDGES, ONE_MORE });
})();
