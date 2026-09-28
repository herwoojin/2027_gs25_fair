import { EVENTS } from './events';

/**
 * 2027 신규 코너 데이터.
 *
 * ⚠️ 사람 이름과 후기는 **자리표시자**다. 실제 인물을 지어내지 않는다.
 * 관리자가 확정된 담당자·사례로 교체하기 전까지 `[ ]` 로 표시된 채 노출된다.
 */

/** 지역별 상품전략도우미 — 유튜브 라이브로 질의응답을 진행한다 */
export interface StrategyHelper {
  eventId: string;
  region: string;
  /** 담당 도우미 표기. 확정 전에는 자리표시자 */
  helperName: string;
  /** 방송 요일·시간 안내 */
  airtime: string;
  /** 이 지역에서 주로 다루는 주제 */
  focus: string;
}

export const STRATEGY_HELPERS: StrategyHelper[] = EVENTS.map((e) => ({
  eventId: e.id,
  region: e.city,
  helperName: '[담당 도우미 미정]',
  airtime: '순회 기간 중 화·목 11:00',
  focus: '신상품 · 진열 · 발주 질의응답',
}));

/**
 * @deprecated 더 이상 화면에 쓰이지 않는다.
 *
 * 멘토 사례는 경영주님이 `/mentor` 에서 직접 쓰고, 본인이 공개에 동의하고,
 * 본부가 승인한 것만 `db.mentorStories` 에서 나간다(`publicMentors()`).
 * 지어낸 후기를 자리표시자로 띄우던 시절의 잔재라 타입만 남겨 둔다.
 */
export interface RegionMentor {
  eventId: string;
  region: string;
  ownerName: string;
  storeName: string;
  /** 전시회에서 얻어가 점포에 적용한 내용 */
  takeaway: string;
  /** 적용 후 달라진 점 */
  result: string;
}

export const REGION_MENTORS: RegionMentor[] = EVENTS.map((e) => ({
  eventId: e.id,
  region: e.city,
  ownerName: '[멘토 경영주 미정]',
  storeName: `${e.city} 지역 점포`,
  takeaway: '전시회에서 본 진열 원칙을 점포에 맞게 적용했습니다.',
  result: '적용 사례는 멘토 경영주님 확인 후 등록됩니다.',
}));
