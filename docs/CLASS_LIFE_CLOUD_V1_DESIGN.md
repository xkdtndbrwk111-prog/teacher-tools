# Teacher Tools 학급생활 CLOUD V1.0 설계

상태: STEP 09-B 설계·로컬 계약 검증 완료 / 실제 Google Cloud 구축 NOT RUN  
기준 커밋: STEP 08 `c3e7b913d57acca043d227655135dbc990e0e571`  
작성일: 2026-11-08

## 1. 범위와 비목표

이 문서는 학급생활 설문·관찰 기록만 Cloud Run과 Firestore로 옮기는 설계다. 자리배치, 체육모둠, 성적 관리, 기존 IndexedDB, Google Sheets NORMAL의 `TT_DATA`·`TT_SYNC`는 변경하지 않는다. 체육모둠 결과를 영구 저장하지 않는다. 실제 프로젝트·결제·서비스 계정·클라우드 리소스는 이번 단계에서 만들지 않는다.

## 2. 현재 SQLite TEST 서버 분석

현재 `classroom/survey/test-server.mjs`는 다음 계약을 이미 제공한다.

- 개인 코드: 학생별 salt+scrypt 해시만 저장하고 원문 코드는 최초 발급·재발급 응답에서만 반환한다.
- 세션: 무작위 토큰의 SHA-256 해시를 SQLite에 저장하며 코드 재발급 시 해당 학생 세션을 삭제한다.
- 범위: `year + class_id + student_id` 복합 범위로 학생·응답·설문 상태를 분리한다.
- 제출: `(year,class_id,student_id,month)` UNIQUE와 트랜잭션으로 중복 제출을 차단한다.
- 교사 기능: 등록, 코드 재발급, 설문 개설/종료, 현황, 분석, 관찰 기록 CRUD.
- 한계: 단일 공유 교사 비밀키, 교사 소유자 개념 부재, 단일 로컬 SQLite, loopback 전용, 인메모리 로그인 제한, 다중 인스턴스 불가, 운영 백업·감사·HTTPS 부재.

운영 전환은 API 의미를 유지하되 모든 경로에 검증된 `teacherUid` 소유 범위를 추가한다.

## 3. 배포 경계

- 학생 설문 UI와 학생 API는 같은 Cloud Run 도메인에서 제공한다. QR은 이 HTTPS 주소만 담고 개인 코드·토큰을 담지 않는다.
- 기존 GitHub Pages 교사 화면은 Cloud Run 교사 API를 호출한다.
- CORS는 정확한 운영 Pages origin과 로컬 QA origin만 허용한다. `*`는 금지한다.
- Cloud Run은 외부 호출 가능 서비스이지만 모든 교사·학생 권한 검증은 애플리케이션에서 수행한다.
- Firestore는 브라우저에서 직접 접근하지 않는다. Admin SDK를 사용하는 Cloud Run 서비스 계정만 접근시키고 클라이언트 Security Rules는 기본 거부한다.
- Cloud Run과 Firestore는 같은 리전(후보: `asia-northeast3`)으로 배치해 지연·리전 간 전송을 줄인다.

## 4. Firestore 문서 구조

```text
teachers/{teacherUid}
teachers/{teacherUid}/classes/{classId}
teachers/{teacherUid}/classes/{classId}/years/{year}
teachers/{teacherUid}/classes/{classId}/years/{year}/students/{studentId}
teachers/{teacherUid}/classes/{classId}/years/{year}/surveys/{month}
teachers/{teacherUid}/classes/{classId}/years/{year}/surveys/{month}/responses/{studentId}
teachers/{teacherUid}/classes/{classId}/years/{year}/students/{studentId}/observations/{observationId}
```

서버는 요청 본문의 `teacherUid`를 신뢰하지 않는다. 교사는 검증한 Google/Firebase ID token의 `uid`, 학생은 검증한 학생 세션의 소유 범위를 사용해 경로를 구성한다.

### 학생 문서

