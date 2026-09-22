'use client';

import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import type { Product, ProductProgress, Section } from '@/types';
import { cn } from '@/lib/utils';

/** 섹션 상품 리스트 — 데스크톱 사이드, 모바일 하단(스크롤) */
export function ProductListPanel({
  section,
  products,
  progress,
  variant = 'list',
}: {
  section: Section;
  products: Product[];
  progress: Record<string, ProductProgress>;
  variant?: 'list' | 'grid';
}) {
  const required = new Set(section.requiredProductIds);

  if (variant === 'grid') {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const done = !!progress[p.id]?.doneAt;
          return (
            <Link
              key={p.id}
              href={`/zone/${section.slug}/product/${p.id}`}
              className="gs-card group flex flex-col p-4 transition hover:shadow-lift"
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className="rounded-pill px-2.5 py-1 text-xs font-bold text-white"
                  style={{ background: p.color ?? '#0056b3' }}
                >
                  {p.category}
                </span>
                {done && (
                  <span className="flex items-center gap-1 text-sm font-bold text-gs-mint-dark">
                    <Check size={16} /> 완료
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold leading-snug">{p.name}</h3>
              <ul className="mt-2 flex-1 space-y-1 text-sm text-gs-muted">
                {p.summary3.slice(0, 2).map((s, i) => (
                  <li key={i} className="line-clamp-2">
                    · {s}
                  </li>
                ))}
              </ul>
              <span className="mt-3 flex items-center gap-1 text-sm font-semibold text-gs-blue">
                자세히 보기 <ChevronRight size={15} />
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <aside className="gs-card overflow-hidden">
      <header className="border-b border-gs-line px-4 py-3">
        <h2 className="text-base font-bold">상품 {products.length}개</h2>
        <p className="text-sm text-gs-muted">
          필수 {section.requiredProductIds.length}개를 모두 완료하면 스탬프가 찍힙니다.
        </p>
      </header>
      <ul className="max-h-[46vh] divide-y divide-gs-line overflow-y-auto lg:max-h-[54vh]">
        {products.map((p) => {
          const done = !!progress[p.id]?.doneAt;
          return (
            <li key={p.id}>
              <Link
                href={`/zone/${section.slug}/product/${p.id}`}
                className="flex min-h-[4rem] items-center gap-3 px-4 py-3 transition hover:bg-gs-surface"
              >
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold text-white',
                    done && 'opacity-50',
                  )}
                  style={{ background: p.color ?? '#0056b3' }}
                >
                  {done ? <Check size={16} /> : String(p.order).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-base font-semibold">{p.name}</span>
                    {required.has(p.id) && (
                      <span className="shrink-0 rounded px-1 text-[0.65rem] font-bold text-gs-blue ring-1 ring-gs-blue/40">
                        필수
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-sm text-gs-muted">{p.summary3[0]}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-gs-line" />
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
