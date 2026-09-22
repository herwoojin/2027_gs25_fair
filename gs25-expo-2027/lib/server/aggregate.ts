/**
 * T6-1 / T5-7 / T8-1 · 집계.
 * 운영에서는 1~5분 스케줄 Function 이 aggregates/* 문서 1건으로 요약하고,
 * 모든 사용자는 그 문서만 구독한다(TRD 5장). 여기서는 같은 산식을 메모리에서 계산한다.
 */
import type {
  AggregateRanking,
  AggregateStats,
  RankingEntry,
  RegionCode,
  RegionRankEntry,
  WordCloudItem,
} from '@/types';
import { REGIONS } from '@/types';
import { SECTIONS } from '@/lib/seed/sections';
import { PRODUCTS } from '@/lib/seed/products';
import { db } from './store';
import { tokenize } from './tokenize';

/** 지역별 등록 점포 수 (구글시트 Stores 원장 기준 — 데모값) */
export const REGISTERED: Record<RegionCode, number> = {
  SEOUL: 3820,
  GYEONGGI: 4610,
  GANGWON: 880,
  CHUNGCHEONG: 1740,
  DAEGU: 1620,
  ULSAN: 620,
  BUSAN: 2180,
  GWANGJU: 1750,
  JEJU: 430,
};

export const TOTAL_REGISTERED = Object.values(REGISTERED).reduce((a, b) => a + b, 0);

/** 결정적 의사난수 — 새로고침마다 수치가 튀지 않도록 문자열 시드를 쓴다. */
function seeded(key: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = ((h >>> 0) % 10000) / 10000;
  return min + r * (max - min);
}

const STORE_NAMES = [
  '강남역', '역삼중앙', '수원영통', '춘천명동', '대전둔산', '대구동성로', '부산서면', '광주충장로',
  '울산삼산', '제주노형', '성수카페', '판교테크노', '일산라페', '천안불당', '청주율량', '포항영일대',
  '창원상남', '전주한옥', '여수엑스포', '목포하당', '김해장유', '평촌학원가', '동탄센트럴', '세종나성',
  '원주무실', '속초해변', '구미산동', '양산물금', '순천조례', '서귀중문',
];

function maskStoreName(name: string): string {
  // 개인 랭킹 점포명 뒤 2글자 마스킹 (PROMPT T6-1)
  if (name.length <= 2) return `${name[0]}○점`;
  return `${name.slice(0, -2)}○○점`;
}

/** 합성 참가자 — 데모 랭킹/통계용. 운영에서는 progress 컬렉션을 집계한다. */
interface SynthParticipant {
  key: string;
  storeLabel: string;
  region: RegionCode;
  completedAt: number;
  understanding: number;
}

function synthParticipants(): SynthParticipant[] {
  const base = db.config.openAt;
  const out: SynthParticipant[] = [];
  REGIONS.forEach((r, ri) => {
    for (let i = 0; i < 34; i++) {
      const key = `${r.code}-${i}`;
      const name = STORE_NAMES[(ri * 7 + i * 3) % STORE_NAMES.length];
      out.push({
        key,
        storeLabel: maskStoreName(name),
        region: r.code,
        completedAt: base + seeded(`c${key}`, 3, 96) * 3600_000,
        understanding: Math.round(seeded(`u${key}`, 58, 100)),
      });
    }
  });
  return out;
}

function myEntries() {
  return Object.values(db.progress).filter((p) => p.completedAt);
}

