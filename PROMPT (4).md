# PROMPT — 바이브코딩 프롬프트 모음

> 2027 GS25 상품전략공유회 온라인 전시 플랫폼
> 사용 환경: Antigravity + Claude Code (다른 AI 코딩 도구도 동일하게 사용 가능)
> 번호는 TASK.md 와 1:1 대응

---

## 0. 프롬프트 작성 원칙 (이 프로젝트에 맞춘 7가지)

1. **문서를 먼저 읽히기** — 매 세션 첫 줄에 "PRD.md, TRD.md, ERD.md, TASK.md를 읽고 시작해"를 넣는다. AI가 전체 맥락(보안·데이터 구조)을 놓치지 않는다.
2. **한 번에 한 태스크** — "T3-1만 구현해. 다른 태스크는 건드리지 마." 범위를 좁힐수록 품질이 오른다.
3. **완료 기준(DoD)을 같이 준다** — "모바일 360px에서 깨지지 않을 것, 에뮬레이터 테스트 통과할 것"처럼 검증 가능한 문장으로.
4. **보안은 금지어로 명시** — "클라이언트에서 progress 컬렉션에 쓰지 마", "정답을 클라이언트로 보내지 마"처럼 하지 말아야 할 것을 적는다. AI는 편의상 규칙을 느슨하게 짜는 경향이 있다.
5. **파일 경로를 지정** — "components/three/ExpoHallScene.tsx 에 작성"처럼 위치를 정해주면 구조가 흐트러지지 않는다.
6. **끝나면 보고 형식 요구** — "변경 파일 목록, 테스트 방법, 남은 이슈를 5줄로 요약해."
7. **막히면 되돌리기** — 3번 수정해도 안 되면 `git checkout` 후 프롬프트를 더 작게 쪼개 다시 요청.

---

## 1. 마스터 프롬프트 (세션 시작 시 매번 붙여넣기)

```
너는 시니어 풀스택 개발자다. 프로젝트는 "2027 GS25 상품전략공유회 온라인 전시 플랫폼"이다.
먼저 PRD.md, TRD.md, ERD.md, TASK.md를 읽고 요구사항을 이해해.

[스택] Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui,
React Three Fiber + drei, Firebase(Auth, Firestore, Functions 2nd gen asia-northeast3,
Storage, App Check, App Hosting), SOLAPI(SMS), Gemini API, Google Sheets API.

[절대 규칙]
- 사전 등록된 점포/본부 계정만 접속한다. 회원가입 화면·API를 만들지 않는다.
- 스탬프·완주·퀴즈 채점·SMS 발송·AI 호출은 반드시 Cloud Functions에서만 한다.
- 비밀키(SOLAPI, Gemini, 시트 서비스계정)는 Secret Manager로만 다루고 클라이언트 코드에 넣지 않는다.
- 휴대폰 번호는 평문 저장 금지(암호화 + 뒷4자리는 HMAC 해시).
- 모든 화면은 모바일(360px)·태블릿(768/1024)·PC(1440)에서 반응형으로 동작한다.
- 기본 글자 16px 이상, 터치 영역 44px 이상(50~60대 경영주 사용 고려).
- 상품 상세 데이터는 정적 빌드(HTML)에 포함하지 않고 로그인 후에만 불러온다.

[작업 방식]
- 내가 지정한 TASK 번호 하나만 구현한다.
- 구현 전 계획을 5줄 이내로 먼저 말하고, 바로 구현한다.
- 끝나면: 변경 파일 목록 / 로컬 테스트 방법 / 남은 이슈를 요약한다.
```

---

## 2. 태스크별 프롬프트

