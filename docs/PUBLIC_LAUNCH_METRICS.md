# 공식 공개 통계 — 준비 완료 / 수집 OFF

공개 전에는 집계·표시·공식 다운로드 링크가 모두 비활성화되어 있습니다. 이전 방문 기록은 가져오지 않고, 새 통계는 모두 0에서 시작합니다.

| 지표 | 초기값 | 의미 |
| --- | ---: | --- |
| 교실매니저 TODAY | 0 | 한국 시간 기준 당일 접속; 같은 탭 새로고침은 중복 집계 안 함 |
| 교실매니저 TOTAL | 0 | 공식 공개 이후 접속 누적 |
| 호자보드 다운로드 | 0 | 보리꼬리 공작소 공식 다운로드 요청 누적 |
| 호자보드 자동 업데이트 | 0 | 서명 검증 후 새 버전 설치 및 정상 재시작에 성공한 작업 누적 |

## 잠금 장치 (공개 이전 유지)

1. launch-metrics-config.js: enabled=false이며 **사이트 HTML에는 아직 불러오지 않음**. V2 usage-stats.js는 이 설정이 없거나 비활성이면 즉시 종료하므로 공개 전 RPC 호출/집계/UI가 없습니다.
2. Supabase launch_metrics_control_v2.enabled=false. 공개 사용자에게 집계 함수의 실행 권한이 없으며, 네 수치의 읽기 권한도 공개 전에는 차단되어 있습니다.
3. 호자보드 공식 다운로드 카드: 대시보드 URL null, download=false로 유지합니다.
4. 서명된 Windows 업데이트 프로그램은 이번 준비 작업에서 수정하지 않습니다. 성공 보고용 서버 RPC 계약만 준비합니다.

## DB 준비 상태

기존 웹 통계의 Supabase 프로젝트: SMQ-Feedback (rhtyktjebiunkchddxvg).
2026-11-21 프로젝트 복구 뒤 SQL 연결 정상, 아래 두 마이그레이션을 **실제 DB에 적용 완료**했습니다.

- docs/usage-migrations/20261121_launch_metrics_v2_prelaunch.sql
- docs/usage-migrations/20261121_launch_metrics_v2_public_read_lock.sql

관리자 SQL에서 select * from public.get_launch_metrics_v2(); 를 실행해 다음을 직접 확인했습니다.

- enabled=false, classroom_today=0, classroom_total=0, hoja_downloads=0, hoja_updates=0
- 날짜별 방문 기록 0행, 업데이트 성공 영수증 0행, 누적값 0이 아닌 지표 0개
- anon/authenticated의 기록 함수 실행권한 없음, 익명 업데이트 보고 불가, 네 지표 공개 조회 권한 없음
- 비활성 상태에서 집계 함수를 호출해도 false를 반환하고 값은 변경되지 않음

기존 app_usage_totals 자료는 새 지표에 **이관하지 않았고 기존 테이블도 삭제하지 않았습니다**. 신규 V2 집계는 완전히 별개입니다.

## 공개일에만 수행할 일 (지금은 금지)

1. 준비된 DB 스키마가 실제로 적용되어 있고 집계값 네 개가 0인지 확인합니다.
2. 호자보드 정상 업데이트 완료·재시작 성공 시점에만 별도 신뢰 서버에서 record_verified_hoja_update_v2(uuid)를 호출하도록 연결합니다. 무작위 작업별 영수증 ID로 중복 성공 보고를 차단하며, 서비스 역할 키를 브라우저나 Windows 클라이언트에 넣지 않습니다.
3. 보리꼬리 공작소의 호자보드 공식 설치 파일 URL을 검증한 후 공개하고 download 플래그를 켭니다.
4. 공개 범위를 정한 후 서버 launch_metrics_control_v2.enabled=true로 전환하고 get_launch_metrics_v2() 조회 권한 및 record_public_launch_v2(text) 기록 권한을 승인된 공개 역할에만 부여합니다.
5. 공개 승인을 받은 변경에서만 launch-metrics-config.js의 enabled:true를 적용하고, 공식 허브·교실매니저 HTML에서 이 설정을 V2 추적기보다 앞서 불러옵니다. 오늘 기준을 Asia/Seoul로 확인합니다.

이 절차는 통계 코드·DB 초기값·공개 스위치의 **준비**이며, 실제 수집 시작이나 호자보드 정식 출시를 의미하지 않습니다.
