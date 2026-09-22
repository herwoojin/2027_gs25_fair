'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { CalendarDays, Check, MapPin, Users } from 'lucide-react';
import type { ExpoEvent, Reservation, Slot } from '@/types';
import { SLOT_TIMES } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';
import { cn, formatDateKo } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

export default function ReservePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-6"><div className="gs-skeleton h-72 w-full" /></div>}>
      <ReserveInner />
    </Suspense>
  );
}

/** T7-2 ⚡ · 타임 예약 (도시 → 날짜 → 3개 타임, 1점포 1예약, 전일 18시 마감) */
function ReserveInner() {
  const search = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();

  const [city, setCity] = useState<string | null>(search.get('city'));
  const [date, setDate] = useState<string | null>(null);
  const [slotNo, setSlotNo] = useState<number | null>(null);
  const [engraving, setEngraving] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: schedule } = useQuery({
    queryKey: ['offlineSchedule'],
    queryFn: () => callFn<{ events: ExpoEvent[]; slots: Slot[] }>('getOfflineSchedule'),
    staleTime: 60_000,
  });

  const { data: mine } = useQuery({
    queryKey: ['myReservation'],
    queryFn: () => callFn<{ reservation: Reservation | null; event: ExpoEvent | null }>('myReservation'),
  });

  useEffect(() => {
    if (!engraving && user?.displayName) setEngraving(user.displayName.slice(0, 12));
  }, [user, engraving]);

  const events = useMemo(() => (schedule?.events ?? []).sort((a, b) => a.order - b.order), [schedule]);
  const dates = useMemo(
    () => [...new Set((schedule?.slots ?? []).filter((s) => s.eventId === city).map((s) => s.date))].sort(),
    [schedule, city],
  );
  const slots = (schedule?.slots ?? []).filter((s) => s.eventId === city && s.date === date);

  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const deadlinePassed = (d: string) => {
    const deadline = new Date(`${d}T18:00:00+09:00`).getTime() - 86400000;
    return Date.now() > deadline;
  };

  const submit = async () => {
    if (!city || !date || !slotNo) return;
    setBusy(true);
    try {
      await callFn('reserveSlot', {
        eventId: city,
        date,
        slotNo,
        partySize: 1,
        engravingText: engraving.trim(),
      });
      toast.push('예약이 확정되었습니다. 확정 문자를 보내 드렸습니다.', 'success');
      await qc.invalidateQueries({ queryKey: ['myReservation'] });
      await qc.invalidateQueries({ queryKey: ['offlineSchedule'] });
      setSlotNo(null);
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await callFn('cancelReservation');
      toast.push('예약이 취소되었습니다.', 'info');
      await qc.invalidateQueries({ queryKey: ['myReservation'] });
      await qc.invalidateQueries({ queryKey: ['offlineSchedule'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">방문 예약</h1>
        <p className="mt-1 text-gs-muted">
          한 점포당 한 건만 예약됩니다. 변경·취소는 방문 전날 18시까지 가능합니다.
        </p>
      </header>

      {mine?.reservation && mine.event && (
        <CurrentReservation
          reservation={mine.reservation}
          event={mine.event}
          onCancel={cancel}
          busy={busy}
          canChange={!deadlinePassed(mine.reservation.date)}
        />
      )}

      {/* 1) 도시 */}
      <section className="mt-5">
        <h2 className="mb-2 text-base font-bold">1. 도시 선택</h2>
        <div className="flex flex-wrap gap-2">
          {events.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                setCity(e.id);
                setDate(null);
                setSlotNo(null);
              }}
              className={cn('gs-chip', city === e.id && 'gs-chip-on', e.endDate < today && 'opacity-45')}
            >
              {e.city}
            </button>
          ))}
        </div>
      </section>

      {/* 2) 날짜 */}
      {city && (
        <section className="mt-5">
          <h2 className="mb-2 text-base font-bold">2. 날짜 선택</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {dates.map((d) => {
              const closed = deadlinePassed(d);
              return (
                <button
                  key={d}
                  disabled={closed}
                  onClick={() => {
                    setDate(d);
                    setSlotNo(null);
                  }}
                  className={cn(
                    'flex min-h-[3.75rem] flex-col items-center justify-center rounded-xl border-2 text-sm font-bold transition',
                    date === d ? 'border-gs-blue bg-gs-blue-light text-gs-blue' : 'border-gs-line',
                    closed && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span>
                    {new Date(`${d}T00:00:00+09:00`).toLocaleDateString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-xs font-semibold text-gs-muted">
                    {new Date(`${d}T00:00:00+09:00`).toLocaleDateString('ko-KR', { weekday: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>
          {dates.every(deadlinePassed) && (
            <p className="mt-2 text-sm text-state-critical">이 도시는 예약이 마감되었습니다.</p>
          )}
        </section>
      )}

      {/* 3) 타임 */}
      {city && date && (
        <section className="mt-5">
          <h2 className="mb-2 text-base font-bold">3. 타임 선택</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {[1, 2, 3].map((n) => {
              const s = slots.find((x) => x.slotNo === n);
              const remain = s ? s.capacity - s.reservedCount : 0;
              const full = remain <= 0;
              return (
                <button
                  key={n}
                  disabled={full}
                  onClick={() => setSlotNo(n)}
                  className={cn(
                    'gs-card flex min-h-[5rem] flex-col items-start gap-1 p-4 text-left transition',
                    slotNo === n && 'border-gs-blue bg-gs-blue-light',
                    full && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span className="text-base font-bold">{SLOT_TIMES[n]}</span>
                  <span
                    className={cn(
                      'flex items-center gap-1 text-sm font-semibold',
                      remain > 20 ? 'text-gs-mint-dark' : remain > 0 ? 'text-amber-600' : 'text-state-critical',
                    )}
                  >
                    <Users size={14} />
                    {full ? '정원 마감' : `잔여 ${remain}석`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 4) 각인 문구 */}
      {city && date && slotNo && (
        <section className="mt-5">
          <h2 className="mb-2 text-base font-bold">4. 점포명 각인 펜 문구</h2>
          <input
            className="gs-input"
            maxLength={12}
            value={engraving}
            onChange={(e) => setEngraving(e.target.value)}
            placeholder="점포명 (최대 12자)"
          />
          <p className="mt-1 text-sm text-gs-muted">
            현장에서 각인해 드립니다. 미리 입력하셔야 당일 바로 받으실 수 있습니다.
          </p>

          <button className="gs-btn-primary mt-4 w-full" disabled={busy} onClick={submit}>
            <CalendarDays size={18} />
            {busy ? '예약 중…' : mine?.reservation ? '예약 변경하기' : '예약 확정하기'}
          </button>
        </section>
      )}
    </div>
  );
}

function CurrentReservation({
  reservation,
  event,
  onCancel,
  busy,
  canChange,
}: {
  reservation: Reservation;
  event: ExpoEvent;
  onCancel: () => void;
  busy: boolean;
  canChange: boolean;
}) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(reservation.qrToken, { width: 420, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [reservation.qrToken]);

  return (
    <div className="gs-card overflow-hidden">
      <div className="bg-gs-blue px-4 py-3 text-white">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Check size={16} /> {reservation.status === 'checked_in' ? '방문 완료' : '예약 확정'}
        </p>
      </div>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-xl font-bold">{event.city}</p>
          <p className="text-gs-muted">
            {formatDateKo(reservation.date)} · {SLOT_TIMES[reservation.slotNo]}
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm text-gs-muted">
            <MapPin size={14} /> {event.venueName}
          </p>
          {reservation.engravingText && (
            <p className="mt-2 text-sm">
              각인 문구 <b>{reservation.engravingText}</b>
            </p>
          )}
          {canChange ? (
            <button className="gs-btn-ghost mt-3 h-10 min-h-0 text-sm" onClick={onCancel} disabled={busy}>
              예약 취소
            </button>
          ) : (
            <p className="mt-3 text-sm text-gs-muted">전일 18시가 지나 변경·취소가 불가합니다.</p>
          )}
        </div>
        <div className="shrink-0 text-center">
          {qr ? (
            <img src={qr} alt="입장 QR 코드" className="mx-auto h-40 w-40 rounded-xl border border-gs-line" />
          ) : (
            <div className="gs-skeleton mx-auto h-40 w-40" />
          )}
          <p className="mt-1.5 text-xs text-gs-muted">현장에서 이 QR을 보여 주세요</p>
        </div>
      </div>
    </div>
  );
}
