# 공식 공개 통계 — 준비 완료 / 수집 OFF

공개 전에는 집계·표시·공식 다운로드 링크가 모두 비활성화되어 있습니다. 이전 방문 기록은 가져오지 않고, 새 통계는 모두 0에서 시작합니다.

| 지표 | 초기값 | 의미 |
| --- | ---: | --- |
| 교실매니저 TODAY | 0 | 한국 시간 기준 당일 접속; 같은 탭 새로고침은 중복 집계 안 함 |
| 교실매니저 TOTAL | 0 | 공식 공개 이후 접속 누적 |
| 호자보드 다운로드 | 0 | 보리꼬리 공작소 공식 다운로드 요청 누적 |
| 호자보드 자동 업데이트 | 0 | 서명 검증 후 새 버전 설치 및 정상 재시작에 성공한 작업 누적 |

## 잠금 장치 (공개 이전 유지)

1. launch-metrics-config.js: enabled=false. 기존 usage-stats.js의 v1 수집 기능을 대체하며, 비활성 상태에서는 RPC 호출 및 통계 UI 표시를 하지 않습니다.
2. Supabase launch_metrics_control_v2.enabled=false (준비용 스키마). record_public_launch_v2는 anon/authenticated에 실행 권한을 부여하지 않았습니다.
3. 호자보드 공식 다운로드 카드: 대시보드 URL null, download=false로 유지합니다.
4. 서명된 Windows 업데이트 프로그램은 이번 준비 작업에서 수정하지 않습니다. 성공 보고용 서버 RPC 계약만 준비합니다.

## DB 준비 상태

기존 웹 통계의 Supabase 프로젝트: rhtyktjebiunkchddxvg.
확인 시 INACTIVE였고 SQL 연결도 실패했기 때문에 **실제 DB 초기화 및 스키마 적용은 아직 하지 않았습니다**.
준비용 SQL 파일: docs/usage-migrations/20261121_launch_metrics_v2_prelaunch.sql.

프로젝트가 다시 활성화되면 승인된 관리 경로에서 해당 SQL을 적용하고 다음을 검증해야 합니다.

    select * from public.get_launch_metrics_v2();

기대값: enabled=false, classroom_today=0, classroom_total=0, hoja_downloads=0, hoja_updates=0.
기존 app_usage_totals 데이터는 새로운 테이블로 옮기지 않으며 새 지표에도 섞지 않습니다. 이전 통계 행 자체는 삭제하지 않습니다.

## 공개일에만 수행할 일 (지금은 금지)

1. 준비된 DB 스키마가 실제로 적용되어 있고 집계값 네 개가 0인지 확인합니다.
2. 호자보드 정상 업데이트 완료·재시작 성공 시점에만 별도 신뢰 서버에서 record_verified_hoja_update_v2(uuid)를 호출하도록 연결합니다. 무작위 작업별 영수증 ID로 중복 성공 보고를 차단하며, 서비스 역할 키를 브라우저나 Windows 클라이언트에 넣지 않습니다.
3. 보리꼬리 공작소의 호자보드 공식 설치 파일 URL을 검증한 후 공개하고 download 플래그를 켭니다.
4. 서버 launch_metrics_control_v2.enabled=true로 전환하고 record_public_launch_v2(text)의 anon/authenticated EXECUTE 권한을 공개합니다.
5. 공개 승인을 받은 변경에서만 launch-metrics-config.js의 enabled:true를 적용합니다. 오늘 기준을 Asia/Seoul로 확인합니다.

본 작업은 통계 코드/초기 스키마의 **준비**이지 배포 승인 또는 통계 수집 시작이 아닙니다.
