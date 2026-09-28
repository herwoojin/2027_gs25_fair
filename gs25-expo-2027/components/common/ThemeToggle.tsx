'use client';

import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, BookOpen } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/lib/hooks/useTheme';
import { cn } from '@/lib/utils';

const MODES: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
  { mode: 'light', icon: Sun, label: '밝은 모드' },
  { mode: 'dark', icon: Moon, label: '어두운 모드' },
  { mode: 'paper', icon: BookOpen, label: '편안한 모드' },
];

/**
 * 상단 헤더에 놓는 동그란 보기 모드 버튼.
 *
 * `tone='onDark'` 는 랜딩 히어로처럼 **항상 어두운** 바탕 위에 놓일 때 쓴다.
 * 그 자리는 영상 위라 모드와 무관하게 어두우므로, 토큰을 따르면 오히려 묻힌다.
 */
export function ThemeToggle({
  className,
  tone = 'app',
}: {
  className?: string;
  tone?: 'app' | 'onDark';
}) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = MODES.find((m) => m.mode === theme) ?? MODES[0];
  const Icon = current.icon;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        className={cn(
          'grid h-9 w-9 place-items-center rounded-full border transition active:scale-95',
          tone === 'onDark'
            ? 'border-white/25 text-white/85 backdrop-blur hover:bg-white/10'
            : 'border-gs-line bg-gs-card text-gs-muted hover:bg-gs-surface hover:text-gs-ink',
        )}
        onClick={() => setOpen(!open)}
        aria-label={`현재 ${current.label} — 변경`}
        title={current.label}
      >
        <Icon size={17} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-gs-line bg-gs-card shadow-lg">
          {MODES.map((m) => (
            <button
              key={m.mode}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold transition',
                theme === m.mode
                  ? 'bg-gs-blue-light text-gs-blue'
                  : 'text-gs-muted hover:bg-gs-surface hover:text-gs-ink',
              )}
              onClick={() => {
                setTheme(m.mode);
                setOpen(false);
              }}
            >
              <m.icon size={16} />
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
