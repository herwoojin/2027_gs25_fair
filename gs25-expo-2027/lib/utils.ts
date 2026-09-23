import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * ⚠️ 날짜 포맷에는 반드시 timeZone 을 고정한다.
 * 서버(Netlify 는 UTC)와 브라우저(KST)의 결과가 달라지면
 * SSR 결과와 하이드레이션 결과가 어긋나 React #418/#425 가 발생한다.
 * 이 서비스는 국내 전용이므로 항상 Asia/Seoul 로 표기한다.
 */
export const KST = 'Asia/Seoul';

export function formatDateKo(ts: number | string, withTime = false): string {
  const d = typeof ts === 'string' ? new Date(`${ts}T00:00:00+09:00`) : new Date(ts);
  return d.toLocaleString('ko-KR', {
    timeZone: KST,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatDateTimeKo(ts: number, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(ts).toLocaleString('ko-KR', { timeZone: KST, ...opts });
}

export function formatRange(start: string, end: string): string {
  // getMonth()/getDay() 는 실행 환경의 타임존을 따르므로 Intl 로 KST 고정 포맷한다.
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00+09:00`).toLocaleDateString('ko-KR', {
      timeZone: KST,
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function countdown(target: number, now = Date.now()): Countdown {
  const diff = Math.max(0, target - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    done: diff <= 0,
  };
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 로컬 저장은 실패할 수 있으므로 항상 감싼다 (사파리 프라이빗 등) */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* noop */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  },
};

export function todayKey(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
