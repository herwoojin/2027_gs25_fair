'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Eye, Loader2, Trash2 } from 'lucide-react';
import type { MentorDisplayMode, MentorStory } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * 멘토 사례 보내기.
 *
 * 여기서 쓴 글은 **로그인 없이 볼 수 있는 공개 랜딩**에 실린다.
 * 그래서 다른 화면보다 한 단계 더 조심스럽게 만든다.
 *   · 어디에 어떻게 실리는지 미리보기로 먼저 보여 준다
 *   · 동의 체크 없이는 보내기 버튼이 눌리지 않는다
 *   · 언제든 스스로 내릴 수 있는 버튼을 항상 같이 둔다
 */

interface City {
  id: string;
  city: string;
}

const DISPLAY: { mode: MentorDisplayMode; label: string; sample: (n: string) => string }[] = [
  { mode: 'full', label: '실명 공개', sample: (n) => n || '홍길동' },
  { mode: 'masked', label: '성만 공개', sample: (n) => (n ? n[0] + '○'.repeat(Math.max(1, n.length - 1)) : '홍○○') },
  { mode: 'store', label: '이름 비공개', sample: () => '경영주' },
];

const STATUS_VIEW: Record<
  MentorStory['status'],
  { icon: typeof Clock; label: string; tone: string; desc: string }
> = {
  pending: {
    icon: Clock,
    label: '검수 중',
    tone: 'bg-gs-sand text-gs-ink',
    desc: '본부에서 확인하고 있습니다. 승인되면 홈 화면에 실립니다.',
  },
  published: {
    icon: CheckCircle2,
    label: '공개 중',
    tone: 'bg-gs-mint-light text-gs-mint-dark',
    desc: '홈 화면의 「지역 멘토 경영주」에 실려 있습니다.',
  },
  rejected: {
    icon: AlertTriangle,
    label: '반려',
    tone: 'bg-red-50 text-state-critical',
    desc: '아래 사유를 확인하고 고쳐서 다시 보내 주세요.',
  },
  withdrawn: {
    icon: Trash2,
    label: '내림',
    tone: 'bg-gs-surface text-gs-muted',
    desc: '공개에서 내려간 상태입니다. 다시 보내시면 검수 후 재게시됩니다.',
  },
};

