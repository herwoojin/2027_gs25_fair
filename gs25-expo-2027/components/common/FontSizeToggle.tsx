'use client';

import { useSession } from '@/lib/hooks/useSession';
import { cn } from '@/lib/utils';

const STEPS = [
  { scale: 1, label: '가', title: '보통' },
  { scale: 1.15, label: '가+', title: '크게' },
  { scale: 1.3, label: '가++', title: '아주 크게' },
];

/** T0-4 · 글자 크게 토글 (50~60대 경영주 고려) */
export function FontSizeToggle({ className }: { className?: string }) {
  const { fontScale, setFontScale } = useSession();
  return (
    <div
      className={cn('flex items-center gap-1 rounded-pill border border-gs-line bg-white p-1', className)}
      role="group"
      aria-label="글자 크기"
    >
      {STEPS.map((s) => (
        <button
          key={s.scale}
          type="button"
          title={`글자 ${s.title}`}
          aria-pressed={Math.abs(fontScale - s.scale) < 0.01}
          onClick={() => setFontScale(s.scale)}
          className={cn(
            'min-h-[2.25rem] rounded-pill px-2.5 text-sm font-bold transition',
            Math.abs(fontScale - s.scale) < 0.01
              ? 'bg-gs-blue text-white'
              : 'text-gs-muted hover:bg-gs-surface',
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
