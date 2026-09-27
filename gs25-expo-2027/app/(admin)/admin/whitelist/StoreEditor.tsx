'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { REGIONS, type RegionCode } from '@/types';
import { callFn, type ApiError } from '@/lib/api';

/**
 * 점포 화이트리스트 개별 편집.
 *
 * 구글시트 동기화만으로는 "한 점포만 급히 추가/제외" 가 안 된다.
 * 현장에서 자주 생기는 요구라 개별 CRUD 를 붙였다.
 *
 * 전화번호는 평문으로 내려오지 않는다(마스킹만). 번호를 바꿀 때만 새로 입력한다.
 */

interface SyncStatus {
  total: number;
  active: number;
  syncedAgoSec: number | null;
  lastSync: { upserted: number; deactivated: number; skipped: number; reasons: string[] } | null;
}

interface Row {
  storeCode: string;
  storeName: string;
  ownerName: string;
  region: RegionCode;
  fcTeam: string;
  active: boolean;
  phoneMasked: string;
}

type Draft = {
  storeCode: string;
  storeName: string;
  ownerName: string;
  phone: string;
  region: RegionCode;
  fcTeam: string;
  active: boolean;
  isNew: boolean;
};

const blank = (): Draft => ({
  storeCode: '',
  storeName: '',
  ownerName: '',
  phone: '',
  region: 'SEOUL',
  fcTeam: '',
  active: true,
  isNew: true,
});

