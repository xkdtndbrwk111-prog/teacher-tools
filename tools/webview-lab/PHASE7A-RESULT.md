# Phase 7A — 온라인 실행 프로필 결과

기준 브랜치: `research/hoja-webview2-phase1`  
기준 커밋: `08131cf8b1dc0e226a71a18a00e343be6097a1f0`

## 구현

- `phase7a-online-profile.json`에 HTTPS 기반 교실매니저·호자 미니게임·네이티브 API origin을 명시했다.
- 온라인 프로필의 정적 서버 실행 파일 목록은 비어 있으며, 사용자 데이터는 교체 가능한 패키지 밖에 둔다는 계약을 명시했다.
- `phase7a-online-preflight.ps1`는 HTTPS, 레거시 loopback origin 누출, 정적 서버 패키징 여부를 검사한다. `-NetworkCheck`를 사용할 때만 읽기 전용 HEAD 요청을 수행한다.
- `phase7a-profile.test.cjs`로 macOS에서 계약을 재현할 수 있다.

## 검증

```text
node tools/webview-lab/phase7a-profile.test.cjs
PASS Phase 7A online profile contract
```

macOS에서는 Windows WebView2 실행 파일과 Authenticode 검증을 직접 수행할 수 없다. 따라서 기존 로컬 정적 서버 파일을 삭제하거나 Windows 런처를 성급히 바꾸지 않았다. Phase 7B에서 네이티브 서버·런처의 PowerShell 의존성을 제거하고, Phase 7C에서 설치 프로그램을 별도 구현한다.

운영 main, stable 피드, 실제 사용자 데이터는 변경하지 않았다.
