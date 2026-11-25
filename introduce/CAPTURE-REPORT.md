# 실제 프로그램 미디어 촬영 기록

## 촬영 환경

- 전시관 브랜치: `feat/introduce-exhibition`
- 교실매니저·한자매니저: 이 저장소의 로컬 정적 서버와 별도 Chromium 프로필
- 학급 TEST 데이터: `6학년 1반` / 세종, 이순신, 신사임당, 장영실, 허준, 유관순, 김구, 안중근, 정약용, 광개토대왕
- 한자 TEST 데이터: 山·水·火·木 및 山水·火山
- 미니게임: 공개 소스 `hoja-minigames`의 로컬 복제본 (`aa32ab1b6fa61c6a8f3fcce5748d0d611dc1c869`)
- 호자게임 2.0: 공개 소스 `SMQ-Project-A`의 로컬 복제본 (`fa09c971fc075b6e915350630deae79b40bd9d54`), SHA-256 검증 복원본
- 운영 학생 자료, 운영 코인·랭킹·통계, 호자보드 실행은 사용하거나 변경하지 않았다.

## 연결한 실제 화면

| 파일 | 프로그램 / 기능 노드 | 실제 조작 장면 | 방식 | 개인정보·운영 변경 |
|---|---|---|---|---|
| `classroom/classroom-roster.png` | 교실매니저 / `class.roster` | 학생 카드·번호·캐릭터 명단 | 격리 프로필 | 역사 인물 TEST 명단 / 없음 |
| `classroom/classroom-rules.png` | 교실매니저 / `class.rules` | 자리배치 규칙 패널 | 격리 프로필 | TEST 명단 / 없음 |
| `classroom/classroom-pe.png` | 교실매니저 / `class.pe` | 체육 모둠 편성 | 격리 프로필 | TEST 명단 / 없음 |
| `classroom/classroom-pe.mp4` | 교실매니저 / `class.pe` | 2팀에서 4팀으로 변경되는 실제 작업 공간 | 실제 화면 프레임 → 무음 H.264 | TEST 명단 / 없음 |
| `classroom/classroom-grades.png` | 교실매니저 / `class.grades` | 성적 관리 화면 | 격리 프로필 | TEST 명단 / 없음 |
| `classroom/classroom-board-link.png` | 교실매니저 / `class.theme` | 호자보드 연동 인터페이스 | 격리 프로필 | TEST 명단 / 호자보드 미실행 |
| `hanja/hanja-characters.png` | 한자매니저 / `hanja.chars` | 단일 한자 등록 목록 | 같은 격리 프로필 | TEST 한자 / 없음 |
| `hanja/hanja-words.png` | 한자매니저 / `hanja.words` | 한자어 등록 목록 | 같은 격리 프로필 | TEST 한자 / 없음 |
| `hanja/hanja-question-manager.png` | 한자매니저 / `hanja.quiz`, `hanja.roster` | 출제 조건과 공통 명단 | 같은 격리 프로필 | TEST 명단·한자 / 없음 |
| `hanja/hanja-question-play.png` | 한자매니저 / `hanja.perStudent` | 선택 학생의 실제 문제 풀이 | 같은 격리 프로필 | TEST 명단·한자 / 없음 |
| `minigames/minigames-*.png` | 호자 미니게임 / `mini.hockey`, `mini.stairs`, `mini.bungeo`, `mini.board`, `mini.party`, `mini.rhythm` | 각 장르의 실제 시작·선택 화면 | 로컬 복제본 | 로컬 전용 / 없음 |
| `minigames/minigames-hockey.mp4` | 호자 미니게임 / `mini.hockey` | 실제 에어하키 플레이 시작 뒤 7.6초 | 실제 화면 프레임 → 무음 H.264 | 로컬 전용, 경기 종료 전 중단 / 없음 |
| `hoja-quiz/hoja-quiz-intro.png` | 호자게임 2.0 / `quiz.arcade` | 실제 최신 소스의 아케이드 인트로 | 로컬 복제본 | 질문·랭킹 서버 미연결 / 없음 |

