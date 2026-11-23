# 1.66.32 — 아몬드 클릭형 Canva: 호자보드 내부 WebView2

## 사용자 요구 (2026-11-23)
- 1.66.31에서 책 읽어주기를 선택하면 외부 브라우저 창이 열림.
- 원래 원하는 동작은 **호자보드 내부 자체 책 읽기 창**이다.
- Canva의 `iframe`은 "연결을 거부"하므로 iframe 방식으로 돌아가지 않는다.
- 기존 클릭 애니메이션 / 터치 / 최소 조작바(제목, 페이지, 볼륨, 전체화면, 닫기)를 유지.

## 설계
- 아몬드 `https://canva.link/9qxk3zuhh93ts2s`만 `interactive=true`로 허용하는 서버/네이티브 호스트 이중 검사.
- 서명된 `BookReader.exe`의 WebView2를 **최상위 탐색**으로 사용하고 Windows 앱 소유 창으로 호자보드의 재생 슬롯 위에 위치시킨다.
- Canva `iframe`이나 자동 넘김용 오버레이를 절대 추가하지 않는다.
- 클릭형 문서의 리디렉션은 `https://www.canva.com/design/DAHbOZ_XOJI/` 내로 제한하며 외부 도메인은 차단한다.
- Canva 페이지 내부를 자동 분석하지 않는다. 페이지 번호는 입력 후 로컬 저장하고 네이티브 호스트와 동기화한다.
- 학교 실기기에서 WebView2 내 Canva 로그인/발표/애니메이션/키보드 작동 확인. 별도 프로필 때문에 일반 Edge에 로그인된 상태가 자동 공유되지는 않는다.

## 체크리스트
- [x] WebView2 호자보드 소유 재생기 내 interactive 모드 구현
- [x] 사용자 제공 아몬드 링크 정확 일치 검증 및 Canva 도메인 이탈 차단
- [x] 원래 `view?embed` 다른 도서의 기존 재생기 유지
- [x] 하단 다섯 항목 외 추가 조작 버튼 제거
- [x] 새 WebView2 코드의 deterministic Windows fixture 추가
- [x] 브라우저 회귀: 외부 탭/iframe 없는 네이티브 모드, 페이지 수동 저장
- [ ] Windows native fixture / Windows 및 Linux 브라우저 회귀 PASS
- [ ] 새 `asset-book-reader-host.zip` 빌드 후 SHA-256 재고정 및 서버 검증
- [ ] 정확한 서명 업데이트 + Pages 배포 완료
- [ ] 학교 PC에서 실제 Canva 링크·클릭 애니메이션·전체화면·음량 확인

**주의:** 코드/가짜 DOM fixture 통과는 실제 Canva에서의 클릭 애니메이션까지 보장하지 않는다. 특히 Canva 계정 로그인과 WebView2의 별도 프로필 차이에 따른 화면을 현장에서 확인해야 한다.
