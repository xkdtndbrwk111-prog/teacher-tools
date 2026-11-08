# 학급생활 Cloud Run + Firestore 배포 준비서

상태: **로컬 Emulator 구현·검증용**. 이 문서는 실제 배포 승인이나 운영 PASS를 뜻하지 않는다.

## 책임 경계

- 브라우저는 Firestore에 직접 접근하지 않는다. `firestore.rules`는 모든 클라이언트 직접 읽기·쓰기를 거부한다.
- Cloud Run 서버만 전용 서비스 계정으로 Firestore에 접근하고, 모든 요청에서 교사 UID 또는 학생 제한 세션의 소유 범위를 검사한다.
- 교사 클라우드 로그인은 Firebase Authentication의 Google 공급자를 사용하고 서버가 ID 토큰의 서명, 철회 상태, `email_verified`, 승인된 학교 도메인을 확인한다. 운영 모드에서는 `TEACHER_EMAIL_DOMAIN`이 없으면 서버가 시작되지 않는다.
- 학생은 144비트 무작위 개인 코드로 로그인한다. 원문 코드는 저장하지 않고 학생별 salt와 scrypt 파생값만 저장한다. 실패 횟수는 계정 범위와 접속 IP 범위를 각각 제한한다.
- 학생 세션은 별도 HMAC 비밀정보로 서명되며 교사 API에 사용할 수 없다. 코드 재발급은 `codeVersion`을 올려 기존 세션을 무효화하지만 기존 응답은 유지한다.
- 기존 Google Sheets NORMAL 동기화용 OAuth 토큰과 Firebase 교사 인증은 서로 다른 권한이다. 어느 토큰도 다른 용도로 재사용하거나 Cloud 서버로 복사하지 않는다.

## 문서 구조

```text
_classOwners/{sha256(classId)}
teachers/{teacherUid}/classes/{classId}/years/{year}/students/{studentId}
teachers/{teacherUid}/classes/{classId}/years/{year}/students/{studentId}/observations/{observationId}
teachers/{teacherUid}/classes/{classId}/years/{year}/surveys/{MM}
teachers/{teacherUid}/classes/{classId}/years/{year}/surveys/{MM}/responses/{studentId}
_authLimits/{sha256(ip|owner|class|year|student)}
```

응답 문서 ID는 학생 ID로 고정한다. 최초 제출은 Firestore transaction의 `create`로 한 번만 생성하며, 같은 `submissionId`와 답변 해시의 재전송은 성공으로 돌려주고 다른 내용의 재제출은 409로 거부한다. 8문항 전체는 응답 문서 하나에 저장한다.

## 배포 전 준비

1. 별도 Google Cloud 프로젝트와 단일 지역 Firestore Native 데이터베이스를 선택한다. 학생·교사 위치와 조직 정책에 맞는 지역을 승인받는다.
2. Firebase Authentication의 Google 로그인과 허용 도메인을 구성한다. 등록 교사 허용 정책(학교 도메인 또는 서버측 allowlist)을 추가 검토한다.
3. 최소 권한 런타임 서비스 계정을 만들고 필요한 Firestore 접근 역할만 부여한다. 배포자와 런타임 계정을 분리한다.
4. 32바이트 이상의 학생 세션 비밀정보는 Secret Manager에 저장한다. 이미지, 저장소, 환경 파일, 로그에 평문을 두지 않는다.
5. `ALLOWED_ORIGINS`는 실제 HTTPS 교사·학생 앱의 정확한 origin만 쉼표로 지정한다. 와일드카드 CORS는 사용하지 않는다.
6. 제공된 Dockerfile로 이미지를 빌드하고 `cloudrun.service.yaml.example`의 자리표시자를 실제 승인값으로 바꾼다.
7. 최소 인스턴스 0, 최대 인스턴스 3, 동시성 8로 시작하고 부하 시험 후 조정한다. 최대 인스턴스는 비용 상한을 보장하지 않으며, Firestore 비용도 별도로 발생한다.
8. Cloud Run HTTPS URL을 학생 QR에 사용한다. 현재 로컬 주소는 운영 QR로 내보내지 않는다.

## 비용·관찰

- 설문 최종 제출은 응답 문서 쓰기 1회가 목표다. 인증 실패 제한, 학생 코드 재발급, 설문 개설 및 관찰 기록 쓰기는 별도로 계측한다.
- 교사 대시보드는 명단, 설문 상태, 월 응답을 필요할 때만 조회한다. 실시간 listener와 통계 문서의 매 제출 갱신은 사용하지 않는다.
- Cloud Billing 예산 알림을 설정하고 Cloud Run 요청 수, 오류율, 인스턴스 수, Firestore 문서 읽기·쓰기·저장량 경보를 둔다. **예산 알림은 사용이나 과금을 자동 차단하지 않는다.**
- 인증 실패 로그에는 학생 코드, 세션 토큰, 응답 원문을 남기지 않는다. IP는 요청 제한에 쓰더라도 보존 기간과 접근 권한을 최소화한다.

## 보존·삭제·복구

- 학년도 종료, 전학, 교사 계정 종료에 따른 응답·관찰 기록 보존 기간과 삭제 승인자를 학교 정책으로 확정해야 한다.
- Firestore 예약 백업 또는 내보내기를 별도 프로젝트/버킷 권한으로 구성하고, 암호화·보존 기간·삭제 정책을 문서화한다.
- 복구 시험은 원본을 덮어쓰지 않는 별도 프로젝트에서 수행하고 문서 수, 해시 가능한 정규화 결과, 소유 범위를 대조한다.
- 학생 브라우저 임시 답변은 30일 후 만료된다. 최종 제출 성공 시 삭제하고, 코드 재발급 뒤 복호화할 수 없는 동일 범위 임시 답변도 삭제한다.

## 운영 전 필수 HOLD 항목

- 실제 Firebase/Google 교사 인증 E2E
- 학교 도메인 교사 등록·퇴직자 차단 정책
- Cloud Armor 또는 이에 준하는 외부 요청 제한 검토
- HTTPS 실제 기기 및 QR 접속 시험
- 10명 교사·200명 학생의 실제 Cloud Run/Firestore 부하·비용 측정
- 백업 생성과 격리 복원 훈련
- 개인정보 처리·보존·열람·삭제 절차 승인

이 항목을 실제 클라우드에서 통과하기 전 최종 운영 판정은 HOLD다.
