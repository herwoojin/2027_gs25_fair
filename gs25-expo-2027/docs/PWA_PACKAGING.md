# 앱으로 만들기 — PWABuilder · 구글 플레이

작성 2026-09-28 · 대상: 이 플랫폼을 앱 형태로 배포하려는 담당자

---

## 0. 먼저 읽어 주세요 — 공개 스토어 등록의 문제

이 플랫폼은 **등록된 GS25 경영주만 들어올 수 있는 폐쇄형 사이트**입니다.
검색엔진도 전면 차단(`robots.txt` · `X-Robots-Tag: noindex`)해 두었습니다.

그런데 **구글 플레이 공개 등록**은 성격이 정반대입니다.

| 항목 | 공개 스토어에 올리면 |
|---|---|
| 노출 | 누구나 검색·설치할 수 있습니다 |
| 심사 | 구글이 **로그인 가능한 테스트 계정**을 요구합니다 (점포코드+휴대폰 인증이라 제출이 까다롭습니다) |
| 개인정보처리방침 | **공개 URL**이 반드시 있어야 합니다 |
| 데이터 안전성 | 휴대폰번호 수집을 신고해야 합니다 |
| 정책 위험 | 일반 사용자가 쓸 수 없는 앱은 *"기능이 제한적인 앱"* 으로 반려될 수 있습니다 |

**권장 경로는 공개 등록이 아니라 다음 둘 중 하나입니다.**

1. **Managed Google Play 비공개 앱** — GS리테일 Workspace 조직 내부에만 배포.
   심사가 가볍고 외부 노출이 없습니다. 폐쇄형 플랫폼에 가장 맞습니다.
2. **내부 테스트(Internal testing) 트랙** — 최대 100명까지 이메일로 초대.
   파일럿에 적합합니다.

공개 등록을 꼭 하셔야 한다면 아래 5번의 준비물을 모두 채워야 합니다.

> 안드로이드만 해당합니다. **아이폰은 APK를 쓸 수 없습니다.** 아래 4번 참고.

---

## 1. 지금 준비된 것

PWABuilder 가 요구하는 항목은 모두 코드에 반영되어 있습니다.

| 항목 | 위치 | 상태 |
|---|---|---|
| 매니페스트 | `public/manifest.json` | ✅ `id`·`name`·`short_name`·`description`·`start_url`·`display` |
| 아이콘 (PNG) | `public/icons/icon-{192,512}.png` | ✅ SVG 는 PWABuilder 가 받지 않아 PNG 로 새로 만들었습니다 |
| 마스커블 아이콘 | `public/icons/icon-maskable-512.png` | ✅ 원형으로 잘려도 글자가 남도록 안전영역 72% |
| iOS 아이콘 | `public/icons/apple-touch-icon.png` | ✅ 180×180, 모서리 각짐(iOS 가 직접 깎습니다) |
| 스크린샷 | `public/screenshots/*.png` | ✅ narrow 2 · wide 1 |
| 바로가기 | 매니페스트 `shortcuts` | ✅ 로비 · 순회 일정 · 입장 QR |
| 서비스 워커 | `public/sw.js` | ✅ 오프라인 안내 전용 |
| 오프라인 페이지 | `public/offline.html` | ✅ 외부 의존 없이 혼자 완결 |
| Digital Asset Links | `public/.well-known/assetlinks.json` | ⚠️ **지문 미입력** — 3번에서 채웁니다 |

### 서비스 워커가 캐시하지 않는 이유

일반적인 PWA 는 화면을 캐시해 빠르게 만듭니다. **이 앱은 반대로 갑니다.**

- `/api/*` 응답 → **캐시 안 함**. 남의 세션 응답이 기기에 남으면 사고입니다.
- HTML 문서 → **캐시 안 함**. 공용 단말에서 로그아웃 뒤 이전 화면이 남습니다.
- `/_next/static/*`·아이콘 → 캐시함. 내용이 바뀌면 파일명도 바뀌는 것들입니다.

즉 **오프라인에서 전시 내용은 보이지 않고**, 연결이 끊겼다는 안내만 뜹니다.
이건 제약이 아니라 의도입니다.

---

## 2. PWABuilder 로 패키지 만들기

1. https://www.pwabuilder.com 접속
2. 배포된 주소 입력 → `Start`
   - **반드시 실제 배포 주소**여야 합니다 (`localhost` 불가, HTTPS 필수)
3. 점수 화면에서 Manifest / Service Worker / Security 가 모두 통과인지 확인
4. `Package For Stores` → **Android**
5. 입력값:

| 항목 | 값 |
|---|---|
| Package ID | `kr.co.gsretail.expo2027` |
| App name | `2027 GS25 상품전략공유회` |
| Short name | `GS25 공유회` |
| Display mode | `Standalone` |
| Signing key | **Create new** (처음) / 이미 있으면 `Use mine` |

6. `Download` → zip 안에 `*.aab`(Play 업로드용) · `*.apk`(직접 설치용) · `signing.keystore` ·
   `assetlinks.json` 이 들어 있습니다.

