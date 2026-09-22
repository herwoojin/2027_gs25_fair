# GUIDE — 2027 GS25 상품전략공유회 온라인 전시 플랫폼

> 개발 환경 구축 · 외부 서비스 설정 · 배포 · 행사 운영 · 라이브 준비 · 보안 체크리스트

---

## 1. 개발 환경
```bash
node -v            # 20.x
npm i -g firebase-tools
npx create-next-app@14 gs25-expo-2027 --ts --tailwind --app --eslint
cd gs25-expo-2027
npx shadcn@latest init
npm i firebase @tanstack/react-query framer-motion recharts zod
npm i three @react-three/fiber @react-three/drei detect-gpu
npm i qrcode html5-qrcode wordcloud
firebase login && firebase init   # Firestore, Functions(TypeScript), Storage, Emulators, App Hosting
cd functions && npm i solapi googleapis @google/generative-ai firebase-admin firebase-functions
```
- 로컬 실행: `firebase emulators:start` + `npm run dev`
- IDE: Antigravity + Claude Code, 태스크는 TASK.md 번호 순으로 하나씩.

## 2. Firebase 설정 순서
1. 프로젝트 3개 생성(dev/stg/prod), 리전 **asia-northeast3**, Blaze 요금제 + 예산 알림.
2. Authentication → Email/Password 사용 설정. 공개 회원가입 방지: 클라이언트에서 `createUserWithEmailAndPassword` 미사용 + **Identity Platform 업그레이드 시 "사용자 가입 허용" 해제**, `beforeUserCreated` 차단 함수로 서버 외 생성 거부.
3. App Check → reCAPTCHA Enterprise 키 생성 → Firestore·Functions·Storage **enforce** 켜기(개발은 디버그 토큰).
4. Firestore 규칙·인덱스 배포: `firebase deploy --only firestore`
5. Secret Manager: `firebase functions:secrets:set SOLAPI_API_KEY` (나머지 TRD 9장 목록 동일)
6. TTL 정책: Firestore 콘솔 → TTL → otpSessions.expiresAt 등 등록.

## 3. SOLAPI 설정
1. solapi.com 가입 → 사업자 인증 → **발신번호 등록**(회사 대표번호, 통신서비스 이용증명원 필요).
2. API Key/Secret 발급 → Secret Manager 저장. 허용 IP 설정 시 Functions 고정 IP(Cloud NAT) 필요 여부 확인.
3. (선택) 카카오 비즈 채널 연결 → 알림톡 템플릿(예약확정·답변도착·쿠폰) 검수 신청 — 검수 기간을 고려해 D-30 이전 신청.
4. 발송 테스트: dev에서 테스트 번호만 허용하는 `SMS_ALLOWLIST` 환경변수 적용(실수 대량발송 방지).

## 4. 구글시트 · Power Automate
1. Google Cloud에서 서비스계정 생성 → Sheets API 사용 → JSON 키를 Secret에 저장.
2. 백업 스프레드시트 생성 → 서비스계정 이메일에 **편집자 공유** → 시트 탭 생성(ERD 5장).
3. `Stores` 탭 양식 배포 → 영업팀이 점포·번호 입력 → 관리자 "화이트리스트 동기화".
4. Power Automate — 아래 4.1 / 4.2 절차대로 구성.
5. 정합성: 매일 `npm run verify-sync` 로 Firestore 이벤트 수 vs 시트 행 수 비교.

### 4.1 흐름 A — 일일 리포트 (Google Sheets → Excel → Teams)

전제: Power Automate 라이선스, Google 계정 연결 권한, 본부 SharePoint 사이트 쓰기 권한.

1. make.powerautomate.com → **내 흐름** → **새 흐름** → **예약된 클라우드 흐름**.
2. 흐름 이름 `GS25공유회_일일리포트`, 시작 `오늘 18:00`, 반복 `1일`마다 → **만들기**.
3. **새 단계** → `Google Sheets` 커넥터 → **행 가져오기**.
   - 처음이면 **로그인**을 눌러 백업 스프레드시트에 접근 권한이 있는 Google 계정으로 연결.
   - 파일: 백업 스프레드시트, 워크시트: `Completions`.