export function StoreEditor() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const pageSize = 50;

  const load = useCallback(async (query: string, p: number) => {
    try {
      callFn<{ status: SyncStatus }>('adminWhitelistSync')
        .then((x) => setSync(x.status))
        .catch(() => setSync(null));
      const r = await callFn<{ rows: Row[]; total: number }>('adminStoreList', {
        q: query,
        page: p,
        pageSize,
      });
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      setError((e as ApiError).message ?? '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load(q, page);
    // 검색어는 제출할 때만 반영한다(타이핑마다 조회하면 부하가 된다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, load]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void load(q, 1);
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await callFn('adminStoreSave', {
        storeCode: draft.storeCode.trim(),
        storeName: draft.storeName.trim(),
        ownerName: draft.ownerName.trim(),
        region: draft.region,
        fcTeam: draft.fcTeam.trim(),
        active: draft.active,
        ...(draft.phone.trim() ? { phone: draft.phone.replace(/[^0-9]/g, '') } : {}),
      });
      setDraft(null);
      await load(q, page);
    } catch (e) {
      setError((e as ApiError).message ?? '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`${r.storeCode} ${r.storeName} 을(를) 목록에서 제외할까요?`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await callFn<{ deactivated: boolean; message?: string }>('adminStoreDelete', {
        storeCode: r.storeCode,
      });
      if (res.deactivated) window.alert(res.message ?? '비활성 처리했습니다.');
      await load(q, page);
    } catch (e) {
      setError((e as ApiError).message ?? '삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form onSubmit={search} className="flex flex-1 gap-2">
          <input
            className="gs-input min-w-0 flex-1 text-sm"
            placeholder="점포코드 · 점포명 · 경영주명 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="gs-btn h-11 min-h-0 border border-gs-line px-3 text-sm" type="submit">
            <Search size={15} /> 검색
          </button>
        </form>
        <button className="gs-btn-primary h-11 min-h-0 px-4 text-sm" onClick={() => setDraft(blank())}>
          <Plus size={15} /> 점포 추가
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-state-critical">{error}</p>
      )}

      {draft && (
        <div className="gs-card space-y-3 border-2 border-gs-blue p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold">{draft.isNew ? '점포 추가' : `${draft.storeCode} 수정`}</h3>
            <button aria-label="닫기" onClick={() => setDraft(null)} className="text-gs-muted">
              <X size={18} />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="점포코드" value={draft.storeCode} disabled={!draft.isNew}
               onChange={(v) => setDraft({ ...draft, storeCode: v })} />
            <F label="점포명" value={draft.storeName} onChange={(v) => setDraft({ ...draft, storeName: v })} />
            <F label="경영주명" value={draft.ownerName} onChange={(v) => setDraft({ ...draft, ownerName: v })} />
            <F
              label={draft.isNew ? '휴대폰 번호' : '휴대폰 번호 (바꿀 때만 입력)'}
              value={draft.phone}
              placeholder="01012345678"
              onChange={(v) => setDraft({ ...draft, phone: v })}
            />
            <label className="block">
              <span className="block text-xs font-bold text-gs-muted">지역</span>
              <select
                className="gs-input mt-1 w-full text-sm"
                value={draft.region}
                onChange={(e) => setDraft({ ...draft, region: e.target.value as RegionCode })}
              >
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <F label="FC팀" value={draft.fcTeam} onChange={(v) => setDraft({ ...draft, fcTeam: v })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            활성 (해제하면 로그인할 수 없습니다)
          </label>
          <button
            className="gs-btn-primary h-11 min-h-0 px-4 text-sm disabled:opacity-40"
            onClick={save}
            disabled={busy || !draft.storeCode.trim() || !draft.storeName.trim() || !draft.ownerName.trim()}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null} 저장
          </button>
        </div>
      )}

      {sync && (
        <div className="gs-card p-4 text-sm">
          <p className="text-gs-muted">
            구글시트 동기화{' '}
            {sync.syncedAgoSec === null ? (
              <b className="text-gs-ink">아직 없음</b>
            ) : (
              <b className="text-gs-ink">{sync.syncedAgoSec}초 전</b>
            )}{' '}
            · 활성 <b className="text-gs-ink">{sync.active.toLocaleString('ko-KR')}</b> / 전체{' '}
            {sync.total.toLocaleString('ko-KR')}
          </p>
          {sync.lastSync && sync.lastSync.skipped > 0 && (
            <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <b>시트에서 {sync.lastSync.skipped}행을 건너뛰었습니다.</b>
              <ul className="mt-1 space-y-0.5">
                {sync.lastSync.reasons.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-gs-muted">총 {total.toLocaleString('ko-KR')}개 점포</p>

      <div className="gs-card overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-gs-line text-left text-gs-muted">
              <th className="px-3 py-2 font-semibold">점포코드</th>
              <th className="px-3 py-2 font-semibold">점포명</th>
              <th className="px-3 py-2 font-semibold">경영주</th>
              <th className="px-3 py-2 font-semibold">연락처</th>
              <th className="px-3 py-2 font-semibold">지역</th>
              <th className="px-3 py-2 font-semibold">상태</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.storeCode} className="border-b border-gs-line last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{r.storeCode}</td>
                <td className="px-3 py-2">{r.storeName}</td>
                <td className="px-3 py-2">{r.ownerName}</td>
                <td className="px-3 py-2 text-gs-muted">{r.phoneMasked}</td>
                <td className="px-3 py-2 text-gs-muted">{r.region}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-pill px-2 py-0.5 text-xs font-bold ${
                      r.active ? 'bg-gs-mint-light text-gs-mint-dark' : 'bg-gs-surface text-gs-muted'
                    }`}
                  >
                    {r.active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      aria-label="수정"
                      className="rounded-lg p-1.5 text-gs-muted hover:bg-gs-surface"
                      onClick={() =>
                        setDraft({ ...r, phone: '', isNew: false })
                      }
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label="제외"
                      className="rounded-lg p-1.5 text-state-critical hover:bg-red-50"
                      onClick={() => remove(r)}
                      disabled={busy}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gs-muted">
                  결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="gs-btn h-10 min-h-0 border border-gs-line px-3 text-sm disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            이전
          </button>
          <span className="text-sm text-gs-muted">
            {page} / {pages}
          </span>
          <button
            className="gs-btn h-10 min-h-0 border border-gs-line px-3 text-sm disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
}

function F({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gs-muted">{label}</span>
      <input
        className="gs-input mt-1 w-full text-sm disabled:bg-gs-surface disabled:text-gs-muted"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
