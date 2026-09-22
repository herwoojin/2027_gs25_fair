import type {
  Cheer,
  HeroMessage,
  LiveStream,
  PopupNews,
  Question,
  RegionCode,
  Souvenir,
  Staff,
} from '@/types';
import { DEFAULT_CONFIG } from '@/lib/config';
import { EVENTS } from './events';

const DAY = 86400000;
const HOUR = 3600000;

/** F-14 기념품 5종 — 처음에는 이름도 숨김(궁금증 설계) */
export const SOUVENIRS: Souvenir[] = [
  {
    id: 'sv-badge',
    name: '2027 기념 뱃지',
    shape: 'badge',
    hint: '가슴에 다는 것. 아홉 도시마다 색이 다릅니다.',
    stampToHint: 3,
    revealAt: DEFAULT_CONFIG.tourStartAt,
    order: 1,
  },
  {
    id: 'sv-keyring',
    name: '미니 점포 키링',
    shape: 'keyring',
    hint: '손바닥보다 작은데, 우리 매장을 그대로 닮았습니다.',
    stampToHint: 3,
    revealAt: DEFAULT_CONFIG.tourStartAt + 5 * DAY,
    order: 2,
  },
  {
    id: 'sv-kit',
    name: '점포 소모품 키트',
    shape: 'kit',
    hint: '매일 쓰는데 늘 모자랐던 것들을 한 상자에 담았습니다.',
    stampToHint: 6,
    revealAt: DEFAULT_CONFIG.tourStartAt + 11 * DAY,
    order: 3,
  },
  {
    id: 'sv-pen',
    name: '점포명 각인 펜',
    shape: 'pen',
    hint: '세상에 하나뿐입니다. 예약할 때 문구를 적어 주세요.',
    stampToHint: 9,
    revealAt: DEFAULT_CONFIG.tourStartAt + 18 * DAY,
    order: 4,
  },
  {
    id: 'sv-apparel',
    name: '근무 조끼 · 티셔츠',
    shape: 'apparel',
    hint: '여름에도 겨울에도 입을 수 있게 만들었습니다.',
    stampToHint: 9,
    revealAt: DEFAULT_CONFIG.tourStartAt + 25 * DAY,
    order: 5,
  },
];

/** F-13 대표님 · 셀럽 메시지 (id 는 대응 product id 와 동일) */
export const MESSAGES: HeroMessage[] = [
  {
    id: 'pw-ceo',
    kind: 'ceo',
    title: '2027년, 점포의 하루를 더 쉽게',
    speaker: '대표이사',
    durationSec: 168,
    videoPath: 'private/messages/ceo.mp4',
    captionPath: 'private/messages/ceo.vtt',
  },
  {
    id: 'pw-celeb',
    kind: 'celeb_welcome',
    title: '전국 경영주님께 드리는 응원',
    speaker: '응원 메시지',
    durationSec: 62,
    videoPath: 'private/messages/celeb-welcome.mp4',
    captionPath: 'private/messages/celeb-welcome.vtt',
    visibleFrom: DEFAULT_CONFIG.openAt,
    // 초상권 사용기간 — 지나면 자동 비노출 (PRD F-13)
    visibleUntil: DEFAULT_CONFIG.closeAt + 30 * DAY,
  },
  {
    id: 'celeb-finish',
    kind: 'celeb_finish',
    title: '완주를 축하합니다',
    speaker: '응원 메시지',
    durationSec: 38,
    videoPath: 'private/messages/celeb-finish.mp4',
    captionPath: 'private/messages/celeb-finish.vtt',
    visibleUntil: DEFAULT_CONFIG.closeAt + 30 * DAY,
  },
];

export const POPUP_NEWS: PopupNews[] = [
  {
    id: 'pn-open',
    title: '2027 GS25 상품전략공유회가 온라인에서 열립니다',
    body: '전국 9개 도시 순회와 동일한 내용을 온라인에서도 보실 수 있습니다.\n스탬프 11개를 모두 모으시면 완주 쿠폰을 보내 드립니다.',
    startAt: DEFAULT_CONFIG.openAt - 14 * DAY,
    endAt: DEFAULT_CONFIG.closeAt,
    priority: 10,
    target: 'public',
    ctaLabel: '사전 알림 받기',
    ctaHref: '#prenotify',
  },
  {
    id: 'pn-reserve',
    title: '오프라인 방문 예약이 열렸습니다',
    body: '도시별 하루 3개 타임(10–12 / 13–15 / 15–17)으로 운영합니다.\n타임별 정원이 있어 조기 마감될 수 있습니다.',
    startAt: DEFAULT_CONFIG.openAt,
    endAt: DEFAULT_CONFIG.closeAt,
    priority: 5,
    target: 'app',
    ctaLabel: '예약하러 가기',
    ctaHref: '/offline/reserve',
  },
];

