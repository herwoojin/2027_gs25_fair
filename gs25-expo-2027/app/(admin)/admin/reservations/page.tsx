'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { QrCode, Users } from 'lucide-react';
import type { ExpoEvent, Reservation, Slot } from '@/types';
import { SLOT_TIMES } from '@/types';
import { callFn } from '@/lib/api';
import { cn, formatDateKo } from '@/lib/utils';

type Row = Reservation & { storeName: string; city: string };

/** T8-6 · 예약·체크인 현황 */
export default function AdminReservationsPage() {
  const [eventId, setEventId] = useState<string | undefined>();

  const { data } = useQuery({
    queryKey: ['adminReservations', eventId],
    queryFn: () =>
      callFn<{ reservations: Row[]; slots: Slot[]; events: ExpoEvent[] }>('adminReservations', { eventId }),
    refetchInterval: 30_000,
  });

  const events = (data?.events ?? []).sort((a, b) => a.order - b.order);
  const slots = (data?.slots ?? []).filter((s) => (eventId ? s.eventId === eventId : true));
  const totalCap = slots.reduce((a, s) => a + s.capacity, 0);
  const totalRes = slots.reduce((a, s) => a + s.reservedCount, 0);
  const totalIn = slots.reduce((a, s) => a + s.checkedInCount, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">예약 · 체크인</h1>
          <p className="text-sm text-gs-muted">
            정원 {totalCap.toLocaleString()} · 예약 {totalRes.toLocaleString()} · 체크인{' '}
            {totalIn.toLocaleString()}
          </p>
        </div>
        <Link href="/admin/reservations/checkin" className="gs-btn-primary h-10 min-h-0 text-sm">
          <QrCode size={16} /> QR 체크인 열기
        </Link>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button className={cn('gs-chip shrink-0', !eventId && 'gs-chip-on')} onClick={() => setEventId(undefined)}>
          전체
        </button>
        {events.map((e) => (
          <button
            key={e.id}
            className={cn('gs-chip shrink-0', eventId === e.id && 'gs-chip-on')}
            onClick={() => setEventId(e.id)}
          >
            {e.city}
          </button>
        ))}
      </div>

      {/* 타임별 혼잡도 */}
      <section className="gs-card overflow-x-auto p-4">
        <h2 className="mb-3 text-base font-bold">타임별 예약 현황</h2>
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="text-left text-gs-muted">
            <tr className="border-b border-gs-line">
              <th className="py-2 pr-3 font-semibold">날짜</th>
              <th className="py-2 pr-3 font-semibold">타임</th>
              <th className="py-2 pr-3 font-semibold">예약/정원</th>
              <th className="py-2 pr-3 font-semibold">혼잡도</th>
              <th className="py-2 font-semibold">체크인</th>
            </tr>
          </thead>
          <tbody>
            {slots
              .filter((s) => s.reservedCount > 0 || eventId)
              .slice(0, 40)
              .map((s) => {
                const pct = (s.reservedCount / Math.max(1, s.capacity)) * 100;
                return (
                  <tr key={s.id} className="border-b border-gs-line/60">
                    <td className="whitespace-nowrap py-2 pr-3">{s.date.slice(5)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{SLOT_TIMES[s.slotNo]}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-semibold">
                      {s.reservedCount}/{s.capacity}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="h-2 w-28 overflow-hidden rounded-pill bg-gs-line">
                        <div
                          className={cn(
                            'h-full rounded-pill',
                            pct >= 100 ? 'bg-state-critical' : pct >= 85 ? 'bg-state-danger' : 'bg-gs-blue',
                          )}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2">{s.checkedInCount}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>

      {/* 예약 목록 */}
      <section className="gs-card overflow-x-auto">
        <h2 className="border-b border-gs-line px-4 py-3 text-base font-bold">
          예약 목록 {data?.reservations.length ?? 0}건
        </h2>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-gs-surface text-left text-gs-muted">
            <tr>
              {['점포', '도시', '날짜', '타임', '각인 문구', '상태'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.reservations ?? []).map((r) => (
              <tr key={r.id} className="border-b border-gs-line/60">
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{r.storeName}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.city}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{formatDateKo(r.date)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{SLOT_TIMES[r.slotNo]}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.engravingText || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span
                    className={cn(
                      'rounded-pill px-2 py-0.5 text-xs font-bold',
                      r.status === 'checked_in'
                        ? 'bg-gs-mint/20 text-gs-mint-dark'
                        : r.status === 'cancelled'
                          ? 'bg-gs-line text-gs-muted'
                          : 'bg-gs-blue-light text-gs-blue',
                    )}
                  >
                    {r.status === 'checked_in' ? '체크인' : r.status === 'cancelled' ? '취소' : '예약'}
                  </span>
                </td>
              </tr>
            ))}
            {(data?.reservations.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gs-muted">
                  <Users className="mx-auto mb-2" size={22} />
                  아직 예약이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
