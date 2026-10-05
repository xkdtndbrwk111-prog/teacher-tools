# App registry

Teacher Tools Hub의 애플리케이션 launcher 설정은 `hub.js`의 `APPS` 배열이 Source of Truth입니다.

Feedback은 STEP 3A부터 launcher app이 아니라 Hub 자체 기능이므로 `APPS`에 포함하지 않습니다.

## Registry fields

| 필드 | 계약 |
|---|---|
| `id` | 변경하지 않는 고유 식별자 |
| `title` | 화면에 표시할 이름 |
| `description` | 짧은 도구 설명 |
| `type` | `internal` 또는 `external` |
| `status` | `active` 또는 `development` |
| `url` | 확인된 주소 또는 `null` |
| `icon` | Hub 내부 고정 SVG icon key |
| `color` | Hub 카드 style key |

## Current apps

현재 launcher에는 정확히 다음 5개 앱만 존재합니다.

| id | 상태 | 종류 | 연결 |
|---|---|---|---|
| `mario-game` | active | external | Project A Production |
| `mario-manager` | active | external | Project B Production |
| `seating` | active | internal | `./seating/` |
| `project-c` | development | external | `null` |
| `role-manager` | development | internal | `null` |

`feedback` app entry는 존재하지 않습니다.

## Navigation rules

`active` 상태이며 유효한 URL이 있을 때만 실제 `<a>` 요소를 생성합니다.

외부 앱은 HTTPS만 허용합니다.

내부 앱은 `./seating/`처럼 현재 repository 기준 상대 경로만 허용하며, 동일 origin과 repository base path 안에서만 이동합니다.

유효하지 않은 URL은 링크로 만들지 않습니다.

`development` 상태 앱은 URL이 실수로 추가되어도 실제 링크를 생성하지 않습니다. 항상 비대화형 `<article>`로 렌더링합니다.

현재 다음 두 앱은 반드시 비활성 상태를 유지합니다.

- `project-c`
- `role-manager`

## Production app mapping

### Mario Game

`mario-game`

Project A Production deployment로 연결합니다.

### Mario Manager

`mario-manager`

Project B Production deployment로 연결합니다.

### Seating Manager

`seating`

Hub repository 내부의:

`./seating/`

으로 연결합니다.

## Feedback contract

Feedback은 별도 application launcher card가 아닙니다.

Hub 하단에 직접 렌더링되는 **Teacher Tools 공용 Feedback Board**입니다.

구조:

```text
Teacher Tools Hub
```

현재 read RPC:

`feedback_list_posts_v2`  
`feedback_get_thread_v2`

Feedback에서 사용하는 Production Supabase project ref:

`rhtyktjebiunkchddxvg`

Browser code에는 publishable key만 사용할 수 있습니다.

다음을 Hub repository에 저장하면 안 됩니다.

- `service_role`
- database password
- JWT signing secret
- Apps Script server secret
- HMAC secret
- owner credential

STEP 3A의 Feedback은 read-only입니다.

지원:

- 게시글 목록
- 공지
- 게시글 본문
- 댓글
- pagination
- refresh
- error / retry state

미지원:

- 글쓰기
- 댓글 작성
- 수정
- 삭제
- 로그인
- OWNER moderation

사용자 작성 데이터는 HTML로 해석하지 않고 `textContent` 또는 안전한 DOM node 생성 방식으로 렌더링합니다.

## Separation boundary

Hub는 Project A, Project B, Project C의 source code를 포함하지 않습니다.

외부 프로젝트의 인증, backend, game logic을 Hub에 복사하지 않습니다.

Seating만 Hub repository 내부 앱으로 배포됩니다.

Feedback은 기존 Production Supabase public-read contract를 소비할 뿐, Supabase schema, RPC, RLS 또는 Project B mutation/auth relay를 변경하지 않습니다.
    ↓
feedback.js
    ↓
Production Supabase public RPC
