# 2027 GS25 상품전략공유회 — 온라인 전시 플랫폼

전국 9개 도시 순회 오프라인 공유회와 **동일한 동선·진열을 3D 웹으로 재현**한 폐쇄형 전시 플랫폼입니다.
사전 등록된 GS25 경영주만 로그인해 섹션별 상품을 듣고·읽고·퀴즈를 풀어 **스탬프 11개**를 모읍니다.

기준 문서: `PRD.md` · `TRD.md` · `ERD.md` · `TASK.md` · `GUIDE.md` · `PLAN.md` · `PROMPT.md`
기술 스택: [`TECH_STACK.md`](TECH_STACK.md) / [`public/techstack.json`](public/techstack.json)

---

## 빠른 시작 (Firebase 없이 바로 실행)

```bash
npm install
npm run dev          # http://localhost:3000
```

Firebase 환경변수가 없으면 **개발 모드**로 동작합니다. 시드 데이터(섹션 11 · 상품 32 · 도시 9 · 슬롯)가
메모리/JSON(`.devdata/`)에 올라가고, Cloud Functions 와 동일한 판정 로직을 `app/api/fn/*` 가 대신합니다.

### 데모 계정

| 구분 | 로그인 |
|---|---|
| 경영주 | 점포코드 `20001` ~ `20010` / 휴대폰 뒷4자리 `1001` ~ `1010` |
| 관리자 | `admin@gsretail.com` (비밀번호 없음 — 이메일 인증번호만) |
| 운영자 | `op1@gsretail.com` |
| MD | `fresh.md@gsretail.com`, `ax.md@gsretail.com` 등 |

> 인증번호(OTP)는 개발 모드에서만 화면에 표시됩니다. 운영에서는 절대 반환되지 않습니다(`DEV_SHOW_OTP`).

### 본부 로그인 — 이메일 인증

본부(MD·운영자·관리자)는 **비밀번호 없이** `@gsretail.com` 회사 이메일만 입력하면,
**Google Apps Script 가 그 주소로 6자리 인증번호를 메일 발송**합니다. 그 번호를 입력하면 로그인됩니다.

```
회사 이메일 입력 → [인증번호 발송] → 메일 수신 → 6자리 입력 → 로그인
```

> **PRD 편차** — PRD 2장은 본부 계정을 "이메일 + 비밀번호 + SMS 2차 인증"으로 정의했지만,
> 운영 요청에 따라 **이메일 인증번호 단일 인증(패스워드리스)** 으로 구현했습니다.
> 비밀번호를 없앤 만큼 보완 통제를 둡니다 — Staff 원장 화이트리스트 · 이메일/IP rate limit ·
> 5회 실패 30분 잠금 · App Check · 감사 로그 · 세션 12시간 · 동시접속 1대.
> 비밀번호 단계를 되살리려면 `staffLogin` 에 검증 로직을 추가하면 됩니다.

- 설정 절차: [`apps-script/README.md`](apps-script/README.md)
- 본부 계정 원장: 구글시트 **`Staff`** 탭 (여기 없는 주소는 인증번호를 받지 못함)
- 연결 확인: `npm run check:mailer` · 관리자 화면 `/admin/whitelist` 상단 카드
- `APPS_SCRIPT_URL` / `APPS_SCRIPT_KEY` 가 비어 있으면 인증번호가 화면에 표시되는 개발 모드로 동작합니다.

인증번호의 **해시·만료(3분)·시도횟수(5회 → 30분 잠금)** 는 플랫폼이 관리하고,
Apps Script 는 메일 릴레이만 맡습니다. 인증번호 평문은 어디에도 저장되지 않습니다.

### Firebase 프로젝트

`gs25-fair` (2027-gs25-fair · 270897004705) 설정이 [`.env.local`](.env.local) 과
[`apphosting.yaml`](apphosting.yaml) 에 들어 있습니다.

