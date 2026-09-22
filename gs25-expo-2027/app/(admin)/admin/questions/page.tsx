'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Send, Timer } from 'lucide-react';
import type { Question, Section } from '@/types';
import { REGION_LABEL } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { useSession } from '@/lib/hooks/useSession';
import { useToast } from '@/components/common/Toast';

/** T5-2 · MD 질의 인박스 (모바일 최적화, 미답변 우선, MD는 담당 섹션만) */
export default function AdminQuestionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();
  const [sectionId, setSectionId] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [makePublic, setMakePublic] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: index } = useQuery({
    queryKey: ['exhibitIndex'],
    queryFn: () => callFn<{ sections: Section[] }>('getExhibitIndex'),
    staleTime: 10 * 60_000,
  });

  const { data } = useQuery({
    queryKey: ['inbox', sectionId],
    queryFn: () => callFn<{ questions: Question[] }>('listQuestions', { scope: 'inbox', sectionId, limit: 100 }),
    refetchInterval: 30_000,
  });

  const submit = async (id: string) => {
    setBusy(true);
    try {
      await callFn('answerQuestion', { questionId: id, text: answer.trim(), makePublic });
      toast.push('답변을 등록하고 경영주님께 문자를 보냈습니다.', 'success');
      setOpenId(null);
      setAnswer('');
      setMakePublic(false);
      await qc.invalidateQueries({ queryKey: ['inbox'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const moderate = async (id: string, action: 'publish' | 'unpublish' | 'hide') => {
    try {
      await callFn('moderateQuestion', { questionId: id, action });
      await qc.invalidateQueries({ queryKey: ['inbox'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    }
  };

  const escalate = async () => {
    try {
      const res = await callFn<{ escalated: number }>('escalateQuestions');
      toast.push(`${res.escalated}건을 백업 MD에게 재알림했습니다.`, 'success');
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    }
  };

  const rows = data?.questions ?? [];
  const openCount = rows.filter((q) => q.status === 'open').length;
  const sections = (index?.sections ?? []).sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">질의 인박스</h1>
          <p className="text-sm text-gs-muted">
            미답변 {openCount}건 · 업무시간 기준 2시간 이내 응답이 목표입니다.
          </p>
        </div>
        {user?.role === 'admin' && (
          <button className="gs-btn-ghost h-10 min-h-0 text-sm" onClick={escalate}>
            <Timer size={15} /> 2시간 경과 재알림
          </button>
        )}
      </header>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button className={cn('gs-chip shrink-0', !sectionId && 'gs-chip-on')} onClick={() => setSectionId(undefined)}>
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

      <ul className="space-y-3">
        {rows.map((q) => (
          <li key={q.id} className={cn('gs-card p-4', q.status === 'open' && 'border-l-4 border-l-state-danger')}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={cn(
                  'rounded-pill px-2.5 py-0.5 text-xs font-bold',
                  q.status === 'open' ? 'bg-state-danger text-white' : 'bg-gs-mint/20 text-gs-mint-dark',
                )}
              >
                {q.status === 'open' ? '미답변' : '답변 완료'}
              </span>
              <span className="font-semibold">{REGION_LABEL[q.region]}</span>
              <span className="text-gs-muted">
                {q.sectionId ? sections.find((s) => s.id === q.sectionId)?.title : '본사'} · {relativeTime(q.createdAt)}
              </span>
              {q.isPublic && <span className="text-xs font-bold text-gs-blue">공개</span>}
              {q.escalatedAt && <span className="text-xs font-bold text-state-danger">에스컬레이션됨</span>}
            </div>

            <p className="mt-2 text-base leading-relaxed">{q.text}</p>

            {q.answer && (
              <div className="mt-3 rounded-xl bg-gs-surface p-3">
                <p className="text-sm font-bold text-gs-blue">{q.answer.byName}</p>
                <p className="mt-1 text-base">{q.answer.text}</p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {q.status === 'open' && (
                <button
                  className="gs-btn-primary h-10 min-h-0 text-sm"
                  onClick={() => {
                    setOpenId(openId === q.id ? null : q.id);
                    setAnswer('');
                  }}
                >
                  답변하기
                </button>
              )}
              <button
                className="gs-btn-ghost h-10 min-h-0 text-sm"
                onClick={() => moderate(q.id, q.isPublic ? 'unpublish' : 'publish')}
              >
                {q.isPublic ? <EyeOff size={15} /> : <Eye size={15} />}
                {q.isPublic ? '비공개로' : '공개 전환'}
              </button>
            </div>

            {openId === q.id && (
              <div className="mt-3 space-y-2">
                <textarea
                  className="gs-input min-h-[7rem] resize-none py-3"
                  placeholder="답변을 입력해 주세요. 등록 즉시 경영주님께 문자로 발송됩니다."
                  maxLength={1000}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[rgb(var(--gs-blue))]"
                    checked={makePublic}
                    onChange={(e) => setMakePublic(e.target.checked)}
                  />
                  다른 경영주님께도 공개 (/ask 피드에 노출)
                </label>
                <button
                  className="gs-btn-primary w-full"
                  disabled={answer.trim().length < 2 || busy}
                  onClick={() => submit(q.id)}
                >
                  <Send size={16} /> {busy ? '전송 중…' : '답변 + 문자발송'}
                </button>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="gs-card p-8 text-center text-gs-muted">담당 섹션에 들어온 질문이 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
