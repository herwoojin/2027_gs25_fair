'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Crown, Flag, Brain, Megaphone, Monitor } from 'lucide-react';
import type { AggregateRanking, RankingEntry, RegionRankEntry } from '@/types';
import { REGIONS, REGION_LABEL } from '@/types';
import { callFn } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'finish', label: '최초 완주', icon: Flag, emoji: '🏁' },
  { key: 'participation', label: '참여율', icon: Megaphone, emoji: '📣' },
  { key: 'understanding', label: '이해도', icon: Brain, emoji: '🧠' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function RankingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-6"><div className="gs-skeleton h-72 w-full" /></div>}>
      <RankingInner />
    </Suspense>
  );
}

/** T6-2 · /ranking — 지역 대항전 */
function RankingInner() {
  const search = useSearchParams();
  const boardMode = search.get('mode') === 'board';
  const [tab, setTab] = useState<TabKey>('finish');
  const { user, progress } = useSession();

  const { data } = useQuery({
    queryKey: ['ranking'],
    queryFn: () => callFn<{ ranking: AggregateRanking }>('getAggregates', { kind: 'ranking' }),
    // 서버가 5분마다 집계 → 같은 주기로 갱신
    refetchInterval: 5 * 60_000,
  });

  // 전광판 모드: 10초마다 탭 자동 전환
  useEffect(() => {
    if (!boardMode) return;
    const id = setInterval(() => {
      setTab((t) => TABS[(TABS.findIndex((x) => x.key === t) + 1) % TABS.length].key);
    }, 10_000);
    return () => clearInterval(id);
  }, [boardMode]);

  const r = data?.ranking;
  const myRank = r?.firstFinishers.find((f) => f.uid === user?.uid);

  const Wrapper = boardMode ? BoardWrapper : PageWrapper;

  return (
    <Wrapper tab={tab} setTab={setTab}>
      {!r ? (
        <div className="gs-skeleton h-72 w-full" />
      ) : tab === 'finish' ? (
        <EntryList entries={r.firstFinishers} big={boardMode} unit="완주" />
      ) : tab === 'participation' ? (
        <RegionBars entries={r.regionParticipation} big={boardMode} caption="지역별 로그인 점포 / 등록 점포" />
      ) : (
        <div className="space-y-6">
          <RegionBars entries={r.regionUnderstanding} big={boardMode} caption="퀴즈 첫 시도 정답률" />
          {!boardMode && (
            <section>
              <h2 className="gs-section-title mb-3">개인 이해도 TOP 30</h2>
              <EntryList entries={r.topUnderstanding} unit="정답률" />
            </section>
          )}
        </div>
      )}

      {!boardMode && (
        <div className="gs-card mt-6 p-4">
          <p className="text-sm font-bold text-gs-blue">내 순위</p>
          {progress?.completedAt ? (
            <p className="mt-1 text-lg font-bold">
              전국 {progress.completionNo}번째 완주 ·{' '}
              {progress.quizTotal
                ? Math.round((progress.quizFirstTryCorrect / progress.quizTotal) * 100)
                : 0}
              % 이해도
              {myRank && <span className="ml-2 text-gs-mint-dark">TOP 30 진입</span>}
            </p>
          ) : (
            <p className="mt-1 text-gs-muted">
              아직 완주 전입니다. 스탬프 {progress?.stampCount ?? 0}/11 · 완주하시면 순위에 오릅니다.
            </p>
          )}
        </div>
      )}
    </Wrapper>
  );
}

function PageWrapper({
  children,
  tab,
  setTab,
}: {
  children: React.ReactNode;
  tab: TabKey;
  setTab: (t: TabKey) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">지역 대항전</h1>
          <p className="mt-1 text-gs-muted">5분마다 집계됩니다.</p>
        </div>
        <a
          href="/ranking?mode=board"
          target="_blank"
          rel="noreferrer"
          className="gs-chip"
          title="행사장 LED 전광판 모드"
        >
          <Monitor size={15} /> 전광판
        </a>
      </header>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex min-h-touch flex-1 items-center justify-center gap-1.5 rounded-xl border-2 px-2 text-sm font-bold transition',
              tab === t.key ? 'border-gs-blue bg-gs-blue-light text-gs-blue' : 'border-gs-line text-gs-muted',
            )}
          >
            <span>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

