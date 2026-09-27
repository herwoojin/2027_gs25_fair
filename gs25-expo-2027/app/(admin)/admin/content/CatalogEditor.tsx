'use client';

import { useCallback, useEffect, useState } from 'react';
import { Gift, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { Product, Section, Souvenir } from '@/types';
import { callFn, type ApiError } from '@/lib/api';

/**
 * 콘텐츠 원장 편집 — 섹션 · 상품 · 퀴즈 · 기념품.
 *
 * 시드(코드 상수) 위에 수정분을 쌓는 구조라, 언제든 '원본으로 되돌리기' 가 가능하다.
 * 섹션은 수정만 연다. hallPosition 이 3D 전시장과 가이드맵 배치를 함께 정하므로
 * 추가·삭제는 좌표 재설계가 따라와야 한다.
 */

interface Status {
  sectionsEdited: number;
  productsEdited: number;
  productsAdded: number;
  productsDeleted: number;
  quizzesEdited: number;
  souvenirsEdited: number;
  souvenirsAdded: number;
  souvenirsDeleted: number;
}

type Tab = 'products' | 'sections' | 'souvenirs';

type ProductDraft = {
  id?: string;
  sectionId: string;
  name: string;
  category: string;
  summary3: string;
  script: string;
  aiContext: string;
  order: number;
};

type SouvenirDraft = {
  id?: string;
  name: string;
  hint: string;
  shape: Souvenir['shape'];
  revealAt: string;
  stampToHint: number;
  order: number;
};

const toLocal = (ts: number) => {
  const d = new Date(ts + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

export function CatalogEditor() {
  const [tab, setTab] = useState<Tab>('products');
  const [sections, setSections] = useState<Section[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [souvenirs, setSouvenirs] = useState<Souvenir[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [pDraft, setPDraft] = useState<ProductDraft | null>(null);
  const [sDraft, setSDraft] = useState<SouvenirDraft | null>(null);
  const [quizFor, setQuizFor] = useState<{ productId: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await callFn<{
        sections: Section[];
        products: Product[];
        souvenirs: Souvenir[];
        status: Status;
      }>('adminCatalog');
      setSections(r.sections);
      setProducts(r.products);
      setSouvenirs(r.souvenirs);
      setStatus(r.status);
    } catch (e) {
      setError((e as ApiError).message ?? '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError((e as ApiError).message ?? '처리하지 못했습니다.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const edited =
    (status?.sectionsEdited ?? 0) +
    (status?.productsEdited ?? 0) +
    (status?.productsAdded ?? 0) +
    (status?.productsDeleted ?? 0) +
    (status?.quizzesEdited ?? 0) +
    (status?.souvenirsEdited ?? 0) +
    (status?.souvenirsAdded ?? 0) +
    (status?.souvenirsDeleted ?? 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['products', 'sections', 'souvenirs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`gs-btn h-10 min-h-0 px-3 text-sm ${
              tab === t ? 'bg-gs-blue text-white' : 'border border-gs-line'
            }`}
          >
            {t === 'products' ? '상품·퀴즈' : t === 'sections' ? '섹션' : '기념품'}
          </button>
        ))}
        {edited > 0 && (
          <button
            className="gs-btn ml-auto h-10 min-h-0 border border-gs-line px-3 text-sm text-gs-muted"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('수정한 내용을 모두 버리고 원본 콘텐츠로 되돌립니다. 진행할까요?')) return;
              void run(() => callFn('adminResetCatalog', { confirm: true }));
            }}
          >
            <RotateCcw size={14} /> 원본으로 되돌리기 ({edited})
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-state-critical">{error}</p>
      )}

      {/* ── 상품 ── */}
      {tab === 'products' && (
        <>
          <button
            className="gs-btn-primary h-11 min-h-0 px-4 text-sm"
            onClick={() =>
              setPDraft({
                sectionId: sections[0]?.id ?? '',
                name: '',
                category: '신상품',
                summary3: '',
                script: '',
                aiContext: '',
                order: 1,
              })
            }
          >
            <Plus size={15} /> 상품 추가
          </button>

          {pDraft && (
            <div className="gs-card space-y-3 border-2 border-gs-blue p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">{pDraft.id ? '상품 수정' : '새 상품'}</h3>
                <button aria-label="닫기" onClick={() => setPDraft(null)} className="text-gs-muted">
                  <X size={18} />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-bold text-gs-muted">섹션</span>
                  <select
                    className="gs-input mt-1 w-full text-sm"
                    value={pDraft.sectionId}
                    onChange={(e) => setPDraft({ ...pDraft, sectionId: e.target.value })}
                  >
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.order}. {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <F label="상품명" value={pDraft.name} onChange={(v) => setPDraft({ ...pDraft, name: v })} />
                <F label="분류" value={pDraft.category} onChange={(v) => setPDraft({ ...pDraft, category: v })} />
                <label className="block">
                  <span className="block text-xs font-bold text-gs-muted">노출 순서</span>
                  <input
                    type="number"
                    min={1}
                    className="gs-input mt-1 w-full text-sm"
                    value={pDraft.order}
                    onChange={(e) => setPDraft({ ...pDraft, order: Number(e.target.value) || 1 })}
                  />
                </label>
              </div>
              <T
                label="3줄 요약 (줄바꿈으로 구분, 최대 3줄)"
                value={pDraft.summary3}
                rows={3}
                onChange={(v) => setPDraft({ ...pDraft, summary3: v })}
              />
              <T label="원고" value={pDraft.script} rows={6} onChange={(v) => setPDraft({ ...pDraft, script: v })} />
              <T
                label="AI 챗봇 참고자료 (경영주에게 보이지 않습니다)"
                value={pDraft.aiContext}
                rows={4}
                onChange={(v) => setPDraft({ ...pDraft, aiContext: v })}
              />
              <button
                className="gs-btn-primary h-11 min-h-0 px-4 text-sm disabled:opacity-40"
                disabled={busy || !pDraft.name.trim()}
                onClick={async () => {
                  const okDone = await run(() =>
                    callFn('adminSaveProduct', {
                      ...(pDraft.id ? { id: pDraft.id } : {}),
                      sectionId: pDraft.sectionId,
                      name: pDraft.name.trim(),
                      category: pDraft.category.trim() || '기타',
                      summary3: pDraft.summary3.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3),
                      script: pDraft.script,
                      aiContext: pDraft.aiContext,
                      order: pDraft.order,
                    }),
                  );
                  if (okDone) setPDraft(null);
                }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} 저장
              </button>
            </div>
          )}

          {quizFor && (
            <QuizForm
              productId={quizFor.productId}
              name={quizFor.name}
              busy={busy}
              onClose={() => setQuizFor(null)}
              onSave={async (body) => {
                const okDone = await run(() => callFn('adminSaveQuiz', body));
                if (okDone) setQuizFor(null);
              }}
            />
          )}

          <ul className="space-y-2">
            {sections.map((sec) => {
              const list = products.filter((p) => p.sectionId === sec.id);
              if (list.length === 0) return null;
              return (
                <li key={sec.id} className="gs-card p-4">
                  <p className="mb-2 font-bold">
                    {String(sec.order).padStart(2, '0')} {sec.title}
                    <span className="ml-2 text-sm font-normal text-gs-muted">{list.length}개</span>
                  </p>
                  <ul className="divide-y divide-gs-line">
                    {list.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="text-sm text-gs-muted">{p.order}</span>
                        <span className="font-semibold">{p.name}</span>
                        <span className="rounded-pill bg-gs-surface px-2 py-0.5 text-xs text-gs-muted">
                          {p.category}
                        </span>
                        {sec.requiredProductIds.includes(p.id) && (
                          <span className="rounded-pill border border-gs-blue px-2 py-0.5 text-xs font-bold text-gs-blue">
                            필수
                          </span>
                        )}
                        <span className="ml-auto flex gap-1">
                          <button
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-gs-blue hover:bg-gs-blue-light"
                            onClick={() => setQuizFor({ productId: p.id, name: p.name })}
                          >
                            퀴즈
                          </button>
                          <button
                            aria-label="수정"
                            className="rounded-lg p-1.5 text-gs-muted hover:bg-gs-surface"
                            onClick={() =>
                              setPDraft({
                                id: p.id,
                                sectionId: p.sectionId,
                                name: p.name,
                                category: p.category,
                                summary3: (p.summary3 ?? []).join('\n'),
                                script: p.script ?? '',
                                aiContext: p.aiContext ?? '',
                                order: p.order,
                              })
                            }
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            aria-label="삭제"
                            className="rounded-lg p-1.5 text-state-critical hover:bg-red-50"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`"${p.name}" 을(를) 삭제할까요?`)) return;
                              void run(() => callFn('adminDeleteProduct', { id: p.id }));
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* ── 섹션 ── */}
      {tab === 'sections' && (
        <>
          <p className="rounded-xl bg-gs-surface px-4 py-3 text-sm text-gs-muted">
            섹션은 <b className="text-gs-ink">수정만</b> 가능합니다. 전시장 좌표가 3D 화면과 가이드맵 배치를
            함께 결정하므로, 추가·삭제는 좌표 재설계가 필요합니다.
          </p>
          <ul className="space-y-2">
            {sections.map((sec) => (
              <SectionRow key={sec.id} sec={sec} busy={busy} onSave={(patch) => run(() => callFn('adminSaveSection', { id: sec.id, ...patch }))} />
            ))}
          </ul>
        </>
      )}

      {/* ── 기념품 ── */}
      {tab === 'souvenirs' && (
        <>
          <button
            className="gs-btn-primary h-11 min-h-0 px-4 text-sm"
            onClick={() =>
              setSDraft({
                name: '',
                hint: '',
                shape: 'badge',
                revealAt: toLocal(Date.now() + 86400000),
                stampToHint: 0,
                order: souvenirs.length + 1,
              })
            }
          >
            <Plus size={15} /> 기념품 추가
          </button>

          {sDraft && (
            <div className="gs-card space-y-3 border-2 border-gs-blue p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">{sDraft.id ? '기념품 수정' : '새 기념품'}</h3>
                <button aria-label="닫기" onClick={() => setSDraft(null)} className="text-gs-muted">
                  <X size={18} />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="이름" value={sDraft.name} onChange={(v) => setSDraft({ ...sDraft, name: v })} />
                <label className="block">
                  <span className="block text-xs font-bold text-gs-muted">형태</span>
                  <select
                    className="gs-input mt-1 w-full text-sm"
                    value={sDraft.shape}
                    onChange={(e) => setSDraft({ ...sDraft, shape: e.target.value as Souvenir['shape'] })}
                  >
                    {(['badge', 'keyring', 'kit', 'pen', 'apparel'] as const).map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-gs-muted">공개 시각</span>
                  <input
                    type="datetime-local"
                    className="gs-input mt-1 w-full text-sm"
                    value={sDraft.revealAt}
                    onChange={(e) => setSDraft({ ...sDraft, revealAt: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-bold text-gs-muted">힌트 공개 스탬프 수</span>
                  <input
                    type="number"
                    min={0}
                    max={11}
                    className="gs-input mt-1 w-full text-sm"
                    value={sDraft.stampToHint}
                    onChange={(e) => setSDraft({ ...sDraft, stampToHint: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <F label="힌트 문구" value={sDraft.hint} onChange={(v) => setSDraft({ ...sDraft, hint: v })} />
              <button
                className="gs-btn-primary h-11 min-h-0 px-4 text-sm disabled:opacity-40"
                disabled={busy || !sDraft.name.trim()}
                onClick={async () => {
                  const okDone = await run(() =>
                    callFn('adminSaveSouvenir', {
                      ...(sDraft.id ? { id: sDraft.id } : {}),
                      name: sDraft.name.trim(),
                      hint: sDraft.hint,
                      shape: sDraft.shape,
                      revealAt: Date.parse(`${sDraft.revealAt}:00+09:00`),
                      stampToHint: sDraft.stampToHint,
                      order: sDraft.order,
                    }),
                  );
                  if (okDone) setSDraft(null);
                }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} 저장
              </button>
            </div>
          )}

          <ul className="space-y-2">
            {souvenirs.map((sv) => (
              <li key={sv.id} className="gs-card flex flex-wrap items-center gap-2 p-4">
                <Gift size={16} className="text-gs-blue" />
                <span className="font-semibold">{sv.name}</span>
                <span className="rounded-pill bg-gs-surface px-2 py-0.5 text-xs text-gs-muted">{sv.shape}</span>
                <span className="text-sm text-gs-muted">스탬프 {sv.stampToHint}개에 힌트</span>
                <span className="ml-auto flex gap-1">
                  <button
                    aria-label="수정"
                    className="rounded-lg p-1.5 text-gs-muted hover:bg-gs-surface"
                    onClick={() =>
                      setSDraft({
                        id: sv.id,
                        name: sv.name,
                        hint: sv.hint,
                        shape: sv.shape,
                        revealAt: toLocal(sv.revealAt),
                        stampToHint: sv.stampToHint,
                        order: sv.order,
                      })
                    }
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label="삭제"
                    className="rounded-lg p-1.5 text-state-critical hover:bg-red-50"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`"${sv.name}" 을(를) 삭제할까요?`)) return;
                      void run(() => callFn('adminDeleteSouvenir', { id: sv.id }));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function SectionRow({
  sec,
  busy,
  onSave,
}: {
  sec: Section;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(sec.title);
  const [subtitle, setSubtitle] = useState(sec.subtitle);
  const [open, setOpen] = useState(sec.isOpen);

  const dirty = title !== sec.title || subtitle !== sec.subtitle || open !== sec.isOpen;

  return (
    <li className="gs-card space-y-2 p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gs-blue-light text-xs font-black text-gs-blue">
          {sec.order}
        </span>
        <input className="gs-input flex-1 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <input
        className="gs-input w-full text-sm"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        placeholder="부제"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          공개
        </label>
        <span className="text-xs text-gs-muted">
          필수 {sec.requiredProductIds.length}개 · 최소 체류 {sec.minDwellSec}초 · 예상 {sec.estMinutes}분
        </span>
        <button
          className="gs-btn-primary ml-auto h-9 min-h-0 px-3 text-xs disabled:opacity-40"
          disabled={busy || !dirty}
          onClick={() => onSave({ title, subtitle, isOpen: open })}
        >
          저장
        </button>
      </div>
    </li>
  );
}

function QuizForm({
  productId,
  name,
  busy,
  onClose,
  onSave,
}: {
  productId: string;
  name: string;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '']);
  const [answerIndex, setAnswerIndex] = useState(0);

  return (
    <div className="gs-card space-y-3 border-2 border-gs-mint-dark p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">퀴즈 — {name}</h3>
        <button aria-label="닫기" onClick={onClose} className="text-gs-muted">
          <X size={18} />
        </button>
      </div>
      <p className="rounded-xl bg-gs-surface px-3 py-2 text-xs text-gs-muted">
        정답은 서버에만 저장되며, 경영주 화면이나 감사 로그에 내려가지 않습니다.
      </p>
      <F label="문제" value={question} onChange={setQuestion} />
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name="answer"
            checked={answerIndex === i}
            onChange={() => setAnswerIndex(i)}
            aria-label={`${i + 1}번을 정답으로`}
          />
          <input
            className="gs-input flex-1 text-sm"
            placeholder={`보기 ${i + 1}`}
            value={o}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
          />
        </div>
      ))}
      <button
        className="gs-btn-primary h-11 min-h-0 px-4 text-sm disabled:opacity-40"
        disabled={busy || !question.trim() || options.filter((o) => o.trim()).length < 2}
        onClick={() =>
          onSave({
            productId,
            question: question.trim(),
            options: options.map((o) => o.trim()).filter(Boolean),
            answerIndex,
          })
        }
      >
        퀴즈 저장
      </button>
    </div>
  );
}

function F({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gs-muted">{label}</span>
      <input className="gs-input mt-1 w-full text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function T({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gs-muted">{label}</span>
      <textarea
        className="gs-input mt-1 w-full py-2 text-sm"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
