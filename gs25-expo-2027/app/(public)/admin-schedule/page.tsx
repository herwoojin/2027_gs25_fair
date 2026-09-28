'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Check, Loader2, Lock, MapPin, RefreshCw, Save } from 'lucide-react';
import type { ExpoEvent } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { safeStorage } from '@/lib/utils';

/**
 * 일정 관리자 — ID/비밀번호로 들어와 순회 일정만 고친다.
 *
 * 저장하면 화면(히어로·순회 일정)에는 즉시 반영되고,
 * 구글시트 Events 탭에는 Apps Script 트리거가 다음에 올 때(최대 1분) 기록된다.
 */

const TOKEN_KEY = 'gs25expo.schedulerToken';

interface Status {
  overrides: number;
  syncedAgoSec: number | null;
  pendingWrites: number;
  failedWrites: number;
}

type Draft = Record<string, { venueName: string; address: string; startDate: string; endDate: string; slotTimes: string; note: string }>;

function toDraft(events: ExpoEvent[]): Draft {
  const d: Draft = {};
  for (const e of events) {
    d[e.id] = {
      venueName: e.venueName ?? '',
      address: e.address ?? '',
      startDate: e.startDate ?? '',
      endDate: e.endDate ?? '',
      slotTimes: (e.slotTimes ?? []).join(' | '),
      note: e.note ?? '',
    };
  }
  return d;
}

