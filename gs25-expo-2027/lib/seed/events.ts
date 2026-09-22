import type { ExpoEvent, Slot } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/config';

const DAY = 86400000;

/** D-day 로부터 offset 일 뒤의 YYYY-MM-DD (KST 기준) */
function dayOffset(offset: number): string {
  const d = new Date(DEFAULT_CONFIG.tourStartAt + offset * DAY);
  const kst = new Date(d.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

/** PLAN.md 2장 순회 일정 템플릿 (D-day 기준 역산 — 확정 시 offset 만 교체) */
export const EVENTS: ExpoEvent[] = [
  {
    id: 'seoul',
    city: '서울',
    region: 'SEOUL',
    venueName: 'GS타워 아모리스홀',
    address: '서울 강남구 논현로 508',
    lat: 37.5013,
    lng: 127.0396,
    startDate: dayOffset(0),
    endDate: dayOffset(4),
    order: 1,
  },
  {
    id: 'gyeonggi',
    city: '경기·인천',
    region: 'GYEONGGI',
    venueName: '수원컨벤션센터 3전시장',
    address: '경기 수원시 영통구 광교중앙로 140',
    lat: 37.2879,
    lng: 127.0559,
    startDate: dayOffset(5),
    endDate: dayOffset(9),
    order: 2,
  },
  {
    id: 'gangwon',
    city: '강원',
    region: 'GANGWON',
    venueName: '춘천 세종호텔 컨벤션홀',
    address: '강원 춘천시 봉의산길 31',
    lat: 37.8813,
    lng: 127.7298,
    startDate: dayOffset(11),
    endDate: dayOffset(12),
    order: 3,
  },
  {
    id: 'chungcheong',
    city: '대전·충청',
    region: 'CHUNGCHEONG',
    venueName: '대전컨벤션센터 제2전시장',
    address: '대전 유성구 엑스포로 107',
    lat: 36.3752,
    lng: 127.3862,
    startDate: dayOffset(13),
    endDate: dayOffset(15),
    order: 4,
  },
  {
    id: 'daegu',
    city: '대구·경북',
    region: 'DAEGU',
    venueName: '엑스코 동관 1홀',
    address: '대구 북구 엑스코로 10',
    lat: 35.9203,
    lng: 128.5951,
    startDate: dayOffset(18),
    endDate: dayOffset(20),
    order: 5,
  },
  {
    id: 'ulsan',
    city: '울산',
    region: 'ULSAN',
    venueName: '울산전시컨벤션센터 2홀',
    address: '울산 남구 삼산중로 200',
    lat: 35.5378,
    lng: 129.3324,
    startDate: dayOffset(21),
    endDate: dayOffset(22),
    order: 6,
  },
  {
    id: 'busan',
    city: '부산·경남',
    region: 'BUSAN',
    venueName: 'BEXCO 제2전시장 4홀',
    address: '부산 해운대구 APEC로 55',
    lat: 35.1694,
    lng: 129.1364,
    startDate: dayOffset(25),
    endDate: dayOffset(28),
    order: 7,
  },
  {
    id: 'gwangju',
    city: '광주·전라',
    region: 'GWANGJU',
    venueName: '김대중컨벤션센터 다목적홀',
    address: '광주 서구 상무누리로 30',
    lat: 35.1424,
    lng: 126.8397,
    startDate: dayOffset(29),
    endDate: dayOffset(32),
    order: 8,
  },
  {
    id: 'jeju',
    city: '제주',
    region: 'JEJU',
    venueName: '제주국제컨벤션센터 한라홀',
    address: '제주 서귀포시 중문관광로 224',
    lat: 33.2494,
    lng: 126.4108,
    startDate: dayOffset(34),
    endDate: dayOffset(35),
    order: 9,
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** 도시별 타임 정원 (PLAN 2장 산식으로 산정 — 확정 필요) */
const CAPACITY: Record<string, number> = {
  seoul: 120,
  gyeonggi: 140,
  gangwon: 60,
  chungcheong: 90,
  daegu: 90,
  ulsan: 55,
  busan: 110,
  gwangju: 100,
  jeju: 50,
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
