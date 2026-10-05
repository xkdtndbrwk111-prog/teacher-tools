# Deployment — STEP 3A

현재 단계에서는 GitHub Pages를 공개 배포하지 않습니다.

STEP 3A의 목적은 다음과 같습니다.

- Hub UI 재구성
- Project A / Project B Production 링크 연결
- Feedback launcher card 제거
- Hub 하단에 Production Feedback Board 내장
- `/seating/` 승인본 유지

`main` merge와 GitHub Pages 활성화는 STEP 3A 검토 완료 후 별도로 진행합니다.

## 예정 공개 경로

Hub:

`https://xkdtndbrwk111-prog.github.io/teacher-tools/`

Seating:

`https://xkdtndbrwk111-prog.github.io/teacher-tools/seating/`

일반 GitHub Project Pages의 repository prefix를 전제로 합니다.

Hub는 다음 상대경로를 사용합니다.

- `./hub.css`
- `./hub.js`
- `./feedback.js`
- `./seating/`

repository subpath가 유지되어야 하므로 내부 링크를 `/seating/` 같은 origin-root 절대경로로 바꾸지 않습니다.

## Current Production connections

### Project A

Mario Game은 확인된 Project A Production Apps Script URL로 연결합니다.

설정 위치:

`hub.js`

### Project B

Mario Manager는 확인된 Project B Production Apps Script URL로 연결합니다.

설정 위치:

`hub.js`

### Feedback

Feedback은 별도 외부 페이지로 이동하지 않습니다.

Hub의 `feedback.js`가 Production Supabase의 공개 read RPC를 직접 호출합니다.

사용 RPC:

- `feedback_list_posts_v2`
- `feedback_get_thread_v2`

Production Supabase project ref:

`rhtyktjebiunkchddxvg`

Browser code에는 publishable key만 포함합니다.

`service_role`, database password, JWT signing secret, HMAC secret 또는 기타 server credential을 GitHub Pages에 포함하면 안 됩니다.

## Feedback deployment boundary

STEP 3A Feedback은 read-only입니다.

Hub에서 지원:

- 게시글 목록
- 공지
- 게시글 본문
- 댓글
- 게시글 pagination
- 댓글 pagination
- 새로고침
- 오류 및 retry state

Hub에서 지원하지 않음:

- 게시글 작성
- 댓글 작성
- 수정
- 삭제
- 로그인
- OWNER moderation

Feedback write path와 Project B authentication relay는 변경하지 않습니다.

Supabase schema, RPC, RLS도 STEP 3A 범위에서 변경하지 않습니다.

## Seating freeze

`seating/`은 승인된 STEP 1B 산출물입니다.

Source ZIP:

`classroom_seating_studio_v6_24_step1b_validation_hardened_2026-10-04.zip`

Source SHA-256:

`1a3344f5e2c6cd4b5b1367b4cff4e779034c0b7f765665509e96f34e075ab282`

STEP 3A에서는 `/seating/` 내부 파일을 수정하지 않습니다.

배포 전 기존 manifest와 비교하여 byte-identical 상태를 유지했는지 확인합니다.

## Local test

저장소의 부모 폴더에서:

`python3 -m http.server 8000`

실행 후 다음 주소에서 테스트합니다.

Hub:

`http://localhost:8000/teacher-tools/`

Seating:

`http://localhost:8000/teacher-tools/seating/`

`file://` 방식으로 테스트하지 않습니다.

## Pre-merge validation

STEP 3A PR merge 전에 다음 항목을 확인합니다.

### Hub

- Hub 로딩 시 JavaScript console error 없음
- Mario Game 카드가 Project A Production으로 이동
- Mario Manager 카드가 Project B Production으로 이동
- Seating 카드가 `./seating/`으로 이동
- Project C는 클릭, Enter, touch로 이동하지 않음
- Role Manager는 클릭, Enter, touch로 이동하지 않음
- Feedback launcher card가 존재하지 않음

### Feedback

- Hub 본체는 Feedback API 상태와 관계없이 먼저 표시됨
- Production 게시글 목록 표시
- 첫 게시글 자동 선택
- 게시글 본문 표시
- 댓글 표시
- 공지 badge 표시
- 게시글 더 보기 동작
- 댓글 더 보기 동작
- 새로고침 동작
- API 실패 시 Hub launcher는 계속 사용 가능
- 오류 메시지와 retry 동작 확인
- 사용자 작성 내용이 HTML로 실행되지 않음

### Responsive

다음 폭에서 확인합니다.

- 1280px
- 768px
- 390px
- 320px

Desktop / tablet에서는 Feedback list와 detail이 2-pane으로 표시됩니다.

Mobile에서는 1-column으로 전환되고 가로 overflow가 없어야 합니다.

### Seating regression

다음 기존 기능을 최소 smoke test합니다.

- `/teacher-tools/seating/` 직접 접속
- 새로고침
- 학급 데이터 저장 및 복원
- 새 배치 생성
- 배치 확정
- undo / redo
- history
- Export / Import
- 손상된 Import 거절
- 학생 공개 화면
- 간단 자리표
- JPG 다운로드
- avatar / sprite / playback asset 로딩

STEP 3A에서는 Seating 동작 자체를 변경하지 않습니다.

## GitHub Pages release procedure

STEP 3A 검토 완료 후에만 진행합니다.

1. `codex/step3a-hub-feedback` PR을 검토합니다.
2. 승인 후 `main`에 merge합니다.
3. merge commit SHA를 기록합니다.
4. GitHub repository의 Settings → Pages로 이동합니다.
5. Build and deployment에서 `Deploy from a branch`를 선택합니다.
6. branch는 `main`, folder는 `/ (root)`를 선택합니다.
7. GitHub Pages 공개 주소가 생성될 때까지 기다립니다.
8. 실제 공개 주소에서 Hub와 Seating을 다시 smoke test합니다.
9. Production Feedback RPC가 실제 Pages origin에서도 정상 동작하는지 확인합니다.

별도 build workflow, npm build, framework deploy는 필요하지 않습니다.

## Rollback

배포 전에 마지막 정상 commit SHA를 기록합니다.

문제 발생 시 main을 force push하지 않습니다.

별도 복구 branch에서 문제를 만든 commit을 `git revert`하고 복구 PR을 생성합니다.

복구 후 다음을 다시 확인합니다.

- Hub
- Production external links
- Feedback
- Seating

코드 rollback은 browser localStorage 데이터를 rollback하지 않습니다.

향후 Seating schema가 변경된 뒤 구버전 코드를 복구해야 하는 경우에는 데이터 호환성 검토가 선행되어야 합니다.

## Data and origin

Seating 학급 데이터는 browser localStorage의:

`teacher-tools.seating.state.v1`

에 저장됩니다.

Hub는 해당 데이터를 읽거나 업로드하지 않습니다.

같은 origin의 애플리케이션은 기술적으로 동일한 browser storage 영역에 접근할 수 있으므로 namespace는 보안 경계가 아닙니다.

host, protocol 또는 port가 바뀌면 새로운 origin이 됩니다.

기존 localStorage는 새 origin으로 자동 이전되지 않습니다.

주소를 변경해야 할 경우 기존 Seating 주소에서 JSON Export 후 새 주소에서 Import하는 전환 절차를 사용합니다.
