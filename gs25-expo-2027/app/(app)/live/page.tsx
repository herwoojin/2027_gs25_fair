'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Radio, Video } from 'lucide-react';
import type { LiveStream } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn, formatDateKo } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

type LiveRow = LiveStream & { subscribed: boolean; youtubeId: string | null };

/** T7-4 · /live — 편성표 · 알림 신청 · YouTube 임베드(로그인 사용자만) · 다시보기 */
export default function LivePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'upcoming' | 'replay'>('upcoming');

  const { data } = useQuery({
    queryKey: ['live'],
    queryFn: () => callFn<{ streams: LiveRow[]; loggedIn: boolean }>('getLive'),
    refetchInterval: 60_000,
  });

  const streams = data?.streams ?? [];
  const live = streams.filter((s) => s.status === 'live');
  const rows = streams.filter((s) =>
    tab === 'upcoming' ? s.status !== 'ended' : s.status === 'ended',
  );

  const toggle = async (id: string) => {
    try {
      const res = await callFn<{ subscribed: boolean }>('subscribeLive', { streamId: id });
      toast.push(res.subscribed ? '시작 10분 전에 문자로 알려 드립니다.' : '알림을 해제했습니다.', 'success');
      await qc.invalidateQueries({ queryKey: ['live'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">MD 라이브 투어</h1>
        <p className="mt-1 text-gs-muted">
          현장 MD가 전시장을 직접 돌며 설명해 드립니다. 매주 화·목 오전 11시.
        </p>
      </header>

      {/* 진행 중 방송 */}
      {live.map((s) => (
        <section key={s.id} className="gs-card mb-4 overflow-hidden">
          <div className="flex items-center gap-2 bg-state-critical px-4 py-2 text-sm font-bold text-white">
            <Radio size={16} className="animate-pulse" /> LIVE · {s.city}
          </div>
          <div className="aspect-video w-full bg-black">
            {s.youtubeId ? (
              <iframe
                className="h-full w-full"
                // 일부공개 + youtube-nocookie (TRD 7.5)
                src={`https://www.youtube-nocookie.com/embed/${s.youtubeId}?rel=0&modestbranding=1`}
                title={s.topic}
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-white/60">
                <div>
                  <Video className="mx-auto mb-2" size={32} />
                  <p className="text-sm">방송 준비 중입니다. 곧 시작합니다.</p>
                  <p className="mt-1 text-xs text-white/40">
                    관리자 화면에서 YouTube 영상 ID를 등록하면 여기에 재생됩니다.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="p-4">
            <p className="text-lg font-bold">{s.topic}</p>
            <p className="text-sm text-gs-muted">진행 · {s.mdName} MD</p>
          </div>
        </section>
      ))}

      <div className="mb-3 flex gap-2">
        <button className={cn('gs-chip', tab === 'upcoming' && 'gs-chip-on')} onClick={() => setTab('upcoming')}>
          편성표
        </button>
        <button className={cn('gs-chip', tab === 'replay' && 'gs-chip-on')} onClick={() => setTab('replay')}>
          다시보기
        </button>
      </div>

      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id} className="gs-card flex items-center gap-3 p-4">
            <span
              className={cn(
                'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xs font-bold text-white',
                s.status === 'live' ? 'bg-state-critical' : s.status === 'ended' ? 'bg-gs-line text-gs-muted' : 'bg-gs-blue',
              )}
            >
              {s.status === 'live' ? 'LIVE' : s.status === 'ended' ? '종료' : '예정'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{s.topic}</p>
              <p className="text-sm text-gs-muted">
                {formatDateKo(s.startAt, true)} · {s.mdName} MD
              </p>
            </div>
            {s.status === 'scheduled' && (
              <button
                onClick={() => toggle(s.id)}
                className={cn(
                  'flex min-h-[2.5rem] shrink-0 items-center gap-1.5 rounded-pill border px-3 text-sm font-bold transition',
                  s.subscribed
                    ? 'border-gs-mint bg-gs-mint/15 text-gs-mint-dark'
                    : 'border-gs-line text-gs-muted hover:bg-gs-surface',
                )}
              >
                {s.subscribed ? <BellRing size={15} /> : <Bell size={15} />}
                {s.subscribed ? '알림 켬' : '알림'}
              </button>
            )}
            {s.status === 'ended' && !s.replayId && (
              <span className="shrink-0 text-sm text-gs-muted">준비 중</span>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="gs-card p-6 text-center text-gs-muted">
            {tab === 'upcoming' ? '예정된 방송이 없습니다.' : '등록된 다시보기가 없습니다.'}
          </li>
        )}
      </ul>

      <p className="mt-4 rounded-xl bg-gs-surface p-3 text-sm text-gs-muted">
        라이브 화면은 로그인하신 경영주님께만 표시됩니다. 링크 공유와 화면 녹화는 금지됩니다.
      </p>
    </div>
  );
}