### Phase 0 · 기반
**T0-1**
```
T0-1을 구현해. TRD.md 8장의 폴더 구조대로 Next.js 14 프로젝트 골격을 만들고,
(public)/(app)/(admin) 라우트 그룹과 빈 페이지를 사이트맵(PRD 3장) 전체에 대해 생성해.
각 페이지에는 페이지 이름만 표시. ESLint/Prettier 설정 포함.
```
**T0-3 🔐**
```
T0-3을 구현해. Firebase App Check(reCAPTCHA Enterprise)를 클라이언트 초기화에 적용하고,
모든 callable Function에 enforceAppCheck: true를 기본값으로 설정해.
next.config.js에 CSP, HSTS, X-Frame-Options DENY, Referrer-Policy no-referrer,
X-Robots-Tag noindex,nofollow 헤더를 넣고, robots.txt는 전체 Disallow로 만들어.
CSP 허용 도메인은 firebase, googleapis, gstatic, youtube-nocookie.com만.
```
**T0-4**
```
T0-4를 구현해. GS25 브랜드 느낌(블루 계열 메인 + 민트 포인트, 흰 배경)의 디자인 토큰을
tailwind.config와 CSS 변수로 정의하고, 다크모드는 만들지 마.
(app) 레이아웃: 모바일은 하단 탭바 5개(로비/랭킹/물어보세요/응원/마이),
태블릿 가로·PC는 좌측 사이드바. 우상단에 글자 크게(가/가+/가++) 토글.
360/768/1024/1440 폭에서 스크린샷 기준으로 깨짐이 없게 해.
```

### Phase 1 · 인증 🔐
**T1-3**
```
T1-3을 구현해. functions/src/auth 에 requestOtp, verifyOtp callable을 만들어.
- requestOtp(storeCode, last4): App Check 필수, rateLimits(점포코드 10분 3회, IP 10분 20회),
  stores/{code}.active 확인, HMAC(last4+storeCode) 비교.
  불일치든 미등록이든 같은 오류 문구 "입력하신 정보를 확인해 주세요"만 반환.
  일치 시 6자리 OTP 생성, 해시만 otpSessions에 저장(expiresAt 3분), SOLAPI로 등록 번호에 발송.
- verifyOtp(sessionId, code): 5회 초과 시 30분 잠금. 성공 시 uid "store_{code}",
  customClaims {role:'owner', store, region} 설정, users/{uid}.activeSessionKey 새로 발급,
  customToken과 sessionKey 반환.
- 모든 시도를 auditLogs에 기록(전화번호는 저장하지 마).
에뮬레이터용 단위 테스트도 작성해.
```
**T1-4**
```
T1-4를 구현해. /login 화면을 3단계 스텝으로 만들어.
1) 점포코드(숫자 키패드) 2) 휴대폰 뒷4자리(비밀번호 마스킹) 3) 인증번호 6자리(3분 타이머, 재발송 60초 후 활성).
상단에 "등록된 경영주님만 입장할 수 있습니다" 안내, 하단에 "번호가 바뀌셨나요? 담당 OFC에 문의" 링크.
성공 시 signInWithCustomToken → 첫 로그인이면 동의 화면(개인정보·보안서약: 화면 캡처와 외부 공유 금지)
→ /lobby. 큰 글씨, 한 손 조작 가능한 모바일 우선 레이아웃.
```
**T1-7**
```
T1-7을 구현해. ERD.md의 모든 컬렉션에 대해 firestore.rules와 storage.rules를 작성해.
TRD 6.1의 원칙을 따르고, 🔒 표시 컬렉션은 클라이언트 read/write 모두 false.
@firebase/rules-unit-testing으로 다음 테스트를 반드시 포함해:
비로그인 전면 거부 / 경영주가 타인 progress 읽기 실패 / quizAnswers·stores 읽기 실패 /
progress 직접 쓰기 실패 / 질문 500자 초과 실패 / 공개 질문은 다른 경영주도 읽기 성공.
```
**T1-8**
```
T1-8을 구현해. components/common/Watermark.tsx: 로그인 사용자 점포코드와 현재시각(분 단위)을
-30도 사선으로 화면 전체에 반복 표시하는 고정 오버레이(pointer-events:none, 불투명도 0.07, z-index 최상위).
3D 캔버스 위에도 보이게 하고, MutationObserver로 제거·숨김 감지 시 재삽입 + auditLogs 기록 호출.
```

### Phase 2 · 프리오픈
**T2-1**
```
T2-1을 구현해. / 프리오픈 랜딩: 풀스크린 히어로 "2027 GS25 상품전략공유회",
오픈까지 D-day 카운트다운(일/시/분/초), 9개 도시 순회 라인(도시 점이 순서대로 빛나는 애니메이션),
기념품 실루엣 5개 "?" 티저, [사전 알림 받기] [입장하기] 버튼.
오픈 전에는 입장하기 비활성 + 오픈 일시 표시. 상품 정보는 절대 넣지 마.
```
**T2-2**
```
T2-2를 구현해. popupNews 컬렉션을 읽어 우선순위 1개를 모달로 띄우는 PopupNews 컴포넌트.
"오늘 하루 보지 않기"(localStorage, try/catch), 닫기. 모바일은 하단 시트 형태.
기본 문구: "2027 GS25 상품전략공유회가 온라인에서 열립니다" + 사전 알림 신청 버튼.
관리자 /admin/content 에 팝업 CRUD(제목/본문/이미지/노출기간/우선순위/대상) 추가.
```