`NEXT_PUBLIC_DEMO_MODE=true` 인 동안에는 Firebase 설정이 있어도 **로컬 백엔드(`/api/fn/*`)** 를 씁니다.
Cloud Functions 를 배포한 뒤 `false` 로 바꾸면 실제 Firebase 경로로 전환됩니다.

---

## Firebase 연동 실행

```bash
cp .env.example .env.local     # Firebase 설정 채우기
firebase emulators:start       # 다른 터미널
npm run seed                   # 에뮬레이터에 시드 적재
npm run dev
```

```bash
# 보안 규칙 테스트 (에뮬레이터 필요)
npm run test:rules

# 점포 계정 일괄 생성
npm run create-store-accounts

# 시트 ↔ Firestore 정합성 검증
SHEET_ID=... SHEETS_SA_JSON="$(cat sa.json)" npm run verify-sync
```

---

## 프로젝트 구조

```
gs25-expo-2027/
├─ app/
│  ├─ (public)/            랜딩 · 경영주 로그인 · 본부 로그인
│  ├─ (app)/               로비 · 섹션 · 상품 · 랭킹 · 응원 · Q&A · 예약 · 라이브 · 마이
│  ├─ (admin)/admin/       대시보드 · 참여자 · 질의 · 예약/체크인 · 쿠폰 · 응원 · 라이브 · 콘텐츠 · 화이트리스트 · 감사 · 기술스택
│  └─ api/
│     ├─ fn/[name]/        개발 모드 callable 디스패처
│     └─ server-health/    서버 용량 배터리 인디케이터용 헬스
├─ components/
│  ├─ three/               ExpoHallScene · ShelfScene · Map2DFallback
│  ├─ exhibit/             MediaPlayer · QuizCard · StampCelebration · Certificate · ExitZone …
│  ├─ chat/ qa/ cheer/     SectionBot · AskMdSheet · WordCloud
│  └─ common/              Watermark · AppShell · PopupNews · ServerBattery · FontSizeToggle
├─ lib/
│  ├─ seed/                섹션·상품·퀴즈·도시·기념품 시드 데이터
│  ├─ server/              개발 모드 백엔드(핸들러·저장소·집계·토크나이저·퀴즈정답🔒)
│  └─ hooks/ api.ts firebase.ts appCheck.ts gpuTier.ts
├─ functions/src/          운영 Cloud Functions (auth · exhibit · qa · ai · reserve · agg · sync · notify · admin)
├─ firestore.rules  storage.rules  firestore.indexes.json  firebase.json
└─ scripts/                seed · createStoreAccounts · verifySync · testRules · loadtest/k6.js
```

---

## 보안 핵심 (PRD 6장)

- **회원가입 없음.** 화이트리스트 점포 + 본부 계정만 로그인 (`beforeUserCreated` 차단 함수)
- **점포코드 + 휴대폰 뒷4자리 + SMS OTP** — 뒷4자리는 HMAC 해시로만 비교, 번호는 AES-256-GCM 암호문 저장
- **스탬프·퀴즈 채점은 서버 전용.** `enter → consumed → quiz` 를 서버 시각으로 검증하며,
  정답(`quizAnswers`)은 Rules 에서 read/write 모두 `false`
- **App Check** 로 정식 웹앱 외 호출 차단, **Rate Limit**(점포 10분 3회 / IP 10분 20회), 5회 실패 30분 잠금
- **동시접속 1대**(`activeSessionKey`), 세션 12시간
- **워터마크** 점포코드+접속시각, 제거 감지 시 재삽입 + 감사 로그
- **검색엔진 차단**(robots.txt Disallow, `X-Robots-Tag: noindex`), OG 메타에 상품 정보 없음
- **CSP/HSTS/X-Frame-Options DENY** 등 보안 헤더

---

## 운영 배포

```bash
firebase use prod
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
# 웹: App Hosting 이 GitHub main 브랜치를 자동 롤아웃
```

배포 전 체크리스트는 `GUIDE.md` 9장(보안 체크리스트)을 따릅니다.
