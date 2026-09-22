'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Image as ImageIcon, MonitorSmartphone, Quote } from 'lucide-react';
import type { HeroMessage, PopupNews, Quiz, Section, Souvenir } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';
import { cn, formatDateKo } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

interface ContentData {
  sections: Section[];
  products: (Omit<Section, 'id'> & { id: string; name: string; sectionId: string; category: string; order: number; scriptLength: number; hasAiContext: boolean })[];
  quizzes: Quiz[];
  popupNews: PopupNews[];
  souvenirs: Souvenir[];
  messages: HeroMessage[];
}

const TABS = [
  { key: 'sections', label: '섹션 · 상품', icon: Boxes },
  { key: 'quizzes', label: '퀴즈', icon: Quote },
  { key: 'popup', label: '팝업 뉴스', icon: ImageIcon },
  { key: 'system', label: '시스템', icon: MonitorSmartphone },
] as const;

/** T8-5 · 콘텐츠 관리 */
export default function AdminContentPage() {
  const toast = useToast();
  const { config, refresh } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('sections');

  const { data } = useQuery({
    queryKey: ['adminContent'],
    queryFn: () => callFn<ContentData>('adminContent'),
  });

  const toggle2D = async (value: boolean) => {
    try {
      await callFn('adminSetConfig', { force2D: value });
      await refresh();
      toast.push(value ? '전체 2D 모드로 전환했습니다.' : '3D 모드를 다시 허용했습니다.', 'success');
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">콘텐츠 관리</h1>
        <p className="text-sm text-gs-muted">
          섹션·상품·퀴즈·팝업 데이터를 확인하고 장애 시 전체 2D 모드를 켤 수 있습니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} className={cn('gs-chip', tab === t.key && 'gs-chip-on')} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'sections' && (
        <div className="space-y-3">
          {(data?.sections ?? [])
            .sort((a, b) => a.order - b.order)
            .map((s) => {
              const items = (data?.products ?? []).filter((p) => p.sectionId === s.id);
              return (
                <section key={s.id} className="gs-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-lg text-xs font-black text-white"
                      style={{ background: s.color ?? '#0056b3' }}
                    >
                      {String(s.order).padStart(2, '0')}
                    </span>
                    <h2 className="text-base font-bold">{s.title}</h2>
                    <span className="gs-chip min-h-0 py-0.5 text-xs">{s.type}</span>
                    <span className="text-sm text-gs-muted">
                      필수 {s.requiredProductIds.length}개 · 최소 체류 {s.minDwellSec}초 · 예상 {s.estMinutes}분
                    </span>
                  </div>
                  <ul className="mt-3 divide-y divide-gs-line/70">
                    {items.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="w-6 text-gs-muted">{p.order}</span>
                        <span className="flex-1 font-semibold">{p.name}</span>
                        <span className="text-gs-muted">{p.category}</span>
                        <span className="text-gs-muted">원고 {p.scriptLength}자</span>
                        {s.requiredProductIds.includes(p.id) && (
                          <span className="rounded px-1.5 text-xs font-bold text-gs-blue ring-1 ring-gs-blue/40">
                            필수
                          </span>
                        )}
                        {p.hasAiContext && <span className="text-xs text-gs-mint-dark">AI자료</span>}
                      </li>
                    ))}
                    {items.length === 0 && <li className="py-2 text-sm text-gs-muted">등록된 상품이 없습니다.</li>}
                  </ul>
                </section>
              );
            })}
        </div>
      )}

      {tab === 'quizzes' && (
        <ul className="space-y-2">
          {(data?.quizzes ?? []).map((q) => (
            <li key={q.id} className="gs-card p-4">
              <p className="text-xs font-mono text-gs-muted">{q.id}</p>
              <p className="mt-1 font-bold">{q.question}</p>
              <ol className="mt-2 grid gap-1 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <li key={i} className="rounded-lg bg-gs-surface px-3 py-1.5 text-sm">
                    {i + 1}. {o}
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-gs-muted">
                정답은 서버(quizAnswers)에만 저장되며 이 화면에도 내려오지 않습니다.
              </p>
            </li>
          ))}
        </ul>
      )}

      {tab === 'popup' && (
        <ul className="space-y-2">
          {(data?.popupNews ?? []).map((p) => (
            <li key={p.id} className="gs-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="gs-chip min-h-0 py-0.5 text-xs">{p.target === 'public' ? '공개 랜딩' : '앱 내부'}</span>
                <span className="text-sm text-gs-muted">우선순위 {p.priority}</span>
                <span className="text-sm text-gs-muted">
                  {formatDateKo(p.startAt)} ~ {formatDateKo(p.endAt)}
                </span>
              </div>
              <p className="mt-1.5 font-bold">{p.title}</p>
              <p className="whitespace-pre-line text-sm text-gs-muted">{p.body}</p>
            </li>
          ))}
        </ul>
      )}

      {tab === 'system' && (
        <div className="space-y-3">
          <section className="gs-card p-4">
            <h2 className="text-base font-bold">전체 2D 모드 강제</h2>
            <p className="mt-1 text-sm text-gs-muted">
              3D 로딩 지연·장애 시 모든 사용자를 2D 평면도로 전환합니다. (GUIDE 8.2 장애 대응)
            </p>
            <button
              className={cn('mt-3', config.force2D ? 'gs-btn-ghost' : 'gs-btn-primary')}
              onClick={() => toggle2D(!config.force2D)}
            >
              {config.force2D ? '3D 다시 허용' : '전체 2D 모드 켜기'}
            </button>
          </section>

          <section className="gs-card p-4">
            <h2 className="text-base font-bold">행사 일정</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <Row label="온라인 오픈" value={formatDateKo(config.openAt, true)} />
              <Row label="순회 시작 (D-day)" value={formatDateKo(config.tourStartAt, true)} />
              <Row label="온라인 마감" value={formatDateKo(config.closeAt, true)} />
            </dl>
          </section>

          <section className="gs-card p-4">
            <h2 className="text-base font-bold">기념품 공개 일정</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(data?.souvenirs ?? []).map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{s.name}</span>
                  <span className="text-gs-muted">
                    스탬프 {s.stampToHint}개 힌트 · {formatDateKo(s.revealAt)} 공개
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="gs-card p-4">
            <h2 className="text-base font-bold">영상 메시지</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(data?.messages ?? []).map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>
                    {m.title} <span className="text-gs-muted">({m.kind})</span>
                  </span>
                  <span className="text-gs-muted">
                    {m.visibleUntil ? `${formatDateKo(m.visibleUntil)}까지` : '기간 제한 없음'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gs-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
