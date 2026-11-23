# 호자보드 아몬드 — Canva 공식 임베드 링크 복구 후보 (2026-11-23)

## 현장 증상
- 아몬드 책 재생 화면에서 Canva 상단 메뉴·공유·가입, 하단 썸네일과 확대/축소 등 일반 Canva 보기 인터페이스가 노출됨.
- 기존 1.66.32 소유 WebView2는 `https://canva.link/9qxk3zuhh93ts2s`로 **최상위 탐색**하므로, 호자보드 자체 모달 안에 있더라도 일반 Canva 보기 UI가 렌더링됨.
- 사용자가 Canva에서 직접 발급받은 아몬드 공식 삽입 주소:
  `https://www.canva.com/design/DAHbOZ_XOJI/h3UEZISrHVAyXQuw06aOTw/view?embed`

## 제한된 변경
- [x] `BookReader.exe`의 **interactive 모드만** 소유 WebView2 내부의 단일 풀사이즈 HTML iframe에 공식 `?embed` URL 삽입.
- [x] 서버 및 대시보드에서 검증하는 승인 `canva.link` 요청 URL과 안정적인 책 ID `DAHbOZ_XOJI`는 변경하지 않음.
- [x] 일반 교사 등록 `view?embed` 도서 및 기타 앱의 기존 재생/북마크 경로 보존.
- [x] iframe에 fullscreen 허용. 외부 브라우저 팝업 없이 호자보드 자체 재생 슬롯 사용.
- [x] 클릭형 문서에는 네이티브 페이지 자동 이동/자동 판독/클릭 오버레이를 도입하지 않음. 현재 페이지 교사 수동 기록 정책 유지.
- [x] WebView2 최상위 탐색 제한은 유지하되, 생성된 임베드 HTML의 1회 `about:blank` 이동만 허용.
- [x] Windows 네이티브 자체 fixture에서 공식 임베드 iframe URL·수량·fullscreen 속성을 검증하도록 보강.
- [x] 코드 변경 범위를 `tools/multimedia/book-reader-host.cs` 및 해당 fixture 설명으로 제한.

## 검증·배포 체크리스트
- [x] GitHub Actions Windows 네이티브 빌드 및 fixture PASS
- [x] Windows 멀티미디어 브라우저 회귀 PASS
- [x] 새 `asset-book-reader-host.zip` 생성, SHA-256 확인 및 `runtime-src/system/server.ps1`의 정확한 해시 핀 교체
- [x] 정본 패키지에 위 ZIP 포함, 서명/업데이트 계보 검증
- [x] 버전 증가, 정확한 Windows CI·R8 CI PASS, 승인된 owner-field-test 배포 및 Pages 게시
- [ ] Windows 학교 PC에서 실제 Canva 임베드 로딩·클릭 순서/애니메이션·좌우키·터치 확인
- [ ] 전체화면·호자보드 자체 닫기·시스템 음량 확인
- [ ] 기존 379쪽 수동 페이지 기록/복귀와 외부 도서 회귀 확인

## 확인 범위
자동 fixture는 **임베드 iframe 생성 및 기본 UI 구조**만 검증한다. 제3자 Canva 서비스가 실제 iframe을 허용하는지, 클릭할 때 애니메이션이 원하는 순서로 진행되는지, WebView2에서 키보드/터치가 전달되는지는 Windows 실기기에서 확인하기 전까지 PASS 표시하지 않는다.

이번 후보만으로 서명된 업데이트 피드가 변경되었다고 주장하지 않는다.

## 배포 완료 기록 (현장 기능 검증과 분리)
- 수정 후보 PR #140 병합: `8fa3a896c28ac7b9ab7ea16b5865316709db2128`
- 배포 승인 PR #141 병합: `96aa7e7c5d907de0279ec226099f1e14295dabf5`
- Windows 임베드 fixture PASS: GitHub Actions `45143075956`; 변경 소스 포함 15개 리뷰 CI 및 9개 main CI PASS.
- 새 책 재생기 ZIP SHA-256: `80f7594fa78b39c6d06100d28e576e3e4e20f89c5501a9707588730be80cb4ad`
- 서명된 1.66.33 owner-field-test 게시: `45144395324` PASS; `stable/runtime-v1/latest.json`의 페이로드 버전 및 서명 확인.
- GitHub Pages 배포: `45144568604` PASS.
- **미검증 유지:** 실제 Windows 학교 PC에서 Canva iframe 렌더링, 클릭 애니메이션, 페이지 조작/키보드/터치, 전체화면·음량·닫기, 수동 북마크 회귀.
