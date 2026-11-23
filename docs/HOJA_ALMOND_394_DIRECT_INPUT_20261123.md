# 호자보드 아몬드 — 394쪽 및 직접 조작 복구 후보 (2026-11-23)

## 현장 확인과 증거
- 사용자가 아몬드 전체 분량은 약 390쪽이고 호자보드에는 379쪽으로 나온다고 보고.
- 연결된 Canva 원본 디자인 **DAHbOZ_XOJI** 실제 `page_count=394` 확인 (2026-11-23). 기존 `canva.link/9qxk3zuhh93ts2s`도 **동일 디자인**으로 해석됨. 잘못된 책을 가리키는 문제는 아님.
- 1.66.33에서 `firstBook.pages=379`로 고정했고 `tt-books-v1:total:DAHbOZ_XOJI`에 구형 값이 남으면 소스 기본값보다 우선하는 로직 확인.
- 1.66.33 Windows BookReader.exe는 클릭형 아몬드를 내부 iframe으로 감싸서 렌더. 학교 PC에서 클릭/좌우키 전달이 안 됨. 원래 클릭형 프레젠테이션은 **직접 최상위 탐색**이 필요.

## 후보 변경
- [x] 원본 책 ID, URL, 기존 북마크 키 불변.
- [x] 기본 총 페이지 수를 394로 수정하고 **저장된 오래된 379 등보다 최신 기본값을 우선** (`Math.max`). 사용자가 저장한 북마크는 삭제하지 않음.
- [x] 아몬드를 별도 외부 브라우저가 아닌 **호자보드 소유 네이티브 WebView2의 최상위 문서**로 탐색. 중첩 iframe 제거.
- [x] 실제 클릭/키보드를 Canva 자신이 처리. 인위적 가로채기/스크립트 페이지 넘기기 오버레이를 사용하지 않음.
- [x] Canva 탐색은 기존 허용된 책 디자인으로 제한, 외부 팝업 차단 유지.
- [x] 재생기 준비 시 포커스 복구. 호자보드 하단 제목·페이지·음량·전체화면·닫기 유지.
- [x] Windows fixture에는 최상위 DOM의 클릭과 좌우키 테스트 추가, 브라우저 목록/수동 북마크의 총 쪽수 검증 변경.
- [x] Windows CI 네이티브 빌드 및 fixture PASS — [45289650391](https://github.com/xkdtndbrwk111-prog/teacher-tools/actions/runs/45289650391)
- [x] Linux/Windows 멀티미디어 브라우저 회귀 PASS — [45289650234](https://github.com/xkdtndbrwk111-prog/teacher-tools/actions/runs/45289650234)
- [ ] Windows 학교 PC에서 실제 Canva 로그인 여부, 탭 없는 모달·클릭 애니메이션·←/→·터치 동작 확인
- [ ] 새 네이티브 ZIP 해시 재고정 및 **다음 서명된 안정 릴리스** 생성/게시

## 중요 배포 구분
**이 PR은 1.66.33의 기존 서명된 설치본을 바꾸지 않음.** 
네이티브 코드 변경은 Windows 빌드·fixture→정확한 ZIP 자산 핀→R8 서명 릴리스 승인을 통과해야 설치 프로그램에서 보인다.
실제 외부 Canva 페이지의 접근/클릭 애니메이션은 제한된 fixture와 별개이며 학교 PC 실기기 검증 전까지 PASS로 표시하지 않는다.

## 2026-11-24 Windows 현장 실패 확인
- Windows 호자보드 책읽기 화면에서 검정 배경 ‘내장 Canva 재생기를 실행하지 못했습니다.’와 ‘Canva 직접 열기’ 링크가 표시됨. 기존 1.66.33 설치/재설치로는 해결되지 않는 문제.
- 실제 서버는 `Open-TTBookHost` 오류를 `BUNDLE_MISMATCH`, `OWNER_NOT_FOUND`, `READER_ALREADY_RUNNING`, `READER_START_ERROR`, `BOOK_URL_INVALID` 코드로 구분하지만, 기존 프런트엔드는 그 메시지를 표시하지 않아 이 화면만으로 원인을 특정할 수 없음.
- [x] `fallback()`에 서버 오류 코드와 사람이 읽을 수 있는 설명 표시 + ‘내장 재생기 다시 시도’ 버튼 제공. Canva 직접 열기 링크의 어두운 글자 대비도 개선. 다른 모드 iframe fallback 불변.
- [x] 브라우저 회귀에서 `OWNER_NOT_FOUND` 모의 409 오류 → 코드 표시 → 같은 모달에서 재시도 → 정상 세션 생성 검증.
- [ ] 실제 사용자 PC 진단: asset-book-reader-host.zip SHA256, board-mode.json owner PID/창 상태, book-reader-sessions 최신 상태, WebView2 설치 여부 확인.
- [ ] 새 1.66.34+ 서명 배포 후보 구성/Windows 실제 클릭·좌우 넘김 검수: R8 source-driven build의 기존 1.66.33 재빌드는 비증가 버전 검사로 실패하므로 무단으로 서명 피드를 덮어쓰지 않음.
