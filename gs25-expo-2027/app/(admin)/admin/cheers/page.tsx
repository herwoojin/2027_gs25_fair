'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, EyeOff } from 'lucide-react';
import type { Cheer } from '@/types';
import { REGION_LABEL } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

const TABS = [
  { key: 'pending', label: '검수 대기' },
  { key: 'visible', label: '노출 중' },
  { key: 'hidden', label: '숨김' },
  { key: 'all', label: '전체' },
] as const;

/** T8-6 · 응원 검수 */
export default function AdminCheersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<(typeof TABS)[number]['key']>('pending');

  const { data } = useQuery({
    queryKey: ['adminCheers', status],
    queryFn: () => callFn<{ cheers: Cheer[] }>('adminCheers', { status }),
    refetchInterval: 30_000,
  });

  const act = async (cheerId: string, action: 'approve' | 'hide') => {
    try {
      await callFn('moderateCheer', { cheerId, action });
      await qc.invalidateQueries({ queryKey: ['adminCheers'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">응원 검수</h1>
        <p className="text-sm text-gs-muted">금칙어가 감지된 메시지는 자동으로 검수 대기로 들어옵니다.</p>
      </header>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={cn('gs-chip', status === t.key && 'gs-chip-on')}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {(data?.cheers ?? []).map((c) => (
          <li key={c.id} className="gs-card flex flex-wrap items-center gap-3 p-3.5">
            <span className="rounded-pill bg-gs-blue-light px-2.5 py-1 text-xs font-bold text-gs-blue">
              {REGION_LABEL[c.region]}
            </span>
            <p className="min-w-0 flex-1 text-base">{c.text}</p>
            <span className="text-xs text-gs-muted">{relativeTime(c.createdAt)}</span>
            <div className="flex gap-2">
              {c.status !== 'visible' && (
                <button className="gs-btn-ghost h-9 min-h-0 px-3 text-sm" onClick={() => act(c.id, 'approve')}>
                  <Check size={14} /> 노출
                </button>
              )}
              {c.status !== 'hidden' && (
                <button className="gs-btn-ghost h-9 min-h-0 px-3 text-sm" onClick={() => act(c.id, 'hide')}>
                  <EyeOff size={14} /> 숨김
                </button>
              )}
            </div>
          </li>
        ))}
        {data?.cheers.length === 0 && (
          <li className="gs-card p-8 text-center text-gs-muted">해당하는 메시지가 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
