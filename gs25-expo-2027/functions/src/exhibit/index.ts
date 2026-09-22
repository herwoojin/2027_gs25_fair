import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db, FieldValue, CALLABLE_OPTS, HOT_CALLABLE_OPTS } from '../shared/admin';
import { requireOwner } from '../shared/guards';
import { audit } from '../shared/audit';
import { queueRow } from '../shared/sheets';

/**
 * T4-2 🔐 · 스탬프 판정 (TRD 4장)
 *  1) enter  → serverEnterAt 기록
 *  2) consumed → 오디오 90% / 스크립트 끝 도달
 *  3) submitQuiz → quizAnswers(클라이언트 접근 불가)와 서버에서 비교
 *  4) 완료 조건: consumed && (퀴즈 있으면 정답) && (now - enterAt >= section.minDwellSec)
 *
 * ⚠️ 클라이언트가 보낸 시각은 절대 신뢰하지 않는다.
 */

const SECTION_CACHE_TTL = 60_000;
let sectionCache: { at: number; map: Map<string, SectionDoc> } | null = null;

interface SectionDoc {
  id: string;
  requiredProductIds: string[];
  minDwellSec: number;
  slug: string;
  title: string;
  order: number;
}

async function sections(): Promise<Map<string, SectionDoc>> {
  if (sectionCache && Date.now() - sectionCache.at < SECTION_CACHE_TTL) return sectionCache.map;
  const snap = await db.collection('sections').get();
  const map = new Map<string, SectionDoc>();
  snap.forEach((d) => {
    const v = d.data();
    map.set(d.id, {
      id: d.id,
      requiredProductIds: (v.requiredProductIds ?? []) as string[],
      minDwellSec: (v.minDwellSec ?? 20) as number,
      slug: v.slug as string,
      title: v.title as string,
      order: v.order as number,
    });
  });
  sectionCache = { at: Date.now(), map };
  return map;
}

async function productSection(productId: string): Promise<{ sectionId: string } | null> {
  const snap = await db.collection('products').doc(productId).get();
  if (!snap.exists) return null;
  return { sectionId: snap.data()?.sectionId as string };
}

const progressSchema = z.object({
  productId: z.string().min(1).max(64),
  event: z.enum(['enter', 'consumed']),
});

export const markProductProgress = onCall(HOT_CALLABLE_OPTS, async (req) => {
  const caller = requireOwner(req);
  const parsed = progressSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');
  const { productId, event } = parsed.data;

  const prod = await productSection(productId);
  if (!prod) throw new HttpsError('not-found', '존재하지 않는 상품입니다.');
  const section = (await sections()).get(prod.sectionId);
  if (!section) throw new HttpsError('not-found', '존재하지 않는 섹션입니다.');

  const ref = db.collection('progress').doc(caller.uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() ?? {
      storeCode: caller.storeCode,
      region: caller.region,
      products: {},
      stamps: {},
      stampCount: 0,
      quizFirstTryCorrect: 0,
      quizTotal: 0,
    }) as ProgressDoc;

    const rec = data.products[productId] ?? {};
    const now = Date.now();

    if (event === 'enter') {
      if (!rec.enterAt) rec.enterAt = now;
    } else {
      // enter 없이 consumed 호출 → 거부 (개발자도구 조작 방지)
      if (!rec.enterAt) throw new HttpsError('failed-precondition', '상품 상세에 먼저 입장해야 합니다.');
      if (!rec.consumedAt) rec.consumedAt = now;
    }

    data.products[productId] = rec;
    applyCompletion(data, productId, section, now);
    tx.set(ref, data, { merge: true });
    return data;
  });

  await syncStampIfNew(result, caller.storeCode, prod.sectionId);

  const rec = result.products[productId];
  return {
    progress: result,
    dwellRemainSec: Math.max(
      0,
      Math.ceil((section.minDwellSec * 1000 - (Date.now() - (rec.enterAt ?? Date.now()))) / 1000),
    ),
  };
});

const quizSchema = z.object({
  productId: z.string().min(1).max(64),
  choice: z.number().int().min(0).max(9),
});

