'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, ShieldCheck, Undo2, X } from 'lucide-react';
import type { MentorStory, MentorStoryStatus } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';

/**
 * 멘토 사례 검수.
 *
 * 승인하면 **로그인 없이 볼 수 있는 홈 화면**에 실명·점포명이 실린다.
 * 그래서 목록에 동의 시각을 같이 띄운다 — 검수자가 동의 여부를 보지 않고
 * 넘기는 일이 없어야 한다.
 */

interface Data {
  rows: MentorStory[];
  counts: { pending: number; published: number; total: number };
}

const TABS: { key: 'pending' | 'published' | 'all'; label: string }[] = [
  { key: 'pending', label: '검수 대기' },
  { key: 'published', label: '공개 중' },
  { key: 'all', label: '전체' },
];

const STATUS_TONE: Record<MentorStoryStatus, string> = {
  pending: 'bg-gs-sand text-gs-ink',
  published: 'bg-gs-mint-light text-gs-mint-dark',
  rejected: 'bg-red-50 text-state-critical',
  withdrawn: 'bg-gs-surface text-gs-muted',
};
const STATUS_LABEL: Record<MentorStoryStatus, string> = {
  pending: '검수 대기',
  published: '공개 중',
  rejected: '반려',
  withdrawn: '본인이 내림',
};
const DISPLAY_LABEL = { full: '실명 공개', masked: '성만 공개', store: '이름 비공개' } as const;

export default function MentorsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'published' | 'all'>('pending');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['adminMentors', tab],
    queryFn: () => callFn<Data>('adminMentorStories', { status: tab }),
    refetchInterval: 60_000,
  });

  const moderate = useMutation({
    mutationFn: (v: { storyId: string; action: 'publish' | 'reject' | 'unpublish'; reason?: string }) =>
      callFn('moderateMentorStory', v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['adminMentors'] }),
    onError: (e) => setError((e as ApiError).message ?? '처리하지 못했습니다.'),
  });

  const reject = (s: MentorStory) => {
    const reason = window.prompt('반려 사유를 적어 주세요. 경영주님께 그대로 보입니다.');
    if (reason === null) return;
    moderate.mutate({ storyId: s.id, action: 'reject', reason: reason.trim() || '내용 확인이 필요합니다.' });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">멘토 사례 검수</h1>
        <p className="text-sm leading-relaxed text-gs-muted">
          승인하면 <b className="text-gs-ink">로그인 없이 볼 수 있는 홈 화면</b>에 점포명과 표기
          이름이 함께 실립니다. 동의 기록과 표기 방식을 확인하고 승인해 주세요.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} className={cn('gs-chip', tab === t.key && 'gs-chip-on')} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'pending' && (data?.counts.pending ?? 0) > 0 && (
              <span className="ml-1 rounded-pill bg-state-critical px-1.5 text-xs font-bold text-white">
                {data?.counts.pending}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-sm text-gs-muted">
          공개 {data?.counts.published ?? 0} · 전체 {data?.counts.total ?? 0}
        </span>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-state-critical">{error}</p>
      )}

      {isLoading && (
        <p className="gs-card flex items-center gap-2 p-4 text-sm text-gs-muted">
          <Loader2 size={15} className="animate-spin" /> 불러오는 중…
        </p>
      )}

      <ul className="space-y-3">
        {(data?.rows ?? []).map((s) => (
          <li key={s.id} className="gs-card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-pill px-2.5 py-0.5 text-xs font-bold', STATUS_TONE[s.status])}>
                {STATUS_LABEL[s.status]}
              </span>
              <span className="text-sm font-bold">{s.storeName || '(점포명 없음)'}</span>
              <span className="font-mono text-xs text-gs-muted">{s.storeCode}</span>
              <span className="ml-auto text-xs text-gs-muted">{relativeTime(s.updatedAt)}</span>
            </div>

            <div>
              <p className="text-[0.95rem] leading-relaxed">{s.takeaway}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gs-muted">{s.result}</p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gs-line pt-2.5 text-xs text-gs-muted">
              <span>지역 {s.region}</span>
              <span>
                표기 <b className="text-gs-ink">{DISPLAY_LABEL[s.displayMode]}</b>
                {s.displayMode !== 'store' && ` · 원본 ${s.ownerName}`}
              </span>
              <span className="flex items-center gap-1 text-gs-mint-dark">
                <ShieldCheck size={12} /> 동의 {relativeTime(s.consentAt)}
              </span>
            </div>

            {s.status === 'rejected' && s.rejectReason && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-state-critical">사유: {s.rejectReason}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {s.status !== 'published' && s.status !== 'withdrawn' && (
                <button
                  className="gs-btn-primary h-10 min-h-0 px-3 text-sm"
                  onClick={() => moderate.mutate({ storyId: s.id, action: 'publish' })}
                  disabled={moderate.isPending}
                >
                  <Check size={15} /> 공개
                </button>
              )}
              {s.status === 'published' && (
                <button
                  className="gs-btn h-10 min-h-0 border border-gs-line px-3 text-sm"
                  onClick={() => moderate.mutate({ storyId: s.id, action: 'unpublish' })}
                  disabled={moderate.isPending}
                >
                  <Undo2 size={15} /> 공개 내리고 재검수
                </button>
              )}
              {s.status !== 'rejected' && s.status !== 'withdrawn' && (
                <button
                  className="gs-btn h-10 min-h-0 border border-gs-line px-3 text-sm text-state-critical"
                  onClick={() => reject(s)}
                  disabled={moderate.isPending}
                >
                  <X size={15} /> 반려
                </button>
              )}
            </div>
          </li>
        ))}
        {!isLoading && (data?.rows.length ?? 0) === 0 && (
          <li className="gs-card px-4 py-10 text-center text-gs-muted">해당하는 사례가 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