4. 같은 방식으로 **행 가져오기** 단계를 `Logins`, `Reservations`, `CheckIns` 시트에 대해 3개 더 추가.
   - 각 단계 이름을 `완주_행`, `로그인_행`, `예약_행`, `체크인_행` 으로 바꿔 두면 뒤에서 참조가 쉬움.
5. **새 단계** → **데이터 작업 → 작성(Compose)** 4개를 추가하고 각각 식을 넣어 건수를 만든다.
   - `length(outputs('완주_행')?['body/value'])` 형태. 이름은 `완주_수`, `로그인_수`, `예약_수`, `체크인_수`.
6. **새 단계** → `Excel Online (Business)` → **테이블에 행 추가**.
   - 위치: 본부 SharePoint 사이트 / 문서 라이브러리 / `공유회_일일집계.xlsx` / 표 `일일집계`.
   - 열 매핑: 날짜 = `utcNow('yyyy-MM-dd')`, 로그인 = `로그인_수`, 완주 = `완주_수`, 예약 = `예약_수`, 체크인 = `체크인_수`.
   - ⚠️ Excel 파일에는 **미리 표(Table)를 만들어 두어야** 커넥터가 열을 인식한다.
7. **새 단계** → `Microsoft Teams` → **채팅 또는 채널에 메시지 게시**.
   - 게시자 `흐름 봇`, 게시 위치 `채널`, 팀/채널: 공유회 운영 채널.
   - 메시지(카드 형식): 제목 `2027 공유회 일일 리포트 @{utcNow('yyyy-MM-dd')}`, 본문에 5단계 변수들을 넣는다.
8. **저장** → **테스트 → 수동으로** 로 1회 실행해 Excel 행과 Teams 카드가 생기는지 확인.
9. 실패 알림: 흐름 우측 상단 **설정 → 실행 후 구성** 에서 "실패 시" 분기를 추가해 운영 담당자에게 메일 발송.

### 4.2 흐름 B — 명단 갱신 (SharePoint → 플랫폼 HTTP 호출)

전제: **HTTP 작업은 프리미엄 커넥터**이므로 Power Automate Premium 라이선스가 필요하다. 라이선스가 없으면
관리자 화면의 "화이트리스트 동기화" 버튼(= `importStores`)과 매일 06시 스케줄로 대체한다.

1. Firebase 콘솔에서 `INTEGRATION_KEY` 시크릿 값을 확인한다.
   - 설정: `firebase functions:secrets:set INTEGRATION_KEY`
2. Power Automate → **솔루션 → 환경 변수** 로 `GS25_INTEGRATION_KEY` 를 만들고 값을 **보안 입력**으로 저장.
   - 흐름 본문에 키를 직접 쓰지 않는다. 실행 기록에 남는다.
3. **새 흐름 → 자동화된 클라우드 흐름** → 트리거 `SharePoint - 항목이 만들어지거나 수정될 때`.
   - 사이트 주소: 본부 사이트, 목록: `점포명단`.
4. **새 단계 → 컨트롤 → 배열 변수 초기화** (`stores`, 형식: 배열).
5. **새 단계 → SharePoint → 여러 항목 가져오기** (목록 `점포명단`, 상위 개수 5000).
6. **각각에 적용(Apply to each)** → `value` 선택 → 내부에 **배열 변수에 추가** 추가.
   - 값(JSON):
     ```json
     {
       "storeCode": "@{items('각각에_적용')?['StoreCode']}",
       "storeName": "@{items('각각에_적용')?['StoreName']}",
       "ownerName": "@{items('각각에_적용')?['OwnerName']}",
       "phone": "@{replace(items('각각에_적용')?['Phone'],'-','')}",
       "region": "@{items('각각에_적용')?['Region']}",
       "fcTeam": "@{items('각각에_적용')?['FcTeam']}",
       "active": @{if(equals(items('각각에_적용')?['Active'],true),true,false)}
     }
     ```
   - `region` 은 SEOUL / GYEONGGI / GANGWON / CHUNGCHEONG / DAEGU / ULSAN / BUSAN / GWANGJU / JEJU 중 하나여야 한다.
7. 루프 **바깥**에 **새 단계 → HTTP** 추가.
   - 메서드: `POST`
   - URI: `https://asia-northeast3-<project-id>.cloudfunctions.net/storesSync`
   - 헤더: `Content-Type: application/json`, `X-Integration-Key: @{parameters('GS25_INTEGRATION_KEY')}`
   - 본문: `{ "stores": @{variables('stores')} }`
