# TRD — 2027 GS25 상품전략공유회 온라인 전시 플랫폼

> 문서 버전 v1.0 · 2026-09-22 · 기준 문서: PRD.md

---

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js 14 (App Router) + TypeScript** | SSG/ISR로 정적 콘텐츠를 CDN 캐시 → 동시접속 부하 분산 |
| UI | Tailwind CSS + shadcn/ui + Framer Motion | 반응형·일관 디자인, 스탬프/전환 애니메이션 |
| 3D | **React Three Fiber + @react-three/drei** (three.js) | 조감도·진열대, 선언형으로 바이브코딩 친화적 |
| 3D 최적화 | glTF/GLB + Draco/Meshopt 압축, KTX2 텍스처, `detect-gpu` | 모바일 저사양 판별 → 2D 폴백 |
| 인증 | **Firebase Authentication** (Email/Password 프로바이더 + Custom Token) | 요구사항의 Firebase 이메일 로그인 기반, 점포코드 로그인은 서버 검증 후 토큰 발급 |
| DB | **Cloud Firestore** (asia-northeast3 서울) | 실시간 리스너(Q&A·응원), 자동 확장 |
| 서버 로직 | **Cloud Functions for Firebase (2nd gen, Node 20)** asia-northeast3 | OTP, 스탬프 판정, SMS, 집계, 시트 동기화 |
| 파일 | Cloud Storage for Firebase + CDN | 서명 URL로 이미지·오디오·영상 제공 |
| 보안 | Firebase App Check (reCAPTCHA Enterprise), Security Rules, Secret Manager | 비정상 클라이언트 차단, 키 비노출 |
| 호스팅 | **Firebase App Hosting** (대안: Vercel) | Firebase 단일 벤더로 운영 단순화 |
| SMS | **SOLAPI** (Node SDK `solapi`) — SMS/LMS/MMS, 선택: 카카오 알림톡 | OTP·질의 알림·답변·예약·쿠폰 |
| AI 챗봇 | Gemini API (Functions에서 호출, 섹션 컨텍스트 주입) | 키 서버 보관, 비용·속도 균형 |
| 워드클라우드 | 서버: 한국어 토큰 집계(간이 명사 추출 + 불용어), 클라이언트: `wordcloud` (wordcloud2.js) 또는 `@visx/wordcloud` | |
| 차트 | Recharts | 관리자 대시보드 |
| QR | `qrcode` (생성), `html5-qrcode` (스캔) | 오프라인 입장·체크인 |
| 데이터 백업 | Google Sheets API (서비스계정) + **MS Power Automate** | 데이터 휘발 방지·본부 보고 |
| 모니터링 | Firebase Performance, Crashlytics(웹 대체: Sentry), Cloud Logging 알림 | |
| PWA | `next-pwa` 또는 수동 manifest + service worker (콘텐츠는 캐시 금지) | |

---

## 2. 시스템 아키텍처

```
 [경영주 모바일/태블릿/PC]        [MD·운영·관리자]
          │  HTTPS + App Check 토큰
          ▼
 ┌──────────────────────────────┐
 │ Firebase App Hosting (Next.js)│  정적/ISR 페이지는 CDN 캐시
 └──────────────┬───────────────┘
                │
   ┌────────────┼──────────────────────────────┐
   ▼            ▼                               ▼
 Firebase Auth  Cloud Firestore (서울)        Cloud Storage (서명 URL)
   ▲            ▲   ▲  실시간 리스너(ask/cheer/questions)
   │            │   │
   │   ┌────────┴───┴───────────────────────────────┐
   └───┤ Cloud Functions (asia-northeast3)          │
       │  auth:  requestOtp / verifyOtp / staffOtp  │
       │  exhibit: markProductProgress / grantStamp │
       │  qa: onQuestionCreate / answerQuestion     │
       │  ai: askSectionBot                         │
       │  reserve: reserveSlot / checkIn            │
       │  agg: 1~5분 스케줄 집계(랭킹·워드클라우드·통계)│
       │  sync: 시트 백업 큐 처리 / 화이트리스트 가져오기 │
       │  notify: 사전알림·리마인드 스케줄              │
       └───┬─────────────┬──────────────┬───────────┘
           ▼             ▼              ▼
        SOLAPI       Gemini API    Google Sheets ◀── MS Power Automate
        (SMS/MMS)                    (백업 원장)       (SharePoint/Teams 보고,
                                                        HTTP로 명단 갱신 호출)
```

