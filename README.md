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
