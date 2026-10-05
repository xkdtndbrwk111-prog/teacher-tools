# Deployment — STEP 2 준비 문서

현재 단계에서는 게시하지 않습니다. Pages 활성화, DNS, custom domain, PR merge를 수행하지 않습니다.

## 예정 경로

- Hub: `https://<owner>.github.io/teacher-tools/`
- Seating: `https://<owner>.github.io/teacher-tools/seating/`

일반 Project Pages의 repository prefix를 전제로 합니다. Hub는 `./hub.css`, `./hub.js`, `./seating/`을 사용하고 Seating은 기존 상대 경로를 유지합니다. `/seating/`처럼 origin-root 경로로 바꾸지 마세요.

## 외부 URL

`hub.js` 상단 APPS의 다음 항목만 수정하세요.

1. `id: "mario-game"`의 url → 확인된 Project A Production 게임 URL
2. `id: "mario-manager"`의 url → 확인된 Project B Manager URL
3. `id: "feedback"`의 url → 확인된 Feedback Production URL

모두 처음에는 null입니다. 실제 HTTPS 주소를 확인하기 전에는 그대로 두세요. 제품은 active를 유지합니다. 테스트에 가짜 URL을 운영 설정으로 넣지 마세요. Feedback product/source 추가는 후속 Project B 작업입니다.

## 추후 승인된 게시 절차

1. STEP 2 PR 검토와 별도 merge/출시 승인을 받습니다.
2. 승인된 커밋이 main에 있는지 확인합니다.
3. GitHub Settings → Pages → Build and deployment에서 Deploy from a branch를 선택합니다.
4. main, `/ (root)`를 선택하여 게시합니다.
5. GitHub가 표시하는 주소에서 아래 검증을 수행합니다.

정적 파일을 그대로 게시하므로 별도 workflow 파일, build 도구가 필요하지 않습니다. GitHub 자체 게시 과정은 플랫폼에서 관리합니다. Hub와 Seating 파일을 모두 포함한 사이트 전체를 게시하세요.

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
- 실제 외부 URL 제공 후 게임/매니저/Feedback 이동 및 로그인 흐름 확인

## Rollback

배포 전에 마지막 정상 commit SHA를 기록합니다. 문제 발생 시 별도 복구 브랜치에서 문제를 만든 커밋을 `git revert <bad-commit>`으로 되돌리고 복구 PR을 검토·merge한 뒤 동일 Pages 경로에 게시합니다. 여러 커밋이면 최신부터 역순으로 revert합니다. merge commit은 mainline을 확인한 담당자가 처리합니다. main 강제 push로 이력을 지우지 않습니다.

복구 결과의 **전체 사이트 파일**이 이전 정상 커밋과 일치하는지 확인하고 Hub·Seating을 재검증합니다. 코드 rollback은 localStorage를 되돌리지 않습니다. 미래의 schema 변경 후 구버전 코드 복구 시 데이터 호환성 검토가 선행되어야 합니다. STEP 2에서는 Seating schema를 변경하지 않았습니다.

## 데이터와 도메인

학급 데이터는 사용자 브라우저의 `teacher-tools.seating.state.v1`에 저장됩니다. Hub는 읽거나 업로드하지 않습니다. namespace는 같은 origin 내 보안 격리를 제공하지 않습니다.

host/protocol/port 변경은 새로운 origin이며 기존 localStorage가 자동 이전되지 않습니다. 기존 주소를 유지한 상태에서 JSON Export → 새 주소에서 Import하는 전환 기간을 제공합니다. 리디렉션만으로 데이터가 이전되지 않습니다. 백업에는 학급 정보가 있으므로 사용자가 직접 보관하도록 안내합니다.
