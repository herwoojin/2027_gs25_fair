'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, Send } from 'lucide-react';
import type { RegionCode } from '@/types';
import { REGIONS, REGION_LABEL } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

interface Row {
  storeCode: string;
  storeName: string;
  region: RegionCode;
  loggedIn: boolean;
  lastLoginAt: number | null;
  stampCount: number;
  completedAt: number | null;
  reserved: string | null;
  visited: boolean;
  coupon: string | null;
}

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'completed', label: '완주' },
  { key: 'incomplete', label: '미완주' },
  { key: 'never', label: '미접속' },
] as const;

/** T8-2 / T8-3 · 참여자 테이블 · 엑셀 내보내기 · 독려 문자 */
export default function ParticipantsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [region, setRegion] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['participants', filter, region, search, page],
    queryFn: () =>
      callFn<{ rows: Row[]; total: number; page: number; pageSize: number }>('adminParticipants', {
        filter,
        region,
        search,
        page,
        pageSize: 25,
      }),
  });

  const exportCsv = async () => {
    setBusy(true);
    try {
      const res = await callFn<{ csv: string; count: number }>('exportParticipants', {
        filter,
        region,
        search,
      });
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `참여자_${filter}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.push(`${res.count}건 내보냈습니다. (감사 로그 기록됨)`, 'success');
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const nudge = async () => {
    if (filter !== 'never' && filter !== 'incomplete') {
      toast.push('미접속 또는 미완주 필터를 선택해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      const preview = await callFn<{ count: number; body: string }>('sendNudge', {
        target: filter,
        preview: true,
      });
      const ok = window.confirm(
        `${preview.count}개 점포에 아래 문자를 발송합니다.\n\n${preview.body}\n\n발송할까요?`,
      );
      if (!ok) return;
      const res = await callFn<{ count: number }>('sendNudge', { target: filter, preview: false });
      toast.push(`${res.count}건 발송했습니다.`, 'success');
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">참여자</h1>
          <p className="text-sm text-gs-muted">총 {(data?.total ?? 0).toLocaleString()}개 점포</p>
        </div>
        <div className="flex gap-2">
          <button className="gs-btn-ghost h-10 min-h-0 text-sm" onClick={nudge} disabled={busy}>
            <Send size={15} /> 독려 문자
          </button>
          <button className="gs-btn-primary h-10 min-h-0 text-sm" onClick={exportCsv} disabled={busy}>
            <Download size={15} /> 엑셀 내보내기
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={cn('gs-chip', filter === f.key && 'gs-chip-on')}
            onClick={() => {
              setFilter(f.key);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
        <select
          className="gs-chip min-h-[2.25rem] cursor-pointer"
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">전체 지역</option>
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gs-muted" />
          <input
            className="gs-chip min-h-[2.25rem] w-44 pl-8"
            placeholder="점포코드·점포명"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="gs-card overflow-x-auto">
        <table className="w-full min-w-[54rem] text-sm">
          <thead className="border-b border-gs-line bg-gs-surface text-left text-gs-muted">
            <tr>
              {['점포코드', '점포명', '지역', '로그인', '스탬프', '완주', '예약', '방문', '쿠폰'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gs-muted">
                  불러오는 중…
                </td>
              </tr>
            )}
            {(data?.rows ?? []).map((r) => (
              <tr key={r.storeCode} className="border-b border-gs-line/60 hover:bg-gs-surface">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono">{r.storeCode}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{r.storeName}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{REGION_LABEL[r.region]}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {r.loggedIn ? (
                    <span className="text-gs-mint-dark">
                      {r.lastLoginAt
                        ? new Date(r.lastLoginAt).toLocaleDateString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                          })
                        : 'Y'}
                    </span>
                  ) : (
                    <span className="text-gs-muted">미접속</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="font-bold">{r.stampCount}</span>
                  <span className="text-gs-muted">/11</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {r.completedAt ? (
                    <span className="rounded-pill bg-gs-mint/20 px-2 py-0.5 text-xs font-bold text-gs-mint-dark">
                      완주
                    </span>
                  ) : (
                    <span className="text-gs-muted">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-gs-muted">{r.reserved ?? '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.visited ? '✓' : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-gs-muted">{r.coupon ?? '—'}</td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gs-muted">
                  조건에 맞는 점포가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button className="gs-btn-ghost h-9 min-h-0 px-3 text-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          이전
        </button>
        <span className="text-sm text-gs-muted">
          {page} / {totalPages}
        </span>
        <button
          className="gs-btn-ghost h-9 min-h-0 px-3 text-sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </button>
      </div>
    </div>
  );
}