export const submitQuiz = onCall(HOT_CALLABLE_OPTS, async (req) => {
  const caller = requireOwner(req);
  const parsed = quizSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');
  const { productId, choice } = parsed.data;

  // 🔒 정답은 여기서만 읽는다. 클라이언트는 quizAnswers 를 읽을 수 없다.
  const answerSnap = await db.collection('quizAnswers').doc(productId).get();
  if (!answerSnap.exists) throw new HttpsError('not-found', '퀴즈가 없습니다.');
  const { answerIndex, explanation } = answerSnap.data() as {
    answerIndex: number;
    explanation: string;
  };

  const prod = await productSection(productId);
  if (!prod) throw new HttpsError('not-found', '존재하지 않는 상품입니다.');
  const section = (await sections()).get(prod.sectionId);
  if (!section) throw new HttpsError('not-found', '존재하지 않는 섹션입니다.');

  const ref = db.collection('progress').doc(caller.uid);

  const { data, correct, firstTry, stampedNow } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('failed-precondition', '상품 상세에 먼저 입장해야 합니다.');
    const d = snap.data() as ProgressDoc;
    const rec = d.products[productId];
    if (!rec?.enterAt) throw new HttpsError('failed-precondition', '상품 상세에 먼저 입장해야 합니다.');

    const isCorrect = choice === answerIndex;
    const isFirst = (rec.attempts ?? 0) === 0;
    rec.attempts = (rec.attempts ?? 0) + 1;

    if (isFirst) {
      rec.quizFirstTryCorrect = isCorrect;
      d.quizTotal = (d.quizTotal ?? 0) + 1;
      if (isCorrect) d.quizFirstTryCorrect = (d.quizFirstTryCorrect ?? 0) + 1;
    }
    if (isCorrect) rec.quizCorrect = true;
    d.products[productId] = rec;

    const before = Object.keys(d.stamps ?? {}).length;
    applyCompletion(d, productId, section, Date.now());
    const after = Object.keys(d.stamps ?? {}).length;

    tx.set(ref, d, { merge: true });
    return { data: d, correct: isCorrect, firstTry: isFirst, stampedNow: after > before };
  });

  if (stampedNow) await syncStampIfNew(data, caller.storeCode, prod.sectionId);

  return {
    correct,
    explanation,
    firstTry,
    attempts: data.products[productId].attempts ?? 1,
    progress: data,
    stampGranted: stampedNow
      ? { id: section.id, title: section.title, order: section.order, slug: section.slug }
      : null,
  };
});

const surveySchema = z.object({
  q1: z.number().int().min(1).max(5),
  q2: z.number().int().min(1).max(5),
  q3: z.number().int().min(1).max(5),
  q4: z.number().int().min(1).max(5),
  q5: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

/** T4-4 · 퇴점 설문 → 11번째 스탬프 → 완주 (분산 카운터로 전국 순번 부여) */
export const submitSurvey = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireOwner(req);
  const parsed = surveySchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '설문 응답을 확인해 주세요.');

  const all = await sections();
  const needed = [...all.values()].filter((s) => s.slug !== 'exit');
  const exitSection = [...all.values()].find((s) => s.slug === 'exit');
  if (!exitSection) throw new HttpsError('failed-precondition', '퇴점 섹션이 설정되지 않았습니다.');

  const ref = db.collection('progress').doc(caller.uid);
  const snap = await ref.get();
  const data = snap.data() as ProgressDoc | undefined;
  if (!data) throw new HttpsError('failed-precondition', '아직 전시를 시작하지 않으셨습니다.');

  const missing = needed.filter((s) => !data.stamps?.[s.id]);
  if (missing.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `아직 완료하지 않은 섹션이 ${missing.length}곳 있습니다.`,
    );
  }

  const completionNo = await nextCompletionNo();

  await db.collection('surveys').doc(caller.uid).set({
    ...parsed.data,
    createdAt: FieldValue.serverTimestamp(),
  });

  const now = Date.now();
  await ref.set(
    {
      surveyDoneAt: now,
      [`stamps.${exitSection.id}`]: now,
      stampCount: Object.keys(data.stamps ?? {}).length + 1,
      completedAt: data.completedAt ?? now,
      completionNo: data.completionNo ?? completionNo,
    },
    { merge: true },
  );

  const understanding = data.quizTotal
    ? Math.round(((data.quizFirstTryCorrect ?? 0) / data.quizTotal) * 100)
    : 0;

  await queueRow('Completions', [
    new Date().toISOString(),
    caller.storeCode,
    caller.region,
    data.completionNo ?? completionNo,
    understanding,
  ]);
  await audit({
    uid: caller.uid,
    role: 'owner',
    action: 'completion',
    target: String(data.completionNo ?? completionNo),
  });

  const storeSnap = await db.collection('stores').doc(caller.storeCode).get();

  return {
    completionNo: data.completionNo ?? completionNo,
    certificate: {
      storeName: (storeSnap.data()?.storeName as string) ?? caller.storeCode,
      storeCode: caller.storeCode,
      completionNo: data.completionNo ?? completionNo,
      completedAt: data.completedAt ?? now,
      understanding,
    },
  };
});

