import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, FieldValue, SCHEDULE_OPTS } from '../shared/admin';
import { tokenize } from '../shared/tokenize';

/**
 * T6-1 / T5-7 / T8-1 ⚡ · 집계 스케줄.
 * 모든 사용자가 aggregates/* 문서 1건만 읽도록 요약해 둔다(TRD 5장).
 */

const REGIONS = [
  'SEOUL', 'GYEONGGI', 'GANGWON', 'CHUNGCHEONG', 'DAEGU', 'ULSAN', 'BUSAN', 'GWANGJU', 'JEJU',
] as const;

type Region = (typeof REGIONS)[number];

/** 개인 랭킹 점포명 뒤 2글자 마스킹 */
function maskStoreName(name: string): string {
  if (!name) return '○○점';
  if (name.length <= 2) return `${name[0]}○점`;
  return `${name.slice(0, -2)}○○점`;
}

interface ProgressRow {
  uid: string;
  storeCode: string;
  region: Region;
  stampCount: number;
  completedAt?: number;
  quizFirstTryCorrect: number;
  quizTotal: number;
}

async function loadProgress(): Promise<ProgressRow[]> {
  const snap = await db.collection('progress').get();
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<ProgressRow, 'uid'>) }));
}

async function storeNames(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // in 쿼리는 30개 제한 → 청크로 나눠 조회
  for (let i = 0; i < codes.length; i += 30) {
    const chunk = codes.slice(i, i + 30);
    const snap = await db.collection('stores').where('storeCode', 'in', chunk).get();
    snap.forEach((d) => map.set(d.id, (d.data().storeName as string) ?? d.id));
  }
  return map;
}

