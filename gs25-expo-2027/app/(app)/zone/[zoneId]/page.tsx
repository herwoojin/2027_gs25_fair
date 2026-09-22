'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, MessageSquarePlus, Route } from 'lucide-react';
import type { HeroMessage, Product, Quiz, Section } from '@/types';
import { callFn } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';
import { useViewMode } from '@/lib/gpuTier';
import { SectionBot } from '@/components/chat/SectionBot';
import { AskMdSheet } from '@/components/qa/AskMdSheet';
import { ProductListPanel } from '@/components/exhibit/ProductListPanel';
import { VideoZone } from '@/components/exhibit/VideoZone';
import { SouvenirZone } from '@/components/exhibit/SouvenirZone';
import { ExitZone } from '@/components/exhibit/ExitZone';
import { startShelfTour } from '@/lib/shelfTour';

const ShelfScene = dynamic(() => import('@/components/three/ShelfScene').then((m) => m.ShelfScene), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-[#f2f6fb]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-gs-blue" />
    </div>
  ),
});

interface SectionData {
  section: Section;
  products: Product[];
  quizzes: Quiz[];
  messages: HeroMessage[];
}

/** T3-5 · 섹션 템플릿 — 11개 섹션이 모두 이 라우트를 쓴다. */
export default function ZonePage({ params }: { params: { zoneId: string } }) {
  const router = useRouter();
  const { progress, config } = useSession();
  const { quality, mode } = useViewMode(config.force2D);
  const [askOpen, setAskOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['section', params.zoneId],
    queryFn: () => callFn<SectionData>('getSectionContent', { sectionId: params.zoneId }),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="gs-skeleton h-8 w-52" />
        <div className="gs-skeleton h-[46vh] w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-bold">섹션을 불러오지 못했습니다.</p>
        <Link href="/lobby" className="gs-btn-primary mt-4">
          로비로 돌아가기
        </Link>
      </div>
    );
  }

  const { section, products, messages } = data;
  const done = progress?.products ?? {};
  const visited = Object.fromEntries(products.map((p) => [p.id, !!done[p.id]?.doneAt]));
  const stamped = !!progress?.stamps?.[section.id];

  const openAsk = (text?: string) => {
    setPrefill(text);
    setAskOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => router.push('/lobby')}
          className="flex min-h-touch items-center gap-1 rounded-pill px-2 text-sm font-semibold text-gs-muted hover:bg-white"
        >
          <ArrowLeft size={18} /> 로비
        </button>
        <ChevronRight size={14} className="text-gs-line" />
        <span className="text-sm font-semibold text-gs-ink">
          {String(section.order).padStart(2, '0')} {section.title}
        </span>
      </div>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{section.title}</h1>
          <p className="mt-1 text-gs-muted">{section.subtitle}</p>
        </div>
        <span
          className={`rounded-pill px-4 py-2 text-sm font-bold ${
            stamped ? 'bg-gs-mint/20 text-gs-mint-dark' : 'bg-gs-blue-light text-gs-blue'
          }`}
        >
          {stamped ? '스탬프 획득 완료' : `필수 ${section.requiredProductIds.length}개 · 약 ${section.estMinutes}분`}
        </span>
      </header>

      {/* 섹션 타입별 본문 */}
      {section.type === 'video' && (
        <VideoZone section={section} products={products} messages={messages} />
      )}

      {section.type === 'souvenir' && <SouvenirZone section={section} products={products} />}

      {section.type === 'exit' && <ExitZone />}

      {section.type === 'shelf3d' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="overflow-hidden rounded-card border border-gs-line bg-white shadow-card">
            <div className="relative h-[46vh] min-h-[300px] sm:h-[54vh]">
              {mode === '3d' ? (
                <>
                  <ShelfScene
                    products={products}
                    visited={visited}
                    onSelect={(p) => router.push(`/zone/${section.slug}/product/${p.id}`)}
                    quality={quality}
                  />
                  <button
                    onClick={startShelfTour}
                    className="absolute left-3 top-3 flex min-h-[2.5rem] items-center gap-1.5 rounded-pill bg-white/95 px-3.5 text-sm font-bold text-gs-blue shadow-card backdrop-blur"
                  >
                    <Route size={16} /> 한 바퀴 자동 투어
                  </button>
                </>
              ) : (
                <div className="grid h-full place-items-center bg-gs-surface px-6 text-center">
                  <div>
                    <p className="font-bold text-gs-ink">2D 모드로 보고 계십니다</p>
                    <p className="mt-1 text-sm text-gs-muted">
                      아래 상품 목록에서 바로 선택하실 수 있습니다.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <ProductListPanel section={section} products={products} progress={done} />
        </div>
      )}

      {section.type === 'content' && (
        <ProductListPanel section={section} products={products} progress={done} variant="grid" />
      )}

      {/* 공통 플로팅 */}
      <SectionBot
        sectionId={section.id}
        sectionTitle={section.title}
        onAskMd={openAsk}
      />
      <button
        onClick={() => openAsk()}
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gs-mint text-gs-ink shadow-lift transition hover:bg-gs-mint-dark hover:text-white lg:right-6"
        style={{ bottom: 'calc(10.5rem + env(safe-area-inset-bottom))' }}
        aria-label="MD에게 질문하기"
      >
        <MessageSquarePlus size={24} />
      </button>

      <AskMdSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        sectionId={section.id}
        sectionTitle={section.title}
        prefill={prefill}
      />
    </div>
  );
}
