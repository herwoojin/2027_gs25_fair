'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { callFn } from '@/lib/api';

/**
 * 접속 혼잡도 배지 — 원활함 / 혼잡 / 과다접속중.
 *
 * 동시 접속이 몰리면 화면이 느려지거나 멈출 수 있다. 그 전에 사용자가 상황을
 * 알아차리도록 상태를 계속 보여 준다. 숫자(몇 명)는 내부 지표라 노출하지 않고
 * 상태 문구만 보여 준다.
 *
 * 폴링은 45초. 탭이 백그라운드면 멈춘다(불필요한 요청이 곧 부하다).
 */

type Level = 'ok' | 'busy' | 'full';

const STYLE: Record<Level, { dot: string; bg: string; fg: string }> = {
  ok: { dot: '#43a047', bg: 'rgba(67,160,71,0.12)', fg: '#2e7d32' },
  busy: { dot: '#f9a825', bg: 'rgba(249,168,37,0.14)', fg: '#a86a00' },
  full: { dot: '#e53935', bg: 'rgba(229,57,53,0.14)', fg: '#c62828' },
};

export function CapacityBadge({ className }: { className?: string }) {
  const [state, setState] = useState<{ level: Level; label: string } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (document.hidden) {
        schedule();
        return;
      }
      try {
        const r = await callFn<{ level: Level; label: string }>('getCapacity');
        if (alive) setState({ level: r.level, label: r.label });
      } catch {
        // 혼잡도를 못 읽는다고 화면을 막지 않는다 — 배지만 숨긴다.
        if (alive) setState(null);
      }
      schedule();
    };
    const schedule = () => {
      if (!alive) return;
      timer = setTimeout(tick, 45_000);
    };

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!state) return null;
  const s = STYLE[state.level];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-bold ${className ?? ''}`}
      style={{ background: s.bg, color: s.fg }}
      title="현재 접속 상황"
      role="status"
      aria-live="polite"
    >
      <Users size={12} aria-hidden />
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: s.dot,
          animation: state.level === 'ok' ? undefined : 'pulse 1.4s ease-in-out infinite',
        }}
      />
      {state.label}
    </span>
  );
}