모든 이미지와 영상은 1920×1080이며, 브라우저 주소창·운영 학생 정보·별도 홍보 문구를 포함하지 않는다.

## 촬영하지 않은 기능

| 기능 | 상태 | 이유 |
|---|---|---|
| `class.life` | 촬영 불가 | EASY 모드에서 학급생활은 Google 통합 인증이 필요하다. 실제 교사 계정 접근은 이 작업 범위 밖이다. |
| `mini.coins` (명예의 전당) | 촬영 보류 | 명예의 전당은 외부 운영 기록을 읽거나 쓸 가능성이 있어 로컬 화면 촬영 범위에서 제외했다. |
| `quiz.cartridge`, `quiz.single`, `quiz.solve`, `quiz.review`, `quiz.rank` | 촬영 불가 | 최신 호자게임은 Google Apps Script의 문제·랭킹 서비스를 필요로 한다. 로컬 복제본에는 해당 서버가 없으며 운영 서버에 테스트 기록을 남기지 않았다. |

이 항목들은 기존 제품 대표 미디어를 그대로 유지한다. 실제 화면으로 오인시키는 대체 합성물은 만들지 않았다.

## 재현과 검증

- 교실매니저·한자매니저의 기본 캡처 스크립트: `node tools/introduce-capture/capture-local.mjs http://127.0.0.1:4173`
- 전시관 계약 검사: `node tests/introduce-contract.test.cjs`
- 전시관 브라우저 검사: `node tests/introduce-browser.cjs`
- 결과: 계약 4/4 PASS, 브라우저 스모크 PASS (데스크톱·모바일·직접 링크·상세·감소된 모션)

## 플레이 영상 재촬영 기록 (2026-11-22)

이번 재촬영은 `/private/tmp/hoja-minigames-capture` 로컬 복제본에서만 수행했다. 게임 소스·운영 기록·코인·명예의 전당은 변경하지 않았다.

| 노드 | 결과 | 영상 | 실제 변화 확인 |
|---|---|---|---|
| `mini.hockey` | PASS | `minigames-hockey.mp4` | 양쪽 말렛 이동, 퍽 왕복, 경기 점수 HUD가 실제로 렌더링됨 |
| `mini.stairs` | PASS | `minigames-stairs.mp4` | 키보드 좌·우 조작 후 캐릭터가 3층까지 상승, 층수 표시 변화 |
| `mini.bungeo` | NOT RUN | 촬영본 보류 | 주문 손님은 확인했지만 굽기·판매 조작까지 명확히 담기지 않아 대표 영상으로 승격하지 않음 |
| `mini.board` | PASS | `minigames-boardgames.mp4` | 오셀로 판에 양쪽 돌이 놓이고 점수 2:2에서 6:3으로 변화 |
| `mini.party` | NOT RUN | 기존 포스터 유지 | 파티 런타임이 자동화 세션에서 비정상 종료되어, 가짜 영상으로 대체하지 않음 |
| `mini.rhythm` | NOT RUN | 기존 포스터 유지 | 리듬 런타임이 자동화 세션에서 비정상 종료되어, 가짜 영상으로 대체하지 않음 |

모든 PASS 영상은 무음 H.264 MP4, 1920×1080, 16:9, 6–12초 구간으로 인코딩했다. 오셀로는 `mini.board` 대표 게임으로 연결했다. 붕어빵·파티·리듬은 촬영 실패를 숨기지 않고 보류 상태로 남겼다.

체육 모둠의 실제 배치 변화는 기존 `classroom/classroom-pe.mp4`에 유지되어 있다. 해당 클립은 실제 교실매니저 화면에서 2팀에서 4팀으로 편성을 바꾸는 장면이며, `class.pe` 상세 미디어로 연결되어 있다.
