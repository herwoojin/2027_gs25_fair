'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import type { RegionCode } from '@/types';
import { REGION_LABEL } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { useToast } from '@/components/common/Toast';

interface StoreRow {
  storeCode: string;
  storeName: string;
  ownerName: string;
  region: RegionCode;
  fcTeam: string;
  active: boolean;
  syncedAt: number;
}

/** T9-2 · 점포 화이트리스트 (구글시트 Stores → Firestore 동기화) */
export default function WhitelistPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ['whitelist'],
    queryFn: () => callFn<{ stores: StoreRow[]; note?: string }>('adminWhitelistSync'),
  });

  const sync = async () => {
    setBusy(true);
    try {
      await callFn('adminWhitelistSync');
      await qc.invalidateQueries({ queryKey: ['whitelist'] });
      toast.push('구글시트와 동기화했습니다.', 'success');
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">점포 화이트리스트</h1>
          <p className="text-sm text-gs-muted">
            등록된 점포만 로그인할 수 있습니다. 원장은 구글시트 <b>Stores</b> 탭입니다.
          </p>
        </div>
        <button className="gs-btn-primary h-10 min-h-0 text-sm" onClick={sync} disabled={busy}>
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> 시트 동기화
        </button>
      </header>

      <MailerStatus />

      <div className="gs-card flex items-start gap-3 p-4">
        <ShieldCheck className="shrink-0 text-gs-blue" size={20} />
        <div className="text-sm text-gs-muted">
          <p>
            휴대폰 번호는 <b>AES-256-GCM 암호문</b>으로만 저장되고, 뒷 4자리는{' '}
            <b>HMAC-SHA256 해시</b>로 비교합니다. 이 화면에도 번호는 표시되지 않습니다.
          </p>
          {data?.note && <p className="mt-1">{data.note}</p>}
        </div>
      </div>

      <div className="gs-card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-gs-surface text-left text-gs-muted">
            <tr>
              {['점포코드', '점포명', '경영주', '지역', '영업팀', '상태', '동기화'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.stores ?? []).map((s) => (
              <tr key={s.storeCode} className="border-t border-gs-line/60">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono">{s.storeCode}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{s.storeName}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{s.ownerName}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{REGION_LABEL[s.region]}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-gs-muted">{s.fcTeam}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span
                    className={`rounded-pill px-2 py-0.5 text-xs font-bold ${
                      s.active ? 'bg-gs-mint/20 text-gs-mint-dark' : 'bg-gs-line text-gs-muted'
                    }`}
                  >
                    {s.active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-gs-muted">
                  {new Date(s.syncedAt).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface MailerInfo {
  configured: boolean;
  ping: { ok: boolean; error?: string; allowedDomain?: string };
  staffCount: number | null;
  allowedDomain: string;
}

/** 본부 로그인 이메일 인증(Apps Script 메일 릴레이) 연결 상태 */
function MailerStatus() {
  const { data } = useQuery({
    queryKey: ['mailer'],
    queryFn: () => callFn<MailerInfo>('checkMailer'),
    staleTime: 60_000,
  });

  const ok = data?.configured && data.ping.ok;

  return (
    <div className="gs-card flex flex-wrap items-start gap-3 p-4">
      <Mail className={`shrink-0 ${ok ? 'text-gs-mint-dark' : 'text-state-danger'}`} size={20} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold text-gs-ink">
          본부 로그인 이메일 인증{' '}
          <span className={ok ? 'text-gs-mint-dark' : 'text-state-danger'}>
            {data === undefined ? '확인 중…' : ok ? '연결됨' : '미연결'}
          </span>
        </p>
        {data && (
          <p className="mt-1 text-gs-muted">
            {ok ? (
              <>
                Google Apps Script 가 <b>@{data.allowedDomain}</b> 주소로만 인증번호를 발송합니다 · Staff
                원장 {data.staffCount ?? '—'}명
              </>
            ) : !data.configured ? (
              <>
                APPS_SCRIPT_URL / APPS_SCRIPT_KEY 가 설정되지 않았습니다. 현재는 개발 모드로 화면에
                인증번호가 표시됩니다. <code>apps-script/README.md</code> 참고.
              </>
            ) : (
              <>연결 오류: {data.ping.error ?? '알 수 없음'}</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
