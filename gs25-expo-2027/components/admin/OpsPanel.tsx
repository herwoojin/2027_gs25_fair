'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Database, Loader2, Trash2, Users } from 'lucide-react';
import { callFn, type ApiError } from '@/lib/api';

/**
 * 운영 전환 패널.
 *
 * 시연용으로 넣어 둔 허수(점포 50개·질문·응원)가 대시보드 숫자에 섞이면
 * 실제 참여 현황을 읽을 수 없다. 무엇이 허수인지 정확히 보여 주고 한 번에 지운다.
 * 함께 실시간 동시접속도 보여 준다.
 */

interface Counts {
  stores: number;
  questions: number;
  cheers: number;
  total?: number;
}
interface Real extends Counts {
  users: number;
  reservations: number;
  coupons: number;
}
interface Capacity {
  active: number;
  limit: number;
  percent: number;
  level: 'ok' | 'busy' | 'full';
  label: string;
}

const LEVEL_STYLE: Record<Capacity['level'], { bg: string; fg: string }> = {
  ok: { bg: '#e8f5e9', fg: '#2e7d32' },
  busy: { bg: '#fff8e1', fg: '#b26a00' },
  full: { bg: '#ffebee', fg: '#c62828' },
};

export function OpsPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data, refetch } = useQuery({
    queryKey: ['adminDataStatus'],
    queryFn: () => callFn<{ demo: Counts; real: Real; capacity: Capacity }>('adminDataStatus'),
    refetchInterval: 30_000,
  });

  const purge = async () => {
    const d = data?.demo;
    if (!d) return;
    const msg = `시연용 데이터를 지웁니다.\n\n점포 ${d.stores} · 질문 ${d.questions} · 응원 ${d.cheers}\n\n되돌릴 수 없습니다. 진행할까요?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    try {
      await callFn('adminPurgeDemo', { confirm: true });
      await refetch();
    } catch (e) {
      setError((e as ApiError).message ?? '정리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const cap = data?.capacity;
  const style = cap ? LEVEL_STYLE[cap.level] : LEVEL_STYLE.ok;
  const demoTotal = (data?.demo.stores ?? 0) + (data?.demo.questions ?? 0) + (data?.demo.cheers ?? 0);

  return (
    <section className="grid gap-3 lg:grid-cols-2">
      {/* 실시간 접속 */}
      <div className="gs-card p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gs-ink">
          <Users size={15} className="text-gs-blue" /> 실시간 동시접속
        </p>
        {cap ? (
          <>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-black tabular-nums text-gs-ink">{cap.active}</span>
              <span className="pb-1 text-sm text-gs-muted">/ {cap.limit}명</span>
              <span
                className="mb-1 ml-auto rounded-pill px-3 py-1 text-sm font-bold"
                style={{ background: style.bg, color: style.fg }}
              >
                {cap.label}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-gs-surface">
              <div
                className="h-full rounded-pill transition-all duration-500"
                style={{ width: `${Math.min(100, cap.percent)}%`, background: style.fg }}
              />
            </div>
            <p className="mt-2 text-xs text-gs-muted">
              최근 3분 안에 활동한 로그인 세션 기준 · 30초마다 갱신
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-gs-muted">불러오는 중…</p>
        )}
      </div>

      {/* 데이터 현황 */}
      <div className="gs-card p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gs-ink">
          <Database size={15} className="text-gs-blue" /> 데이터 현황
        </p>
        {data ? (
          <>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Stat label="점포" real={data.real.stores} demo={data.demo.stores} />
              <Stat label="질문" real={data.real.questions} demo={data.demo.questions} />
              <Stat label="응원" real={data.real.cheers} demo={data.demo.cheers} />
            </dl>
            {demoTotal > 0 ? (
              <>
                <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  시연용 데이터 {demoTotal}건이 집계에 섞여 있습니다. 운영 전에 정리하세요.
                </p>
                <button
                  onClick={purge}
                  disabled={busy}
                  className="gs-btn mt-2 h-10 min-h-0 w-full border border-state-critical px-3 text-sm font-bold text-state-critical disabled:opacity-40"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  시연용 데이터 정리
                </button>
              </>
            ) : (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                시연용 데이터 없음 — 실제 운영 데이터만 집계됩니다.
              </p>
            )}
            {error && <p className="mt-2 text-xs font-semibold text-state-critical">{error}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-gs-muted">불러오는 중…</p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, real, demo }: { label: string; real: number; demo: number }) {
  return (
    <div className="rounded-xl bg-gs-surface px-2 py-2">
      <dt className="text-xs text-gs-muted">{label}</dt>
      <dd className="text-lg font-black tabular-nums text-gs-ink">{real.toLocaleString('ko-KR')}</dd>
      {demo > 0 && <dd className="text-[0.68rem] font-bold text-amber-700">시연 {demo}</dd>}
    </div>
  );
}
