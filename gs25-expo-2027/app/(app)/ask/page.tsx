'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, MessageSquarePlus, ThumbsUp } from 'lucide-react';
import type { Question, Section } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { relativeTime, cn } from '@/lib/utils';
import { AskMdSheet } from '@/components/qa/AskMdSheet';
import { useToast } from '@/components/common/Toast';

type Feed = { questions: (Question & { likedByMe?: boolean })[]; total: number };

/** T5-4 · /ask — 본사에 무엇이든 물어보세요 (공개 Q&A 피드) */
export default function AskPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [sort, setSort] = useState<'latest' | 'likes'>('latest');
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [open, setOpen] = useState(false);

  const { data: index } = useQuery({
    queryKey: ['exhibitIndex'],
    queryFn: () => callFn<{ sections: Section[] }>('getExhibitIndex'),
    staleTime: 10 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['askFeed', sort, sectionId],
    queryFn: () => callFn<Feed>('listQuestions', { scope: 'public', sort, sectionId, limit: 30 }),
    // 실시간 피드 — 운영에서는 Firestore 리스너(limit 30)
    refetchInterval: 20_000,
  });

  const like = async (id: string) => {
    try {
      await callFn('likeQuestion', { questionId: id });
      await qc.invalidateQueries({ queryKey: ['askFeed'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    }
  };

  const sections = (index?.sections ?? []).sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">본사에 무엇이든 물어보세요</h1>
        <p className="mt-1 text-gs-muted">
          작성자는 “○○권 경영주”로 표시되며 점포명은 공개되지 않습니다.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        <button className={cn('gs-chip', sort === 'latest' && 'gs-chip-on')} onClick={() => setSort('latest')}>
          최신순
        </button>
        <button className={cn('gs-chip', sort === 'likes' && 'gs-chip-on')} onClick={() => setSort('likes')}>
          공감순
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          className={cn('gs-chip shrink-0', !sectionId && 'gs-chip-on')}
          onClick={() => setSectionId(undefined)}
        >
          전체
        </button>
        {sections.map((s) => (
          <button
            key={s.id}
            className={cn('gs-chip shrink-0', sectionId === s.id && 'gs-chip-on')}
            onClick={() => setSectionId(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="gs-skeleton h-32 w-full" />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {(data?.questions ?? []).map((q) => (
            <li key={q.id} className="gs-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-gs-muted">
                <span className="font-semibold text-gs-ink">{q.authorLabel}</span>
                {q.sectionId && (
                  <span className="rounded-pill bg-gs-blue-light px-2 py-0.5 text-xs font-bold text-gs-blue">
                    {sections.find((s) => s.id === q.sectionId)?.title ?? q.sectionId}
                  </span>
                )}
                <span>{relativeTime(q.createdAt)}</span>
              </div>

              <p className="mt-2 text-base leading-relaxed">{q.text}</p>

              {q.answer ? (
                <div className="mt-3 rounded-xl border-l-4 border-gs-mint bg-gs-surface p-3">
                  <p className="text-sm font-bold text-gs-blue">{q.answer.byName}</p>
                  <p className="mt-1 text-base leading-relaxed">{q.answer.text}</p>
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-gs-surface px-3 py-2 text-sm text-gs-muted">
                  담당 MD가 확인하고 있습니다. (업무시간 기준 2시간 이내 답변 목표)
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => like(q.id)}
                  className={cn(
                    'flex min-h-[2.5rem] items-center gap-1.5 rounded-pill border px-3 text-sm font-bold transition',
                    q.likedByMe
                      ? 'border-gs-blue bg-gs-blue-light text-gs-blue'
                      : 'border-gs-line text-gs-muted hover:bg-gs-surface',
                  )}
                >
                  <ThumbsUp size={15} /> {q.likeCount}
                </button>
                <button
                  onClick={() => toast.push('신고가 접수되었습니다. 운영자가 확인합니다.', 'info')}
                  className="flex min-h-[2.5rem] items-center gap-1 rounded-pill px-3 text-sm text-gs-muted hover:bg-gs-surface"
                >
                  <Flag size={14} /> 신고
                </button>
              </div>
            </li>
          ))}
          {data?.questions.length === 0 && (
            <li className="gs-card p-6 text-center text-gs-muted">
              아직 등록된 질문이 없습니다. 첫 질문을 남겨 보세요.
            </li>
          )}
        </ul>
      )}

      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-gs-blue px-5 font-bold text-white shadow-lift lg:right-6"
        style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
      >
        <MessageSquarePlus size={20} /> 질문하기
      </button>

      <AskMdSheet
        open={open}
        onClose={() => {
          setOpen(false);
          void qc.invalidateQueries({ queryKey: ['askFeed'] });
        }}
        channel="hq"
      />
    </div>
  );
}
