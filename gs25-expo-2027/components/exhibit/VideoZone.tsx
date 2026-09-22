'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock } from 'lucide-react';
import type { HeroMessage, Product, Section } from '@/types';
import { callFn } from '@/lib/api';
import { useExhibit } from '@/lib/hooks/useExhibit';
import { MediaPlayer } from './MediaPlayer';

/**
 * T3-6 · 웰컴존 / 미디어 시청.
 * 대표님 → 셀럽 순서로 영상을 재생하고, 각 영상 90% 시청 시 서버에 consumed 를 보낸다.
 * visibleUntil 이 지난 셀럽 영상은 목록에서 제외된다(초상권 사용기간).
 */
export function VideoZone({
  section,
  products,
  messages,
}: {
  section: Section;
  products: Product[];
  messages: HeroMessage[];
}) {
  const { data: index } = useQuery({
    queryKey: ['exhibitIndex'],
    queryFn: () => callFn<{ sections: Section[] }>('getExhibitIndex'),
    staleTime: 10 * 60 * 1000,
  });
  const { progress, enter, consumed } = useExhibit(index?.sections ?? []);
  const [current, setCurrent] = useState(0);

  const now = Date.now();
  const items = products
    .map((p) => ({ product: p, message: messages.find((m) => m.id === p.id) ?? null }))
    .filter(({ message }) => !message?.visibleUntil || message.visibleUntil > now);

  const active = items[Math.min(current, items.length - 1)];

  useEffect(() => {
    if (active) void enter(active.product.id);
  }, [active, enter]);

  if (!active) return <p className="gs-card p-6 text-gs-muted">재생할 영상이 없습니다.</p>;

  const done = progress?.products ?? {};

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <MediaPlayer
            key={active.product.id}
            src={null /* 운영: Storage 서명 URL */}
            durationSec={active.message?.durationSec ?? 120}
            captionSrc={null}
            autoPlayMuted
            onConsumed={() => {
              void consumed(active.product.id);
              // 다음 영상으로 자동 이어보기
              if (current < items.length - 1) setTimeout(() => setCurrent((c) => c + 1), 1500);
            }}
          />
          <div>
            <h2 className="text-xl font-bold">{active.message?.title ?? active.product.name}</h2>
            <p className="text-sm text-gs-muted">{active.message?.speaker ?? active.product.category}</p>
            <ul className="mt-3 space-y-1.5">
              {active.product.summary3.map((s, i) => (
                <li key={i} className="flex gap-2 text-base text-gs-ink">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gs-mint" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="gs-card overflow-hidden">
          <h3 className="border-b border-gs-line px-4 py-3 text-base font-bold">
            재생 목록 {items.length}개
          </h3>
          <ul className="divide-y divide-gs-line">
            {items.map((it, i) => {
              const isDone = !!done[it.product.id]?.doneAt;
              return (
                <li key={it.product.id}>
                  <button
                    onClick={() => setCurrent(i)}
                    className={`flex min-h-[3.5rem] w-full items-center gap-3 px-4 py-3 text-left transition ${
                      i === current ? 'bg-gs-blue-light' : 'hover:bg-gs-surface'
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gs-ink text-xs font-bold text-white">
                      {isDone ? <Check size={15} /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold">
                        {it.message?.title ?? it.product.name}
                      </span>
                      <span className="flex items-center gap-1 text-sm text-gs-muted">
                        <Clock size={13} />
                        {Math.round((it.message?.durationSec ?? 120) / 60)}분
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {/* 오늘의 동선 안내 (웰컴존 전용) */}
      {section.slug === 'welcome' && index?.sections && (
        <section>
          <h3 className="gs-section-title mb-3">오늘의 동선</h3>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {index.sections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/zone/${s.slug}`}
                    className="gs-card flex min-h-[3.75rem] items-center gap-3 px-3 py-2.5 transition hover:shadow-lift"
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-black text-white"
                      style={{ background: s.color ?? '#0056b3' }}
                    >
                      {String(s.order).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{s.title}</span>
                      <span className="block text-sm text-gs-muted">약 {s.estMinutes}분</span>
                    </span>
                  </Link>
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  );
}
