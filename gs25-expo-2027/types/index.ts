// T0-5 · ERD.md 전 컬렉션 타입 정의
// 🔒 표시 컬렉션은 클라이언트에서 읽지 않는다(서버 전용 타입은 functions 에서 재사용).

export type RegionCode =
  | 'SEOUL'
  | 'GYEONGGI'
  | 'GANGWON'
  | 'CHUNGCHEONG'
  | 'DAEGU'
  | 'BUSAN'
  | 'GWANGJU'
  | 'ULSAN'
  | 'JEJU';

export const REGIONS: { code: RegionCode; label: string; short: string }[] = [
  { code: 'SEOUL', label: '서울', short: '서울' },
  { code: 'GYEONGGI', label: '경기·인천', short: '경기' },
  { code: 'GANGWON', label: '강원', short: '강원' },
  { code: 'CHUNGCHEONG', label: '대전·충청', short: '충청' },
  { code: 'DAEGU', label: '대구·경북', short: '대구' },
  { code: 'ULSAN', label: '울산', short: '울산' },
  { code: 'BUSAN', label: '부산·경남', short: '부산' },
  { code: 'GWANGJU', label: '광주·전라', short: '광주' },
  { code: 'JEJU', label: '제주', short: '제주' },
];

export const REGION_LABEL: Record<RegionCode, string> = REGIONS.reduce(
  (acc, r) => ({ ...acc, [r.code]: r.label }),
  {} as Record<RegionCode, string>,
);

export type Role = 'owner' | 'md' | 'operator' | 'admin';

/** 🔒 stores/{storeCode} — 클라이언트 read 금지 */
export interface Store {
  storeCode: string;
  storeName: string;
  ownerName: string;
  phoneEnc: string;
  phoneLast4Hash: string;
  region: RegionCode;
  fcTeam: string;
  active: boolean;
  syncedAt?: number;
}

/** users/{uid} — uid = `store_{storeCode}` 또는 본부 Firebase uid */
export interface AppUser {
  uid: string;
  role: Role;
  storeCode?: string;
  displayName: string;
  region?: RegionCode;
  activeSessionKey?: string;
  consentAt?: number;
  firstLoginAt?: number;
  lastLoginAt?: number;
  fontScale?: number;
  offlineVisited?: boolean;
}

/** staff/{uid} */
export interface Staff {
  uid: string;
  name: string;
  team: string;
  email: string;
  phoneEnc?: string;
  sectionIds: string[];
  backupFor: string[];
  smsEnabled: boolean;
}

export type SectionType = 'video' | 'shelf3d' | 'content' | 'souvenir' | 'exit';

export type SectionSlug =
  | 'welcome'
  | 'media'
  | 'standard-store'
  | 'counter-ff'
  | 'fresh'
  | 'new-format'
  | 'education'
  | 'ax-auto-order'
  | 'win-win'
  | 'souvenir'
  | 'exit';

