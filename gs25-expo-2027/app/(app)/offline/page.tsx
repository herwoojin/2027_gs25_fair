'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import type { ExpoEvent, Slot } from '@/types';
import { SLOT_TIMES } from '@/types';
import { callFn } from '@/lib/api';
import { cn, formatRange } from '@/lib/utils';
import { themeOf } from '@/lib/cityTheme';
import { Reveal } from '@/components/common/Reveal';

/** T7-1 · /offline — 9개 도시 순회 지도 · 타임라인 · 도시 상세 */
export default function OfflinePage() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['offlineSchedule'],
    queryFn: () => callFn<{ events: ExpoEvent[]; slots: Slot[] }>('getOfflineSchedule'),
    staleTime: 5 * 60_000,
  });

  const events = useMemo(() => (data?.events ?? []).sort((a, b) => a.order - b.order), [data]);
  const active = events.find((e) => e.id === selected) ?? null;
  const theme = themeOf(selected);

  const remainOf = (eventId: string) => {
    const slots = (data?.slots ?? []).filter((s) => s.eventId === eventId);
    const cap = slots.reduce((a, s) => a + s.capacity, 0);
    const res = slots.reduce((a, s) => a + s.reservedCount, 0);
    return { cap, res, remain: cap - res };
  };

  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">오프라인 순회 일정</h1>
        <p className="mt-1 text-gs-muted">
          가까운 도시를 선택하고 하루 3개 타임 중 편한 시간에 예약하세요.
        </p>
        <span
          aria-hidden
          className="mt-3 block h-[3px] w-24 rounded-pill transition-colors duration-700"
          style={{ background: theme.accent }}
        />
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <Reveal>
          <div className="gs-card overflow-hidden p-3">
            <KoreaMap events={events} selected={selected} onSelect={setSelected} />
          </div>
        </Reveal>

        <ol className="space-y-2">
          {events.map((e, i) => {
            const { remain, cap } = remainOf(e.id);
            const past = e.endDate < today;
            const ongoing = e.startDate <= today && today <= e.endDate;
            const t = themeOf(e.id);
            const on = selected === e.id;
            return (
              <Reveal key={e.id} delay={i * 0.04} y={14}>
                <li>
                  <button
                    onClick={() => setSelected(e.id === selected ? null : e.id)}
                    className={cn(
                      'relative flex w-full items-center gap-3 overflow-hidden rounded-card border px-3 py-3 text-left transition-all duration-400',
                      past && 'opacity-55',
                    )}
                    style={{
                      borderColor: on ? `${t.accent}99` : 'rgb(var(--gs-line))',
                      background: on ? `${t.accent}12` : '#fff',
                    }}
                  >
                    <motion.span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
                      style={{ background: past ? '#c7d0da' : ongoing ? '#00c2a8' : t.accent }}
                      animate={ongoing ? { scale: [1, 1.12, 1] } : {}}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    >
                      {e.order}
                    </motion.span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-base font-bold">{e.city}</span>
                        <span aria-hidden>{t.emoji}</span>
                        {ongoing && (
                          <span className="shrink-0 rounded-pill bg-gs-mint px-2 py-0.5 text-[0.65rem] font-bold text-white">
                            진행 중
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-sm text-gs-muted">
                        {formatRange(e.startDate, e.endDate)} · {e.venueName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span
                        className="block font-bold"
                        style={{ color: remain > 0 ? t.accent : '#e53935' }}
                      >
                        {remain > 0 ? `${remain.toLocaleString()}석` : '마감'}
                      </span>
                      <span className="block text-xs text-gs-muted">/{cap.toLocaleString()}</span>
                    </span>
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[3px] origin-top transition-transform duration-500"
                      style={{ background: t.accent, transform: on ? 'scaleY(1)' : 'scaleY(0)' }}
                    />
                  </button>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </div>

      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
          >
            <CityDetail
              event={active}
              slots={(data?.slots ?? []).filter((s) => s.eventId === active.id)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Link
        href="/offline/reserve"
        className="gs-btn mt-6 w-full text-white transition-colors duration-700 sm:w-auto"
        style={{ background: theme.accent }}
      >
        <CalendarDays size={18} /> 방문 예약하기
      </Link>
    </div>
  );
}

/** 위경도를 단순 선형 투영한 약식 지도 (실제 지도 API 없이 위치 감각만 전달) */
function KoreaMap({
  events,
  selected,
  onSelect,
}: {
  events: ExpoEvent[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const BOUND = { minLat: 33.0, maxLat: 38.4, minLng: 125.8, maxLng: 129.7 };
  const px = (lng: number) => ((lng - BOUND.minLng) / (BOUND.maxLng - BOUND.minLng)) * 100;
  const py = (lat: number) => ((BOUND.maxLat - lat) / (BOUND.maxLat - BOUND.minLat)) * 100;

  const points = events.map((e) => `${px(e.lng)},${py(e.lat)}`).join(' ');

  return (
    <div className="relative aspect-[3/4] w-full rounded-xl bg-gs-surface">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {/* 순회 동선이 그려지는 애니메이션 */}
        <motion.polyline
          points={points}
          fill="none"
          stroke="#c7d8ea"
          strokeWidth="0.6"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.2, ease: 'easeInOut' }}
        />
        <motion.polyline
          points={points}
          fill="none"
          stroke="#00c2a8"
          strokeWidth="0.35"
          strokeLinecap="round"
          strokeDasharray="1.5 2.5"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.2, delay: 0.3, ease: 'easeInOut' }}
        />
      </svg>

      {events.map((e, i) => {
        const on = selected === e.id;
        const t = themeOf(e.id);
        return (
          <motion.button
            key={e.id}
            onClick={() => onSelect(e.id)}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${px(e.lng)}%`, top: `${py(e.lat)}%` }}
            aria-label={e.city}
            initial={reduced ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.09, type: 'spring', stiffness: 260, damping: 18 }}
          >
            {/* 선택된 도시의 확산 링 */}
            {on && (
              <motion.span
                aria-hidden
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{ border: `2px solid ${t.accent}` }}
                initial={{ width: 8, height: 8, x: '-50%', y: '-50%', opacity: 0.8 }}
                animate={{ width: 46, height: 46, opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
            <span
              className={cn(
                'relative grid place-items-center rounded-full font-black text-white shadow-card transition-all duration-300',
                on ? 'h-8 w-8 text-[0.7rem]' : 'h-6 w-6 text-[0.6rem]',
              )}
              style={{ background: on ? t.accent : '#0056b3' }}
            >
              {e.order}
            </span>
            <span
              className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[0.65rem] font-bold transition-colors duration-300"
              style={{ color: on ? t.accent : 'rgb(var(--gs-muted))' }}
            >
              {e.city}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

function CityDetail({ event, slots }: { event: ExpoEvent; slots: Slot[] }) {
  const dates = [...new Set(slots.map((s) => s.date))].sort();
  const t = themeOf(event.id);

  return (
    <section className="gs-card mt-4 overflow-hidden">
      <div
        className="px-4 py-3 text-white transition-colors duration-700"
        style={{ background: `linear-gradient(100deg, ${t.accent}, ${t.glow})` }}
      >
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <span aria-hidden>{t.emoji}</span> {event.city}
        </h2>
        <p className="mt-0.5 text-sm text-white/85">{t.tagline}</p>
      </div>

      <div className="p-4">
        <p className="flex items-center gap-1.5 text-gs-muted">
          <MapPin size={15} /> {event.venueName} · {event.address}
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="border-b border-gs-line text-left text-gs-muted">
                <th className="py-2 pr-3 font-semibold">날짜</th>
                {[1, 2, 3].map((n) => (
                  <th key={n} className="py-2 pr-3 font-semibold">
                    {SLOT_TIMES[n]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d, di) => (
                <motion.tr
                  key={d}
                  className="border-b border-gs-line/60"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: di * 0.05 }}
                >
                  <td className="py-2.5 pr-3 font-bold">
                    {new Date(`${d}T00:00:00+09:00`).toLocaleDateString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      weekday: 'short',
                    })}
                  </td>
                  {[1, 2, 3].map((n) => {
                    const s = slots.find((x) => x.date === d && x.slotNo === n);
                    const remain = s ? s.capacity - s.reservedCount : 0;
                    const ratio = s ? s.reservedCount / Math.max(1, s.capacity) : 0;
                    return (
                      <td key={n} className="py-2.5 pr-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold',
                            remain > 20
                              ? 'bg-gs-mint/20 text-gs-mint-dark'
                              : remain > 0
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-50 text-state-critical',
                          )}
                        >
                          <Users size={12} />
                          {remain > 0 ? `${remain}석` : '마감'}
                        </span>
                        <span className="mt-1 block h-1 w-16 overflow-hidden rounded-pill bg-gs-line">
                          <motion.span
                            className="block h-full rounded-pill"
                            style={{ background: t.accent }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, ratio * 100)}%` }}
                            transition={{ duration: 0.8, delay: di * 0.05 }}
                          />
                        </span>
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link
          href={`/offline/reserve?city=${event.id}`}
          className="gs-btn mt-4 w-full text-white transition-colors duration-700 sm:w-auto"
          style={{ background: t.accent }}
        >
          {event.city} 예약하기
        </Link>
      </div>
    </section>
  );
}
