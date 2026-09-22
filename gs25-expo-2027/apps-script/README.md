# 본부 로그인 이메일 인증 — Google Apps Script 설정

본부(MD·운영자·관리자) 로그인의 2차 인증번호를 **Apps Script가 Gmail로 발송**합니다.
발송 대상은 **`@gsretail.com` 이메일로만** 제한됩니다.

- 스프레드시트: `1FhWFERnQyGk1gGIXW12iR1nw8uf9eEHcIV5zsVVKbVw`
- 스크립트 프로젝트: `1NjklK7EsYP71EK_Fc0_nrQI4nHFH3qhH3r04ACzMmv0FtXDR0hJtSalz`

---

## 1. 스크립트 붙여넣기

1. 스크립트 프로젝트를 엽니다.
2. `Code.gs` 내용을 **이 폴더의 [`Code.gs`](Code.gs)로 전부 교체**합니다.
3. 좌측 **프로젝트 설정 → "`appsscript.json` 매니페스트 파일을 편집기에 표시"** 를 켜고,
   `appsscript.json` 을 [이 폴더의 파일](appsscript.json)로 교체합니다.

> 스크립트가 스프레드시트에 종속(bound)되어 있지 않아도 됩니다.
> `SpreadsheetApp.openById(SHEET_ID)` 로 접근하므로 독립 프로젝트에서도 동작합니다.

## 2. `setup()` 한 번 실행

편집기 상단 함수 선택에서 **`setup`** 을 고르고 실행합니다.

- 권한 승인 창이 뜨면 승인합니다 (Gmail 발송 + 스프레드시트 접근).
- 실행 로그(`Ctrl/⌘ + Enter`)에 **`SHARED_KEY`** 가 출력됩니다. **복사해 두세요.**
- 시트에 두 탭이 자동 생성됩니다.

### `Staff` 탭 — 본부 계정 원장

| email | name | team | role | sectionIds | backupFor | active |
|---|---|---|---|---|---|---|
| admin@gsretail.com | 본부 관리자 | 상품기획팀 | admin | welcome,media,souvenir,exit | | Y |
| fresh.md@gsretail.com | 이신선 | 신선식품팀 | md | fresh | counter-ff | Y |
| op1@gsretail.com | 현장 운영자 | 행사운영팀 | operator | | | Y |

- `role` — `admin` / `operator` / `md` 중 하나 (그 외 값은 `md` 로 처리)
- `sectionIds` — 담당 섹션 id, 쉼표 구분 (MD 질의 인박스 필터에 사용)
- `backupFor` — 백업 담당 섹션 (2시간 미응답 에스컬레이션 대상)
- `active` — `Y` / `TRUE` / `1` / `O` 면 활성. 그 외는 로그인 거부

**이 탭에 없는 이메일은 인증번호를 받지 못합니다.** 본부 인원을 여기서 관리하세요.

### `MailLogs` 탭 — 발송 이력

`at · emailMasked · purpose · status · detail · callerIp`

이메일은 마스킹(`ad****@gsretail.com`)되어 기록되고, **인증번호는 기록되지 않습니다.**

## 3. 웹 앱으로 배포

**배포 → 새 배포 → 유형 선택 ⚙️ → 웹 앱**

| 항목 | 값 |
|---|---|
| 설명 | `GS25 expo mailer v1` |
| 다음 사용자 인증 정보로 실행 | **나** (스크립트 소유자 계정) |
| 액세스 권한이 있는 사용자 | **모든 사용자** |

배포하면 `https://script.google.com/macros/s/AKfycb.../exec` 형태의 URL이 나옵니다.

### ❗ "액세스 권한이 있는 사용자"를 오해하기 쉽습니다

이 항목은 **"이 URL을 누가 호출할 수 있나"** 이지, **"누가 플랫폼에 로그인할 수 있나"가 아닙니다.**

이 URL을 호출하는 주체는 경영주나 외부인이 아니라 **우리 플랫폼 서버**입니다.
서버는 GS리테일 구글 계정으로 로그인한 상태가 아니므로,
`GS리테일의 모든 사용자` 로 두면 막히는 것은 공격자가 아니라 **우리 서버**입니다.

| 설정 | 우리 서버 호출 | 외부인이 로그인 |
|---|---|---|
| `GS리테일의 모든 사용자` | ❌ 401 (기능 자체가 동작 안 함) | ❌ |
| **`모든 사용자`** | ✅ 동작 | ❌ (아래 5겹이 막음) |

**"모든 사용자"로 열어도 아무나 로그인할 수 없는 이유 — 5겹 방어**