> **키스토어를 반드시 안전하게 보관하세요.** 잃어버리면 같은 앱으로 업데이트를 올릴 수
> 없습니다. Play App Signing 을 켜면 구글이 대신 보관해 줍니다(권장).

---

## 3. assetlinks.json 채우기 — 빠뜨리면 주소창이 보입니다

TWA 는 이 파일로 "이 사이트와 이 앱은 같은 주인"임을 증명합니다.
맞지 않으면 앱을 열었을 때 **주소창이 그대로 있는 크롬 화면**이 떠서, 앱처럼 보이지 않습니다.
심사 반려의 가장 흔한 원인입니다.

1. Play Console → **설정 → 앱 서명 → 앱 서명 키 인증서 → SHA-256 인증서 지문** 복사
   - ⚠️ PWABuilder zip 안의 지문이 아니라 **Play Console 의 지문**입니다.
     Play App Signing 을 쓰면 구글이 다시 서명하므로 로컬 지문은 어긋납니다.
2. `public/.well-known/assetlinks.json` 의 `REPLACE_WITH_...` 를 그 값으로 교체
   (콜론 포함 대문자 그대로: `AA:BB:...:99`)
3. 커밋 → 배포
4. 확인:
   ```bash
   curl -s https://<도메인>/.well-known/assetlinks.json
   ```
   `application/json` 으로 200 이 떠야 합니다.

---

## 4. 아이폰은 APK 가 안 됩니다

APK/AAB 는 안드로이드 전용입니다. 아이폰에서 앱처럼 쓰는 방법은 둘입니다.

**① 홈 화면에 추가 (지금 바로 가능 · 권장)**
사파리로 접속 → 공유 버튼 → **홈 화면에 추가**.
전체화면으로 열리고 아이콘도 붙습니다. 이미 동작하며, 랜딩의 「향후 일정」 블록에도
같은 안내가 들어 있습니다.

**② App Store 등록 (별도 작업)**
PWABuilder 가 iOS 패키지도 만들어 주지만, 실제 등록에는 다음이 필요합니다.
- Apple Developer Program (연 $99)
- macOS + Xcode 에서 빌드·서명
- App Store 심사 — **단순 웹 포장 앱은 4.2(최소 기능) 로 반려되는 경우가 많습니다**

폐쇄형 사내 앱이라면 **Apple Business Manager 의 커스텀 앱**이 더 맞는 경로입니다.

---

## 5. 공개 등록을 하실 경우 준비물

0번의 권고에도 공개 등록을 진행하신다면 다음이 필요합니다. **아직 없는 것들입니다.**

- [ ] **개인정보처리방침 공개 URL** — 현재 사이트에 없습니다. 휴대폰번호 수집·암호화
      보관·파기 시점(행사 종료 후 3개월)을 명시해야 합니다.
- [ ] **심사용 테스트 계정** — 점포코드 + 휴대폰 뒷 4자리 + 문자 인증 구조라, 심사자가
      문자를 받을 수 없습니다. 심사 기간 동안만 쓰는 우회 계정이 필요합니다.
- [ ] **데이터 안전성 양식** — 전화번호(수집·암호화 전송·암호화 저장), 기기 ID 등
- [ ] **스토어 등록정보** — 512×512 아이콘, 1024×500 그래픽, 스크린샷 2장 이상
      (`public/screenshots/` 의 파일을 그대로 쓰실 수 있습니다)
- [ ] **콘텐츠 등급 설문**

---

## 6. 배포 후 확인 목록

```bash
DOMAIN=https://25gps.netlify.app

curl -si $DOMAIN/manifest.json            | head -1   # 200
curl -si $DOMAIN/sw.js                    | head -1   # 200
curl -si $DOMAIN/offline.html             | head -1   # 200
curl -si $DOMAIN/.well-known/assetlinks.json | head -1  # 200
curl -si $DOMAIN/icons/icon-maskable-512.png | head -1  # 200
```

브라우저 개발자도구에서:
- `Application → Manifest` — 오류 없음, 아이콘 3개 표시
- `Application → Service Workers` — `activated and is running`
- 네트워크를 끊고 새로고침 → 오프라인 안내 페이지

---

## 7. 앞으로 손댈 때 주의

- **아이콘을 바꾸려면** 원본 한 장만 바꾸고 스크립트를 돌리세요. 파비콘·앱 아이콘·
  화면 로고가 한 번에 따라옵니다.
  ```bash
  python3 scripts/make-icons.py assets/brand/logo-source.png
  ```
  이어서 `public/sw.js` 의 `VERSION` 을 올려야 캐시된 옛 아이콘이 버려집니다.
- **서비스 워커를 고치면** `public/sw.js` 의 `VERSION` 을 올리세요. 올리지 않으면
  옛 캐시가 남습니다.
- **캐시 대상을 늘리지 마세요.** 상품 정보나 로그인 뒤 화면을 캐시에 넣는 순간
  이 앱의 보안 전제가 무너집니다.