```json
{
  "studentId": "내부 ID",
  "displayName": "표시 이름",
  "status": "ACTIVE",
  "codeSalt": "random",
  "codeHash": "scrypt result",
  "codeVersion": 3,
  "updatedAt": "server timestamp"
}
```

개인 코드 원문은 저장하지 않는다. 이름·출석번호 변경과 무관하게 내부 학생 ID를 유지한다.

### 설문 상태 문서

```json
{
  "month": 5,
  "surveyVersion": "V0.2",
  "open": true,
  "openedAt": "server timestamp",
  "closedAt": null
}
```

### 응답 문서

경로: `.../surveys/05/responses/{studentId}`

```json
{
  "schemaVersion": 1,
  "surveyVersion": "V0.2",
  "answers": {
    "1": "선택지 원문",
    "2": "선택지 원문",
    "3": "서술형",
    "4": [{"studentId": "id", "behavior": "행동 원문"}],
    "5": [{"studentId": "id", "behavior": "행동 원문"}],
    "6": "선택지 또는 관계 선택 객체",
    "7": "선택지 또는 관계 선택 객체",
    "8": "서술형"
  },
  "submissionId": "client idempotency id",
  "answerHash": "canonical answer SHA-256",
  "submittedAt": "server timestamp"
}
```

8문항 전체를 한 문서로 저장한다. 별도 “제출 완료” 문서나 문항별 문서를 만들지 않는다. 통계 문서도 제출 때 갱신하지 않는다.

## 5. 제출 일관성과 쓰기 1회

1. 학생 세션과 `codeVersion`을 검증한다.
2. 설문 개설 상태와 버전을 읽는다.
3. 답변 1~8, 친구 ID, 자기 선택·중복·타 학급 ID를 검증한다.
4. 응답 문서 트랜잭션에서 기존 존재 여부를 읽는다.
5. 문서가 없으면 `create` 1회로 전체 응답을 저장한다.
6. 문서가 있으면 `submissionId + answerHash`가 같을 때 재시도 성공으로 200을 반환하고 쓰지 않는다. 다르면 409를 반환한다.
7. 클라이언트는 성공 응답 뒤에만 IndexedDB 초안을 삭제한다. 응답이 유실되면 GET 상태를 먼저 확인한다.

목표는 최종 제출당 응답 문서 쓰기 1회다. 트랜잭션 검증 read와 학생 인증 read는 무결성을 위해 유지한다.

## 6. 인증과 권한

### 교사

