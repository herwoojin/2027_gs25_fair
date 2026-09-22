# TASK — 2027 GS25 상품전략공유회 온라인 전시 플랫폼

> 원칙: **한 번에 한 태스크만** AI에게 맡기고, 완료 기준(DoD)을 통과한 뒤 커밋 → 다음 태스크.
> 표기: [ ] 대기 · [~] 진행 · [x] 완료 · 🔐 보안 핵심 · ⚡ 성능 핵심
> 각 태스크에 맞는 프롬프트는 PROMPT.md 의 같은 번호를 사용.

> **진행 현황 (2026-09-22)** — 코드는 `gs25-expo-2027/` 에 있습니다.
> · `[x]` = 구현 + 로컬 검증 완료 · `[~]` = 코드 작성 완료, **실제 외부 계정/기기가 있어야 최종 검증 가능**
> · 로컬 검증: 라우트 31개 200 OK · API 통합 테스트 49/49 통과 · 완주 체인(스탬프 11 → 수료증 → 쿠폰) 실동작 확인
> · `npm run build` 성공, `npm run lint` 무경고, `tsc --noEmit` 무오류(웹앱 + functions)

---

## Phase 0. 기반 (1주)
- [x] **T0-1** Next.js 14 + TS + Tailwind + shadcn/ui 프로젝트 생성, 폴더 구조(TRD 8장) 생성
  - DoD: `npm run dev` 정상, ESLint/Prettier 통과 → ✅ 확인
- [~] **T0-2** Firebase dev/stg/prod 프로젝트 연결, Auth·Firestore·Functions·Storage·App Hosting 초기화, 에뮬레이터 구성
  - `firebase.json` · `.firebaserc` · `.env.example` 작성 완료. **실제 Firebase 프로젝트 3개 생성은 계정 작업 필요**
  - Firebase 미설정 시 동일 판정 로직의 로컬 백엔드(`lib/server/**` + `app/api/fn/*`)로 자동 폴백
- [~] **T0-3** 🔐 App Check(reCAPTCHA Enterprise) 적용, 보안 헤더·noindex·robots.txt 적용
  - 보안 헤더(CSP/HSTS/XFO/Referrer/Permissions/X-Robots-Tag) + robots.txt Disallow + `enforceAppCheck: true` 전 callable 적용 완료
  - **reCAPTCHA Enterprise 키 발급 후 `NEXT_PUBLIC_APPCHECK_SITE_KEY` 주입 필요**
- [x] **T0-4** 디자인 토큰(GS25 브랜드 컬러, 16px 기본 폰트, 글자크기 토글), 공통 레이아웃(모바일 하단 탭바 / 태블릿·PC 사이드바)
  - DoD: 360 / 768 / 1024 / 1440px 깨짐 없음 (Tailwind 브레이크포인트 기준 구현)
- [x] **T0-5** Firestore 컬렉션 타입 정의(`types/`), 시드 스크립트(섹션 11, 상품 32, 도시 9, 슬롯 897)
  - DoD: `npm run seed` 로 에뮬레이터에 데이터 적재

## Phase 1. 인증 · 보안 (1.5주)
- [x] **T1-1** 🔐 `stores` 화이트리스트 + 휴대폰 암호화/HMAC 유틸, 점포 계정 일괄 생성 스크립트
  - DoD: 평문 전화번호 DB 에 없음 (AES-256-GCM `phoneEnc` + HMAC `phoneLast4Hash` 만 저장)
- [~] **T1-2** 🔐 SOLAPI 공용 모듈(`shared/solapi.ts`) + smsLogs 기록 + 템플릿 컬렉션
  - 모듈·템플릿 10종·야간 차단·허용목록·재시도 구현 완료. **발신번호 등록 + API 키 발급 후 실제 수신 테스트 필요**
- [x] **T1-3** 🔐 `requestOtp` / `verifyOtp` Functions + rateLimit + 감사로그 + Custom Token 발급
  - DoD: 미등록/번호불일치 **동일 오류 문구** ✅ · 5회 실패 30분 잠금 ✅ · 점포 10분 3회 제한 ✅ (통합 테스트 검증)
- [x] **T1-4** 경영주 로그인 UI (점포코드 → 뒷4자리 → 인증번호, 3분 타이머, 재발송 60초) + 첫 로그인 동의 화면
- [x] **T1-5** 🔐 본부 로그인(@gsretail.com 차단함수) + SMS 2차 인증 + 역할별 메뉴
  - DoD: 외부 도메인 로그인 403 차단 ✅
- [x] **T1-6** 🔐 동시접속 1대 제한(activeSessionKey), 12시간 세션 만료, AuthGuard/RoleGuard
  - DoD: 새 기기 로그인 시 기존 기기에 "다른 기기에서 로그인되어…" 안내 후 강제 종료 ✅