export interface HallPosition {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Section {
  id: string;
  order: number;
  slug: SectionSlug;
  title: string;
  subtitle: string;
  type: SectionType;
  modelPath?: string;
  hallPosition: HallPosition;
  requiredProductIds: string[];
  minDwellSec: number;
  estMinutes: number;
  mdIds: string[];
  isOpen: boolean;
  /** 조감도 블록 색 (GLB 교체 전 임시 표현) */
  color?: string;
}

export type ShelfFixture = 'gondola' | 'walkin' | 'counter' | 'ff' | 'island';

export interface ShelfPosition {
  fixture: ShelfFixture;
  bay: number;
  row: number;
  col: number;
}

export interface Product {
  id: string;
  sectionId: string;
  name: string;
  category: string;
  summary3: string[];
  script: string;
  audioPath?: string;
  imagePath?: string;
  videoPath?: string;
  shelf?: ShelfPosition;
  /** 챗봇 참고자료 — 서버에서만 프롬프트로 사용 */
  aiContext: string;
  launchDate?: string;
  order: number;
  /** 진열 박스 색(텍스처 대체) */
  color?: string;
}

/** quizzes/{productId} — 보기만. 정답은 quizAnswers(🔒)에만 있다. */
export interface Quiz {
  id: string;
  question: string;
  options: string[];
}

export type MessageKind = 'ceo' | 'celeb_welcome' | 'celeb_finish';

export interface HeroMessage {
  id: string;
  kind: MessageKind;
  title: string;
  speaker: string;
  videoPath?: string;
  captionPath?: string;
  posterPath?: string;
  durationSec: number;
  visibleFrom?: number;
  visibleUntil?: number;
}

export interface ProductProgress {
  enterAt?: number;
  consumedAt?: number;
  doneAt?: number;
  /** 첫 시도 정답 여부 — 이해도 랭킹 산식에 사용 */
  quizFirstTryCorrect?: boolean;
  /** 최종 정답 여부 — 상품 완료 조건 */
  quizCorrect?: boolean;
  attempts?: number;
}

/** 🧮 progress/{uid} — 클라이언트 write 금지 */
export interface Progress {
  uid: string;
  storeCode: string;
  region: RegionCode;
  products: Record<string, ProductProgress>;
  stamps: Record<string, number>;
  stampCount: number;
  quizFirstTryCorrect: number;
  quizTotal: number;
  surveyDoneAt?: number;
  completedAt?: number;
  completionNo?: number;
}

export interface Survey {
  uid: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  q5: number;
  comment?: string;
  createdAt: number;
}

export type QuestionChannel = 'section' | 'hq';
export type QuestionStatus = 'open' | 'answered' | 'hidden';

export interface Question {
  id: string;
  channel: QuestionChannel;
  sectionId?: string;
  productId?: string;
  uid: string;
  storeCode: string;
  region: RegionCode;
  authorLabel: string;
  text: string;
  status: QuestionStatus;
  assignedMdIds: string[];
  answer?: { text: string; byUid: string; byName: string; at: number };
  isPublic: boolean;
  likeCount: number;
  escalatedAt?: number;
  createdAt: number;
}

export type CheerStatus = 'pending' | 'visible' | 'hidden';

export interface Cheer {
  id: string;
  uid: string;
  region: RegionCode;
  authorLabel: string;
  text: string;
  status: CheerStatus;
  tokens: string[];
  createdAt: number;
}

export interface ChatTurn {
  id: string;
  sectionId: string;
  role: 'user' | 'bot';
  text: string;
  createdAt: number;
  tokensUsed?: number;
}

export interface ExpoEvent {
  id: string;
  city: string;
  region: RegionCode;
  venueName: string;
  address: string;
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  order: number;
}

export const SLOT_TIMES: Record<number, string> = {
  1: '10:00 – 12:00',
  2: '13:00 – 15:00',
  3: '15:00 – 17:00',
};

export interface Slot {
  id: string;
  eventId: string;
  date: string;
  slotNo: number;
  capacity: number;
  reservedCount: number;
  checkedInCount: number;
}

export type ReservationStatus = 'reserved' | 'cancelled' | 'checked_in' | 'no_show';

export interface Reservation {
  id: string;
  uid: string;
  storeCode: string;
  region: RegionCode;
  eventId: string;
  slotId: string;
  date: string;
  slotNo: number;
  partySize: number;
  engravingText: string;
  status: ReservationStatus;
  qrToken: string;
  createdAt: number;
  checkedInAt?: number;
  checkedInBy?: string;
  souvenirGiven?: Record<string, boolean>;
}

export interface Souvenir {
  id: string;
  name: string;
  teaserImage?: string;
  revealImage?: string;
  hint: string;
  shape: 'badge' | 'keyring' | 'kit' | 'pen' | 'apparel';
  revealAt: number;
  stampToHint: number;
  order: number;
}

export interface SouvenirStock {
  id: string;
  eventId: string;
  itemId: string;
  total: number;
  given: number;
}

export type LiveStatus = 'scheduled' | 'live' | 'ended';

export interface LiveStream {
  id: string;
  eventId: string;
  city: string;
  startAt: number;
  endAt: number;
  mdName: string;
  topic: string;
  youtubeId?: string;
  status: LiveStatus;
  replayId?: string;
}

export interface PopupNews {
  id: string;
  title: string;
  body: string;
  imagePath?: string;
  startAt: number;
  endAt: number;
  priority: number;
  target: 'public' | 'app';
  ctaLabel?: string;
  ctaHref?: string;
}

export type CouponStatus = 'ready' | 'sent' | 'failed';

export interface Coupon {
  uid: string;
  storeCode: string;
  code: string;
  status: CouponStatus;
  sentAt?: number;
  solapiGroupId?: string;
  retries: number;
}

export interface AggregateStats {
  loginCount: number;
  todayLoginCount: number;
  onlineNow: number;
  completedCount: number;
  registeredCount: number;
  openQuestionCount: number;
  regions: Record<RegionCode, { registered: number; loggedIn: number; completed: number }>;
  sectionStamps: { sectionId: string; title: string; count: number }[];
  hourly: { hour: string; count: number }[];
  quizWrongTop: { productId: string; name: string; wrongRate: number }[];
  updatedAt: number;
}

export interface RankingEntry {
  rank: number;
  storeLabel: string;
  region: RegionCode;
  value: number;
  valueLabel: string;
  uid?: string;
}

export interface RegionRankEntry {
  rank: number;
  region: RegionCode;
  ratio: number;
  numerator: number;
  denominator: number;
}

export interface AggregateRanking {
  firstFinishers: RankingEntry[];
  regionParticipation: RegionRankEntry[];
  regionUnderstanding: RegionRankEntry[];
  topUnderstanding: RankingEntry[];
  updatedAt: number;
}

export interface WordCloudItem {
  text: string;
  value: number;
}

export interface AuditLog {
  id: string;
  uid: string;
  role: Role | 'anonymous';
  action: string;
  target?: string;
  ip?: string;
  ua?: string;
  at: number;
  detail?: string;
}

export interface AppConfig {
  /** 전체 2D 모드 강제 (GUIDE 8.2 장애 대응) */
  force2D: boolean;
  /** 온라인 오픈 일시 (ms) */
  openAt: number;
  /** 순회 시작일 (ms) — D-day */
  tourStartAt: number;
  /** 온라인 마감 */
  closeAt: number;
  maintenanceNotice?: string;
}
