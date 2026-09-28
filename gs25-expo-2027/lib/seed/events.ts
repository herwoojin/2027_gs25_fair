import type { ExpoEvent, Slot } from '@/types';

const DAY = 86400000;

/**
 * 순회 일정 — 전년도(2026) 실제 운영안을 2027 요일에 맞춰 옮긴 것.
 *
 * 전년도 구조는 이렇다. 컨벤션센터를 빌려 길게 여는 방식이 아니라,
 * **연속된 3개 금요일에 부문 사무소에서 동시 개최**하고 토요일까지 이어간다.
 *
 *   1회차 3/27(금)~3/28(토)  2부문(광진) · 4부문(대전)
 *   2회차 4/3(금)~4/4(토)    1부문(일산) · 6부문(부산) · 4부문(광주, 금만)
 *         4/5(일)~4/6(월)    5부문(대구)
 *   3회차 4/10(금)~4/11(토)  3부문(수원) · 제주 지역사무소(금) · 원주 지역사무소(토)
 *
 * 2027 은 같은 요일 구조를 따른다(3월 넷째 금요일부터 3주 연속).
 *   1회차 3/26(금)~3/27(토) · 2회차 4/2(금)~4/3(토) · 3회차 4/9(금)~4/10(토)
 *
 * 장소·주소·운영시간은 구글시트 `Events` 탭이 최종 결정권을 갖는다. 여기 값은
 * 시트가 아직 동기화되기 전에 쓰는 기본값이다(`lib/server/eventDirectory.ts` 참고).
 * 시트에서 동기화되는 항목은 venueName · address · startDate · endDate · slotTimes · note 뿐이고,
 * **id · city · region · 좌표는 시트가 아니라 여기서 정한다.**
 *
 * 광주·제주·원주는 전년도처럼 별도 전시장 없이 **점포에서 진행**한다.
 */

/** 전년도 표의 회차 구분 — 같은 날 여러 곳에서 동시에 열린다 */
export const ROUNDS = [
  { round: 1, label: '1회차', date: '2027-03-26' },
  { round: 2, label: '2회차', date: '2027-04-02' },
  { round: 3, label: '3회차', date: '2027-04-09' },
] as const;

const WALK_TBD = '자세한 경로는 아래 카카오맵 길찾기를 이용해 주세요.';
/** 광주·제주·원주는 전시장이 아니라 점포에서 진행한다 */
const WALK_STORE = '점포에서 진행합니다. 담당 OFC 안내에 따라 방문해 주세요.';