### Phase 3 · 3D ⚡
**T3-1**
```
T3-1을 구현해. components/three/ExpoHallScene.tsx 에 React Three Fiber로 박람회장 조감도를 만들어.
- 카메라: 아이소메트릭 느낌의 OrthographicCamera, 좌우 회전 ±30도만 허용, 줌 제한.
- sections 컬렉션의 hallPosition{x,z,w,d}로 11개 구역 블록 배치, 블록 위에 섹션명 라벨(drei Html),
  바닥에 입구→퇴점 동선 라인.
- 호버/탭: 블록이 살짝 떠오르고 툴팁(섹션명·예상 소요시간·스탬프 여부).
- 클릭: 카메라가 해당 블록으로 0.8초 줌인 후 /zone/[slug] 이동.
- frameloop="demand", 그림자는 데스크톱만, 모바일 DPR 최대 1.5.
3D 모델 파일 없이 기본 도형 + 색으로 먼저 구현(나중에 GLB 교체 가능한 구조로).
```
**T3-2**
```
T3-2를 구현해. detect-gpu로 tier 0~1 또는 WebGL 미지원이면 Map2DFallback(SVG 일러스트 평면도,
같은 11개 클릭 영역)을 보여줘. 상단에 "3D/2D 보기" 토글, 선택은 localStorage에 기억.
관리자 설정 문서(config/app.force2D=true)면 전원 2D로 강제.
```
**T3-4**
```
T3-4를 구현해. 표준매장 3D(components/three/ShelfScene.tsx):
곤돌라(5단), 워크인 쿨러, 카운터, FF 진열대 컴포넌트를 파라미터(폭·단수)로 생성.
products.shelf{fixture,bay,row,col} 위치에 상품 박스를 InstancedMesh로 배치(텍스처는 서명 URL로 로드).
상품 클릭 → 상세로 이동. OrbitControls(핀치 줌·드래그), [한 바퀴 자동 투어] 버튼은
카메라가 진열대 순서대로 이동하며 각 구역 2초 정지. 모바일 30fps 이상 목표.
```
**T3-6**
```
T3-6을 구현해. 웰컴존: messages에서 ceo → celeb_welcome 순으로 영상 자동 재생(음소거 시작,
"소리 켜기" 큰 버튼, 자막 트랙), 각 영상 90% 시청 시 서버에 consumed 이벤트 전송.
visibleUntil이 지난 셀럽 영상은 숨김. 아래에 오늘의 동선 안내 카드 11개.
```

### Phase 4 · 스탬프 🔐
**T4-2**
```
T4-2를 구현해. functions/src/exhibit:
- markProductProgress({productId, event:'enter'|'consumed'}): 서버 시각 기록.
- submitQuiz({productId, choice}): quizAnswers와 비교, 첫 시도 정답 여부 기록, 정답/해설 반환.
- 상품 완료 조건: consumed && 정답 && (now - enterAt >= section.minDwellSec).
- 섹션 requiredProductIds 전부 완료 시 stamps.{sectionId} 기록, stampCount 증가(트랜잭션),
  syncQueue에 Stamps 행 추가.
- 11개 + 설문 완료 시 completedAt, completionNo(전국 순번, 분산 카운터) 기록.
클라이언트가 enter 없이 consumed/submitQuiz를 호출하거나 체류시간 미달이면 거부하는 테스트 포함.
```
**T4-3**
```
T4-3을 구현해. QuizCard(4지선다, 큰 버튼), 정답 시 초록 체크+해설, 오답 시 해설 후 "다시 풀기".
스탬프 획득 시 화면 중앙에 도장이 쾅 찍히는 Framer Motion 애니메이션 + 진동(navigator.vibrate)
+ "n/11 스탬프" 토스트. 모든 스탬프 완료 시 "퇴점에서 완주를 확인하세요" 안내.
```

