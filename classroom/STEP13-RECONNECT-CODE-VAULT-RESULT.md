# 학급생활 재접속 · 학생 코드 보관 검증 기록

기준 브랜치: `codex/life-reconnect-code-vault`  
기준 소스: `e467b701e5b6544a31a3a94cbcaab31f0e9919e7`  
실행일: 2026-11-16 (KST)  
자료 범위: 가상 학급과 가상 학생만 사용

## 구현 인수 결과

- 처음 등록된 학급은 교사 UID·학급 ID·학년도·내부 학생 ID로 조회한다.
- 동일 명단은 읽기 전용 상태 조회 후 자동 연결하며, 재등록·재발급을 하지 않는다.
- 학생 코드는 서버 비밀값으로 AES-GCM 암호화 보관한다. 교사 인증과 소유 학급 검증을 통과한 코드 조회 API에서만 복호화한다.
- 이름·번호 변경은 기존 내부 학생 ID의 코드를 유지하고, 신규 학생에게만 새 6자리 코드를 발급한다. 삭제 학생은 비활성화한다.
- 이전 해시 방식으로 발급되어 원문 보관값이 없는 코드는 자동 재발급하지 않는다.

## 자동 검증

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 전체 저장소 단위 시험 | PASS | 90 PASS, 0 FAIL, Firestore Emulator 의존 10건은 로컬 환경에서 SKIP |
| Firestore Emulator 코드 보관 시험 | PASS | GitHub Actions run `43877537213`, `e467b70`, 성공 |
| 코드 보관 조회·소유자 격리·무쓰기 재조회 | PASS | Emulator의 `teacher code vault returns same existing codes, owner-scoped and no writes on repeated reads` |
| 이름 변경·삭제·신규 학생 동기화 | PASS | Emulator의 `roster sync preserves existing codes, updates names and suspends removed students` |

## 실제 TEST Cloud Run 검증

배포 대상: `tt-cloud-test-111-20261108` / `teacher-tools-class-life` / `asia-northeast3`  
배포 리비전: `teacher-tools-class-life-00008-t52`  
이미지: `class-life:reconnect-e467b70`

- 기존 서비스 계정, `STUDENT_SESSION_SECRET` Secret 참조, Firestore 자료 및 허용 출처를 유지했다.
- `http://localhost:4188`의 CORS 사전 요청은 `204`와 정확한 허용 출처를 반환했다.
- 인증 없는 `GET /api/v2/teacher/codes`는 `401 교사 인증 필요`로 차단됨을 확인했다.
- 시험 직후 새 리비전의 ERROR 로그는 없었다.

## 실제 브라우저 E2E

| 시나리오 | 결과 |
| --- | --- |
| 가상 21명 최초 등록과 6자리 코드 발급 | PASS |
| 코드 관리·전체 인쇄 화면 | PASS |
| 페이지 재접속 후 Google 통합 로그인 복원 및 자동 연결 | PASS |
| 재접속 뒤 코드 21건 재조회·인쇄 가능 | PASS |
| 명단 변경 없이 재등록 버튼 미표시 | PASS |
| 가상 학생 1명 추가 후 변경 명단 연결 | PASS |
| 기존 21개 코드 유지, 신규 1명에만 코드 발급 | PASS |
| 학생 설문 제출 → 교사 원문 조회 | PASS |
| 개별 재발급 후 이전 코드 로그인 차단 | PASS |
| 개별 재발급 후 이전 학생 세션 차단 | PASS |
| 새 코드 로그인 및 기존 설문 응답 보존 | PASS |
| 다른 교사 계정의 실제 브라우저 접근 차단 | NOT RUN — 별도 TEST 교사 Google 계정이 이 실행에 제공되지 않음. Emulator 소유자 격리 시험은 PASS. |
| 별도 PC에서 Google Sheets 가상 학급을 복원한 뒤 연결 | NOT RUN — 기존 Google Sheets 자료를 덮어쓰지 않기 위해 가상 명단을 해당 사용자 저장소에 쓰지 않음. |
| 통신 장애 뒤 실제 브라우저 재시도 | NOT RUN — 서비스 트래픽을 의도적으로 중단하지 않음. 재등록 없는 읽기 재시도는 자동 시험으로 PASS. |

## 배포 순서와 되돌리기

1. 서버 이미지를 먼저 TEST Cloud Run에 배포하고, 코드 보관 API·CORS·교사 인증을 확인한다.
2. 그 다음 이 브랜치의 웹 UI를 배포한다. 이전 해시 전용 코드는 자동 재발급하지 않는다.
3. 문제가 생기면 Cloud Run 트래픽을 직전 리비전으로 되돌린다. Firestore 문서와 기존 학생 코드를 삭제하거나 변환하지 않는다.

## 판정

**CONDITIONAL GO** — 동일 교사·동일 학급의 재접속, 코드 보관·인쇄, 변경 명단의 신규 코드만 발급, 재발급 무효화와 응답 보존은 실제 TEST Cloud Run에서 확인했다. 실제 운영 게시 전에는 별도 가상 교사 계정과 별도 브라우저/Google 저장소를 이용한 두 개의 NOT RUN 시나리오를 추가로 완료해야 한다.
