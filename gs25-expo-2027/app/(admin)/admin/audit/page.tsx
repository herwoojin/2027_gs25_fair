'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditLog } from '@/types';
import { callFn } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';

interface AuditData {
  logs: AuditLog[];
  smsLogs: { id: string; code: string; toMasked: string; body: string; status: string; at: number }[];
  syncQueue: { id: string; sheet: string; row: (string | number)[]; createdAt: number; tries: number }[];
}

const TABS = [
  { key: 'audit', label: '감사 로그' },
  { key: 'sms', label: '문자 발송 이력' },
  { key: 'sync', label: '시트 백업 큐' },
] as const;

/** T8-6 / S-12 · 접속 · 보안 로그 뷰어 */
export default function AuditPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('audit');

  const { data } = useQuery({
    queryKey: ['audit'],
    queryFn: () => callFn<AuditData>('adminAudit', { limit: 200 }),
    refetchInterval: 30_000,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">감사 · 보안 로그</h1>
        <p className="text-sm text-gs-muted">
          로그인 시도, 대량 조회, 엑셀 내보내기, 쿠폰 발송, 워터마크 제거 감지가 기록됩니다.
        </p>
      </header>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.key} className={cn('gs-chip', tab === t.key && 'gs-chip-on')} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'audit' && (
        <div className="gs-card overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-gs-surface text-left text-gs-muted">
              <tr>
                {['시각', '행위자', '역할', '액션', '대상', 'IP', '비고'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.logs ?? []).map((l) => (
                <tr key={l.id} className="border-t border-gs-line/60">
                  <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{relativeTime(l.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{l.uid}</td>
                  <td className="whitespace-nowrap px-3 py-2">{l.role}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs font-bold',
                        l.action.includes('fail') || l.action.includes('tamper') || l.action.includes('rate')
                          ? 'bg-red-50 text-state-critical'
                          : 'bg-gs-surface text-gs-muted',
                      )}
                    >
                      {l.action}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{l.target ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{l.ip ?? '—'}</td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-gs-muted">{l.detail ?? '—'}</td>
                </tr>
              ))}
              {(data?.logs.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gs-muted">
                    기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sms' && (
        <div className="gs-card overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="bg-gs-surface text-left text-gs-muted">
              <tr>
                {['시각', '템플릿', '수신(마스킹)', '상태', '내용'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.smsLogs ?? []).map((l) => (
                <tr key={l.id} className="border-t border-gs-line/60">
                  <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{relativeTime(l.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold">{l.code}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{l.toMasked}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{l.status}</td>
                  <td className="max-w-[22rem] truncate px-3 py-2">{l.body}</td>
                </tr>
              ))}
              {(data?.smsLogs.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gs-muted">
                    발송 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sync' && (
        <div className="gs-card overflow-x-auto">
          <p className="border-b border-gs-line px-4 py-3 text-sm text-gs-muted">
            1분마다 배치로 구글시트에 append 되고, 성공한 행만 큐에서 삭제됩니다.
          </p>
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-gs-surface text-left text-gs-muted">
              <tr>
                {['시각', '시트', '행', '재시도'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.syncQueue ?? []).map((q) => (
                <tr key={q.id} className="border-t border-gs-line/60">
                  <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{relativeTime(q.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold">{q.sheet}</td>
                  <td className="max-w-[26rem] truncate px-3 py-2 font-mono text-xs">{q.row.join(' | ')}</td>
                  <td className="whitespace-nowrap px-3 py-2">{q.tries}</td>
                </tr>
              ))}
              {(data?.syncQueue.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gs-muted">
                    대기 중인 백업 행이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