### Phase 5 · 소통 · AI
**T5-1 / T5-2**
```
T5-1과 T5-2를 순서대로 구현해(각각 끝나면 멈추고 보고).
T5-1: 섹션·상품 화면 플로팅 [MD에게 질문] → 바텀시트 작성(500자) → questions 생성.
onQuestionCreate 트리거: sections.mdIds로 assignedMdIds 설정 → staff 번호로 SOLAPI 문자
"[공유회질의] {섹션명} {지역} 경영주: {질문 40자}… 답변: {관리자 링크}".
T5-2: /admin/questions 모바일 인박스(미답변 우선, 섹션 필터, MD는 담당 섹션만).
answerQuestion callable → answer 저장 → 경영주 번호로 "답변이 도착했습니다: {답변 60자} 전체보기 {링크}"
→ 앱 내 알림 배지. "공개 전환" 토글 시 isPublic=true.
```
**T5-5**
```
T5-5를 구현해. askSectionBot callable(Gemini, 스트리밍):
시스템 프롬프트 = "GS25 상품전략공유회 안내 도우미. 아래 [자료] 안에서만 한국어로 짧고 쉽게 답하라.
자료에 없거나 불확실하면 추측하지 말고 '담당 MD에게 질문하기'를 권하라.
타사 비교, 개인정보, 매출 단정 표현 금지." + 해당 섹션 products.aiContext 합본.
aiUsage로 1인 1일 50회 제한, chatLogs 저장.
UI: 섹션마다 우하단 챗봇 버튼, 추천 질문 칩 3개(섹션별), 답변 하단 [MD에게 질문] 버튼.
```
**T5-7**
```
T5-7을 구현해. 1분 스케줄 aggregateWordcloud: 최근 visible 응원 cheers.tokens를 지역별로 집계,
불용어(은/는/이/가/합니다/화이팅 제외 여부는 설정값) 제거, 상위 80개를 aggregates/wordcloud_{region},
wordcloud_ALL에 저장. /cheer 화면: 상단 워드클라우드(GS25 컬러 팔레트, 반응형 캔버스 리사이즈),
지역 탭 10개(전국+9), 단어 클릭 시 해당 단어 포함 응원 목록, 하단 응원 작성(50자).
```

### Phase 6 · 랭킹
**T6-1 / T6-2**
```
T6-1: 5분 스케줄 aggregateRanking → aggregates/ranking에
firstFinishers(전국 30), regionParticipation(지역별 로그인점포/등록점포), regionUnderstanding(퀴즈 첫시도 정답률),
topUnderstanding(개인 30, 동점 시 완주 빠른 순) 저장. 점포명은 뒤 2글자 마스킹.
T6-2: /ranking 3개 탭(🏁 최초 완주 / 📣 참여율 / 🧠 이해도), 내 순위 고정 카드,
지역 순위는 막대그래프 + 1위 지역 왕관. ?mode=board 는 전광판 모드(전체화면, 10초마다 탭 자동 전환, 큰 글씨).
```

### Phase 7 · 오프라인 · 라이브 · 기념품
**T7-2**
```
T7-2를 구현해. /offline/reserve: 도시 선택 → 달력(개최일만 활성) → 3개 타임 카드(10–12/13–15/15–17, 잔여석 실시간).
reserveSlot callable: 트랜잭션으로 reservedCount < capacity 확인, 1점포 1예약(기존 예약 있으면 변경 처리),
전일 18시 이후 변경·취소 불가. 예약 시 각인 펜 문구(기본 점포명, 12자) 입력.
완료 화면에 서명된 qrToken 기반 QR, SOLAPI 확정 문자. 전일 17시 리마인드 스케줄 함수.
```
**T7-3**
```
T7-3을 구현해. /admin/reservations/checkin (operator 권한, 모바일 전용 UI):
html5-qrcode로 스캔 → checkIn callable(qrToken 검증, 당일·해당 타임 확인, 중복 체크인 거부)
→ 점포명·각인 문구 표시 → 기념품 품목 체크 → souvenirStock 차감.
네트워크 끊김 시 로컬 큐에 저장 후 복구되면 재전송.
```
**T7-5**
```
T7-5를 구현해. 기념품존(온라인)과 /souvenir-promo:
- 미스터리 박스 5개(뱃지, 키링, 점포소모품 키트, 점포명 각인 펜, 의류 — 처음엔 이름도 숨김).
- 내 스탬프 3/6/9개 달성 시 박스 하나씩 흔들리며 힌트 문구 공개.
- souvenirs.revealAt 시각이 지나면 실물 사진으로 리빌(뒤집히는 카드 애니메이션).
- "현장에서만 받을 수 있어요" 배지, 도시별 재고 소진 시 "조기 소진", 하단 고정 [방문 예약하기] CTA.
궁금증을 키우도록 과한 설명 없이 짧은 카피로.
```