export function buildRanking(): AggregateRanking {
  const synth = synthParticipants();

  // 🏁 최초 완주 — 완주 시각 순
  const finishers = [...synth]
    .map((s) => ({ ...s }))
    .concat(
      myEntries().map((p) => ({
        key: p.uid,
        storeLabel: `${db.stores[p.storeCode]?.storeName ?? p.storeCode}`,
        region: p.region,
        completedAt: p.completedAt!,
        understanding:
          p.quizTotal > 0 ? Math.round((p.quizFirstTryCorrect / p.quizTotal) * 100) : 0,
      })),
    )
    .sort((a, b) => a.completedAt - b.completedAt);

  const firstFinishers: RankingEntry[] = finishers.slice(0, 30).map((f, i) => ({
    rank: i + 1,
    storeLabel: f.storeLabel,
    region: f.region,
    value: f.completedAt,
    valueLabel: new Date(f.completedAt).toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    uid: f.key,
  }));

  // 📣 참여율 — 지역별 로그인 점포 수 ÷ 등록 점포 수
  const regionParticipation: RegionRankEntry[] = REGIONS.map((r) => {
    const registered = REGISTERED[r.code];
    const loggedIn = Math.round(registered * seeded(`p${r.code}`, 0.52, 0.86));
    return { rank: 0, region: r.code, ratio: loggedIn / registered, numerator: loggedIn, denominator: registered };
  })
    .sort((a, b) => b.ratio - a.ratio)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  // 🧠 이해도 — 퀴즈 첫 시도 정답률
  const regionUnderstanding: RegionRankEntry[] = REGIONS.map((r) => {
    const members = synth.filter((s) => s.region === r.code);
    const correct = members.reduce((a, m) => a + m.understanding, 0);
    const total = members.length * 100;
    return { rank: 0, region: r.code, ratio: correct / total, numerator: correct, denominator: total };
  })
    .sort((a, b) => b.ratio - a.ratio)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  const topUnderstanding: RankingEntry[] = [...synth]
    .sort((a, b) => b.understanding - a.understanding || a.completedAt - b.completedAt)
    .slice(0, 30)
    .map((s, i) => ({
      rank: i + 1,
      storeLabel: s.storeLabel,
      region: s.region,
      value: s.understanding,
      valueLabel: `${s.understanding}%`,
      uid: s.key,
    }));

  return { firstFinishers, regionParticipation, regionUnderstanding, topUnderstanding, updatedAt: Date.now() };
}

export function buildStats(): AggregateStats {
  const ranking = buildRanking();
  const regions = {} as AggregateStats['regions'];
  let loggedInTotal = 0;
  let completedTotal = 0;
  for (const r of REGIONS) {
    const registered = REGISTERED[r.code];
    const loggedIn = ranking.regionParticipation.find((p) => p.region === r.code)!.numerator;
    const completed = Math.round(loggedIn * seeded(`f${r.code}`, 0.46, 0.72));
    regions[r.code] = { registered, loggedIn, completed };
    loggedInTotal += loggedIn;
    completedTotal += completed;
  }

  const sectionStamps = SECTIONS.map((s, i) => ({
    sectionId: s.id,
    title: s.title,
    // 뒤 섹션으로 갈수록 이탈 — 퍼널 형태
    count: Math.round(loggedInTotal * (0.95 - i * 0.045)),
  }));

  const hourly = Array.from({ length: 24 }, (_, h) => {
    const peak = h >= 9 && h <= 11 ? 1.8 : h >= 13 && h <= 15 ? 1.6 : h >= 20 && h <= 22 ? 1.4 : 0.5;
    return { hour: `${String(h).padStart(2, '0')}시`, count: Math.round(seeded(`h${h}`, 40, 160) * peak) };
  });

  const quizWrongTop = PRODUCTS.filter((p) => p.sectionId !== 'welcome' && p.sectionId !== 'media')
    .map((p) => ({ productId: p.id, name: p.name, wrongRate: seeded(`q${p.id}`, 0.08, 0.46) }))
    .sort((a, b) => b.wrongRate - a.wrongRate)
    .slice(0, 10);

  const openQuestionCount = db.questions.filter((q) => q.status === 'open').length;

  return {
    loginCount: loggedInTotal + Object.keys(db.users).length,
    todayLoginCount: Math.round(loggedInTotal * 0.21) + Object.keys(db.users).length,
    onlineNow: Math.round(seeded(`o${new Date().getHours()}`, 380, 1240)),
    completedCount: completedTotal + myEntries().length,
    registeredCount: TOTAL_REGISTERED,
    openQuestionCount,
    regions,
    sectionStamps,
    hourly,
    quizWrongTop,
    updatedAt: Date.now(),
  };
}

/** T5-7 · 지역별 상위 80단어 */
export function buildWordcloud(region: RegionCode | 'ALL', excludeCheerWords = false): WordCloudItem[] {
  const counts = new Map<string, number>();
  for (const c of db.cheers) {
    if (c.status !== 'visible') continue;
    if (region !== 'ALL' && c.region !== region) continue;
    for (const t of tokenize(c.text, excludeCheerWords)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 80);
}

/** 공감 상위 질문 10 (aggregates/askTop) */
export function buildAskTop() {
  return [...db.questions]
    .filter((q) => q.isPublic && q.status !== 'hidden')
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 10);
}