/** F-12 라이브 편성 — 매주 화·목 11:00, 도시별 최소 1회 (PLAN 3장) */
export const LIVE_STREAMS: LiveStream[] = EVENTS.flatMap((ev, i) => {
  const start = new Date(`${ev.startDate}T11:00:00+09:00`).getTime();
  const base: LiveStream = {
    id: `live-${ev.id}-open`,
    eventId: ev.id,
    city: ev.city,
    startAt: start,
    endAt: start + 30 * 60000,
    mdName: ['김상품', '이신선', '박카운터', '최포맷', '정교육', '한AX', '조상생', '윤기념', '서운영'][i],
    topic: `${ev.city} 개막 라이브 — 전시장 한 바퀴 투어`,
    status: Date.now() > start + 30 * 60000 ? 'ended' : Date.now() > start ? 'live' : 'scheduled',
    youtubeId: undefined,
    replayId: undefined,
  };
  const second: LiveStream = {
    ...base,
    id: `live-${ev.id}-md`,
    startAt: start + 2 * DAY,
    endAt: start + 2 * DAY + 30 * 60000,
    topic: `${ev.city} MD 라이브 — 신선강화점 진열 따라하기`,
    status: Date.now() > start + 2 * DAY + 30 * 60000 ? 'ended' : Date.now() > start + 2 * DAY ? 'live' : 'scheduled',
  };
  return ev.startDate === ev.endDate ? [base] : [base, second];
});

export const STAFF: Staff[] = [
  { uid: 'md-hq', name: '본부 운영', team: '상품기획팀', email: 'hq@gsretail.com', sectionIds: ['welcome', 'media', 'souvenir', 'exit'], backupFor: [], smsEnabled: true },
  { uid: 'md-store', name: '김상품', team: '점포운영팀', email: 'store.md@gsretail.com', sectionIds: ['standard-store'], backupFor: ['counter-ff'], smsEnabled: true },
  { uid: 'md-ff', name: '박카운터', team: 'FF상품팀', email: 'ff.md@gsretail.com', sectionIds: ['counter-ff'], backupFor: ['standard-store'], smsEnabled: true },
  { uid: 'md-fresh', name: '이신선', team: '신선식품팀', email: 'fresh.md@gsretail.com', sectionIds: ['fresh'], backupFor: ['counter-ff'], smsEnabled: true },
  { uid: 'md-format', name: '최포맷', team: '신포맷TF', email: 'format.md@gsretail.com', sectionIds: ['new-format'], backupFor: ['fresh'], smsEnabled: true },
  { uid: 'md-edu', name: '정교육', team: '교육지원팀', email: 'edu.md@gsretail.com', sectionIds: ['education'], backupFor: ['win-win'], smsEnabled: true },
  { uid: 'md-ax', name: '한AX', team: 'AX부문', email: 'ax.md@gsretail.com', sectionIds: ['ax-auto-order'], backupFor: ['education'], smsEnabled: true },
  { uid: 'md-winwin', name: '조상생', team: '상생협력팀', email: 'winwin.md@gsretail.com', sectionIds: ['win-win'], backupFor: ['education'], smsEnabled: true },
];

/** 데모 응원 메시지 — 워드클라우드가 비어 보이지 않도록 초기 데이터를 넣는다. */
const CHEER_TEXTS: [RegionCode, string][] = [
  ['SEOUL', '신선강화점 기대됩니다 올해도 화이팅'],
  ['SEOUL', '자동발주 빨리 도입해주세요 발주가 제일 힘들어요'],
  ['SEOUL', '표준매장 진열 설명 정말 도움 됐습니다'],
  ['GYEONGGI', '카운터FF 신메뉴 기대하고 있습니다'],
  ['GYEONGGI', '전국 경영주님들 모두 화이팅입니다'],
  ['GYEONGGI', '밀키트 잘 팔릴 것 같아요 기대됩니다'],
  ['GANGWON', '강원도에서도 열려서 정말 반갑습니다'],
  ['GANGWON', '폐기 지원 확대 감사합니다'],
  ['CHUNGCHEONG', '자동발주 설명 이해가 잘 됐습니다'],
  ['CHUNGCHEONG', '온라인으로도 볼 수 있어서 좋네요'],
  ['DAEGU', '대구에서 뵙겠습니다 기념품 기대할게요'],
  ['DAEGU', '커피 리뉴얼 반갑습니다'],
  ['BUSAN', '부산 경영주입니다 신선 상품 기대돼요'],
  ['BUSAN', '기념품 각인 펜 너무 궁금합니다'],
  ['BUSAN', '상생 지원 확대 감사드립니다'],
  ['GWANGJU', '광주도 빨리 왔으면 좋겠습니다 화이팅'],
  ['GWANGJU', '교육 영상 짧아서 좋아요'],
  ['ULSAN', '울산도 열려서 감사합니다'],
  ['JEJU', '제주까지 와주셔서 감사합니다 기대됩니다'],
  ['JEJU', '신선 배송 온도 관리 좋은 변화입니다'],
];

export const CHEERS: Cheer[] = CHEER_TEXTS.map(([region, text], i) => ({
  id: `cheer-seed-${i + 1}`,
  uid: `store_${20000 + i}`,
  region,
  authorLabel: '경영주',
  text,
  status: 'visible',
  tokens: [],
  createdAt: Date.now() - (CHEER_TEXTS.length - i) * 37 * 60000,
}));