/** 5분 주기 — 랭킹 */
export const aggregateRanking = onSchedule(
  { ...SCHEDULE_OPTS, schedule: 'every 5 minutes' },
  async () => {
    const rows = await loadProgress();
    const finishers = rows.filter((r) => r.completedAt).sort((a, b) => a.completedAt! - b.completedAt!);
    const names = await storeNames([...new Set(finishers.slice(0, 60).map((r) => r.storeCode))]);

    const firstFinishers = finishers.slice(0, 30).map((r, i) => ({
      rank: i + 1,
      storeLabel: maskStoreName(names.get(r.storeCode) ?? r.storeCode),
      region: r.region,
      value: r.completedAt!,
      valueLabel: new Date(r.completedAt!).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      uid: r.uid,
    }));

    // 지역별 등록 점포 수
    const registered = new Map<Region, number>();
    const storesSnap = await db.collection('stores').where('active', '==', true).get();
    storesSnap.forEach((d) => {
      const region = d.data().region as Region;
      registered.set(region, (registered.get(region) ?? 0) + 1);
    });

    const loggedIn = new Map<Region, number>();
    const usersSnap = await db.collection('users').where('role', '==', 'owner').get();
    usersSnap.forEach((d) => {
      const region = d.data().region as Region;
      if (d.data().lastLoginAt) loggedIn.set(region, (loggedIn.get(region) ?? 0) + 1);
    });

    const regionParticipation = REGIONS.map((region) => {
      const denom = registered.get(region) ?? 0;
      const num = loggedIn.get(region) ?? 0;
      return { rank: 0, region, ratio: denom ? num / denom : 0, numerator: num, denominator: denom };
    })
      .sort((a, b) => b.ratio - a.ratio)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    const uMap = new Map<Region, { correct: number; total: number }>();
    for (const r of rows) {
      const cur = uMap.get(r.region) ?? { correct: 0, total: 0 };
      cur.correct += r.quizFirstTryCorrect ?? 0;
      cur.total += r.quizTotal ?? 0;
      uMap.set(r.region, cur);
    }
    const regionUnderstanding = REGIONS.map((region) => {
      const v = uMap.get(region) ?? { correct: 0, total: 0 };
      return {
        rank: 0,
        region,
        ratio: v.total ? v.correct / v.total : 0,
        numerator: v.correct,
        denominator: v.total,
      };
    })
      .sort((a, b) => b.ratio - a.ratio)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    const topRows = rows
      .filter((r) => r.quizTotal > 0)
      .map((r) => ({ ...r, pct: (r.quizFirstTryCorrect / r.quizTotal) * 100 }))
      .sort((a, b) => b.pct - a.pct || (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity))
      .slice(0, 30);
    const topNames = await storeNames([...new Set(topRows.map((r) => r.storeCode))]);

    const topUnderstanding = topRows.map((r, i) => ({
      rank: i + 1,
      storeLabel: maskStoreName(topNames.get(r.storeCode) ?? r.storeCode),
      region: r.region,
      value: Math.round(r.pct),
      valueLabel: `${Math.round(r.pct)}%`,
      uid: r.uid,
    }));

    await db.collection('aggregates').doc('ranking').set({
      firstFinishers,
      regionParticipation,
      regionUnderstanding,
      topUnderstanding,
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);

/** 1분 주기 — 통계 카드 · 섹션 퍼널 */
export const aggregateStats = onSchedule({ ...SCHEDULE_OPTS, schedule: 'every 1 minutes' }, async () => {
  const rows = await loadProgress();

  const regions = {} as Record<Region, { registered: number; loggedIn: number; completed: number }>;
  for (const r of REGIONS) regions[r] = { registered: 0, loggedIn: 0, completed: 0 };

  const storesSnap = await db.collection('stores').where('active', '==', true).get();
  storesSnap.forEach((d) => {
    const region = d.data().region as Region;
    if (regions[region]) regions[region].registered += 1;
  });

  const usersSnap = await db.collection('users').where('role', '==', 'owner').get();
  let loginCount = 0;
  let todayLoginCount = 0;
  const todayStart = new Date(new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Seoul' })).getTime();
  usersSnap.forEach((d) => {
    const v = d.data();
    const region = v.region as Region;
    if (!v.lastLoginAt) return;
    loginCount += 1;
    if (regions[region]) regions[region].loggedIn += 1;
    const last = v.lastLoginAt?.toMillis?.() ?? v.lastLoginAt;
    if (last >= todayStart) todayLoginCount += 1;
  });

  let completedCount = 0;
  for (const r of rows) {
    if (r.completedAt) {
      completedCount += 1;
      if (regions[r.region]) regions[r.region].completed += 1;
    }
  }

  // 섹션별 스탬프 수
  const sectionsSnap = await db.collection('sections').orderBy('order').get();
  const sectionStamps = sectionsSnap.docs.map((d) => ({
    sectionId: d.id,
    title: d.data().title as string,
    count: 0,
  }));
  const allProgress = await db.collection('progress').get();
  allProgress.forEach((d) => {
    const stamps = (d.data().stamps ?? {}) as Record<string, number>;
    for (const s of sectionStamps) if (stamps[s.sectionId]) s.count += 1;
  });

  // 퀴즈 오답률 TOP 10
  const wrong = new Map<string, { wrong: number; total: number }>();
  allProgress.forEach((d) => {
    const products = (d.data().products ?? {}) as Record<
      string,
      { attempts?: number; quizFirstTryCorrect?: boolean }
    >;
    for (const [pid, rec] of Object.entries(products)) {
      if (rec.attempts === undefined) continue;
      const cur = wrong.get(pid) ?? { wrong: 0, total: 0 };
      cur.total += 1;
      if (rec.quizFirstTryCorrect === false) cur.wrong += 1;
      wrong.set(pid, cur);
    }
  });
  const productsSnap = await db.collection('products').get();
  const productNames = new Map(productsSnap.docs.map((d) => [d.id, d.data().name as string]));
  const quizWrongTop = [...wrong.entries()]
    .map(([productId, v]) => ({
      productId,
      name: productNames.get(productId) ?? productId,
      wrongRate: v.total ? v.wrong / v.total : 0,
    }))
    .sort((a, b) => b.wrongRate - a.wrongRate)
    .slice(0, 10);

  const openQuestions = await db.collection('questions').where('status', '==', 'open').count().get();

  await db.collection('aggregates').doc('stats').set({
    loginCount,
    todayLoginCount,
    onlineNow: 0, // Realtime presence 를 붙이면 채운다
    completedCount,
    registeredCount: storesSnap.size,
    openQuestionCount: openQuestions.data().count,
    regions,
    sectionStamps,
    hourly: [],
    quizWrongTop,
    updatedAt: FieldValue.serverTimestamp(),
  });
});

/** T5-7 ⚡ · 1분 주기 워드클라우드 (지역별 상위 80단어) */
export const aggregateWordcloud = onSchedule(
  { ...SCHEDULE_OPTS, schedule: 'every 1 minutes' },
  async () => {
    const snap = await db
      .collection('cheers')
      .where('status', '==', 'visible')
      .orderBy('createdAt', 'desc')
      .limit(3000)
      .get();

    const byRegion = new Map<string, Map<string, number>>();
    const all = new Map<string, number>();

    // 불용어 제외 여부는 설정값으로 관리한다 (config/app.excludeCheerWords)
    const cfg = await db.collection('config').doc('app').get();
    const exclude = (cfg.data()?.excludeCheerWords as boolean) ?? false;

    snap.forEach((d) => {
      const v = d.data() as { region: string; tokens?: string[]; text: string };
      const tokens = v.tokens?.length ? v.tokens : tokenize(v.text, exclude);
      const m = byRegion.get(v.region) ?? new Map<string, number>();
      for (const t of tokens) {
        if (exclude && ['화이팅', '파이팅', '감사', '응원'].includes(t)) continue;
        m.set(t, (m.get(t) ?? 0) + 1);
        all.set(t, (all.get(t) ?? 0) + 1);
      }
      byRegion.set(v.region, m);
    });

    const top = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([text, value]) => ({ text, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 80);

    const batch = db.batch();
    batch.set(db.collection('aggregates').doc('wordcloud_ALL'), {
      items: top(all),
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const region of REGIONS) {
      batch.set(db.collection('aggregates').doc(`wordcloud_${region}`), {
        items: top(byRegion.get(region) ?? new Map()),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  },
);

/** 공감 상위 질문 10 (aggregates/askTop) */
export const aggregateAskTop = onSchedule(
  { ...SCHEDULE_OPTS, schedule: 'every 5 minutes' },
  async () => {
    const snap = await db
      .collection('questions')
      .where('channel', '==', 'hq')
      .where('isPublic', '==', true)
      .orderBy('likeCount', 'desc')
      .limit(10)
      .get();

    await db.collection('aggregates').doc('askTop').set({
      items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);
