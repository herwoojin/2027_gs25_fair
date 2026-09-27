/**
 * 콘텐츠 원장 — 섹션·상품·퀴즈·기념품을 운영 중에 고친다.
 *
 * 시드(lib/seed/**)는 상수라 코드를 고쳐야 바뀐다. 운영 중에는 그럴 수 없으므로
 * **시드 위에 덮어쓰는 층(override)** 을 DB 에 둔다.
 *
 *   시드  +  수정분(override)  +  추가분(added)  −  삭제분(deleted)  =  실제 노출
 *
 * 이렇게 하면 시드를 건드리지 않고도 운영 중 편집이 가능하고,
 * 수정분만 지우면 언제든 원래 콘텐츠로 되돌릴 수 있다.
 */
import { PRODUCTS, QUIZZES } from '@/lib/seed/products';
import { QUIZ_ANSWERS } from './quizAnswers';
import { SECTIONS } from '@/lib/seed/sections';
import { SOUVENIRS } from '@/lib/seed/misc';
import type { Product, Quiz, Section, Souvenir } from '@/types';
import { db, persist } from './store';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/catalog.ts is server-only');
}

// ── 섹션 ──────────────────────────────────────────────────────────
/**
 * 섹션은 **수정만** 허용한다.
 * hallPosition 이 3D 전시장과 가이드맵 배치를 동시에 결정하기 때문에,
 * 추가·삭제는 좌표 재설계가 따라와야 한다. 운영 중 실수로 동선이 무너지면 복구가 어렵다.
 */
export function mergedSections(): Section[] {
  return SECTIONS.map((s) => {
    const o = db.sectionOverrides[s.id];
    return o ? ({ ...s, ...o } as Section) : s;
  });
}

// ── 상품 ──────────────────────────────────────────────────────────
export function mergedProducts(): Product[] {
  const deleted = new Set(db.productDeleted);
  const base = PRODUCTS.filter((p) => !deleted.has(p.id)).map((p) => {
    const o = db.productOverrides[p.id];
    return o ? ({ ...p, ...o } as Product) : p;
  });
  const added = db.productAdded.filter((p) => !deleted.has(p.id));
  return [...base, ...added].sort((a, b) =>
    a.sectionId === b.sectionId ? a.order - b.order : a.sectionId.localeCompare(b.sectionId),
  );
}

export function mergedProduct(id: string): Product | null {
  return mergedProducts().find((p) => p.id === id) ?? null;
}

/** 퀴즈 — 보기는 공개, 정답은 서버에만 둔다(기존 규칙 유지) */
export function mergedQuiz(productId: string): Quiz | null {
  const o = db.quizOverrides[productId];
  if (o) return { id: productId, question: o.question, options: o.options };
  return QUIZZES.find((q) => q.id === productId) ?? null;
}

export function mergedQuizAnswer(productId: string): number | null {
  const o = db.quizOverrides[productId];
  if (o) return o.answerIndex;
  return QUIZ_ANSWERS[productId]?.answerIndex ?? null;
}

// ── 기념품 ────────────────────────────────────────────────────────
export function mergedSouvenirs(): Souvenir[] {
  const deleted = new Set(db.souvenirDeleted);
  const base = SOUVENIRS.filter((s) => !deleted.has(s.id)).map((s) => {
    const o = db.souvenirOverrides[s.id];
    return o ? ({ ...s, ...o } as Souvenir) : s;
  });
  const added = db.souvenirAdded.filter((s) => !deleted.has(s.id));
  return [...base, ...added].sort((a, b) => a.order - b.order);
}

// ── 쓰기 ──────────────────────────────────────────────────────────

const isSeedProduct = (id: string) => PRODUCTS.some((p) => p.id === id);
const isSeedSouvenir = (id: string) => SOUVENIRS.some((s) => s.id === id);

export function saveSectionPatch(id: string, patch: Partial<Section>) {
  db.sectionOverrides[id] = { ...db.sectionOverrides[id], ...patch };
  persist();
}

export function saveProduct(p: Product) {
  if (isSeedProduct(p.id)) {
    // 시드 상품은 원본을 남기고 수정분만 쌓는다 — 되돌리기가 가능해야 한다.
    db.productOverrides[p.id] = { ...db.productOverrides[p.id], ...p };
  } else {
    const i = db.productAdded.findIndex((x) => x.id === p.id);
    if (i >= 0) db.productAdded[i] = p;
    else db.productAdded.push(p);
  }
  db.productDeleted = db.productDeleted.filter((x) => x !== p.id);
  persist();
}

export function deleteProduct(id: string) {
  if (!db.productDeleted.includes(id)) db.productDeleted.push(id);
  db.productAdded = db.productAdded.filter((p) => p.id !== id);
  persist();
}

export function saveQuiz(productId: string, question: string, options: string[], answerIndex: number) {
  db.quizOverrides[productId] = { question, options, answerIndex };
  persist();
}

export function deleteQuiz(productId: string) {
  delete db.quizOverrides[productId];
  persist();
}

export function saveSouvenir(s: Souvenir) {
  if (isSeedSouvenir(s.id)) {
    db.souvenirOverrides[s.id] = { ...db.souvenirOverrides[s.id], ...s };
  } else {
    const i = db.souvenirAdded.findIndex((x) => x.id === s.id);
    if (i >= 0) db.souvenirAdded[i] = s;
    else db.souvenirAdded.push(s);
  }
  db.souvenirDeleted = db.souvenirDeleted.filter((x) => x !== s.id);
  persist();
}

export function deleteSouvenir(id: string) {
  if (!db.souvenirDeleted.includes(id)) db.souvenirDeleted.push(id);
  db.souvenirAdded = db.souvenirAdded.filter((s) => s.id !== id);
  persist();
}

/** 수정분을 전부 버리고 시드 원본으로 되돌린다 */
export function resetCatalog() {
  db.sectionOverrides = {};
  db.productOverrides = {};
  db.productAdded = [];
  db.productDeleted = [];
  db.quizOverrides = {};
  db.souvenirOverrides = {};
  db.souvenirAdded = [];
  db.souvenirDeleted = [];
  persist();
}

export function catalogStatus() {
  return {
    sectionsEdited: Object.keys(db.sectionOverrides).length,
    productsEdited: Object.keys(db.productOverrides).length,
    productsAdded: db.productAdded.length,
    productsDeleted: db.productDeleted.length,
    quizzesEdited: Object.keys(db.quizOverrides).length,
    souvenirsEdited: Object.keys(db.souvenirOverrides).length,
    souvenirsAdded: db.souvenirAdded.length,
    souvenirsDeleted: db.souvenirDeleted.length,
  };
}
