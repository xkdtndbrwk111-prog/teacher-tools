# App registry

앱 카드 라우팅의 유일한 설정 위치는 `hub.js`의 `APPS`입니다. 카드 HTML은 registry에서 생성됩니다. (Feedback 게시판은 앱 카드가 아니며 아래 예외 절을 따릅니다.)

| 필드 | 계약 |
|---|---|
| id | 변경하지 않는 고유 식별자 |
| title | 한국어 표시 이름 |
| description | 짧은 도구 설명 |
| type | internal 또는 external |
| status | active 또는 development만 사용 |
| url | 확인된 주소 또는 null |
| icon, color | Hub 내부 아이콘·색상 표시 키 |

active + 유효 URL이면 실제 anchor를 생성합니다. 내부 URL은 `./seating/`처럼 저장소 기준 상대 경로여야 하며 동일 origin·기준 경로 안에서만 이동합니다. 외부 URL은 HTTPS만 허용합니다. 이동은 같은 탭에서 이루어집니다.

active + null/잘못된 URL이면 ‘링크 설정 필요’로 표시합니다. 제품 상태를 development로 바꾸지 않습니다. article로 렌더링하며 클릭·키보드 이동 핸들러나 tabindex를 부여하지 않습니다.

development이면 URL 유무와 관계없이 article을 생성하며 ‘개발 중’을 표시합니다. 현재 Project C와 role-manager의 URL은 반드시 null로 유지합니다. 실제 출시 검증 후에만 status와 url을 바꾸고 Hub를 재게시하세요.

외부 연결값: `mario-game.url` = Project A 게임 Production, `mario-manager.url` = Project B Manager Production(`AKfycby9iWJ…SLca`). Feedback은 링크 항목이 아니라 Hub 내장 게시판입니다. 임의 주소, secret, 인증 token, 학급 데이터, Feedback product/source query를 추가하지 마세요.

앱 카드 registry는 정적입니다. 카드 렌더링·이동은 인증·storage·API 호출을 수행하지 않습니다. 아이콘은 자체 SVG이며 외부 폰트·분석 도구가 없습니다.

## 예외: Hub Feedback 게시판

Hub에 내장된 Feedback 게시판(`feedback-board.js`)은 위 "API 호출 없음" 원칙의 문서화된 예외입니다.

- 공개 읽기: `feedback-transport.js`가 Production Supabase 공개 v3 RPC(publishable key)를 호출합니다.
- 인증·변경: `feedback-auth-bridge.js`가 Project B Production 배포와 popup bridge(정확한 origin·nonce·`event.source` 확인)로 통신합니다.

Hub는 신원·권한 판단 주체가 아닙니다. Creator/OWNER 판정, mutation 실행, idempotency, moderation은 모두 Project B 서버가 결정합니다. Hub는 service-role secret이나 actor 권한값을 받거나 보내지 않습니다.