export default function SchedulerPage() {
  const [token, setToken] = useState<string | null>(null);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [events, setEvents] = useState<ExpoEvent[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    setToken(safeStorage.get(TOKEN_KEY));
  }, []);

  const load = useCallback(async (t: string) => {
    try {
      const r = await callFn<{ events: ExpoEvent[]; status: Status }>('schedulerEvents', {}, t);
      setEvents(r.events);
      setDraft(toDraft(r.events));
      setStatus(r.status);
    } catch {
      safeStorage.set(TOKEN_KEY, '');
      setToken(null);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await callFn<{ token: string }>('schedulerLogin', { id: id.trim(), password: pw });
      safeStorage.set(TOKEN_KEY, r.token);
      setToken(r.token);
      setPw('');
    } catch (err) {
      setError((err as ApiError).message ?? '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (eventId: string) => {
    if (!token) return;
    const d = draft[eventId];
    if (!d) return;
    setBusy(true);
    setError('');
    try {
      const r = await callFn<{ events: ExpoEvent[]; status: Status }>(
        'schedulerSaveEvent',
        {
          eventId,
          venueName: d.venueName.trim() || undefined,
          address: d.address.trim() || undefined,
          startDate: d.startDate.trim() || undefined,
          endDate: d.endDate.trim() || undefined,
          note: d.note.trim() || undefined,
          slotTimes: d.slotTimes.trim()
            ? d.slotTimes.split('|').map((x) => x.trim()).filter(Boolean)
            : undefined,
        },
        token,
      );
      setEvents(r.events);
      setStatus(r.status);
      setSavedId(eventId);
      setTimeout(() => setSavedId((c) => (c === eventId ? null : c)), 2200);
    } catch (err) {
      setError((err as ApiError).message ?? '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // ── 로그인 ──
  if (!token) {
    return (
      <div className="grid min-h-dvh place-items-center bg-gs-surface px-5">
        <form onSubmit={signIn} className="w-full max-w-sm rounded-2xl border border-gs-line bg-gs-card p-6">
          <p className="flex items-center gap-2 text-lg font-bold text-gs-ink">
            <Lock size={18} className="text-gs-blue" /> 일정 관리자 로그인
          </p>
          <p className="mt-1 text-sm text-gs-muted">
            순회 일정·장소·주소·시간만 수정할 수 있습니다.
          </p>

          <label htmlFor="sid" className="mt-5 block text-sm font-bold text-gs-ink">
            아이디
          </label>
          <input
            id="sid"
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="username"
            className="mt-1.5 min-h-touch w-full rounded-xl border border-gs-line px-3.5 text-gs-ink outline-none focus:border-gs-blue"
          />

          <label htmlFor="spw" className="mt-3 block text-sm font-bold text-gs-ink">
            비밀번호
          </label>
          <input
            id="spw"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
            className="mt-1.5 min-h-touch w-full rounded-xl border border-gs-line px-3.5 text-gs-ink outline-none focus:border-gs-blue"
          />

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-state-critical">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !id.trim() || !pw}
            className="gs-btn mt-5 w-full bg-gs-blue text-white disabled:opacity-40"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Lock size={17} />} 로그인
          </button>

          <Link href="/" className="mt-4 flex items-center justify-center gap-1.5 text-sm text-gs-muted">
            <ArrowLeft size={14} /> 첫 화면으로
          </Link>
        </form>
      </div>
    );
  }

  // ── 편집 ──
  return (
    <div className="min-h-dvh bg-gs-surface px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-gs-ink">
              <Calendar size={22} className="text-gs-blue" /> 순회 일정 관리
            </h1>
            <p className="mt-1 text-sm text-gs-muted">
              저장하면 사이트에 바로 반영되고, 구글시트에는 1분 안에 기록됩니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => token && load(token)}
              className="flex min-h-touch items-center gap-1.5 rounded-pill border border-gs-line bg-gs-card px-3.5 text-sm font-semibold text-gs-ink"
            >
              <RefreshCw size={15} /> 새로고침
            </button>
            <button
              type="button"
              onClick={() => {
                safeStorage.set(TOKEN_KEY, '');
                setToken(null);
              }}
              className="flex min-h-touch items-center rounded-pill border border-gs-line bg-gs-card px-3.5 text-sm font-semibold text-gs-muted"
            >
              로그아웃
            </button>
          </div>
        </header>

        {status && (
          <p className="mt-4 rounded-xl border border-gs-line bg-gs-card px-4 py-3 text-sm text-gs-muted">
            시트 동기화{' '}
            {status.syncedAgoSec === null ? (
              <b className="text-gs-ink">아직 없음</b>
            ) : (
              <b className="text-gs-ink">{status.syncedAgoSec}초 전</b>
            )}{' '}
            · 시트 반영 대기 <b className="text-gs-ink">{status.pendingWrites}건</b>
            {status.failedWrites > 0 && (
              <span className="text-state-critical"> · 실패 {status.failedWrites}건</span>
            )}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-state-critical">
            {error}
          </p>
        )}

        <ol className="mt-5 space-y-4">
          {events.map((e) => {
            const d = draft[e.id];
            if (!d) return null;
            const set = (k: keyof typeof d, v: string) =>
              setDraft((cur) => ({ ...cur, [e.id]: { ...cur[e.id], [k]: v } }));
            return (
              <li key={e.id} className="rounded-2xl border border-gs-line bg-gs-card p-5">
                <p className="flex items-center gap-2 text-lg font-bold text-gs-ink">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-gs-blue-light text-sm font-black text-gs-blue">
                    {e.order}
                  </span>
                  {e.city}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="장소" value={d.venueName} onChange={(v) => set('venueName', v)} />
                  <Field label="주소" value={d.address} onChange={(v) => set('address', v)} />
                  <Field label="시작일 (YYYY-MM-DD)" value={d.startDate} onChange={(v) => set('startDate', v)} />
                  <Field label="종료일 (YYYY-MM-DD)" value={d.endDate} onChange={(v) => set('endDate', v)} />
                </div>
                <div className="mt-3 grid gap-3">
                  <Field
                    label="운영 시간 (| 로 구분, 최대 3개)"
                    value={d.slotTimes}
                    onChange={(v) => set('slotTimes', v)}
                    placeholder="10:00 – 12:00 | 13:00 – 15:00 | 15:00 – 17:00"
                  />
                  <Field label="세부 일정 안내" value={d.note} onChange={(v) => set('note', v)} />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => save(e.id)}
                    disabled={busy}
                    className="gs-btn bg-gs-blue text-white disabled:opacity-40"
                  >
                    {savedId === e.id ? <Check size={16} /> : <Save size={16} />}
                    {savedId === e.id ? '저장됨' : '저장'}
                  </button>
                  <span className="flex items-center gap-1 text-xs text-gs-muted">
                    <MapPin size={13} /> {e.venueName} · {e.address}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gs-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 min-h-touch w-full rounded-xl border border-gs-line px-3 text-[0.95rem] text-gs-ink outline-none focus:border-gs-blue"
      />
    </label>
  );
}
