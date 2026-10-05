# Teacher Tools Hub

수업과 학급 운영에 필요한 도구를 한곳에서 연결하는 정적 Teacher Tools Hub입니다.

HTML, CSS, vanilla JavaScript만 사용하며 별도 build, npm, framework 의존성이 없습니다.

## 구성

| 도구 | 상태 | 위치 |
|---|---|---|
| 마리오 게임 | active | 외부 Project A Production |
| 마리오 매니저 | active | 외부 Project B Production |
| 자리배치 매니저 | active | `./seating/` |
| Project C | development | 향후 외부 서비스 |
| 1인1역 배치 매니저 | development | 향후 내부 앱 |

피드백은 더 이상 별도 launcher card가 아닙니다.

Hub 하단에 **Teacher Tools 공용 피드백 게시판**이 직접 포함되어 있으며 Production Supabase의 공개 읽기 RPC를 사용합니다.

## Hub 구조

상단은 Teacher Tools 애플리케이션 launcher입니다.

- 마리오 게임
- 마리오 매니저
- 자리배치 매니저
- Project C — 개발 중
- 1인1역 배치 매니저 — 개발 중

하단은 Teacher Tools 전체에 대한 공용 Feedback Board입니다.

Desktop에서는 게시글 목록과 선택한 글을 2-pane으로 표시하고, 작은 화면에서는 1-column으로 표시합니다.

## Production 외부 서비스

### Project A — 마리오 게임

`hub.js`에 확인된 Production URL이 설정되어 있습니다.

### Project B — 마리오 매니저

`hub.js`에 확인된 Production URL이 설정되어 있습니다.

외부 앱은 HTTPS 주소만 허용합니다.

development 상태 앱은 URL 유무와 관계없이 실제 링크를 생성하지 않습니다.

## Feedback Board

Feedback은 별도 웹앱을 iframe으로 삽입하지 않습니다.

Hub 브라우저에서 Production Supabase의 공개 RPC를 직접 호출합니다.

읽기 경로:

```text
GitHub Pages Hub
    ↓
Production Supabase
    ↓
feedback_list_posts_v2
feedback_get_thread_v2
```

현재 STEP 3A에서 제공하는 기능:

- 게시글 목록 읽기
- 공지 표시
- 게시글 본문 읽기
- 댓글 읽기
- 게시글 pagination
- 댓글 pagination
- 새로고침
- 오류 및 retry 상태

현재 STEP 3A에서는 다음 기능을 제공하지 않습니다.

- 게시글 작성
- 댓글 작성
- 수정
- 삭제
- 로그인
- OWNER moderation

Feedback browser code에는 Supabase의 **publishable key만** 포함됩니다.

`service_role`, database password, JWT signing secret, Apps Script secret 등 서버 비밀정보를 GitHub Pages에 포함하면 안 됩니다.

Feedback 게시글·댓글 등 사용자 작성 데이터는 HTML로 실행하지 않고 DOM `textContent`로 렌더링합니다.

## 자리배치 매니저

`seating/`은 승인된 STEP 1B 자리배치 매니저를 그대로 포함합니다.

승인 원본:

`classroom_seating_studio_v6_24_step1b_validation_hardened_2026-10-04.zip`

STEP 3A에서는 `seating/` 내부 파일을 수정하지 않습니다.

자리배치 개인 학급 데이터는 브라우저 로컬 저장소에 저장되며 Hub가 해당 데이터를 읽거나 업로드하지 않습니다.

현재 storage namespace:

`teacher-tools.seating.state.v1`

브라우저 데이터 삭제나 기기 변경에 대비해 자리배치 앱의 JSON Export 기능으로 백업할 수 있습니다.

같은 origin의 웹앱은 기술적으로 동일한 브라우저 저장소 영역에 접근할 수 있으므로 namespace는 보안 격리가 아니라 이름 충돌 방지 규칙입니다.

## 로컬 실행

저장소의 부모 폴더에서:

```bash
python3 -m http.server 8000
```

실행 후:

```text
http://localhost:8000/teacher-tools/
```

로 접속하면 GitHub Project Pages의 repository subpath 환경을 재현할 수 있습니다.

`file://` 방식으로 테스트하지 않습니다.

## 예정 GitHub Pages 주소

Hub:

```text
https://xkdtndbrwk111-prog.github.io/teacher-tools/
```

Seating:

```text
https://xkdtndbrwk111-prog.github.io/teacher-tools/seating/
```

GitHub Pages 활성화와 Production 공개는 STEP 3A 구현 및 검토가 끝난 뒤 별도 승인 단계에서 수행합니다.

## 현재 단계

STEP 3A:

**Hub UI restructure + embedded Production Feedback Board**

아직 `main` merge 또는 GitHub Pages Production 배포는 수행하지 않습니다.
