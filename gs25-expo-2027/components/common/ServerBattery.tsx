'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Level = 'ok' | 'warn' | 'danger' | 'critical' | 'offline';

interface Health {
  ok: boolean;
  uptimeSec: number | null;
  memory: { usedMB: number; totalMB: number; percent: number } | null;
  cpuLoad1m: number | null;
  disk: { usedMB: number; totalMB: number; percent: number } | null;
  level: Exclude<Level, 'offline'>;
  reason: string;
}

const COLOR: Record<Level, string> = {
  ok: '#43a047',
  warn: '#fbc02d',
  danger: '#f57c00',
  critical: '#e53935',
  offline: '#9e9e9e',
};

const LABEL: Record<Level, string> = {
  ok: '여유',
  warn: '주의',
  danger: '경고',
  critical: '위험',
  offline: '연결 끊김',
};

/**
 * 백엔드 서버 용량 신호등.
 * 우측 하단 고정, 30초 폴링(백그라운드 탭에서는 정지), 3회 연속 실패 시 offline.
 */
export function ServerBattery() {
  const [health, setHealth] = useState<Health | null>(null);
  const [level, setLevel] = useState<Level>('ok');
  const [open, setOpen] = useState(false);
  const failures = useRef(0);

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/server-health', { cache: 'no-store' });
      const data: Health = await res.json();
      failures.current = 0;
      setHealth(data);
      setLevel(data.ok ? data.level : 'critical');
    } catch {
      failures.current += 1;
      if (failures.current >= 3) setLevel('offline');
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(poll, 30_000);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  // 채움률 = 여유 용량
  const worst = Math.max(health?.memory?.percent ?? 0, health?.disk?.percent ?? 0);
  const fill = level === 'offline' ? 0 : Math.max(4, Math.min(100, 100 - worst));

  const anim =
    level === 'critical'
      ? 'animate-battery-pulse'
      : level === 'danger'
        ? 'animate-battery-danger'
        : level === 'warn'
          ? 'animate-battery-warn'
          : '';

  return (
    <div
      className="fixed z-[60] flex flex-col items-end gap-2"
      style={{ right: 12, bottom: `calc(12px + env(safe-area-inset-bottom))` }}
    >
      {open && (
        <div className="w-60 rounded-xl border border-gs-line bg-white/98 p-3 text-sm shadow-lift backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-bold">서버 용량</span>
            <span className="font-semibold" style={{ color: COLOR[level] }}>
              {LABEL[level]}
            </span>
          </div>
          {level === 'offline' || !health ? (
            <div className="space-y-2">
              <p className="text-gs-muted">서버 상태를 확인할 수 없습니다.</p>
              <button
                className="gs-btn-ghost h-9 w-full text-sm"
                onClick={() => {
                  failures.current = 0;
                  void poll();
                }}
              >
                다시 시도
              </button>
            </div>
          ) : (
            <dl className="space-y-1 text-gs-muted">
              <Row label="메모리" value={health.memory ? `${health.memory.usedMB}MB / ${health.memory.totalMB}MB (${health.memory.percent}%)` : '—'} />
              <Row label="디스크" value={health.disk ? `${health.disk.percent}%` : '—'} />
              <Row label="CPU(1분)" value={health.cpuLoad1m != null ? String(health.cpuLoad1m) : '—'} />
              <Row label="업타임" value={health.uptimeSec != null ? `${Math.floor(health.uptimeSec / 60)}분` : '—'} />
              {health.reason && <p className="pt-1 text-gs-ink">{health.reason}</p>}
            </dl>
          )}
        </div>
      )}

      <button
        type="button"
        aria-label={`서버 용량 ${LABEL[level]}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 min-h-0 items-center gap-1 rounded-lg border border-gs-line bg-white/90 px-2 shadow-card backdrop-blur transition hover:shadow-lift',
          anim,
        )}
      >
        <span className="relative flex h-5 w-10 items-center rounded-[4px] border-2 p-[2px]" style={{ borderColor: COLOR[level] }}>
          <span
            className="h-full rounded-[1px] transition-all duration-700"
            style={{ width: `${fill}%`, background: COLOR[level] }}
          />
          <span
            className="absolute -right-[5px] top-1/2 h-2 w-[3px] -translate-y-1/2 rounded-r"
            style={{ background: COLOR[level] }}
          />
        </span>
        {level === 'offline' && <span className="text-xs font-bold text-state-critical">!</span>}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="text-right font-medium text-gs-ink">{value}</dd>
    </div>
  );
}