1. **HMAC 서명** — 호출자는 공유키를 직접 보내지 않고, 공유키로 만든 서명만 보냅니다.
   서명이 없거나 틀리면 `unauthorized`.
2. **타임스탬프(±2분) + 1회용 nonce** — 과거 요청을 캡처해도 재전송할 수 없습니다.
3. **도메인 화이트리스트** — `@gsretail.com` 이 아니면 `domain-not-allowed`.
4. **`Staff` 시트 원장** — 등록되지 않은 주소면 `not-registered`.
5. **rate limit** — 이메일당 10분 5회.

무엇보다 **인증번호는 `Staff` 시트에 등록된 `@gsretail.com` 주소로만 발송**됩니다.
외부인이 URL을 알아내도 자기 메일함으로는 번호를 받을 수 없습니다.

### 코드를 바꿨으면 반드시 재배포

서명 검증이 추가되었으므로 **`Code.gs` 를 최신본으로 교체한 뒤 재배포**해야 합니다.

**배포 → 배포 관리 → ✏️(편집) → 액세스 권한 "모든 사용자" → 버전 "새 버전" → 배포**

> 저장만으로는 `/exec` URL 에 반영되지 않습니다.

### ⚠️ URL 형태로 배포 상태를 판별할 수 있습니다

| URL 형태 | 상태 | 서버 호출 |
|---|---|---|
| `.../macros/s/AKfyc.../exec` | ✅ "모든 사용자" 배포 | **가능** |
| `.../a/macros/gsretail.com/s/.../exec` | 도메인 제한 배포 | ❌ 401 |
| `.../s/.../dev` | 테스트 전용(항상 로그인 요구) | ❌ 401 |

- **`/dev` 는 절대 쓰지 마세요.** 편집기에서 바로 열리는 테스트 URL이라 서버 간 호출이 불가합니다.
- **`/a/macros/<도메인>/` 이 들어가면** 액세스 권한이 "모든 사용자"가 아닙니다. 다시 배포하세요.

`npm run check:mailer` 가 이 형태를 먼저 검사해 원인을 알려 줍니다.

### Workspace 관리자가 "모든 사용자"를 막아 둔 경우

액세스 권한 드롭다운에 **"모든 사용자" 항목 자체가 보이지 않으면** 조직 정책으로 차단된 것입니다.

1. 관리 콘솔 → **앱 → 추가 Google 서비스 → Apps Script** 에서 외부 공유 허용 여부 확인
2. 해제가 어렵다면 **방향을 뒤집는 우회**가 필요합니다 —
   플랫폼이 발송 대기열을 두고, Apps Script 시간 기반 트리거(1분)가 **바깥으로 나가서** 가져가 발송합니다.
   인바운드 접근이 필요 없어 정책에 걸리지 않지만, 인증번호 도착이 최대 1분 늦어져
   OTP 유효시간을 5분으로 늘려야 합니다. 필요해지면 구성해 드립니다.

## 4. 플랫폼에 연결

`.env.local` (또는 운영은 Secret Manager)에 넣습니다.

```bash
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycb.../exec
APPS_SCRIPT_KEY=<setup() 이 출력한 SHARED_KEY>
```

운영(Cloud Functions):

```bash
firebase functions:secrets:set APPS_SCRIPT_URL
firebase functions:secrets:set APPS_SCRIPT_KEY
```

연결 확인:

```bash
npm run check:mailer
```

## 5. 동작 확인

1. Apps Script 편집기에서 `testSend` 실행 → 본인 메일함 확인
   (본인 계정이 `@gsretail.com` 이 아니면 거부됩니다 — 의도된 동작)
2. 플랫폼 `/staff/login` 에서 `Staff` 탭에 등록된 주소로 로그인 시도

---

## 코드 변경 시 주의

**코드를 고친 뒤에는 반드시 "배포 → 배포 관리 → ✏️ → 버전: 새 버전 → 배포"** 를 눌러야
`/exec` URL 에 반영됩니다. 저장만으로는 반영되지 않습니다.

## 한계

| 항목 | 내용 |
|---|---|
| 일일 발송 한도 | 개인 Gmail 100통 / Workspace 1,500통. `setup()` 로그에서 잔여량 확인 |
| 지연 | 보통 수 초. 스팸함 유입 가능성이 있어 첫 안내 시 확인 요청 필요 |
| 도메인 | `ALLOWED_DOMAIN` 상수로 고정. 변경 시 스크립트 수정 + 재배포 |
| 키 유출 대응 | `rotateSharedKey()` 실행 후 플랫폼 환경변수 교체 |