8. **새 단계 → 데이터 작업 → JSON 구문 분석** 으로 응답을 파싱(`ok`, `created`, `updated`, `deactivated`, `total`).
9. **Teams 메시지 게시** 로 결과 요약을 운영 채널에 통보.
10. **IP 허용목록**: Functions 환경변수 `INTEGRATION_ALLOW_IPS` 에 Power Automate 아웃바운드 IP 를 넣으면
    해당 IP 외 호출이 차단된다. Microsoft 가 공개하는 리전별 IP 대역을 확인해 등록하고, 대역이 바뀌면 갱신한다.
    (IP 고정이 어려우면 비워 두고 공유키 검증만 사용한다.)
11. **테스트**: SharePoint 목록에서 항목 하나를 수정 → 흐름 실행 기록에서 HTTP 200 과 `{"ok":true,...}` 확인
    → 관리자 화면 `/admin/whitelist` 에서 반영 여부 확인.

**오류 코드 해석**

| 응답 | 원인 | 조치 |
|---|---|---|
| 401 `unauthorized` | `X-Integration-Key` 불일치 | 환경 변수 값과 Secret Manager 값 비교 |
| 403 `ip-not-allowed` | 허용목록 밖 IP | `INTEGRATION_ALLOW_IPS` 갱신 또는 비활성화 |
| 400 `invalid-body` | 필드 누락·형식 오류(주로 phone, region) | 응답의 `issues` 배열에서 실패 필드 확인 |

### 4.3 흐름 C (선택) — 미응답 질의 Teams 멘션

1. **자동화된 클라우드 흐름** → 트리거 `Google Sheets - 행이 만들어질 때`, 워크시트 `Questions`.
2. **조건** → `answeredAt` 이 비어 있음(`empty(triggerOutputs()?['body/answeredAt'])`).
3. 참(True) 분기에서 **지연(Delay) 2시간** → **Teams 메시지 게시** 로 담당 MD 를 멘션.
   - 플랫폼의 `escalateQuestions` 스케줄 함수와 중복되므로, 둘 중 하나만 운영한다.

## 5. 3D 에셋 가이드
- 도구: Blender(모델링) → glTF 내보내기 → `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2`
- 규칙: 섹션당 ≤3MB(모바일), 삼각형 ≤10만, 텍스처 1024px 이하, 진열 상품은 박스 1종 + 패키지 텍스처 아틀라스(인스턴싱).
- 조감도: 실제 행사장 도면(동선) 기준 11개 구역을 블록으로 단순화. 구역 좌표는 `sections.hallPosition` 에 저장해 코드 수정 없이 배치 변경.
- **공개 폴더(`public/models`)에는 로고·빈 진열대 등 셸만**, 신상품 패키지 텍스처는 Storage 서명 URL로 로드.

## 6. 배포
```bash
# Functions
firebase use prod && firebase deploy --only functions
# 웹 (App Hosting: GitHub main 브랜치 연결 시 자동 롤아웃)
firebase apphosting:backends:create   # 최초 1회
# 규칙
firebase deploy --only firestore:rules,storage
```
- 브랜치 전략: `feature/*` → `develop`(stg 자동) → `main`(prod, 수동 승인).
- 행사 기간 배포 동결: 순회 중에는 콘텐츠 수정은 관리자 화면으로만, 코드 배포는 긴급 패치만.

## 7. MD 라이브 투어 사전 준비 (오프라인 → 온라인 전파)

### 7.1 D-14 준비
- [ ] 도시별 편성표 확정(요일·시간·진행 MD·주제) → /admin/live 등록 → 알림 신청 오픈
- [ ] 라이브 전용 YouTube 채널/계정, **일부공개** 기본, 퍼가기 허용, 채팅 끔(자체 채팅 사용)
- [ ] 장비: 짐벌 + 스마트폰 2대(메인/예비), 무선 핀마이크 2개, 보조배터리, LTE/5G 에그 2개(행사장 와이파이 백업), 소형 조명
- [ ] 동선 대본: 웰컴존 → 표준매장 → 카운터FF → 신선 → 뉴포맷 → 교육 → AX → 상생 → 기념품(살짝만 공개) → 퇴점, 섹션당 2~3분
- [ ] **발언 금지 항목**: 원가·마진율·공급사 조건·미확정 출시일·타사 비교 (링크 유출 대비)
- [ ] 초상권: 방송 중 방문 경영주 촬영 동의(현장 안내문 + 구두), 비동의 시 얼굴 비노출

