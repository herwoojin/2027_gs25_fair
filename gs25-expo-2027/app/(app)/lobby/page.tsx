'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Box, Map as MapIcon, List, Info } from 'lucide-react';
import type { Section } from '@/types';
import { callFn } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';
import { useViewMode } from '@/lib/gpuTier';
import { cn } from '@/lib/utils';
import { Map2DFallback } from '@/components/three/Map2DFallback';
import { StampProgressBar } from '@/components/exhibit/StampProgressBar';

// 3D 씬은 필요할 때만 내려받는다 (⚡ 초기 로딩 최적화)
const ExpoHallScene = dynamic(
  () => import('@/components/three/ExpoHallScene').then((m) => m.ExpoHallScene),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center bg-[#eef4fb]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-white border-t-gs-blue" />
          <p className="text-sm font-semibold text-gs-muted">전시장을 준비하고 있습니다…</p>
        </div>
      </div>
    ),
  },
);

type LobbyView = '3d' | '2d' | 'list';

export default function LobbyPage() {
  const router = useRouter();
  const { progress, config } = useSession();
  const { mode, quality, auto, choose, locked } = useViewMode(config.force2D);
  const [listMode, setListMode] = useState(false);

  const { data } = useQuery({
    queryKey: ['exhibitIndex'],
    queryFn: () => callFn<{ sections: Section[]; productCounts: Record<string, number> }>('getExhibitIndex'),
  });

  const sections = useMemo(
    () => (data?.sections ?? []).filter((s) => s.isOpen).sort((a, b) => a.order - b.order),
    [data],
  );
  const stamps = progress?.stamps ?? {};
  const nextSection = sections.find((s) => !stamps[s.id]) ?? null;

  const view: LobbyView = listMode ? 'list' : (mode ?? '2d');

  const go = (s: Section) => router.push(`/zone/${s.slug}`);

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">전시장 조감도</h1>
        <p className="mt-1 text-gs-muted">
          {nextSection
            ? `다음 추천 코스는 ${String(nextSection.order).padStart(2, '0')} ${nextSection.title} 입니다.`
            : '모든 섹션을 둘러보셨습니다! 퇴점에서 완주를 확인하세요.'}
        </p>
      </header>

      <StampProgressBar sections={sections} stamps={stamps} />

      {/* 보기 전환 (vFairs 식 조감도/평면도/목록) */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ViewTab
          on={view === '3d'}
          disabled={locked}
          onClick={() => {
            setListMode(false);
            choose('3d');
          }}
          icon={<Box size={16} />}
          label="조감도 3D"
        />
        <ViewTab
          on={view === '2d'}
          onClick={() => {
            setListMode(false);
            choose('2d');
          }}
          icon={<MapIcon size={16} />}
          label="평면도 2D"
        />
        <ViewTab on={view === 'list'} onClick={() => setListMode(true)} icon={<List size={16} />} label="목록" />

        {auto?.reason && (
          <span className="flex items-center gap-1 text-xs text-gs-muted">
            <Info size={13} /> {auto.reason}
          </span>
        )}
      </div>

      {/* 씬 */}
      <div className="mt-3 overflow-hidden rounded-card border border-gs-line bg-white shadow-card">
        {view === 'list' ? (
          <SectionList sections={sections} stamps={stamps} counts={data?.productCounts ?? {}} />
        ) : (
          <div className="h-[56vh] min-h-[360px] w-full sm:h-[62vh]">
            {view === '3d' ? (
              <ExpoHallScene
                sections={sections}
                stamps={stamps}
                nextSectionId={nextSection?.id ?? null}
                onSelect={go}
                quality={quality}
              />
            ) : (
              <Map2DFallback
                sections={sections}
                stamps={stamps}
                nextSectionId={nextSection?.id ?? null}
                onSelect={go}
              />
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-sm text-gs-muted">
        구역을 눌러 이동하세요. {view === '3d' && '드래그로 좌우 회전, 두 손가락으로 확대할 수 있습니다.'}
      </p>

      {nextSection && (
        <Link href={`/zone/${nextSection.slug}`} className="gs-btn-primary mt-5 w-full sm:w-auto">
          {String(nextSection.order).padStart(2, '0')} {nextSection.title} 으로 이동
        </Link>
      )}
    </div>
  );
}

function ViewTab({
  on,
  onClick,
  icon,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn('gs-chip', on && 'gs-chip-on', disabled && 'opacity-40')}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionList({
  sections,
  stamps,
  counts,
}: {
  sections: Section[];
  stamps: Record<string, number>;
  counts: Record<string, number>;
}) {
  return (
    <ul className="divide-y divide-gs-line">
      {sections.map((s) => {
        const done = !!stamps[s.id];
        return (
          <li key={s.id}>
            <Link
              href={`/zone/${s.slug}`}
              className="flex min-h-[4.5rem] items-center gap-4 px-4 py-3 transition hover:bg-gs-surface"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-black text-white"
                style={{ background: done ? '#9fb6cf' : (s.color ?? '#0056b3') }}
              >
                {String(s.order).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">{s.title}</span>
                <span className="block truncate text-sm text-gs-muted">{s.subtitle}</span>
              </span>
              <span className="shrink-0 text-right text-sm">
                {done ? (
                  <span className="font-bold text-gs-mint-dark">스탬프 완료</span>
                ) : (
                  <span className="text-gs-muted">
                    {counts[s.id] ?? 0}개 · {s.estMinutes}분
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
