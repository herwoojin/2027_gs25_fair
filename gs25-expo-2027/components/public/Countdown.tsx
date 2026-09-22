'use client';

import { useEffect, useState } from 'react';
import { countdown } from '@/lib/utils';

const UNITS: [keyof ReturnType<typeof countdown>, string][] = [
  ['days', '일'],
  ['hours', '시'],
  ['minutes', '분'],
  ['seconds', '초'],
];

export function Countdown({ target, compact = false }: { target: number; compact?: boolean }) {
  const [now, setNow] = useState<number | null>(null);

  // 서버·클라이언트 시각 차이로 hydration 경고가 나지 않도록 마운트 후에만 계산한다.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const c = countdown(target, now ?? target);

  return (
    <div className={compact ? 'flex gap-2' : 'flex gap-3 sm:gap-4'} role="timer" aria-live="off">
      {UNITS.map(([key, label]) => (
        <div
          key={key}
          className={
            compact
              ? 'min-w-[3rem] rounded-xl bg-white/15 px-2 py-1.5 text-center'
              : 'min-w-[4.25rem] rounded-2xl bg-white/15 px-3 py-3 text-center backdrop-blur sm:min-w-[5.5rem]'
          }
        >
          <div
            className={
              compact
                ? 'text-xl font-black tabular-nums text-white'
                : 'text-3xl font-black tabular-nums text-white sm:text-4xl'
            }
          >
            {now === null ? '--' : String(c[key] as number).padStart(2, '0')}
          </div>
          <div className="text-xs font-semibold text-white/70">{label}</div>
        </div>
      ))}
    </div>
  );
}
