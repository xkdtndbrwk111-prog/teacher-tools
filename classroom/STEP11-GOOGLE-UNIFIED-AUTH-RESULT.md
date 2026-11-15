# STEP 11 — Google 통합 인증 실증 결과

- 기준 커밋: `db5bbdc6243a192b27a79ccb0215046f773bc1c5`
- 대상: `codex/class-life-unified-google-auth`
- 데이터: STEP11 가상 교사 1명, 가상 학생 4명만 사용
- 실제 학생 정보, 인증 토큰, 개인 코드, 비밀키는 이 문서와 Git에 포함하지 않았다.

## 실제 브라우저·Cloud TEST 결과

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| NORMAL 기존 Google OAuth → Firebase credential 교환 | PASS | 기존 교실매니저 NORMAL 로그인 직후 학급생활이 `통합 연결됨`으로 표시되었고, 별도 학급생활 로그인 없이 Cloud Run 교사 API를 사용했다. |
| Firebase Google 제공업체와 기존 NORMAL OAuth 클라이언트 연결 | PASS | TEST Firebase Google 제공업체의 외부 클라이언트 허용 목록에 기존 NORMAL 웹 클라이언트를 추가한 뒤 실제 credential 교환이 성공했다. |
| Google immutable subject와 Firebase provider ID 일치 검사 | PASS | 런타임은 provider `google.com`의 immutable ID와 NORMAL session subject가 일치할 때만 연결을 완료하며, 실제 연결도 이 검사를 통과했다. |
| 가상 명단 온라인 연결 및 5월 설문 개설 | PASS | 가상 학생 4명의 기존 내부 ID를 유지해 Cloud TEST 명단에 연결하고 5월 설문을 개설했다. |
| 가상 학생 설문 제출 | PASS | 가상학생 A가 8문항·친구 선택·서술형 응답을 실제 Cloud Run TEST에 제출했다. |
| 담당 교사 원문 조회 | PASS | 교사 화면에서 제출 1명/미제출 3명 및 가상학생 A의 서술형·칭찬 원문을 조회했다. 원시 `studentId` JSON은 화면에 노출되지 않았다. |
| 동일 학생 중복 제출 | PASS | 같은 개인 코드로 재접속했을 때 `이미 제출했습니다`로 차단되었고 입력 폼이 재표시되지 않았다. |
| 토큰 만료·계정 불일치·EASY 전환 차단 | PASS (자동) | 통합 인증 회귀시험에서 만료 NORMAL session, Google subject 불일치, EASY 전환 뒤의 Firebase in-memory session/API 접근을 모두 차단했다. 실제 만료 시간 대기와 두 번째 Google 계정 전환은 수행하지 않았다. |
| 다른 실제 Google 교사의 해당 학급 조회 403 | NOT RUN | 승인된 두 번째 가상 교사 Google 계정이 없어 실제 온라인 403 시험은 하지 않았다. 소유자 범위·ID 불일치 거절은 자동시험으로 검증했다. |
| 기존 Google Sheets에 가상 자료 실제 저장 | NOT RUN | 로그인 계정의 기존 2026 Sheets 자료가 충돌 보호 화면에 감지되어, 실제 학생 자료를 읽거나 가상 자료로 덮어쓰지 않았다. 원격 쓰기는 수행하지 않았다. |

## TEST Firebase 설정 변경

`tt-cloud-test-111-20261108`의 Firebase Authentication > Google 제공업체에 기존 NORMAL OAuth 웹 클라이언트를 외부 클라이언트 허용 목록으로 추가했다. 결제, Firestore 구조, Cloud Run, 기존 Google Sheets OAuth 프로젝트는 변경하지 않았다.

## 코드 변경

- 이전 `Custom Token` 기반 STEP 10 브라우저 시험을 제거했다.
- `classroom/tests/life-cloud-unified-auth.test.mjs`를 추가했다. 실제 코드와 동일한 경로에서 NORMAL access token credential 교환, Firebase memory persistence, immutable Google ID 일치, 만료/계정 전환/EASY 차단을 검증한다.
- 기존 정적 인증 회귀시험은 독립 Firebase popup과 시험용 인증 진입점이 없음을 계속 확인한다.

## 자동시험

`node --test classroom/tests/*.test.mjs`

- PASS: 86
- FAIL: 0
- SKIP: 8 (Firestore Emulator 환경이 구성되지 않은 통합 부하/격리 사례)

## 판정

**CONDITIONAL GO.** 기존 NORMAL Google 세션을 Firebase에 안전하게 연결하고 실제 가상 학생 제출·교사 조회까지 통과했다. 다만 실제 두 번째 Google 교사 계정의 403 시험과, 기존 Google Sheets 실제 자료를 건드리지 않는 별도 TEST 저장소에서의 쓰기 시험은 남아 있다.
