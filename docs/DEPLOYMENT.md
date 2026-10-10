# Deployment

현재 Hub는 GitHub Pages(branch 기반, main · `/ (root)`)로 게시되어 운영 중입니다. 별도 workflow 파일, build 도구, custom domain은 없습니다. 이 문서는 배포 설정을 바꾸지 않고 현재 상태와 재게시·rollback 절차를 기록합니다.

## 현재 경로

- Hub: `https://xkdtndbrwk111-prog.github.io/teacher-tools/`
- Seating: `https://xkdtndbrwk111-prog.github.io/teacher-tools/seating/`
- Hanja: `https://xkdtndbrwk111-prog.github.io/teacher-tools/hanja/`

일반 Project Pages의 repository prefix를 전제로 합니다. Hub는 `./hub.css`, `./hub.js`, `./seating/`을 사용하고 Seating은 기존 상대 경로를 유지합니다. `/seating/`처럼 origin-root 경로로 바꾸지 마세요.

## 현재 Production 대상

| 항목 | 위치 | Production 대상 |
|---|---|---|
| 마리오 게임 카드 | `hub.js` `mario-game.url` | Project A Production 게임 URL |
| 퀴즈 매니저 카드 | `hub.js` `mario-manager.url` | Project B Production `AKfycby9iWJSQhcYZncoPAvxeWm_Mk9ZvbHXcVcy_UWo6Vktbrdvwcev7rEPM3Y2X0U-SLca` |
| Feedback 공개 읽기 | `feedback-transport.js` `CONFIG` | Production Supabase `rhtyktjebiunkchddxvg` |
| Feedback 인증·변경 bridge | `feedback-auth-bridge.js` `BRIDGE_EXEC_URL` / `BRIDGE_ORIGIN` | Project B Production 배포(위와 동일 ID) |

Feedback의 현재 기준 상태는 [FB_HUB_1_FINAL_REPORT](project-b/FB_HUB_1_FINAL_REPORT.md)를 따릅니다. 외부 URL·Feedback 대상을 바꿀 때는 확인된 HTTPS Production 주소만 사용하고, 테스트용 주소를 운영 설정으로 넣지 마세요.

## 재게시 절차

main에 merge된 커밋이 GitHub Pages(Deploy from a branch, main, `/ (root)`)로 게시됩니다. Hub와 Seating·Hanja 파일을 모두 포함한 사이트 전체가 함께 게시됩니다.

1. 변경을 PR로 검토하고 승인 후 main에 merge합니다.
2. GitHub가 Pages 게시를 완료하면 아래 체크리스트로 공개 주소에서 검증합니다.

> HISTORICAL / SUPERSEDED: STEP 2 준비 단계 문서에는 "현재 단계에서는 게시하지 않습니다"와 외부 URL 초기값 null 안내가 있었습니다. 이후 Pages 게시, Project A/B Production URL 설정, FB-HUB-1 Production 전환이 완료되어 해당 문구는 더 이상 유효하지 않습니다.

## 로컬 및 게시 후 체크리스트

부모 폴더에서 `python3 -m http.server 8000` 실행 후 `/teacher-tools/` 경로에서 테스트합니다. file:// 테스트로 대체하지 마세요.

- Hub 로딩, console 오류, desktop/tablet/mobile 배치와 가로 넘침
- 키보드 focus와 Seating 이동
- Project C, Roles, 미설정 외부 카드의 클릭·Enter·touch 이동 없음
- `/teacher-tools/seating/` 직접 접속 및 새로고침
- HTML/CSS/JS, 학생 sprite, 교사 avatar, playback PNG 정상 로딩
- 학급 이름 등 변경 후 저장·새로고침 복원
- 새 배치, 확정, undo/redo, 히스토리
- JSON Export/Import 후 상태 복원, 손상된 파일 거절
- 학생 공개 화면, 즉시 완료, 간단 자리표, JPG 다운로드
- 불필요한 외부 network 요청 없음
- 게임/매니저 카드 Production 이동, Feedback 공개 목록·글 보기, `Creator 연결` → `Creator · OWNER 연결됨`

## Rollback

배포 전에 마지막 정상 commit SHA를 기록합니다(FB-HUB-1 완료 기준: `34f71e0a3f848c6c5c16f67fd657e4968b4c87bd`). 문제 발생 시 별도 복구 브랜치에서 문제를 만든 커밋을 `git revert <bad-commit>`으로 되돌리고 복구 PR을 검토·merge한 뒤 동일 Pages 경로에 게시합니다. 여러 커밋이면 최신부터 역순으로 revert합니다. merge commit은 mainline을 확인한 담당자가 처리합니다. main 강제 push로 이력을 지우지 않습니다.

복구 결과의 **전체 사이트 파일**이 이전 정상 커밋과 일치하는지 확인하고 Hub·Seating을 재검증합니다. 코드 rollback은 localStorage를 되돌리지 않습니다. 미래의 schema 변경 후 구버전 코드 복구 시 데이터 호환성 검토가 선행되어야 합니다. STEP 2에서는 Seating schema를 변경하지 않았습니다.

## 데이터와 도메인

학급 데이터는 사용자 브라우저의 `teacher-tools.seating.state.v1`에 저장됩니다. Hub는 읽거나 업로드하지 않습니다. namespace는 같은 origin 내 보안 격리를 제공하지 않습니다.

host/protocol/port 변경은 새로운 origin이며 기존 localStorage가 자동 이전되지 않습니다. 기존 주소를 유지한 상태에서 JSON Export → 새 주소에서 Import하는 전환 기간을 제공합니다. 리디렉션만으로 데이터가 이전되지 않습니다. 백업에는 학급 정보가 있으므로 사용자가 직접 보관하도록 안내합니다.
