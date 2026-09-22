import type { AppConfig } from '@/types';

/**
 * 행사 일정 기본값.
 * 실제 운영에서는 Firestore `config/app` 문서가 우선하고, 여기 값은 폴백이다.
 * (PLAN.md 1장 — D-day 기준 역산. 날짜 확정 시 env 또는 config 문서만 바꾸면 된다.)
 */
const iso = (s: string) => new Date(s).getTime();

export const DEFAULT_CONFIG: AppConfig = {
  force2D: false,
  // 온라인 오픈.
  // 기본값은 "이미 오픈된" 상태여서 랜딩의 [입장하기]가 바로 동작한다.
  // 프리오픈(카운트다운 + 입장 비활성) 화면을 보려면 NEXT_PUBLIC_OPEN_AT 을 미래 일시로 바꾼다.
  openAt: iso(process.env.NEXT_PUBLIC_OPEN_AT ?? '2026-09-19T09:00:00+09:00'),
  // 순회 시작 D-day
  tourStartAt: iso(process.env.NEXT_PUBLIC_TOUR_START_AT ?? '2026-10-05T10:00:00+09:00'),
  // 온라인 마감 (순회 종료 +7일)
  closeAt: iso(process.env.NEXT_PUBLIC_CLOSE_AT ?? '2026-11-16T23:59:59+09:00'),
};

/** 데모/로컬 모드 여부 — Firebase 설정이 없으면 시드 데이터로 동작한다. */
export const IS_DEMO =
  !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export const SITE = {
  name: '2027 GS25 상품전략공유회',
  shortName: 'GS25 공유회',
  tagline: '전국 9개 도시, 그리고 온라인에서',
  ofcPhone: '1577-0000',
};