/** 데모 공개 질문 (/ask 피드) */
export const QUESTIONS: Question[] = [
  {
    id: 'q-seed-1',
    channel: 'hq',
    uid: 'store_20001',
    storeCode: '20001',
    region: 'SEOUL',
    authorLabel: '서울권 경영주',
    text: 'ESL 전자가격표시기는 기존 매장도 신청할 수 있나요? 신청 순서가 궁금합니다.',
    status: 'answered',
    assignedMdIds: ['md-store'],
    answer: {
      text: '2027년에는 신규·리뉴얼점을 우선 도입합니다. 기존 매장은 하반기부터 권역별로 신청을 받을 예정이며, 신청 방법은 점포 앱 공지로 안내해 드리겠습니다.',
      byUid: 'md-store',
      byName: '김상품 MD',
      at: Date.now() - 3 * HOUR,
    },
    isPublic: true,
    likeCount: 42,
    createdAt: Date.now() - 6 * HOUR,
  },
  {
    id: 'q-seed-2',
    channel: 'section',
    sectionId: 'ax-auto-order',
    productId: 'pa-auto',
    uid: 'store_20007',
    storeCode: '20007',
    region: 'BUSAN',
    authorLabel: '부산권 경영주',
    text: '자동발주 제안 수량을 제가 수정하면 다음 제안에도 반영되나요?',
    status: 'answered',
    assignedMdIds: ['md-ax'],
    answer: {
      text: '네, 수정 이력이 다시 학습에 반영되어 점포 성향에 맞게 제안값이 조정됩니다. 2~3주 정도 사용하시면 차이를 체감하실 수 있습니다.',
      byUid: 'md-ax',
      byName: '한AX MD',
      at: Date.now() - 50 * 60000,
    },
    isPublic: true,
    likeCount: 31,
    createdAt: Date.now() - 2 * HOUR,
  },
  {
    id: 'q-seed-3',
    channel: 'section',
    sectionId: 'fresh',
    uid: 'store_20013',
    storeCode: '20013',
    region: 'GWANGJU',
    authorLabel: '광주권 경영주',
    text: '신선강화점 지정 조건이 어떻게 되나요? 면적 기준이 있는지 궁금합니다.',
    status: 'open',
    assignedMdIds: ['md-fresh'],
    isPublic: true,
    likeCount: 18,
    createdAt: Date.now() - 40 * 60000,
  },
  {
    id: 'q-seed-4',
    channel: 'hq',
    uid: 'store_20019',
    storeCode: '20019',
    region: 'GANGWON',
    authorLabel: '강원권 경영주',
    text: '오프라인 행사에 직원을 대신 보내도 기념품을 받을 수 있나요?',
    status: 'open',
    assignedMdIds: ['md-hq'],
    isPublic: true,
    likeCount: 12,
    createdAt: Date.now() - 18 * 60000,
  },
];

/** 데모 점포 화이트리스트 (실제 운영에서는 구글시트 Stores 탭에서 동기화) */
export const DEMO_STORES = [
  { storeCode: '20001', storeName: '강남역점', ownerName: '김경영', phone: '01012341001', region: 'SEOUL' as RegionCode, fcTeam: '서울1팀' },
  { storeCode: '20002', storeName: '역삼중앙점', ownerName: '이경영', phone: '01012341002', region: 'SEOUL' as RegionCode, fcTeam: '서울1팀' },
  { storeCode: '20003', storeName: '수원영통점', ownerName: '박경영', phone: '01012341003', region: 'GYEONGGI' as RegionCode, fcTeam: '경기2팀' },
  { storeCode: '20004', storeName: '춘천명동점', ownerName: '최경영', phone: '01012341004', region: 'GANGWON' as RegionCode, fcTeam: '강원팀' },
  { storeCode: '20005', storeName: '대전둔산점', ownerName: '정경영', phone: '01012341005', region: 'CHUNGCHEONG' as RegionCode, fcTeam: '충청1팀' },
  { storeCode: '20006', storeName: '대구동성로점', ownerName: '한경영', phone: '01012341006', region: 'DAEGU' as RegionCode, fcTeam: '대구팀' },
  { storeCode: '20007', storeName: '부산서면점', ownerName: '조경영', phone: '01012341007', region: 'BUSAN' as RegionCode, fcTeam: '부산1팀' },
  { storeCode: '20008', storeName: '광주충장로점', ownerName: '윤경영', phone: '01012341008', region: 'GWANGJU' as RegionCode, fcTeam: '광주팀' },
  { storeCode: '20009', storeName: '울산삼산점', ownerName: '서경영', phone: '01012341009', region: 'ULSAN' as RegionCode, fcTeam: '울산팀' },
  { storeCode: '20010', storeName: '제주노형점', ownerName: '고경영', phone: '01012341010', region: 'JEJU' as RegionCode, fcTeam: '제주팀' },
];
