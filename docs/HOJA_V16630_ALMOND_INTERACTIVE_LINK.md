# 호자보드 1.66.30 아몬드 클릭 애니메이션 링크 교체

## 사용자 요구 (2026-11-23)
- 이전 아몬드 공개 보기 링크 `https://www.canva.com/design/DAHbOZ_XOJI/d_oXAabCNXOYBSoES_ZXxA/view?embed` 사용 시 애니메이션이 클릭마다 실행되지 않고 자동 진행됨.
- 새 원본 링크: `https://canva.link/9qxk3zuhh93ts2s`
- 아몬드만 교체하며 다른 책/학급어린이회의/다운로더는 보존.

## 구현 체크리스트
- [x] 내장 아몬드 `firstBook.url`을 새 공유 링크로 교체
- [x] 안정적인 책 ID `DAHbOZ_XOJI` 유지 (북마크 키 유지)
- [x] 클릭형 링크는 Windows 원격 네이티브 재생기 진입 생략
- [x] 클릭형 웹 재생은 페이지 방향키 가로채기 없이, Canva iframe에 autoplay 권한을 별도 요청하지 않음
- [x] 전체화면 Escape 동작은 유지 (브라우저 포커스 상태에 따라 직접 화면 해제 버튼 사용 가능)
- [x] 직접 공유 링크 여는 `캔바에서 클릭하며 읽기` 버튼 추가
- [x] 웹 모드 북마크는 자동이 아닌 수동 입력임을 설명
- [x] 일반 Canva `view?embed` 등록 책은 기존 네이티브 경로와 자동 북마크를 유지
- [x] 브라우저 회귀 시험에 아몬드 URL/네이티브 우회/자동재생 허용 안 함/북마크 키/방향키·Escape 검증 추가

## 검증·배포 게이트
- [x] GitHub Actions 멀티미디어 브라우저 회귀 PASS — PR #133, run `45092601211` (Linux/Windows)
- [x] R8 source-driven build 및 native Windows 검증 PASS — main `45092761553` / `45092761637`
- [ ] 실제 `canva.link` 공개 페이지의 클릭-애니메이션·페이지 이동·전체화면 터치 동작 실기기 PASS
- [ ] 실제 Canva가 iframe을 차단할 경우 `캔바에서 클릭하며 읽기`로 브라우저 직접 열기 PASS
- [x] SHA/승인 아티팩트 고정, 서명 및 stable 1.66.30 게시 — owner-pilot `45093110062`
- [ ] 학교 PC 업데이트 설치·재실행과 북마크 확인

**주의:** 새 단축 주소는 현재 작업 환경에서 리디렉션 대상/Canva 실제 애니메이션을 열어 검증할 수 없다. `allow`에서 autoplay 권한을 빼는 것만으로 Canva 자체의 자동 애니메이션을 강제로 차단할 수 있는 것은 아니다. 실제 공유 옵션/발표 방식은 실기기에서 확인한다. 서명 배포는 교사 운영 시험용으로 완료되었지만 학교 실기기 동작을 PASS로 표시하지 않는다.

1.66.29 기반으로 검토한 1.66.30은 PR #133/#134를 통해 `main` 병합 후 서명된 owner-field-test 채널에 게시했다. 일반 현장 검증 게이트는 아직 미통과.

## 배포 검증 기록
- [x] 1.66.30 서명 manifest 파일 `stable/runtime-v1/latest.json`에 version=1.66.30, signature 존재
- [x] 원자적 publish 단계 성공 (GitHub Actions `45093110062`)
- [ ] GitHub Pages 게시 완료 후 학교 PC에서 설정→업데이트 확인으로 1.66.30 설치
- [ ] 페이지 클릭 애니메이션의 실제 수동·자동 동작 확인. iframe이 작동하지 않으면 `캔바에서 클릭하며 읽기` 버튼으로 원본 주소 직접 열기