---

## 3. 인증 설계

### 3.1 경영주 로그인 시퀀스
```
Client                         Function                          Firestore / SOLAPI
  │ requestOtp(storeCode,last4) ─▶│ App Check 검증, rate limit 확인
  │                               │ stores/{code} 조회 → active, last4 해시 비교
  │                               │ 불일치 → 동일 문구 "정보를 확인해 주세요"(존재 여부 비노출)
  │                               │ 일치 → 6자리 OTP 생성, 해시만 otpSessions에 저장(TTL 3분)
  │                               │──────────────── SOLAPI SMS 발송 ─────────────▶
  │◀── sessionId ─────────────────│
  │ verifyOtp(sessionId, code) ──▶│ 해시 비교, 시도횟수 ≤5
  │                               │ Auth 사용자 확보: uid = "store_{code}",
  │                               │   email = "{code}@expo.gs25.internal"(사전 생성 Email 계정)
  │                               │ customClaims {role:"owner", store, region}
  │                               │ activeSession 갱신(새 sessionKey, 기존 세션 무효화)
  │◀── customToken ───────────────│
  │ signInWithCustomToken()       │
```
- Email/Password 프로바이더에 점포 계정을 **사전 생성**(Admin SDK, 비밀번호는 서버 난수로 사용자에게 비노출) → 콘솔에서 계정 관리·비활성화가 쉬움. 실제 로그인은 Custom Token으로 수행.
- 사용자 입장의 "ID/비밀번호" = 점포코드 / 휴대폰 뒷4자리. 여기에 SMS 인증번호가 추가됨.

### 3.2 본부 로그인
- Firebase Email/Password(@gsretail.com만 허용, `beforeUserSignedIn` 차단 함수로 도메인 검증) → 로그인 직후 `staffOtp` 로 SMS 2차 인증 → 통과 시 `mfaVerifiedAt` 클레임 갱신. 관리자 라우트는 클레임 확인.
- 대안: Firebase Identity Platform의 SMS MFA 사용(유료 플랜) — SOLAPI 비용과 비교해 선택.

### 3.3 세션 · 동시접속 1대
- `users/{uid}.activeSessionKey` 를 로그인마다 교체. 클라이언트는 자기 sessionKey를 로컬 보관하고 `users/{uid}` 를 리스닝 → 불일치 시 강제 로그아웃 + 안내.
- ID 토큰 만료와 별도로 12시간 경과 시 재로그인.

### 3.4 Rate Limit
- `rateLimits/{key}` 문서(키: `ip:{ip}`, `store:{code}`)에 슬라이딩 윈도 카운트, 트랜잭션 처리.
- requestOtp: 점포코드당 10분 3회, IP당 10분 20회. 초과 시 429 + 관리자 알림(대량 시도 감지).

---

## 4. 스탬프 판정 (부정 방지)

1. 상품 상세 진입 시 `markProductProgress({pid, event:"enter"})` → 서버가 `serverEnterAt` 기록.
2. 오디오 90%/스크롤 끝 도달 시 `event:"consumed"`.
3. 퀴즈 제출 `submitQuiz({pid, choice})` → 서버가 `quizAnswers/{pid}`(클라이언트 접근 불가)와 비교, 첫 시도 여부 기록.
4. 서버 조건: consumed && 정답 && (now − serverEnterAt ≥ minDwellSec) → 상품 완료.
5. 섹션 필수 상품 전부 완료 → `progress/{uid}.stamps.{sectionId}` 기록 + 완료 수 증가. 11개 달성 + 설문 제출 → `completedAt`.
- `progress` 문서 쓰기는 **Functions만** 가능(Rules에서 클라이언트 write 금지).