function BoardWrapper({ children, tab }: { children: React.ReactNode; tab: TabKey; setTab: (t: TabKey) => void }) {
  const current = TABS.find((t) => t.key === tab)!;
  return (
    <div className="fixed inset-0 z-[300] overflow-auto bg-gs-ink px-8 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 flex items-center gap-4 text-5xl font-black">
          <span>{current.emoji}</span> {current.label}
          <span className="ml-auto text-xl font-semibold text-white/50">2027 GS25 상품전략공유회</span>
        </h1>
        {children}
      </div>
    </div>
  );
}

function EntryList({ entries, big, unit }: { entries: RankingEntry[]; big?: boolean; unit: string }) {
  return (
    <ol className={cn('space-y-2', big && 'space-y-3')}>
      {entries.slice(0, big ? 10 : 30).map((e) => (
        <li
          key={`${e.rank}-${e.storeLabel}`}
          className={cn(
            'flex items-center gap-3 rounded-card px-4 py-3',
            big ? 'bg-white/10 text-white' : 'gs-card',
          )}
        >
          <span
            className={cn(
              'grid shrink-0 place-items-center rounded-full font-black',
              big ? 'h-14 w-14 text-2xl' : 'h-9 w-9 text-sm',
              e.rank === 1 && 'bg-[#f5c518] text-gs-ink',
              e.rank === 2 && 'bg-[#c7d0da] text-gs-ink',
              e.rank === 3 && 'bg-[#e0a878] text-white',
              e.rank > 3 && (big ? 'bg-white/15 text-white' : 'bg-gs-line text-gs-muted'),
            )}
          >
            {e.rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate font-bold', big ? 'text-3xl' : 'text-base')}>
              {e.storeLabel}
            </span>
            <span className={cn('block', big ? 'text-lg text-white/60' : 'text-sm text-gs-muted')}>
              {REGION_LABEL[e.region]}
            </span>
          </span>
          <span className={cn('shrink-0 font-bold', big ? 'text-2xl' : 'text-sm text-gs-blue')}>
            {e.valueLabel}
            <span className={cn('ml-1 font-semibold', big ? 'text-white/50' : 'text-gs-muted')}>{unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function RegionBars({
  entries,
  big,
  caption,
}: {
  entries: RegionRankEntry[];
  big?: boolean;
  caption: string;
}) {
  const max = Math.max(...entries.map((e) => e.ratio), 0.0001);
  return (
    <div>
      <p className={cn('mb-3', big ? 'text-xl text-white/60' : 'text-sm text-gs-muted')}>{caption}</p>
      <ol className="space-y-2">
        {entries.map((e) => (
          <li key={e.region} className={cn('rounded-card px-4 py-3', big ? 'bg-white/10' : 'gs-card')}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className={cn('font-black', big ? 'w-10 text-2xl' : 'w-6 text-sm')}>{e.rank}</span>
              <span className={cn('flex-1 font-bold', big ? 'text-2xl' : 'text-base')}>
                {REGIONS.find((r) => r.code === e.region)?.label ?? e.region}
                {e.rank === 1 && <Crown className="ml-2 inline text-[#f5c518]" size={big ? 26 : 18} />}
              </span>
              <span className={cn('font-bold', big ? 'text-2xl' : 'text-sm text-gs-blue')}>
                {(e.ratio * 100).toFixed(1)}%
              </span>
            </div>
            <div className={cn('overflow-hidden rounded-pill', big ? 'h-4 bg-white/15' : 'h-2.5 bg-gs-line')}>
              <div
                className="h-full rounded-pill bg-gradient-to-r from-gs-blue to-gs-mint transition-all duration-1000"
                style={{ width: `${(e.ratio / max) * 100}%` }}
              />
            </div>
            <p className={cn('mt-1', big ? 'text-base text-white/50' : 'text-xs text-gs-muted')}>
              {e.numerator.toLocaleString()} / {e.denominator.toLocaleString()}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