- Firebase Authentication 또는 Identity Platform의 Google 로그인을 사용한다.
- 브라우저가 받은 ID token을 `Authorization: Bearer`로 전송한다.
- Cloud Run은 Admin SDK로 서명·issuer·audience·만료와 `email_verified`를 확인한다.
- 검증된 `uid`만 자기 `teachers/{uid}` 아래를 접근한다. 교사 활성 상태/허용 도메인은 서버에서 추가 검증한다.
- Cloud Run 공식 문서는 일반 최종 사용자 인증에 Identity Platform/Firebase Auth와 서버 ID token 검증을 권장한다: [Cloud Run 최종 사용자 인증](https://docs.cloud.google.com/run/docs/authenticating/end-users), [Firebase ID token 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

### 학생

- 개인 코드는 현재처럼 강한 난수로 생성하고 salt+scrypt 해시만 저장한다.
- 로그인 성공 시 짧은 수명의 `HttpOnly; Secure; SameSite=Lax` 학생 세션을 발급한다. 학생 UI와 API를 같은 Cloud Run origin에 두어 토큰을 JavaScript 저장소에 두지 않는다.
- 세션에는 `teacherUid,classId,year,studentId,codeVersion,exp` 범위를 넣는다.
- 학생 요청마다 학생 문서의 현재 `codeVersion`을 확인한다. 코드 재발급 즉시 이전 세션을 거부한다.
- 학생 세션은 교사 경로를 호출할 수 없다. 교사 ID token도 학생 제출 권한을 자동 부여하지 않는다.
- 로그인 실패는 IP 해시+학생 범위로 제한한다. 작은 규모에서는 인스턴스 메모리 token bucket과 Firestore 실패 카운터를 함께 사용한다. 성공 로그인은 실패 카운터를 만료 처리한다. 원 IP와 코드는 로그에 남기지 않는다.
- 운영 전에는 분산 rate limit의 비용 공격 내성을 부하 시험한다. Cloud Armor를 쓰면 별도 비용을 평가한다.

## 7. 기존 API 대응

| 현재 API | Cloud 동작 |
|---|---|
| `POST /api/v2/teacher/register` | 교사 uid 범위에 명단 생성; batch 최대 25, ID 중복 차단 |
| `POST /api/v2/teacher/reissue` | code hash/salt/version 갱신; 원문은 응답 1회 |
| `POST /api/v2/teacher/open` | 월 설문 상태 문서 갱신 |
| `GET /api/v2/teacher/status` | 학생 목록+해당 월 응답 페이지 조회 |
| `GET /api/v2/teacher/analysis` | 원본 응답을 읽어 요청 시 계산; 통계 재저장 없음 |
| 관찰 기록 CRUD | 학생 하위 observations 문서 CRUD |
| `POST /api/v2/login` | 학생 코드 검증 후 범위 제한 세션 |
| `GET /api/v2/student/survey` | 자기 범위의 설문 상태·제출 여부·친구 명단 |
| `POST /api/v2/student/submit` | 자기 응답 문서 1회 create, 멱등 재시도 |

교사 현황은 25명 단위 페이지를 기본으로 하며 ETag/짧은 서버 메모리 캐시를 사용할 수 있다. 민감 응답은 공유 CDN 캐시하지 않는다.

## 8. Cloud Run 설정 초안

- 요청 기반 과금, 최소 인스턴스 0.
- 시작값: 1 vCPU, 512 MiB, concurrency 8, timeout 15초, 서비스 최대 인스턴스 3.
- Node.js 전역 메모리에 권위 데이터를 두지 않고 모든 요청을 병렬 안전하게 처리한다.
- max instances는 비용 안전장치지만 순간적으로 초과할 수 있고, 포화 시 429 가능하므로 학생 제출 재시도와 상태 확인을 유지한다.
- Google은 처음 비용 보호용 max instances 3을 제안하며, concurrency는 낮은 값 8부터 조정할 것을 안내한다: [최대 인스턴스](https://docs.cloud.google.com/run/docs/configuring/max-instances), [동시성](https://docs.cloud.google.com/run/docs/about-concurrency).
- 성공 요청의 상세 본문 로그는 남기지 않는다. 오류율, 지연, 401/403/409/429/5xx, 인스턴스 수, Firestore read/write만 지표화한다.

## 9. 사용량과 비용 추정

가정: 학생 1명당 9개월 제출, 관찰 기록 연 5건, 제출 흐름당 Firestore read 5회, Cloud Run 요청 6회.

| 규모 | 연 제출 | 응답 write | 관찰 write | 추정 read | Cloud Run 요청 |
|---|---:|---:|---:|---:|---:|
| 교사 10 / 학생 200 | 1,800 | 1,800 | 1,000 | 9,000 | 10,800 |
| 교사 100 / 학생 2,000 | 18,000 | 18,000 | 10,000 | 90,000 | 108,000 |

학급·학생 등록, 코드 재발급, 설문 개설 쓰기는 별도지만 위 규모에서는 무료 일일 쓰기 한도보다 매우 작다. 특정 하루에 학생 2,000명이 모두 제출해도 응답 쓰기는 2,000건이다.

Firestore default 데이터베이스 무료 할당량은 저장 1 GiB, 일 50,000 reads, 일 20,000 writes/deletes, 월 10 GiB outbound이며 프로젝트당 무료 데이터베이스는 하나다. named database, TTL deletes, PITR, backup/restore는 무료 대상이 아니다: [Firestore 가격과 무료 할당량](https://cloud.google.com/firestore/pricing).

Cloud Run 요청 기반 과금의 무료 한도는 월 2백만 요청, 180,000 vCPU-seconds, 360,000 GiB-seconds(미국 중부 가격 기준 할인)다. 실제 지역·로그·네트워크·Secret Manager·Authentication·백업 비용은 별도일 수 있다: [Cloud Run 가격](https://cloud.google.com/run/pricing).

따라서 월 0원은 목표로는 현실적이지만 보장할 수 없다. 특히 운영 백업/PITR은 무료가 아니므로 데이터 안정성을 우선하면 소액 과금을 승인해야 한다.

## 10. 모니터링과 장애 복구

- 예산 알림 50/80/100%, forecast 알림, Cloud Run 429/5xx와 Firestore quota 알림을 설정한다.
- 일반 alerts-only 예산은 과금을 자동 차단하지 않는다. 공식 문서도 이를 명시한다: [Cloud Billing 예산 알림](https://docs.cloud.google.com/billing/docs/how-to/budgets).
- max instances 3, 요청 본문 제한, 정확한 CORS, 인증 실패 제한으로 비용 폭주 범위를 줄인다.
- 응답 문서는 overwrite 금지 create-only다. 삭제는 별도 승인·감사 이벤트 없이는 제공하지 않는다.
- 일일 검증용 익명 집계(응답 수, hash, 누락 범위)를 생성하되 원문을 통계 문서로 복제하지 않는다.
- Firestore managed backup 또는 PITR을 쓰려면 과금 승인이 필요하다. 백업은 별도 프로젝트/버킷에 암호화 보관하고 정기 복원 시험을 해야 한다.
- 장애 시 클라이언트 초안은 유지되고, 재접속하면 응답 문서 존재를 먼저 확인한다. 동일 hash면 성공, 다르면 교사 확인 대상으로 격리한다.

## 11. IndexedDB 초안 보호 정책

- 키 범위: `ownerId + year + classId + studentId + month + surveyVersion`.
- 값: 학생 코드에서 PBKDF2-SHA-256(120,000회)로 파생한 AES-GCM 키로 암호화한 답변.
- 저장하지 않는 값: 개인 코드 원문, 세션 token, Authorization header.
- 코드 재발급 후 기존 초안은 복호화할 수 없다.
- 만료: 30일. 로그인 시 만료 record를 삭제한다.
- 최종 서버 저장 확인 뒤 해당 record를 삭제한다.
- 브라우저 데이터 삭제·다른 기기 복원은 지원하지 않는다.
- 공용 기기에서 학생 코드가 노출되면 복호화 가능하므로 코드 비공개, 자동완성 금지, 로그아웃, 코드 재발급 정책이 필요하다. 이 조건과 E2E를 충족하기 전 실제 학생 데이터 운영은 HOLD다.

## 12. 구축 전 준비사항

1. 별도 Google Cloud 프로젝트와 결제 승인.
2. 운영 도메인, 학교 허용 Google 계정 범위, 개인정보 처리·보존 기간 확정.
3. Firebase Auth/Identity Platform 선택과 OAuth 동의 화면 검토.
4. Firestore default database 리전 확정. 무료 할당량은 default database 하나에만 적용됨을 확인.
5. Cloud Run 서비스 계정 최소 권한, Secret Manager, CORS origin, CSP/HSTS 설정.
6. 부하·권한 시험용 가상 교사 10명/학생 200명과 100명/2,000명 시나리오.
7. managed backup/PITR 비용 승인과 실제 복원 리허설.
8. 예산·quota·오류율 알림 수신자와 장애 대응 책임자 지정.
9. 실제 Google Sheets NORMAL 회귀시험. Firestore 데이터를 `TT_DATA`·`TT_SYNC`에 넣지 않음.
10. 개인정보 영향 검토와 학교 운영 승인.

## 13. 판정

- STEP 09-B 설계: PASS
- 경로·단일 응답 문서·사용량 산정 로컬 계약 시험: PASS
- 실제 Firebase/Identity Platform: NOT RUN
- 실제 Cloud Run/Firestore read/write 측정: NOT RUN
- 10교사/200학생 클라우드 부하·권한 시험: NOT RUN
- 운영 백업 복원: NOT RUN
- 운영 배포: HOLD

