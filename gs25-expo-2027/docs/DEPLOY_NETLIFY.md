# Netlify 배포 — 환경변수 정리

> 저장소 최상위가 아니라 `gs25-expo-2027/` 안에 앱이 있습니다.
> Netlify 사이트 설정에서 **Base directory = `gs25-expo-2027`** 로 지정하세요.
> (`netlify.toml` 에도 동일하게 적어 두었습니다)

| 항목 | 값 |
|---|---|
| Base directory | `gs25-expo-2027` |
| Build command | `npm run build` |
| Publish directory | `.next` |
| Node version | `20` |

---

## 1. 지금 바로 붙여넣을 값

Netlify → **Site configuration → Environment variables** 에서 등록합니다.

### 클라이언트 (빌드 시점에 번들로 들어감 — 공개값)

| 키 | 값 |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyB6fSlhJVJLZdV7VkLLy-im6pcF5Ddxamo` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `gs25-fair.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `gs25-fair` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `gs25-fair.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `270897004705` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:270897004705:web:8a4a8c383715663f9730e0` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` ← Cloud Functions 배포 전까지 |

### 행사 일정

| 키 | 값 |
|---|---|
| `NEXT_PUBLIC_OPEN_AT` | `2026-09-19T09:00:00+09:00` |
| `NEXT_PUBLIC_TOUR_START_AT` | `2026-10-05T10:00:00+09:00` |
| `NEXT_PUBLIC_CLOSE_AT` | `2026-11-16T23:59:59+09:00` |

> 프리오픈(카운트다운 + 입장 비활성) 화면을 보여주려면 `NEXT_PUBLIC_OPEN_AT` 을 미래 일시로.

### 본부 로그인 메일 (pull 모드)

| 키 | 값 |
|---|---|
| `MAILER_MODE` | `pull` |
| `APPS_SCRIPT_KEY` | `3c7c07d9f2d94d07af660209519fedb925c873d6ba484d629a77a2756248d862` |

> `APPS_SCRIPT_URL` 은 **넣지 않습니다.** GS리테일 Workspace 가 익명 웹앱 배포를 막고 있어,
> Apps Script 트리거가 1분마다 `https://<사이트>/api/mail-queue` 로 찾아오는 방식(pull)을 씁니다.

### 개인정보 암호화 키 (새로 생성한 값)

| 키 | 값 |
|---|---|
| `PHONE_ENC_KEY` | `317b1c84c7742957e0df215157b8a84eef6b3c592ad32e475ce9ef91fc03bd61` |
| `PHONE_HMAC_KEY` | `2ff73e0e68c6573579b20e0eb6d61d6613db9f81e52b4512ffc07c1af4ce5ee6` |

> ⚠️ 이 두 값은 **한 번 정하면 바꾸면 안 됩니다.** 바꾸면 기존에 암호화된 전화번호를
> 복호화할 수 없고, 저장된 뒷4자리 해시도 전부 불일치가 됩니다.
> 위 값은 이 문서에 적혀 있으므로 저장소가 공개라면 **Netlify 에서 새로 생성해 교체**하세요.
> 생성: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 운영 안전장치

| 키 | 값 |
|---|---|
| `DEV_SHOW_OTP` | `false` ← 반드시 false. true 면 인증번호가 화면에 노출됩니다 |
| `CHECKIN_ALLOW_ANY_DAY` | `false` |
| `NODE_VERSION` | `20` |

### 나중에 발급하면 추가할 값

| 키 | 언제 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise 키 발급 후 | App Check 활성화 |
| `GEMINI_API_KEY` | AI 챗봇 운영 전환 시 | 없으면 검색 기반 응답으로 동작 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER` | 발신번호 등록 후 | 경영주 SMS OTP |

---

## 2. 배포 후 Apps Script 연결

Netlify 배포 주소가 나오면 Apps Script 편집기에서 **두 함수를 한 번씩** 실행합니다.

```js
setPlatformUrl('https://<실제-netlify-주소>')   // 1회
installPullTrigger()                            // 1회 — 1분 주기 트리거 등록
checkPull()                                     // 연결 확인
```

`checkPull()` 로그에 `{"ok":true,"pong":true,...}` 가 나오면 연결된 것입니다.
관리자 화면 `/admin/whitelist` 상단 카드에서도 트리거가 다녀간 시각을 확인할 수 있습니다.

> 웹앱 배포는 **필요 없습니다.** 액세스 권한이 "GS리테일의 모든 사용자"여도 무관합니다.
> Apps Script 가 바깥으로 나가는 방향이라 조직 정책에 걸리지 않습니다.

---

## 3. ⚠️ 알아두실 제약 — DEMO_MODE 와 서버리스

`NEXT_PUBLIC_DEMO_MODE=true` 상태에서는 로그인 세션·스탬프·메일 대기열이
**서버 메모리와 로컬 파일**에 저장됩니다(`lib/server/store.ts`).

Netlify 의 Next.js 런타임은 **서버리스 함수**라서 요청마다 다른 인스턴스가 응답할 수 있고,
파일시스템도 요청 간에 공유되지 않습니다. 따라서 DEMO_MODE 배포에서는

- 로그인했는데 다음 요청에서 로그아웃되는 현상
- 스탬프 진행이 되돌아가는 현상
- 메일 대기열에 넣었는데 Apps Script 가 가져가지 못하는 현상

이 **불규칙하게** 발생할 수 있습니다. 트래픽이 적으면 컨테이너가 따뜻하게 유지되어
잘 동작하는 것처럼 보이지만, 신뢰할 수 있는 상태는 아닙니다.

| 용도 | 권장 |
|---|---|
| **랜딩·3D 투어 시연, 디자인 공유** | DEMO_MODE=true 로 지금 배포 ✅ |
| **실제 로그인·스탬프·예약 운영** | Firebase 연결 필요 (아래) |

### 실제 운영으로 넘어가려면

1. `firebase deploy --only firestore:rules,firestore:indexes,storage`
2. `firebase deploy --only functions` (Secret Manager 에 키 등록 후)
3. 시드 적재 · 점포 계정 생성
4. Netlify 환경변수에서 `NEXT_PUBLIC_DEMO_MODE=false` 로 변경 후 재배포

이 단계로 넘어가면 모든 상태가 Firestore 에 저장되어 서버리스 문제가 사라집니다.
다만 메일 대기열도 Firestore 로 옮겨야 하므로, 그때 함께 작업이 필요합니다.