export default function MentorPage() {
  const qc = useQueryClient();
  const [eventId, setEventId] = useState('');
  const [takeaway, setTakeaway] = useState('');
  const [result, setResult] = useState('');
  const [displayMode, setDisplayMode] = useState<MentorDisplayMode>('masked');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const { data: home } = useQuery({
    queryKey: ['publicHome'],
    queryFn: () => callFn<{ cities: City[] }>('getPublicHome'),
    staleTime: 10 * 60_000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['myMentorStory'],
    queryFn: () => callFn<{ story: MentorStory | null }>('myMentorStory'),
  });
  const story = data?.story ?? null;

  // 기존 글이 있으면 폼을 채워 둔다 (수정 흐름)
  useEffect(() => {
    if (!story) return;
    setEventId(story.eventId);
    setTakeaway(story.takeaway);
    setResult(story.result);
    setDisplayMode(story.displayMode);
  }, [story]);

  useEffect(() => {
    if (!eventId && home?.cities?.length) setEventId(home.cities[0].id);
  }, [home, eventId]);

  const submit = useMutation({
    mutationFn: () =>
      callFn<{ story: MentorStory }>('submitMentorStory', {
        eventId,
        takeaway: takeaway.trim(),
        result: result.trim(),
        displayMode,
        consent: true,
      }),
    onSuccess: () => {
      setDone('보냈습니다. 본부 확인 후 홈 화면에 실립니다.');
      setError('');
      setConsent(false);
      void qc.invalidateQueries({ queryKey: ['myMentorStory'] });
    },
    onError: (e) => {
      setError((e as ApiError).message ?? '보내지 못했습니다.');
      setDone('');
    },
  });

  const withdraw = useMutation({
    mutationFn: () => callFn('withdrawMentorStory'),
    onSuccess: () => {
      setDone('공개에서 내렸습니다.');
      void qc.invalidateQueries({ queryKey: ['myMentorStory'] });
    },
    onError: (e) => setError((e as ApiError).message ?? '내리지 못했습니다.'),
  });

  const canSubmit =
    consent && eventId && takeaway.trim().length >= 10 && result.trim().length >= 5 && !submit.isPending;

  const view = story ? STATUS_VIEW[story.status] : null;
  const StatusIcon = view?.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">멘토 사례 보내기</h1>
        <p className="mt-1 text-sm leading-relaxed text-gs-muted">
          앞선 상품전시회에서 얻어가 점포에 적용해 보신 내용을 들려주세요. 다른 지역 경영주님께
          그대로 전해집니다.
        </p>
      </header>

      {/* 현재 상태 */}
      {isLoading ? (
        <div className="gs-card flex items-center gap-2 p-4 text-sm text-gs-muted">
          <Loader2 size={15} className="animate-spin" /> 불러오는 중…
        </div>
      ) : story && view && StatusIcon ? (
        <div className="gs-card space-y-2 p-4">
          <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-bold', view.tone)}>
            <StatusIcon size={14} /> {view.label}
          </span>
          <p className="text-sm leading-relaxed text-gs-muted">{view.desc}</p>
          {story.status === 'rejected' && story.rejectReason && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-state-critical">
              사유: {story.rejectReason}
            </p>
          )}
          {story.status === 'published' && (
            <button
              className="gs-btn h-10 min-h-0 border border-gs-line px-3 text-sm text-state-critical"
              onClick={() => {
                if (window.confirm('홈 화면에서 내릴까요? 언제든 다시 보내실 수 있습니다.')) withdraw.mutate();
              }}
              disabled={withdraw.isPending}
            >
              <Trash2 size={14} /> 공개에서 내리기
            </button>
          )}
        </div>
      ) : null}

      {/* 작성 */}
      <section className="gs-card space-y-4 p-4">
        <label className="block">
          <span className="block text-sm font-bold">어느 지역 멘토로 실릴까요?</span>
          <select
            className="gs-input mt-1.5 w-full text-base"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            {(home?.cities ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.city}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-sm font-bold">
            전시회에서 얻어가 점포에 적용한 것 <span className="text-gs-muted">({takeaway.trim().length}/200)</span>
          </span>
          <textarea
            className="gs-input mt-1.5 min-h-[6rem] w-full resize-y py-3 text-base leading-relaxed"
            placeholder="예: 신선 코너 진열 순서를 바꿔 아침 시간대 동선을 짧게 만들었습니다."
            maxLength={200}
            value={takeaway}
            onChange={(e) => setTakeaway(e.target.value)}
          />
          {takeaway.trim().length > 0 && takeaway.trim().length < 10 && (
            <span className="mt-1 block text-xs text-state-critical">10자 이상 적어 주세요.</span>
          )}
        </label>

        <label className="block">
          <span className="block text-sm font-bold">
            적용한 뒤 달라진 점 <span className="text-gs-muted">({result.trim().length}/200)</span>
          </span>
          <textarea
            className="gs-input mt-1.5 min-h-[5rem] w-full resize-y py-3 text-base leading-relaxed"
            placeholder="예: 아침 시간대 신선 매출이 눈에 띄게 늘었습니다."
            maxLength={200}
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
        </label>

        <div>
          <span className="block text-sm font-bold">이름 표기</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DISPLAY.map((d) => (
              <button
                key={d.mode}
                type="button"
                className={cn('gs-chip', displayMode === d.mode && 'gs-chip-on')}
                onClick={() => setDisplayMode(d.mode)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* 미리보기 — 공개 화면에 어떻게 실리는지 먼저 보여 준다 */}
        <div className="rounded-xl border border-gs-line bg-gs-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-gs-muted">
            <Eye size={13} /> 홈 화면에 이렇게 실립니다
          </p>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-gs-ink">
            {takeaway.trim() || '적용한 내용이 여기에 표시됩니다.'}
          </p>
          <p className="mt-1.5 text-sm text-gs-muted">
            {result.trim() || '달라진 점이 여기에 표시됩니다.'}
          </p>
          <p className="mt-2.5 border-t border-gs-line pt-2.5 text-xs text-gs-muted">
            {story?.storeName || '내 점포'} ·{' '}
            {DISPLAY.find((d) => d.mode === displayMode)?.sample(story?.ownerName ?? '')}
          </p>
        </div>

        {/* 동의 — 이게 없으면 저장되지 않는다 */}
        <label className="flex items-start gap-2.5 rounded-xl border-2 border-gs-line p-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            <b>[필수]</b> 위 내용과 점포명·표기 이름이{' '}
            <b>로그인 없이 볼 수 있는 홈 화면</b>에 공개되는 것에 동의합니다. 동의 후에도 언제든 직접
            내릴 수 있습니다.
          </span>
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-state-critical">{error}</p>
        )}
        {done && (
          <p className="rounded-xl bg-gs-mint-light px-4 py-3 text-sm font-semibold text-gs-mint-dark">{done}</p>
        )}

        <button
          className="gs-btn-primary w-full disabled:opacity-40"
          onClick={() => {
            setError('');
            setDone('');
            submit.mutate();
          }}
          disabled={!canSubmit}
        >
          {submit.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
          {story ? '수정해서 다시 보내기' : '보내기'}
        </button>

        {story && (
          <p className="text-center text-xs leading-relaxed text-gs-muted">
            이미 공개된 글을 고치면 다시 검수를 거칩니다.
          </p>
        )}
      </section>
    </div>
  );
}