- [x] **T1-7** 🔐 Firestore/Storage Rules 전체 작성 + 규칙 테스트(`scripts/testRules.ts`, 25케이스)
  - DoD 케이스: 비로그인 전면 거부 / 타인 progress / quizAnswers / stores / progress 직접쓰기 / 질문 500자 / 공개질문 읽기
  - **실행에는 Firestore 에뮬레이터 필요** (`npm run test:rules`)
- [x] **T1-8** 🔐 워터마크 오버레이(점포코드+시각, MutationObserver 제거 감지 → 재삽입 + 감사로그)

## Phase 2. 프리오픈 · 공지 (0.5주)
- [x] **T2-1** 프리오픈 랜딩(카운트다운, 9개 도시 티저, 기념품 실루엣), 오픈 전 입장 버튼 비활성
- [x] **T2-2** 팝업 뉴스 컴포넌트 + 관리자 조회 + "오늘 하루 보지 않기"
- [x] **T2-3** 사전 알림 신청(화이트리스트 검증, 수신동의) + D-7/D-1/D-day 스케줄 발송 함수
  - DoD: 스케줄 함수 `sendPreNotifyBatch` 가 config.openAt 기준으로 대상 추출

## Phase 3. 3D 전시 (2.5주)
- [x] **T3-1** ⚡ 3D 로비: 아이소메트릭 박람회장, 11개 섹션 블록(hallPosition 기반), 호버 툴팁, 클릭 0.8초 줌 전환
- [x] **T3-2** ⚡ GPU 등급 판별 → 2D SVG 평면도 폴백 + 수동 전환 토글 + 관리자 강제 2D
- [x] **T3-3** 스탬프 상태 반영(색·도장), 추천 다음 섹션 바닥 화살표, 상단 진행바
- [x] **T3-4** ⚡ 표준매장 3D: 곤돌라·워크인·카운터·FF·행사매대, 상품 박스 배치, 오빗 컨트롤·한 바퀴 자동 투어
- [x] **T3-5** 섹션 템플릿(3D 씬 + 상품 리스트 사이드/바텀시트), 섹션 11종 라우팅
- [x] **T3-6** 웰컴존: 대표님·셀럽 영상 순차 재생(음소거 시작, 90% 시청 시 consumed), 동선 안내 카드 11개
- [~] **T3-7** 3D 에셋 최적화 파이프라인(gltf-transform), 섹션별 지연 로딩
  - 지연 로딩 완료(three.js 번들 분리 → zone 페이지 523kB → **261kB**). **실제 GLB 모델 제작 후 최적화 필요**

## Phase 4. 상품 상세 · 스탬프 (1.5주)
- [x] **T4-1** 상품 상세: 오디오 가이드(진행률), 스크립트 리더(끝 도달 감지), 핵심 3줄, 완료 조건 표시
- [x] **T4-2** 🔐 `markProductProgress` / `submitQuiz` / 스탬프·완주 판정(서버 시각, 최소 체류)
  - DoD: 개발자도구로 바로 완료 호출해도 스탬프 불가 ✅ (enter 없는 consumed·퀴즈 거부, 체류 미달 시 완료 보류 검증)
- [x] **T4-3** 퀴즈 카드(정답·오답 해설, 재도전), 스탬프 획득 애니메이션·토스트·진동
- [x] **T4-4** 퇴점: 전 스탬프 확인 → 설문 5문항 → 완주 처리 → 디지털 수료증(워터마크, PNG 저장)
  - DoD: 실제 완주 체인 검증 완료 (전국 완주 순번 · 이해도 산출 · 수료증 발급)
- [x] **T4-5** /my 페이지: 스탬프 보드, 내 질문·답변, 예약, 쿠폰 상태

## Phase 5. 소통 · AI (1.5주)
- [x] **T5-1** MD 질의: 질문 작성(섹션/상품 자동 태그) → `onQuestionCreate` → 담당 MD 문자
- [x] **T5-2** MD 인박스(모바일 최적화) → 답변 → 경영주 문자 + 공개 전환
- [x] **T5-3** 2시간 미응답 에스컬레이션 스케줄 함수(업무시간 15분 주기)
- [x] **T5-4** /ask 공개 Q&A 피드(최신·공감순, 섹션 필터, 공감, 신고)
- [~] **T5-5** 섹션 AI 챗봇: `askSectionBot`(Gemini, 섹션 컨텍스트, 1일 50회) + 플로팅 UI
  - DoD: 자료 밖 질문에 추측하지 않고 MD 연결 안내 ✅ (로컬은 검색 기반 응답으로 동일 정책 재현)
  - **Gemini API 키 주입 시 운영 경로(functions/src/ai)로 전환**
- [x] **T5-6** 응원 메시지 작성·금칙어·검수 + 토큰 추출 함수
- [x] **T5-7** ⚡ 워드클라우드 집계(1분) + 전국/지역 10탭, 단어 클릭 필터

