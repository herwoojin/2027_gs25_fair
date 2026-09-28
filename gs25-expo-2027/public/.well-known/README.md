# Digital Asset Links — TWA(구글 플레이) 전용

`assetlinks.json` 은 **이 사이트와 안드로이드 앱이 같은 주인**임을 증명하는 파일이다.
이게 맞지 않으면 Play 에서 받은 앱을 열었을 때 **주소창이 그대로 보이는 크롬 화면**이 뜬다.
(앱이 안 열리는 게 아니라 "앱처럼" 안 보인다 — 심사에서 반려되는 흔한 원인)

## 지금 상태

`sha256_cert_fingerprints` 가 자리표시자다. **아직 동작하지 않는다.**

## 채우는 순서

1. PWABuilder 에서 Android 패키지를 내려받는다.
2. 함께 들어 있는 `assetlinks.json` 을 열어 지문(SHA-256)을 복사한다.
   - Play App Signing 을 쓰면 **Play Console 의 지문이 진짜다.**
     `Play Console → 설정 → 앱 서명 → 앱 서명 키 인증서 → SHA-256 인증서 지문`
   - 로컬 서명 키 지문만 넣으면 Play 가 다시 서명하면서 어긋나 주소창이 보인다.
3. 위 파일의 자리표시자를 그 값으로 바꾼다. 콜론(:) 포함 대문자 형식 그대로 넣는다.
   예: `AA:BB:CC:...:99`
4. `package_name` 도 PWABuilder 에서 입력한 값과 정확히 같아야 한다.
   현재 값: `kr.co.gsretail.expo2027`
5. 커밋 → 배포 후 확인:
   `curl -s https://<도메인>/.well-known/assetlinks.json`
   → `Content-Type: application/json` 으로 200 이 떠야 한다.

## 확인 도구

https://developers.google.com/digital-asset-links/tools/generator
