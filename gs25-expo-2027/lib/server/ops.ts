/**
 * 운영 전환 — 데모(허수) 데이터 식별·정리와 실시간 접속 용량.
 *
 * 개발·시연 편의로 점포 50개·질문·응원이 시드로 들어가 있다.
 * 실제 운영에서는 이 숫자가 대시보드에 섞이면 판단을 망치므로,
 * 무엇이 허수인지 정확히 세고 한 번에 지울 수 있어야 한다.
 */
import { CHEERS, DEMO_STORES, QUESTIONS, LIVE_STREAMS } from '@/lib/seed/misc';
import { db, persist } from './store';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/ops.ts is server-only');
}

const DEMO_STORE_CODES = new Set(DEMO_STORES.map((s) => s.storeCode));
const DEMO_QUESTION_IDS = new Set(QUESTIONS.map((q) => q.id));
const DEMO_CHEER_IDS = new Set(CHEERS.map((c) => c.id));

/** 지금 DB 에 남아 있는 허수의 정확한 수 */
export function demoCounts() {
  const stores = Object.keys(db.stores).filter((c) => DEMO_STORE_CODES.has(c)).length;
  const questions = db.questions.filter((q) => DEMO_QUESTION_IDS.has(q.id)).length;
  const cheers = db.cheers.filter((c) => DEMO_CHEER_IDS.has(c.id)).length;
  return { stores, questions, cheers, total: stores + questions + cheers };
}

/** 실제 운영 데이터 수 (허수를 뺀 값) */
export function realCounts() {
  const d = demoCounts();
  return {
    stores: Object.keys(db.stores).length - d.stores,
    questions: db.questions.length - d.questions,
    cheers: db.cheers.length - d.cheers,
    users: Object.keys(db.users).length,
    reservations: db.reservations.length,
    coupons: Object.keys(db.coupons).length,
  };
}

/**
 * 허수를 지운다.
 * 시드 id 와 정확히 일치하는 것만 지우므로, 실제로 들어온 데이터는 건드리지 않는다.
 */
export function purgeDemo(): { removed: ReturnType<typeof demoCounts> } {
  const before = demoCounts();

  for (const code of DEMO_STORE_CODES) delete db.stores[code];
  db.questions = db.questions.filter((q) => !DEMO_QUESTION_IDS.has(q.id));
  db.cheers = db.cheers.filter((c) => !DEMO_CHEER_IDS.has(c.id));

  // 지운 점포에 딸린 흔적도 함께 정리한다 (고아 레코드가 남으면 집계가 어긋난다)
  for (const [uid, u] of Object.entries(db.users)) {
    if (u.storeCode && DEMO_STORE_CODES.has(u.storeCode)) {
      delete db.users[uid];
      delete db.progress[uid];
      delete db.surveys[uid];
      delete db.coupons[uid];
    }
  }
  db.reservations = db.reservations.filter((r) => !DEMO_STORE_CODES.has(r.storeCode));

  persist();
  return { removed: before };
}

// ── 실시간 접속 용량 ──────────────────────────────────────────────

/** 동시 접속 허용 인원. 무료 호스팅 기준 보수적으로 잡고 환경변수로 조정한다. */
export const CAPACITY_LIMIT = Number(process.env.CONCURRENCY_LIMIT ?? 300);

/** 이 시간 안에 활동한 세션을 '접속 중' 으로 센다. */
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;

export type CapacityLevel = 'ok' | 'busy' | 'full';

/** 마지막 활동 시각을 남긴다. 모든 인증 요청에서 호출된다. */
export function touchSession(token: string | null) {
  if (!token) return;
  const s = db.sessions[token];
  if (!s) return;
  s.lastSeenAt = Date.now();
}

/**
 * 실시간 접속 현황.
 *
 * lastSeenAt 이 없는 예전 세션은 발급 시각(issuedAt)으로 갈음한다.
 * 만료된 세션은 제외한다.
 */
export function capacity(): {
  active: number;
  limit: number;
  percent: number;
  level: CapacityLevel;
  label: string;
} {
  const now = Date.now();
  let active = 0;
  for (const s of Object.values(db.sessions)) {
    if (s.expiresAt <= now) continue;
    const seen = s.lastSeenAt ?? s.issuedAt;
    if (now - seen <= ACTIVE_WINDOW_MS) active += 1;
  }

  const limit = Math.max(1, CAPACITY_LIMIT);
  const percent = Math.round((active / limit) * 100);
  const level: CapacityLevel = percent >= 90 ? 'full' : percent >= 70 ? 'busy' : 'ok';
  const label = level === 'full' ? '과다접속중' : level === 'busy' ? '혼잡' : '원활함';
  return { active, limit, percent, level, label };
}

/** 라이브 편성 초기값 — DB 가 비어 있을 때 시드에서 채운다. */
export function ensureLiveStreams() {
  if (db.liveStreams.length === 0 && !db.liveSeeded) {
    db.liveStreams = LIVE_STREAMS.map((l) => ({ ...l }));
    db.liveSeeded = true;
    persist();
  }
}