---

## 5. 성능 · 동시접속 설계

| 병목 | 대책 |
|---|---|
| 콘텐츠 조회 반복 읽기 | 섹션·상품 메타데이터는 빌드 시 SSG/ISR(재검증 5분)로 번들 → Firestore 읽기 0. 단 **민감 콘텐츠는 로그인 후 클라이언트 fetch**(정적 HTML에 포함하지 않음, 아래 주의) |
| 랭킹·통계 | 스케줄 Function이 1~5분마다 `aggregates/*` 단일 문서로 요약 → 모든 사용자는 문서 1건만 구독 |
| 워드클라우드 | 1분마다 지역별 상위 80단어만 `aggregates/wordcloud_{region}` 저장 |
| 카운터 핫스팟 | 동시 증가 필드는 분산 카운터(샤드 10개) 또는 집계 함수로 계산 |
| 실시간 피드 | /ask, /cheer 리스너는 `limit(30)` + 페이지네이션 |
| 3D 무게 | 섹션별 GLB 분리·지연 로딩, 공용 텍스처 아틀라스, 인스턴싱(진열 상품), 모바일은 그림자·후처리 끔, `frameloop="demand"` |
| 미디어 | 영상은 HLS(적응형) 또는 YouTube 일부공개, 오디오 AAC 64kbps |
| Functions 콜드스타트 | 핵심 함수 `minInstances: 1`(행사 기간), 동시성 80 |
| 스파이크(오픈 순간) | 오픈 공지 시각을 지역별로 30분씩 분산 발송 |

> 주의: 경쟁사 차단을 위해 **상품 상세 텍스트·이미지 경로는 정적 빌드에 넣지 않습니다.** 공개 가능한 셸(레이아웃·3D 빈 진열대)만 정적으로, 상품 데이터는 로그인 후 Firestore(규칙으로 보호)에서 가져오고 1회 로드 후 메모리 캐시(React Query `staleTime` 10분)로 반복 읽기를 줄입니다.

### 부하 추정 (예시)
- 등록 점포 약 18,000, 동시접속 피크 3,000 가정. 사용자당 세션 읽기 ≈ 상품 60건 + 집계 5건 + 피드 60건 ≈ 125 reads → 하루 1만 명 기준 약 125만 reads/일 — Firestore 한도·비용 내 충분.
- 부하 테스트: k6로 로그인·스탬프 API 시나리오, Firestore 에뮬레이터 + 스테이징 프로젝트에서 실행.

---

## 6. 보안 설계

