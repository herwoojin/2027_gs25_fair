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

> "모든 사용자"로 열어도 안전한 이유 — 모든 요청은 `SHARED_KEY` 로 검증하고,
> 도메인·원장·rate limit 을 스크립트 안에서 다시 확인합니다.

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

액세스 권한 드롭다운에 **"모든 사용자"가 보이지 않으면** 조직 정책으로 외부 공유가 차단된 것입니다.

1. 관리 콘솔 → **앱 → 추가 Google 서비스 → Apps Script** 에서 외부 공유 허용 여부 확인
2. 해제가 어렵다면 **시트 큐 방식**으로 우회해야 합니다
   (플랫폼이 시트에 발송 요청 행을 쓰고, Apps Script 시간 기반 트리거가 1분마다 읽어 발송).
   인증번호 도착까지 최대 1분이 더 걸리므로, 필요해지면 OTP 유효시간을 5분으로 늘려 대응합니다.

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