### 7.2 D-1 리허설
- [ ] 현장 통신 속도 측정(업로드 10Mbps 이상), 리허설 스트림 5분(비공개)
- [ ] 플랫폼 /live 에 youtubeId 입력 → 로그인 사용자 화면에서 재생 확인
- [ ] 역할: 진행 MD / 설명 MD / 촬영 / 채팅 모더레이터(자체 채팅 질문을 진행자에게 전달)

### 7.3 방송 당일
- 시작 10분 전 자동 알림 문자 → 정시 시작 → 오프닝(오늘 도시·방문 현황) → 한 바퀴 투어 → 채팅 Q&A 5분 → 엔딩(온라인 스탬프 독려·지역 랭킹 소개)
- 종료 후 30분 내 다시보기 등록, 민감 발언 발생 시 해당 구간 편집 후 공개.

## 8. 행사 운영 런북

### 8.1 매일
| 시각 | 할 일 | 담당 |
|---|---|---|
| 08:30 | 대시보드 점검(오류율, 미응답 질문), 당일 슬롯 예약 현황 | 운영 |
| 09:30 | 현장 체크인 폰 로그인·QR 스캐너 테스트, 기념품 재고 입력 | 현장 운영자 |
| 10:00/13:00/15:00 | 타임 입장, 체크인 | 현장 |
| 수시 | MD 질의 응답(목표 2시간) | MD |
| 17:30 | 체크인·노쇼·기념품 소진 집계 | 현장 |
| 18:00 | Power Automate 일일 리포트 Teams 게시 확인 | 운영 |

### 8.2 장애 대응
| 증상 | 1차 조치 |
|---|---|
| 로그인 불가(다수) | SOLAPI 발송 상태 확인 → 장애 시 팝업 공지, OTP 재시도 안내 |
| 로그인 불가(개별, 번호 불일치) | 운영자가 OFC 확인 후 `Stores` 시트 수정 → 동기화 |
| 3D 로딩 지연 | 관리자 설정 "전체 2D 모드 강제" 스위치 |
| 현장 네트워크 장애 | 체크인 오프라인 큐(로컬 저장 후 재전송) + 종이 명단 백업 |
| 대량 로그인 실패 시도 탐지 | IP 차단 목록 추가, 정보보호 부서 통보 |

## 9. 보안 체크리스트 (출시 전 필수)
- [ ] 비로그인 상태로 모든 페이지·API·Storage 접근 시 차단
- [ ] 경영주 A가 경영주 B의 progress·questions(비공개)·reservations 조회 불가
- [ ] quizAnswers, stores, otpSessions 클라이언트 읽기 불가
- [ ] App Check 미적용 요청(curl) 거부
- [ ] 로그인 오류 문구가 점포 존재 여부를 드러내지 않음
- [ ] OTP 5회 실패 잠금, rate limit 동작
- [ ] 동시접속 시 기존 세션 강제 종료
- [ ] 워터마크 모든 화면(3D 포함) 표시, DOM 제거 시 복구
- [ ] 소스맵 prod 비공개, 번들에 비밀키 없음(`gitleaks` 스캔)
- [ ] robots.txt Disallow, `X-Robots-Tag: noindex`, OG 메타에 상품정보 없음
- [ ] 서명 URL 만료(15분) 후 접근 불가
- [ ] 관리자 엑셀 내보내기·쿠폰 발송 감사로그 기록
- [ ] 개인정보 처리 동의서·보안서약 문구 법무 검토
- [ ] 행사 종료 후 계정 비활성·파기 배치 스케줄 등록

## 10. 관리자 사용 요약
- 대시보드 → 참여자 → 필터 "완주" → 쿠폰 메뉴에서 코드 CSV 업로드 → 매칭 확인 → 발송 → 실패 건 재발송.
- 질의 인박스: 섹션 필터 → 답변 입력 → "답변 + 문자발송" → 필요 시 "공개 전환".
- 콘텐츠: 섹션 → 상품 추가(이미지·오디오·원고·퀴즈·챗봇 자료) → 필수 상품 지정 → 저장 즉시 반영.
