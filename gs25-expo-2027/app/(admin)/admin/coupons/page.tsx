'use client';

import { useState } from 'react';
import { AlertTriangle, Send, Upload } from 'lucide-react';
import { callFn, type ApiError } from '@/lib/api';
import { useToast } from '@/components/common/Toast';

interface Match {
  uid: string;
  storeCode: string;
  storeName: string;
  code: string | null;
}

/** T8-4 · 쿠폰 CSV 업로드 → 완주자 매칭 → 일괄 발송 → 실패 재발송 */
export default function CouponsPage() {
  const toast = useToast();
  const [codes, setCodes] = useState<string[]>([]);
  const [preview, setPreview] = useState<{
    matched: Match[];
    matchedCount: number;
    unmatchedCount: number;
    spareCodes: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const hour = new Date().getHours();
  const nightBlocked = hour >= 21 || hour < 8;

  const readCsv = async (file: File) => {
    const text = await file.text();
    const parsed = text
      .split(/\r?\n/)
      .map((line) => line.split(',')[0].trim())
      .filter((v) => v && !/^쿠폰|code$/i.test(v));
    setCodes(parsed);
    toast.push(`${parsed.length}개 코드를 읽었습니다.`, 'success');
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      const res = await callFn<typeof preview>('sendCoupons', { codes, dryRun: true });
      setPreview(res);
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const send = async (retryFailedOnly = false) => {
    if (!window.confirm(`${preview?.matchedCount ?? 0}건을 발송합니다. 진행할까요?`)) return;
    setBusy(true);
    try {
      const res = await callFn<{ sent: number; failed: number }>('sendCoupons', {
        codes,
        dryRun: false,
        retryFailedOnly,
      });
      toast.push(`발송 완료 · 성공 ${res.sent} / 실패 ${res.failed}`, res.failed ? 'error' : 'success');
      await runPreview();
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">완주자 쿠폰 발송</h1>
        <p className="text-sm text-gs-muted">
          발급 대행사 코드를 업로드해 완주자와 1:1 매칭한 뒤 일괄 발송합니다.
        </p>
      </header>

      {nightBlocked && (
        <div className="gs-card flex items-center gap-3 border-state-danger bg-amber-50 p-3">
          <AlertTriangle className="text-state-danger" size={20} />
          <p className="text-sm font-semibold">
            21시~08시에는 발송이 차단됩니다. (정보통신망법 야간 광고성 발송 제한)
          </p>
        </div>
      )}

      <section className="gs-card p-4">
        <h2 className="mb-2 text-base font-bold">1. 쿠폰 코드 CSV 업로드</h2>
        <label className="flex min-h-[6rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gs-line px-4 py-6 text-center transition hover:bg-gs-surface">
          <Upload size={24} className="text-gs-muted" />
          <span className="text-sm font-semibold text-gs-muted">
            {codes.length ? `${codes.length}개 코드 업로드됨` : 'CSV 파일을 선택하세요 (첫 번째 열 = 쿠폰코드)'}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && readCsv(e.target.files[0])}
          />
        </label>
      </section>

      <section className="gs-card p-4">
        <h2 className="mb-2 text-base font-bold">2. 완주자 매칭 미리보기</h2>
        <button className="gs-btn-ghost w-full" onClick={runPreview} disabled={busy}>
          매칭 결과 보기
        </button>

        {preview && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="매칭" value={preview.matchedCount} tone="ok" />
              <Stat label="코드 부족" value={preview.unmatchedCount} tone={preview.unmatchedCount ? 'warn' : 'ok'} />
              <Stat label="여분 코드" value={preview.spareCodes} />
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-gs-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gs-surface text-left text-gs-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">점포</th>
                    <th className="px-3 py-2 font-semibold">쿠폰코드</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.matched.map((m) => (
                    <tr key={m.uid} className="border-t border-gs-line/60">
                      <td className="px-3 py-2">
                        {m.storeName} <span className="text-gs-muted">({m.storeCode})</span>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {m.code ?? <span className="text-state-critical">코드 없음</span>}
                      </td>
                    </tr>
                  ))}
                  {preview.matched.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-gs-muted">
                        아직 완주자가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="gs-card p-4">
        <h2 className="mb-2 text-base font-bold">3. 발송</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            className="gs-btn-primary flex-1"
            disabled={busy || nightBlocked || !preview?.matchedCount}
            onClick={() => send(false)}
          >
            <Send size={17} /> 일괄 발송 (100건씩 배치)
          </button>
          <button
            className="gs-btn-ghost flex-1"
            disabled={busy || nightBlocked}
            onClick={() => send(true)}
          >
            실패 건만 재발송
          </button>
        </div>
        <p className="mt-2 text-xs text-gs-muted">
          발송 이력은 감사 로그에 기록되며, 수신번호는 마스킹해 저장됩니다.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl bg-gs-surface px-3 py-2.5">
      <p className="text-xs font-semibold text-gs-muted">{label}</p>
      <p
        className={`text-xl font-black ${
          tone === 'warn' ? 'text-state-danger' : tone === 'ok' ? 'text-gs-blue' : 'text-gs-ink'
        }`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
