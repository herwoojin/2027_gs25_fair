'use client';

import type { Section } from '@/types';
import { cn } from '@/lib/utils';

/** T3-3 · 상단 진행바 — 스탬프 n/11 */
export function StampProgressBar({
  sections,
  stamps,
  compact = false,
}: {
  sections: Section[];
  stamps: Record<string, number>;
  compact?: boolean;
}) {
  const total = sections.length || 11;
  const got = sections.filter((s) => stamps[s.id]).length;
  const pct = Math.round((got / total) * 100);

  return (
    <div className={cn('gs-card p-3', compact && 'border-0 bg-transparent p-0 shadow-none')}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gs-muted">내 스탬프</span>
        <span className="text-lg font-black text-gs-blue">
          {got}
          <span className="text-sm font-bold text-gs-muted">/{total}</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-pill bg-gs-line">
        <div
          className="h-full rounded-pill bg-gradient-to-r from-gs-blue to-gs-mint transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="mt-2.5 flex gap-1" aria-hidden>
        {sections.map((s) => (
          <li
            key={s.id}
            title={s.title}
            className={cn(
              'h-2 flex-1 rounded-pill transition-colors',
              stamps[s.id] ? 'bg-gs-mint' : 'bg-gs-line',
            )}
          />
        ))}
      </ol>
    </div>
  );
}
