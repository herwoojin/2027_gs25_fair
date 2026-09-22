/**
 * 2027 GS25 상품전략공유회 — Cloud Functions (2nd gen, Node 20, asia-northeast3)
 *
 * 원칙 (PROMPT.md 절대 규칙)
 *  - 스탬프·완주·퀴즈 채점·SMS 발송·AI 호출은 반드시 여기(서버)에서만 한다.
 *  - 비밀키는 Secret Manager(defineSecret)로만 다루고 클라이언트 번들에 넣지 않는다.
 *  - 휴대폰 번호는 평문 저장 금지(AES-GCM 암호화 + 뒷4자리 HMAC).
 *  - 모든 callable 은 App Check 를 강제한다(enforceAppCheck: true).
 */

// 인증 · 세션
export {
  requestOtp,
  verifyOtp,
  staffLogin,
  staffVerify,
  acceptConsent,
  reportWatermarkTamper,
  blockPublicSignup,
  enforceStaffDomain,
} from './auth';

// 전시 · 스탬프
export { markProductProgress, submitQuiz, submitSurvey } from './exhibit';

// 질의응답 · 응원
export {
  onQuestionCreate,
  onQuestionLike,
  answerQuestion,
  moderateQuestion,
  escalateQuestions,
  onCheerCreate,
  moderateCheer,
} from './qa';

// AI 챗봇
export { askSectionBot, getSuggestedQuestions } from './ai';

// 오프라인 예약 · 체크인
export {
  reserveSlot,
  cancelReservation,
  checkIn,
  remindReservations,
  markNoShows,
} from './reserve';

// 집계 (랭킹 · 통계 · 워드클라우드)
export { aggregateRanking, aggregateStats, aggregateWordcloud, aggregateAskTop } from './agg';

// 데이터 연동 (구글시트 · Power Automate)
export {
  flushSyncQueue,
  importStores,
  importStoresDaily,
  importStaff,
  importStaffDaily,
  storesSync,
  purgePersonalData,
} from './sync';

// 알림 (사전알림 · 리마인드 · 라이브)
export {
  requestPreNotify,
  sendPreNotifyBatch,
  sendCityReminder,
  sendLiveAlerts,
} from './notify';

// 관리자
export {
  adminParticipants,
  exportParticipants,
  sendNudge,
  sendCoupons,
  adminSetConfig,
  getSignedMediaUrl,
} from './admin';