### Phase 8 · 관리자
**T8-1 / T8-2**
```
T8-1: /admin/dashboard — aggregates/stats 1건 구독으로 카드(현재 접속, 오늘 로그인, 누적 로그인,
완주 수/율, 미응답 질문), Recharts로 지역별 로그인·완주율 막대, 섹션별 스탬프 퍼널(이탈 구간),
시간대별 접속 라인, 퀴즈 오답률 TOP10.
T8-2: /admin/participants — 점포코드·점포명·지역·로그인·스탬프 n/11·완주시각·예약/방문·쿠폰상태 테이블,
필터(완주/미완주/미접속/지역), 검색, 서버 페이지네이션, 엑셀 내보내기(exportParticipants callable, auditLogs 기록).
```
**T8-4**
```
T8-4를 구현해. /admin/coupons: 쿠폰코드 CSV 업로드 → 완주자(completedAt 존재) 목록과 1:1 매칭 미리보기
→ [발송] 시 sendCoupons callable이 100건씩 배치로 SOLAPI MMS 발송, coupons/{uid} 상태 기록,
실패 건만 모아 재발송 버튼. 21시~08시에는 발송 버튼 비활성.
```

### Phase 9 · 데이터 연동
**T9-1**
```
T9-1을 구현해. 이벤트 발생 시 syncQueue에 {sheet, row, createdAt} 추가하는 헬퍼(shared/sheets.ts)를 만들고,
1분 스케줄 flushSyncQueue가 시트별로 묶어 spreadsheets.values.append(최대 500행/회) 후 성공분만 삭제,
실패는 tries 증가(5회 초과 시 관리자 알림). 서비스계정 키는 Secret에서 읽어.
```
**T9-3**
```
T9-3을 구현해. HTTPS Function storesSync(POST): X-Integration-Key 헤더 검증(timing-safe 비교),
IP 허용목록, 본문 스키마 zod 검증 후 stores 업서트/비활성. 결과 요약 JSON 반환, auditLogs 기록.
GUIDE.md 4장에 Power Automate 흐름 A/B 설정 절차를 스크린샷 없이 단계별로 추가해.
```

### Phase 10 · 품질
**T10-3**
```
T10-3을 구현해. scripts/loadtest/k6.js: 스테이징에서 가상 사용자 3,000명,
시나리오 = 로비 진입 → 섹션 2개 → 상품 5개 progress/퀴즈 → 랭킹 조회 → 응원 1건.
OTP는 테스트 모드 고정코드(스테이징 한정 플래그)로 우회. p95 응답시간과 오류율 리포트 출력.
결과를 보고 minInstances·동시성 설정 권장값을 제안해.
```

---

## 3. 디버깅 · 수정용 짧은 프롬프트
- "방금 만든 T3-1이 갤럭시 A 시리즈에서 버벅여. 원인을 3가지 추정하고, 가장 효과 큰 것부터 하나씩 고쳐."
- "Rules 테스트 3번이 실패해. 규칙을 느슨하게 바꾸지 말고, 테스트 기대값과 규칙 중 무엇이 PRD와 맞는지 먼저 판단해."
- "이 화면을 태블릿 세로(820px)에서 캡처했더니 상품 리스트가 3D를 가려. 바텀시트 높이를 40%로 줄이고 드래그로 펼치게 해."
- "변경사항을 커밋 메시지 한 줄(한국어, 태스크번호 포함)로 정리해."

## 4. 참고 사이트를 프롬프트에 활용하는 법
- "vFairs의 2D/3D/항공뷰 전환처럼, 로비에 '조감도/평면도/목록' 3가지 보기를 넣어줘."
- "MootUp처럼 섹션별 체류시간·클릭을 추적해서 관리자 대시보드 섹션 퍼널에 반영해."
- "WithSpace의 '작품 간 자동 이동'처럼, 상품 상세에서 [다음 상품] 버튼으로 진열 순서대로 이동하게 해."
- "three.js AI 쇼룸 데모처럼, 3D 진열대에서 상품을 선택하면 챗봇 입력창에 '이 상품' 컨텍스트가 자동으로 붙게 해."