export const EVENTS: ExpoEvent[] = [
  // ── 1회차 · 3/26(금) ~ 3/27(토) ──────────────────────────────
  {
    id: 'seoul',
    city: '서울',
    region: 'SEOUL',
    venueName: '광진구',
    address: '서울 광진구',
    lat: 37.5385,
    lng: 127.0823,
    startDate: '2027-03-26',
    endDate: '2027-03-27',
    order: 1,
    transit: {
      rail: ['수도권 2호선 건대입구역 하차'],
      bus: [],
      etc: [],
      walk: WALK_TBD,
    },
    parking: { available: true, note: '사무소 주차장 이용. 자리가 넉넉하지 않아 대중교통을 권장합니다.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },
  {
    id: 'chungcheong',
    city: '대전·충청',
    region: 'CHUNGCHEONG',
    venueName: '대전컨벤션센터 제2전시장',
    address: '대전 유성구 엑스포로 107',
    lat: 36.3752,
    lng: 127.3862,
    startDate: '2027-03-26',
    endDate: '2027-03-27',
    order: 2,
    transit: {
      rail: ['KTX 대전역에서 시내버스·택시 환승'],
      bus: [],
      etc: [],
      walk: WALK_TBD,
    },
    parking: { available: true, note: '사무소 주차장 이용.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },

  // ── 2회차 · 4/2(금) ~ 4/3(토) ────────────────────────────────
  {
    id: 'gyeonggi',
    city: '경기·인천',
    region: 'GYEONGGI',
    venueName: '일산 킨텍스',
    address: '경기 고양시 일산서구 킨텍스로 217',
    lat: 37.6664,
    lng: 126.7455,
    startDate: '2027-04-02',
    endDate: '2027-04-03',
    order: 3,
    transit: {
      rail: ['GTX-A 킨텍스역 하차', '수도권 3호선 대화역에서 버스·택시 환승'],
      bus: [],
      etc: [],
      walk: WALK_TBD,
    },
    parking: { available: true, note: '사무소 주차장 이용.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },
  {
    id: 'busan',
    city: '부산·경남',
    region: 'BUSAN',
    venueName: 'BEXCO 제2전시장 4홀',
    address: '부산 해운대구 APEC로 55',
    lat: 35.1694,
    lng: 129.1364,
    startDate: '2027-04-02',
    endDate: '2027-04-03',
    order: 4,
    transit: {
      rail: ['부산 2호선 벡스코역 하차', '부산 2호선 센텀시티역 하차'],
      bus: [],
      etc: [],
      walk: WALK_TBD,
    },
    parking: { available: true, note: '사무소 주차장 이용. 도심이라 혼잡이 예상됩니다.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },
  {
    // 전년도에도 광주는 금요일 하루만 열렸다
    id: 'gwangju',
    city: '광주·전라',
    region: 'GWANGJU',
    venueName: '점포진행',
    address: '광주 서구 상무누리로 30',
    lat: 35.1424,
    lng: 126.8397,
    startDate: '2027-04-02',
    endDate: '2027-04-02',
    order: 5,
    transit: {
      rail: ['광주 1호선 김대중컨벤션센터역 하차'],
      bus: [],
      etc: [],
      walk: WALK_STORE,
    },
    parking: { available: true, note: '사무소 주차장 이용.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },

  // ── 4/4(일) ~ 4/5(월) · 대구는 회차와 별도로 주말에 열린다 ────
  {
    id: 'daegu',
    city: '대구·경북',
    region: 'DAEGU',
    venueName: '엑스코 동관 1홀',
    address: '대구 북구 엑스코로 10',
    lat: 35.9203,
    lng: 128.5951,
    startDate: '2027-04-04',
    endDate: '2027-04-05',
    order: 6,
    transit: {
      rail: ['KTX 동대구역에서 시내버스·택시 환승'],
      bus: [],
      etc: [],
      walk: WALK_TBD,
    },
    parking: { available: true, note: '사무소 주차장 이용.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },

  // ── 3회차 · 4/9(금) ~ 4/10(토) ───────────────────────────────
  {
    id: 'suwon',
    city: '경기·수원',
    region: 'GYEONGGI',
    venueName: '수원컨벤션센터 3전시장',
    address: '경기 수원시 영통구 광교중앙로 140',
    lat: 37.2879,
    lng: 127.0559,
    startDate: '2027-04-09',
    endDate: '2027-04-10',
    order: 7,
    transit: {
      rail: ['신분당선 광교중앙역 하차'],
      bus: [],
      etc: [],
      walk: WALK_TBD,
    },
    parking: { available: true, note: '사무소 주차장 이용.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },
  {
    // 전년도에도 제주는 금요일 하루만 열렸다
    id: 'jeju',
    city: '제주',
    region: 'JEJU',
    venueName: '점포진행',
    address: '제주 서귀포시 중문관광로 224',
    lat: 33.2494,
    lng: 126.4108,
    startDate: '2027-04-09',
    endDate: '2027-04-09',
    order: 8,
    transit: {
      rail: [],
      bus: [],
      etc: ['제주국제공항에서 리무진버스 또는 택시 (제주에는 철도가 없습니다)'],
      walk: WALK_STORE,
    },
    parking: { available: true, note: '사무소 주차장 이용.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },
  {
    // 전년도에도 원주는 토요일 하루만 열렸다
    id: 'wonju',
    city: '원주',
    region: 'GANGWON',
    venueName: '점포진행',
    address: '강원 원주시',
    lat: 37.3422,
    lng: 127.9202,
    startDate: '2027-04-10',
    endDate: '2027-04-10',
    order: 9,
    transit: {
      rail: ['KTX 원주역 또는 만종역에서 시내버스·택시 환승'],
      bus: [],
      etc: ['원주고속버스터미널에서 택시'],
      walk: WALK_STORE,
    },
    parking: { available: true, note: '사무소 주차장 이용.' },
    slotTimes: ['10:00 – 12:00', '13:00 – 15:00', '15:00 – 17:00'],
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** 이벤트가 속한 회차 (대구는 회차 밖이라 null) */
export function roundOf(eventId: string): (typeof ROUNDS)[number] | null {
  const ev = EVENT_BY_ID[eventId];
  if (!ev) return null;
  return ROUNDS.find((r) => r.date === ev.startDate) ?? null;
}

/**
 * 장소별 정원.
 * 컨벤션센터가 아니라 부문 사무소라 전년도보다 작게 잡았다.
 * 확정되면 관리자 화면에서 조정한다.
 */
const CAPACITY: Record<string, number> = {
  seoul: 90,
  chungcheong: 70,
  gyeonggi: 90,
  busan: 80,
  gwangju: 60,
  daegu: 70,
  suwon: 90,
  jeju: 40,
  wonju: 40,
};

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(`${start}T00:00:00+09:00`).getTime();
  const last = new Date(`${end}T00:00:00+09:00`).getTime();
  while (cur <= last) {
    out.push(new Date(cur + 9 * 3600000).toISOString().slice(0, 10));
    cur += DAY;
  }
  return out;
}

/** 일자 × 3타임 슬롯 생성. reservedCount 는 데모용 의사난수로 채운다. */
export function buildSlots(withDemoReservations = false): Slot[] {
  const slots: Slot[] = [];
  for (const ev of EVENTS) {
    for (const date of datesBetween(ev.startDate, ev.endDate)) {
      for (const slotNo of [1, 2, 3]) {
        const capacity = CAPACITY[ev.id] ?? 80;
        // 결정적 의사난수 — 새로고침해도 잔여석이 흔들리지 않게 한다.
        const seed = [...`${ev.id}${date}${slotNo}`].reduce((a, c) => a + c.charCodeAt(0), 0);
        const ratio = ((seed % 83) / 100) * 1.15;
        slots.push({
          id: `${ev.id}_${date.replace(/-/g, '')}_${slotNo}`,
          eventId: ev.id,
          date,
          slotNo,
          capacity,
          reservedCount: withDemoReservations ? Math.min(capacity, Math.round(capacity * ratio)) : 0,
          checkedInCount: 0,
        });
      }
    }
  }
  return slots;
}

export const SLOTS = buildSlots(true);

export function slotsOf(eventId: string, date: string): Slot[] {
  return SLOTS.filter((s) => s.eventId === eventId && s.date === date).sort(
    (a, b) => a.slotNo - b.slotNo,
  );
}

export function eventDates(eventId: string): string[] {
  const ev = EVENT_BY_ID[eventId];
  return ev ? datesBetween(ev.startDate, ev.endDate) : [];
}