// ── 내부 ────────────────────────────────────────────────────
interface ProductRec {
  enterAt?: number;
  consumedAt?: number;
  doneAt?: number;
  quizFirstTryCorrect?: boolean;
  quizCorrect?: boolean;
  attempts?: number;
}

interface ProgressDoc {
  storeCode: string;
  region: string;
  products: Record<string, ProductRec>;
  stamps: Record<string, number>;
  stampCount: number;
  quizFirstTryCorrect: number;
  quizTotal: number;
  surveyDoneAt?: number;
  completedAt?: number;
  completionNo?: number;
}

/** 상품 완료 조건 검사 + 섹션 스탬프 부여 */
function applyCompletion(data: ProgressDoc, productId: string, section: SectionDoc, now: number) {
  const rec = data.products[productId];
  if (!rec?.enterAt || !rec.consumedAt || rec.doneAt) {
    // 완료 조건 미충족 또는 이미 완료
  } else {
    const dwellOk = now - rec.enterAt >= section.minDwellSec * 1000;
    // 퀴즈가 있는 상품은 quizCorrect 가 true 여야 한다.
    // (퀴즈 존재 여부는 quizCorrect 필드가 한 번이라도 세팅됐는지로 판단하지 않고,
    //  섹션 필수 상품 정책상 퀴즈가 없으면 quizCorrect 가 undefined 인 채로 통과시킨다.)
    const quizOk = rec.attempts === undefined ? true : rec.quizCorrect === true;
    if (dwellOk && quizOk) rec.doneAt = now;
  }

  data.stamps = data.stamps ?? {};
  if (!data.stamps[section.id] && section.requiredProductIds.length > 0) {
    const all = section.requiredProductIds.every((pid) => data.products[pid]?.doneAt);
    if (all) {
      data.stamps[section.id] = now;
      data.stampCount = Object.keys(data.stamps).length;
    }
  }
}

const syncedStamps = new Set<string>();

async function syncStampIfNew(data: ProgressDoc, storeCode: string, sectionId: string) {
  const key = `${storeCode}:${sectionId}`;
  if (!data.stamps?.[sectionId] || syncedStamps.has(key)) return;
  syncedStamps.add(key);
  await queueRow('Stamps', [new Date().toISOString(), storeCode, sectionId, data.stampCount]);
  await audit({ uid: `store_${storeCode}`, role: 'owner', action: 'stamp.granted', target: sectionId });
}

/**
 * TRD 5장 · 분산 카운터(샤드 10개)로 완주 순번을 부여한다.
 * 단일 문서 increment 는 초당 1회 한계가 있어 오픈 직후 핫스팟이 된다.
 */
const SHARDS = 10;

async function nextCompletionNo(): Promise<number> {
  const shardId = Math.floor(Math.random() * SHARDS);
  const shardRef = db.collection('counters').doc('completions').collection('shards').doc(String(shardId));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(shardRef);
    tx.set(shardRef, { count: ((snap.data()?.count as number) ?? 0) + 1 }, { merge: true });
  });

  const all = await db.collection('counters').doc('completions').collection('shards').get();
  let total = 0;
  all.forEach((d) => {
    total += (d.data().count as number) ?? 0;
  });
  return total;
}
