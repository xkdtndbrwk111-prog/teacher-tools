# Teacher Tools Hub

수업과 학급 운영 도구를 연결하는 작은 정적 런처입니다. HTML, CSS, vanilla JavaScript만 사용하며 설치·빌드·npm 의존성이 없습니다.

## 구성

| 도구 | 제품 상태 | 위치 | 초기 연결 상태 |
|---|---|---|---|
| 마리오 게임 | active | 외부 Project A | Production URL 연결됨 |
| 마리오 매니저 (퀴즈 매니저) | active | 외부 Project B | Production URL 연결됨 |
| 자리배치 매니저 | active | `./seating/` | 사용 가능 |
| 한자 학습 매니저 | active | `./hanja/` | 사용 가능 |
| 피드백 | active | Hub 내장 게시판 (`#feedback`) | Production 운영 중 |
| Project C | development | 향후 외부 서비스 | 개발 중, 비활성 |
| 1인1역 배치 매니저 | development | 향후 내부 앱 | 개발 중, 비활성 |

Hub는 GitHub Pages(`https://xkdtndbrwk111-prog.github.io/teacher-tools/`)에서 운영 중입니다. Hub는 도구·상태 표시와 링크 이동을 담당하며, A/B/C 소스·backend·인증을 통합하지 않습니다.

**Feedback (FB-HUB-1, Production 완료):** 눈에 보이는 Feedback 게시판은 Hub에만 있습니다(`feedback-board.js`, `feedback-board.css`). Project B의 Feedback 게시판 UI는 제거되었고, Project B는 Feedback에 대해 backend 전용입니다(Google Creator 인증, OWNER 권한, Hub bridge, mutation relay, idempotency, moderation, Supabase 특권 접근). 공개 읽기는 Production Supabase 공개 RPC(`feedback-transport.js`), 작성·수정·삭제·OWNER 관리는 Project B Production 세션 브리지(`feedback-auth-bridge.js`)를 거치며 권한은 Project B 서버가 결정합니다. 문의 대상(product)은 `feedback_products` registry가 기준입니다. 현재 기준 문서: [FB_HUB_1_FINAL_REPORT](docs/project-b/FB_HUB_1_FINAL_REPORT.md).

## 외부 주소 설정

`hub.js` 상단 `APPS` 배열의 `mario-game`(Project A), `mario-manager`(Project B) `url`에는 확인된 HTTPS Production URL이 설정되어 있습니다. 주소가 null이면 active 상태를 유지하며 ‘링크 설정 필요’를 표시하고 링크를 생성하지 않습니다. [Registry 계약](docs/APP_REGISTRY.md)을 참고하세요.

## 익명 실행 횟수 (USAGE-1)

자리배치 매니저와 한자 학습 매니저는 앞으로의 누적 실행 횟수만 익명 집계합니다. 같은 탭 세션에서 새로고침해도 한 번만 집계하며, Hub 피드백 게시판 아래에 작은 글씨로 누적 횟수를 표시합니다. 서버에는 `SEATING` / `HANJA`별 총횟수만 저장하며 계정, 학교, 학생, 브라우저 식별자 같은 개인정보는 저장하지 않습니다. 집계 실패는 앱 실행을 막지 않습니다.

## 자리배치

`seating/`은 승인된 `classroom_seating_studio_v6_24_step1b_validation_hardened_2026-10-04.zip`의 배포 파일을 기반으로 공용 자산 경로를 참조합니다. UI, 배치 엔진, 저장·migration, Export/Import 기능은 수정하지 않았습니다.

**자리배치 개인 학급 데이터는 브라우저에 로컬 저장되며 Hub가 저장하지 않습니다.** Hub는 학급 데이터나 localStorage를 읽지 않습니다. 자리배치는 기존 `teacher-tools.seating.state.v1` 키를 사용합니다. 브라우저 데이터 삭제·기기 변경 등에 대비해 앱의 JSON 내보내기로 백업하세요.

같은 origin의 앱은 브라우저 저장소 접근 권한을 공유합니다. namespace는 이름 충돌 방지 규칙이며 보안 격리가 아닙니다. Hub가 읽지 않는 것은 구현상의 경계입니다. 다른 앱의 기술적 접근까지 막으려면 별도 origin이 필요합니다. origin/domain을 바꾸어도 데이터가 자동 이전되지 않으므로 기존 주소에서 Export하고 새 주소에서 Import해야 합니다.

## 실행 및 배포

저장소의 부모 폴더에서 `python3 -m http.server 8000`을 실행하고 `http://localhost:8000/teacher-tools/`에 접속하면 Project Pages 경로를 재현할 수 있습니다.

공개 주소는 `https://xkdtndbrwk111-prog.github.io/teacher-tools/`이며 자리배치는 그 아래 `seating/`에서 실행합니다. GitHub Pages의 branch 기반(main, `/ (root)`) 게시를 사용합니다. 별도 Actions 파일이나 custom domain 설정은 없습니다. [배포 안내](docs/DEPLOYMENT.md)를 참고하세요.

Hub와 Seating은 하나의 Pages 게시 산출물을 공유합니다. 외부 서비스 A/B/C와는 배포가 독립적이며, 내부 앱들 사이의 완전한 독립 배포를 보장하지는 않습니다.

## Hanja and shared assets

Hanja lives at `hanja/`. `shared/student-registry.js` reads the existing Seating roster without writes or migration. Save the roster in Seating on the same origin first. Hanja data and settings use `teacher-tools.hanja.data.v1`; participation and lesson progress are session-only. All 175 Seating assets now live in `shared/assets/`. See `docs/HANJA_CHANGE_REPORT.md` and `tests/README.md`.