### 6.1 Firestore Rules 원칙 (요약)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() { return request.auth != null; }
    function role() { return request.auth.token.role; }
    function isStaff() { return role() in ['md','operator','admin']; }
    function isAdmin() { return role() == 'admin'; }

    match /sections/{id}  { allow read: if signedIn(); allow write: if isAdmin(); }
    match /products/{id}  { allow read: if signedIn(); allow write: if isAdmin(); }
    match /quizzes/{id}   { allow read: if signedIn(); allow write: if isAdmin(); } // 보기만, 정답 없음
    match /quizAnswers/{id} { allow read, write: if false; }                         // Functions 전용
    match /stores/{code}  { allow read: if isAdmin(); allow write: if false; }        // 전화번호 포함
    match /progress/{uid} { allow read: if request.auth.uid == uid || isStaff(); allow write: if false; }
    match /questions/{id} {
      allow create: if signedIn() && request.resource.data.uid == request.auth.uid
                    && request.resource.data.text.size() <= 500;
      allow read: if resource.data.uid == request.auth.uid || isStaff()
                  || (signedIn() && resource.data.isPublic == true);
      allow update: if false;                                                         // 답변은 Function
    }
    match /cheers/{id} {
      allow create: if signedIn() && request.resource.data.text.size() <= 50;
      allow read: if signedIn() && resource.data.status == 'visible';
    }
    match /aggregates/{id} { allow read: if signedIn(); allow write: if false; }
    match /otpSessions/{id} { allow read, write: if false; }
    match /rateLimits/{id}  { allow read, write: if false; }
    match /auditLogs/{id}   { allow read: if isAdmin(); allow write: if false; }
    // ... ERD.md 전 컬렉션에 대해 동일 원칙으로 작성
  }
}
```
### 6.2 Storage
- `/private/**` 는 `request.auth != null` 만 읽기. 이미지·오디오는 `getDownloadURL` 대신 Function이 발급하는 **15분 만료 서명 URL** 사용(영상 원본 보호).

### 6.3 웹 보안 헤더 (next.config.js)
- `Content-Security-Policy` (self, firebase, youtube-nocookie, gstatic만 허용), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self)` (QR 스캔), `X-Robots-Tag: noindex, nofollow`.

### 6.4 워터마크
- 앱 루트에 `pointer-events:none` 고정 오버레이 캔버스, 점포코드·일시를 사선 반복, 불투명도 6~8%. 3D 캔버스 위에도 표시. DOM 제거 감지 시(MutationObserver) 재삽입 + 감사 로그.

### 6.5 비밀정보
- SOLAPI API Key/Secret, Gemini Key, Sheets 서비스계정 키, Power Automate 공유키 → **Secret Manager** (`defineSecret`). 클라이언트 번들에 절대 포함 금지.

---

## 7. 외부 연동

### 7.1 SOLAPI
- SDK: `npm i solapi` → `new SolapiMessageService(key, secret)`; `send({to, from, text})`.
- **발신번호 사전 등록 필수**(SOLAPI 콘솔). 90바이트 초과 시 LMS 자동 전환 고려.
- 메시지 유형과 템플릿 (`smsTemplates` 컬렉션에서 관리):

| 코드 | 수신자 | 트리거 |
|---|---|---|
| OTP | 경영주·본부 | 로그인 |
| PRE_NOTIFY | 사전 신청자 | D-7, D-1, D-day 스케줄 |
| Q_TO_MD | MD | 질문 생성 |
| Q_ESCALATE | 백업 MD | 2시간 미응답 |
| A_TO_OWNER | 경영주 | 답변 등록 |
| RESERVE_OK / RESERVE_REMIND | 경영주 | 예약 / 전일 17시 |
| LIVE_ALERT | 알림 신청자 | 라이브 10분 전 |
| NUDGE | 미접속·미완주 | 관리자 수동 |
| COUPON | 완주자 | 관리자 수동(MMS/알림톡) |
- 모든 발송은 `smsLogs` 에 기록(수신번호는 마스킹), 실패 시 1회 재시도 후 관리자 표시.
- 야간(21시~08시) 광고성 발송 금지 로직, 광고성 문자는 "(광고)" 및 수신거부 안내 포함.

### 7.2 Google Sheets 백업
- 방식: 이벤트 발생 Function → `syncQueue` 에 행 추가 → 1분 스케줄 Function이 배치로 `spreadsheets.values.append` (시트: Logins, Stamps, Completions, Questions, Reservations, CheckIns, Coupons, Cheers).
- 실패 시 큐에 남아 재시도(데이터 유실 없음). 시트 행 한도 대비 월별 시트 분할.
- 화이트리스트: `Stores` 시트(점포코드, 점포명, 경영주명, 휴대폰, 지역, 도시권, 활성) → 관리자 "동기화" 버튼 또는 매일 06시 `importStores` 함수가 Firestore `stores` 로 반영(추가/변경/비활성).

### 7.3 MS Power Automate
- 흐름 A (일일 리포트): 예약 트리거(매일 18:00) → Google Sheets 커넥터로 집계 시트 읽기 → Excel(SharePoint) 표에 추가 → Teams 채널에 요약 카드 게시.
- 흐름 B (명단 갱신): 본부 SharePoint 명단 변경 시 → HTTP 작업으로 `POST /api/integrations/stores-sync` (헤더 `X-Integration-Key`, IP 허용목록) → Function이 검증 후 반영.
- 흐름 C (MD 알림 보조, 선택): 미응답 질문 시트 행 추가 시 Teams 멘션.
- HTTP 커넥터는 Power Automate 프리미엄 라이선스 필요 여부 확인.

### 7.4 Gemini 챗봇
- `askSectionBot({sectionId, productId?, message, history})` → 시스템 프롬프트: "GS25 상품전략공유회 안내 도우미. 아래 자료 안에서만 답하라. 자료에 없으면 '담당 MD에게 질문하기'를 권하라. 타사 비교·개인정보·예상 매출 단정 금지." + 섹션 자료(products.aiContext 합본, 8k 토큰 이내).
- 스트리밍 응답, 1인 1일 50회(`aiUsage/{uid_yyyymmdd}`), 응답 로그 저장.

### 7.5 YouTube Live
- 일부공개 + 임베드 허용, `youtube-nocookie.com` 사용, 로그인 사용자 화면에서만 렌더. 링크 유출 리스크가 있으므로 **민감 수치는 라이브에서 언급 금지** 가이드(GUIDE 7장).

---

## 8. 프로젝트 구조

```
gs25-expo-2027/
├─ app/
│  ├─ (public)/page.tsx                 프리오픈 랜딩
│  ├─ (public)/login/page.tsx
│  ├─ (public)/staff/login/page.tsx
│  ├─ (app)/layout.tsx                  AuthGuard + Watermark + 하단 탭바
│  ├─ (app)/lobby/page.tsx
│  ├─ (app)/zone/[zoneId]/page.tsx
│  ├─ (app)/zone/[zoneId]/product/[pid]/page.tsx
│  ├─ (app)/offline/…  live/… cheer/… ask/… ranking/… my/… souvenir-promo/…
│  └─ (admin)/admin/…                   RoleGuard
├─ components/
│  ├─ three/  (ExpoHallScene, ZoneBlock, ShelfScene, ProductBox, Map2DFallback)
│  ├─ exhibit/ (AudioGuide, ScriptReader, QuizCard, StampToast, ProgressBar)
│  ├─ chat/   (SectionBot)   qa/  cheer/ (WordCloud)  ranking/  admin/
│  └─ common/ (Watermark, PopupNews, BottomNav, FontSizeToggle)
├─ lib/ (firebase.ts, appCheck.ts, hooks/, api.ts, gpuTier.ts)
├─ functions/src/
│  ├─ auth/ exhibit/ qa/ ai/ reserve/ agg/ sync/ notify/ admin/
│  └─ shared/ (solapi.ts, sheets.ts, rateLimit.ts, audit.ts, tokenize.ts)
├─ firestore.rules  storage.rules  firestore.indexes.json
├─ public/models/*.glb (공개 셸 모델만)   public/manifest.json
└─ scripts/ (seed.ts, createStoreAccounts.ts, loadtest/k6.js)
```

## 9. 환경 구성
- Firebase 프로젝트 3개: `gs25-expo-dev` / `gs25-expo-stg` / `gs25-expo-prod`.
- 요금제: Blaze(Functions·외부 호출 필수). 예산 알림 설정.
- 환경변수: 클라이언트 `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_APPCHECK_SITE_KEY` / 서버 Secret: `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER`, `GEMINI_API_KEY`, `SHEETS_SA_JSON`, `SHEET_ID`, `INTEGRATION_KEY`, `PHONE_ENC_KEY`.