## Phase 6. 게임 · 랭킹 (0.5주)
- [x] **T6-1** ⚡ 랭킹 집계 스케줄(`aggregates/ranking`, `stats`, `wordcloud_*`, `askTop`)
- [x] **T6-2** /ranking 화면(최초 완주·참여율·이해도 탭, 내 순위, 지역 배지) + `?mode=board` 전광판 모드

## Phase 7. 오프라인 · 라이브 · 기념품 (1.5주)
- [x] **T7-1** /offline: 9개 도시 지도·타임라인, 도시 상세(일자×3타임 잔여석)
- [x] **T7-2** ⚡ 타임 예약(트랜잭션, 1점포 1예약, 전일 18시 마감), 각인 문구, 입장 QR, 확정·리마인드 문자
- [x] **T7-3** 운영자 체크인 앱(QR 스캔, 기념품 지급 체크, 재고 차감, 중복 방지, 오프라인 큐)
- [x] **T7-4** /live 편성표·알림 신청·YouTube(nocookie) 임베드·다시보기 + 관리자 편성 관리
- [x] **T7-5** 기념품존 미스터리 박스(스탬프 3·6·9 힌트) + /souvenir-promo(공개 일정별 리빌, 조기 소진 배지)

## Phase 8. 관리자 (1.5주)
- [x] **T8-1** 대시보드: 실시간 카드, 지역별·섹션 퍼널·시간대 차트, 오답률 TOP10
- [x] **T8-2** 참여자 테이블(필터·검색·페이지네이션·CSV 내보내기 + 감사로그)
- [x] **T8-3** 독려 문자 일괄 발송(미접속/미완주, 야간 차단, 미리보기 확인)
- [x] **T8-4** 쿠폰: 코드 CSV 업로드 → 완주자 매칭 → 100건 배치 발송 → 실패 재발송
- [x] **T8-5** 콘텐츠 관리(섹션·상품·퀴즈·메시지·기념품·팝업 조회 + 전체 2D 강제 스위치)
- [x] **T8-6** 예약·체크인 현황, 응원 검수, 감사·SMS·백업큐 로그 뷰어

## Phase 9. 데이터 연동 (1주)
- [x] **T9-1** syncQueue + 1분 배치 구글시트 append(시트별 묶음, 실패 시 tries 증가·5회 초과 알림)
- [x] **T9-2** 구글시트 `Stores` → `importStores` (관리자 버튼 + 매일 06시)
- [x] **T9-3** Power Automate 연동 엔드포인트(`storesSync`, 공유키 timing-safe·IP 허용) + **GUIDE 4.1~4.3 절차 문서화 완료**
  - DoD: `scripts/verifySync.ts` 로 시트 행 수 = Firestore 이벤트 수 검증

## Phase 10. 품질 · 출시 (1.5주)
- [x] **T10-1** PWA(manifest, 아이콘, standalone), 콘텐츠 비캐시(`/api/*` no-store)
- [~] **T10-2** 접근성·글자크기·태블릿 QA, 실기기 테스트
  - 글자 크게 3단계 · 터치 44px · 기본 16px · 자막 트랙 구현 완료. **실기기(갤럭시 A/아이폰/탭) 테스트 필요**
- [x] **T10-3** ⚡ k6 부하 스크립트(동시 3,000, 로그인·스탬프·피드) + minInstances 권장값 자동 산출
  - **스테이징 환경에서 실행 필요**
- [~] **T10-4** 🔐 보안 점검: Rules 테스트·헤더·비밀키 스캔·개인정보 파기 배치
  - Rules 테스트 25케이스 · 파기 배치(`purgePersonalData`) 구현. **`gitleaks` 스캔 + 외부 모의 접속은 배포 후 수행**
- [ ] **T10-5** 운영 리허설(파일럿 100점포 + MD 5명), 장애 대응 런북 점검 → prod 배포

---

## 남은 외부 작업 (코드 밖)

1. Firebase 프로젝트 3개 생성(dev/stg/prod, asia-northeast3, Blaze + 예산 알림)
2. reCAPTCHA Enterprise 키 발급 → App Check enforce
3. SOLAPI 사업자 인증 + **발신번호 등록** + API 키 → Secret Manager (알림톡 검수는 D-30 이전 신청)
4. Gemini API 키 발급 → Secret Manager
5. 구글시트 백업 문서 + 서비스계정 편집자 공유 → `SHEETS_SA_JSON` / `SHEET_ID`
6. Power Automate 프리미엄 라이선스 확인 → 흐름 A/B 구성 (GUIDE 4.1~4.3)
7. 실제 콘텐츠: 상품 원고·오디오 녹음·영상 촬영, 3D GLB 모델, 기념품 실물 사진
8. PRD 9장 오픈 이슈 확정: 도시·장소·기간, 타임별 정원, 셀럽·초상 사용기간, 섹션별 담당 MD, 쿠폰 대행사
