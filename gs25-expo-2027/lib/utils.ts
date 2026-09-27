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

/**
 * 날짜 표기는 Intl 을 쓰지 않고 직접 만든다.
 *
 * 왜 — Intl 의 한국어 결과는 **실행 환경의 ICU 데이터에 따라 달라진다.**
 * 넷리파이의 Node 는 로케일 데이터가 빠진 빌드라 `ko-KR` 오전/오후를 `AM`/`PM` 으로 낸다.
 * 서버는 "9월 19일 AM 09:00", 브라우저는 "9월 19일 오전 09:00" 을 만들어
 * 하이드레이션이 깨지고(React #418·#425) 결국 루트 전체가 클라이언트 렌더로 넘어갔다(#423).
 *
 * KST 는 서머타임이 없는 UTC+9 고정이라, 9시간을 더하고 UTC 필드를 읽으면 정확하다.
 * 어느 런타임에서도 같은 문자열이 나온다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface KstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

function kstParts(ts: number | string): KstParts {
  const ms = typeof ts === 'string' ? Date.parse(`${ts}T00:00:00+09:00`) : ts;
  const d = new Date(ms + KST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: WEEKDAY_KO[d.getUTCDay()],
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 오전/오후 12시간제 — Intl 없이 고정 표기 */
function ampmKo(hour: number, minute: number): string {
  const label = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${label} ${pad2(h12)}:${pad2(minute)}`;
}

/** 예: 9월 19일 (토) · withTime 이면 뒤에 오전 09:00 */
export function formatDateKo(ts: number | string, withTime = false): string {
  const p = kstParts(ts);
  const base = `${p.month}월 ${p.day}일 (${p.weekday})`;
  return withTime ? `${base} ${ampmKo(p.hour, p.minute)}` : base;
}

/**
 * 예: 9월 19일 오전 09:00
 * opts 는 Intl 시절 호출부와의 호환을 위해 받되, 쓰는 키만 본다.
 */
export function formatDateTimeKo(
  ts: number,
  opts: { month?: unknown; day?: unknown; hour?: unknown; minute?: unknown; year?: unknown } = {},
): string {
  const p = kstParts(ts);
  const wantsTime = opts.hour !== undefined || opts.minute !== undefined;
  const wantsYear = opts.year !== undefined;
  const head = `${wantsYear ? `${p.year}년 ` : ''}${p.month}월 ${p.day}일`;
  // 옵션을 주지 않으면 날짜+시각을 모두 보여 준다(기존 toLocaleString 과 같은 기본값)
  const showTime = wantsTime || Object.keys(opts).length === 0;
  return showTime ? `${head} ${ampmKo(p.hour, p.minute)}` : head;
}

/** 예: 10. 5. (월) – 10. 9. (금) */
export function formatRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const p = kstParts(iso);
    return `${p.month}. ${p.day}. (${p.weekday})`;
  };
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
