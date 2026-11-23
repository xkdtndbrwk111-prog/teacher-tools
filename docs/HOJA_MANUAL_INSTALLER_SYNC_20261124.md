# 호자보드 수동 설치파일 — 보리꼬리공작소 다운로드/자동업데이트 동기화 (2026-11-24)

## 현장 요청
- 설치 ZIP 파일명에 정확한 버전 표시: `호자보드_1.66.33_설치파일.zip`
- `호자보드 설치.cmd`, 도움말 `설치가 안되면 열어보세요.txt` 포함
- 재설치 및 이후 업데이트에서도 바로가기 `호자보드.lnk` 하나만 유지
- 공작소 공식 다운로드 카드에 설치 파일 연결, 이후 서명된 자동 업데이트와 버전 동기화

## 구현·검증 체크리스트
- [x] 이전 1.66.33 재설치 오류 수정 ZIP을 고정 SHA256(`3eaeb50cd666bbe607dd6adc885a59e1ebdbd4027835ed23fbf2c0aec2c24bb7`) seed로 등록
- [x] RSA2048 PKCS#1 v1.5 SHA256 서명 및 R8 manifest 계약 검증 없이는 게시하지 않도록 자동 빌드
- [x] 서명된 `stable/runtime-v1/latest.json`의 **동일 버전과 payload SHA**로 설치기 생성
- [x] 이전 수동 설치 ZIP에 있던 `File.Replace` 안전 백업 경로 및 단일 바탕화면 바로가기 재생성 동작 보존
- [x] `hoja-board/downloads/호자보드_<version>_설치파일.zip`과 `hoja-board/release.json`을 하나의 커밋에 함께 게시
- [x] 최신 버전의 서명된 manifest가 변경될 때마다 자동 생성·배포 트리거 설정
- [x] 이전 버전으로 다운그레이드 및 동일 버전의 내용 바꿔치기 차단
- [x] 공작소 페이지에서 **정확한 버전이 들어간 같은 출처(downloads) URL**만 다운로드 링크로 허용
- [x] PR #144 서명 검증/ZIP 구조/해시/반복 재생성 CI PASS (`45209874576`)
- [x] main 병합 후 자동 게시 CI PASS (`45210055686`)
- [x] GitHub Pages 재게시 PASS (`45210083688`)
- [ ] Windows 실제 PC에서 공식 공작소 다운로드→수동 설치→단일 바로가기→재설치 및 다음 버전 자동 업데이트 현장 시험

## 1.66.33 배포 정보
- GitHub: https://github.com/xkdtndbrwk111-prog/teacher-tools/pull/144
- 공식 다운로드: https://xkdtndbrwk111-prog.github.io/teacher-tools/hoja-board/
- ZIP: `호자보드_1.66.33_설치파일.zip`
- SHA256: `9f0922958baa8193ac3a96c3f923b733492744f1179f105c00a39792befd9c33`
- 서명된 업데이트 payload SHA256: `ad2164eb3148868fbdaea01f9c7ede3adb423a93e87827f7d1621c2bd25af09d`

**구분:** 별도로 검토 중인 아몬드 394쪽/Canva 입력 복구 PR #143은 이 1.66.33 서명 설치판에 포함되지 않는다. 다음 승인된 서명 릴리스가 나와야 자동 업데이트 및 공식 설치 파일 모두에 반영된다.
