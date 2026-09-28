import type { RegionCode } from '@/types';

/**
 * 도시별 연출 테마.
 * 2026년판(25fair)의 "도시마다 accent 컬러와 환경이 바뀌는" 연출 문법을 가져오되,
 * GS25 브랜드(블루·민트)를 기준선으로 두고 권역별 색을 변주한다.
 *
 * ⚠️ 여기에는 **상품 정보를 절대 넣지 않는다** (PRD F-01 · 랜딩 노출 금지).
 * 일정·장소·분위기 카피만 담는다.
 */
export type CityEnv =
  | 'city'
  | 'blossom'
  | 'mountain'
  | 'lab'
  | 'neon'
  | 'industry'
  | 'ocean'
  | 'field'
  | 'island';

export interface CityTheme {
  accent: string;
  glow: string;
  emoji: string;
  tagline: string;
  env: CityEnv;
  region: RegionCode;
}

export const CITY_THEME: Record<string, CityTheme> = {
  seoul: {
    accent: '#2b7fff',
    glow: '#7fb4ff',
    emoji: '🏙️',
    tagline: '가장 먼저 문을 엽니다',
    env: 'city',
    region: 'SEOUL',
  },
  gyeonggi: {
    accent: '#00c2a8',
    glow: '#7ff0e0',
    emoji: '🌸',
    tagline: '2회차, 킨텍스에서 이어갑니다',
    env: 'blossom',
    region: 'GYEONGGI',
  },
  wonju: {
    accent: '#4ade80',
    glow: '#a7f3c4',
    emoji: '🏔️',
    tagline: '마지막 여정, 원주입니다',
    env: 'mountain',
    region: 'GANGWON',
  },
  chungcheong: {
    accent: '#a78bfa',
    glow: '#d6c9ff',
    emoji: '🔬',
    tagline: '같은 날, 대전에서도 엽니다',
    env: 'lab',
    region: 'CHUNGCHEONG',
  },
  daegu: {
    accent: '#fb923c',
    glow: '#ffc79a',
    emoji: '🎨',
    tagline: '영남 내륙을 가로지릅니다',
    env: 'neon',
    region: 'DAEGU',
  },
  suwon: {
    accent: '#38bdf8',
    glow: '#a5e4ff',
    emoji: '🏛️',
    tagline: '광교에서 다시 만납니다',
    env: 'industry',
    region: 'GYEONGGI',
  },
  busan: {
    accent: '#22d3ee',
    glow: '#9bf0fb',
    emoji: '🌊',
    tagline: '바다를 배경으로 펼쳐집니다',
    env: 'ocean',
    region: 'BUSAN',
  },
  gwangju: {
    accent: '#f472b6',
    glow: '#ffc2dd',
    emoji: '🍲',
    tagline: '남도의 맛과 함께합니다',
    env: 'field',
    region: 'GWANGJU',
  },
  jeju: {
    accent: '#fbbf24',
    glow: '#ffe3a0',
    emoji: '🍊',
    tagline: '섬에서도 같은 날 함께합니다',
    env: 'island',
    region: 'JEJU',
  },
};

export const DEFAULT_THEME: CityTheme = {
  accent: '#2b7fff',
  glow: '#7fb4ff',
  emoji: '🏙️',
  tagline: '전국 9개 도시를 순회합니다',
  env: 'city',
  region: 'SEOUL',
};

export function themeOf(eventId: string | null | undefined): CityTheme {
  return (eventId && CITY_THEME[eventId]) || DEFAULT_THEME;
}

/**
 * 위경도를 3D 씬 좌표로 투영한다.
 * 한반도는 세로로 길어 경도·위도 배율을 다르게 준다.
 */
export function toScene(lat: number, lng: number): [number, number] {
  return [(lng - 127.7) * 14, (35.8 - lat) * 11];
}
