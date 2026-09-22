'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Clock, Headphones, MessageSquarePlus } from 'lucide-react';
import type { HeroMessage, Product, Quiz, Section } from '@/types';
import { callFn } from '@/lib/api';
import { useExhibit } from '@/lib/hooks/useExhibit';
import { cn } from '@/lib/utils';
import { MediaPlayer } from '@/components/exhibit/MediaPlayer';
import { QuizCard } from '@/components/exhibit/QuizCard';
import { SectionBot } from '@/components/chat/SectionBot';
import { AskMdSheet } from '@/components/qa/AskMdSheet';

interface ProductData {
  product: Product;
  quiz: Quiz | null;
  section: Section;
  prevId: string | null;
  nextId: string | null;
  message: HeroMessage | null;
}

/**
 * T4-1 / T4-3 · 상품 상세.
 * 완료 조건(서버 판정): 오디오 90% 또는 스크립트 끝까지 스크롤 + 최소 체류시간 + 퀴즈 정답
 */
export default function ProductPage({ params }: { params: { zoneId: string; pid: string } }) {
  const router = useRouter();
  const [askOpen, setAskOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | undefined>();
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [audioDone, setAudioDone] = useState(false);
  const [dwell, setDwell] = useState(0);
  const scriptRef = useRef<HTMLDivElement>(null);

  const { data: index } = useQuery({
    queryKey: ['exhibitIndex'],
    queryFn: () => callFn<{ sections: Section[] }>('getExhibitIndex'),
    staleTime: 10 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['product', params.pid],
    queryFn: () => callFn<ProductData>('getProductContent', { productId: params.pid }),
  });

  const { progress, enter, consumed, submitQuiz, recheck } = useExhibit(index?.sections ?? []);

  // 상세 진입 시 서버에 enter 기록 (서버 시각 기준)
  useEffect(() => {
    void enter(params.pid);
    setScrolledEnd(false);
    setAudioDone(false);
    setDwell(0);
  }, [params.pid, enter]);

  useEffect(() => {
    const id = setInterval(() => setDwell((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [params.pid]);

  // 오디오 90% 또는 스크립트 끝 도달 → consumed
  useEffect(() => {
    if (scrolledEnd || audioDone) void consumed(params.pid);
  }, [scrolledEnd, audioDone, params.pid, consumed]);

  const rec = progress?.products?.[params.pid];
  const minDwell = data?.section.minDwellSec ?? 20;
  const dwellRemain = Math.max(0, minDwell - dwell);
  const consumedOk = !!rec?.consumedAt;
  const done = !!rec?.doneAt;

  // 체류시간이 채워지면 서버에 한 번 더 확인 요청 (퀴즈 없는 상품의 완료 처리)
  useEffect(() => {
    if (!done && consumedOk && dwellRemain === 0 && !data?.quiz) void recheck(params.pid);
  }, [done, consumedOk, dwellRemain, data?.quiz, params.pid, recheck]);

  const scriptParas = useMemo(
    () => (data?.product.script ?? '').split('\n').filter(Boolean),
    [data?.product.script],
  );

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="gs-skeleton h-8 w-48" />
        <div className="gs-skeleton h-56 w-full" />
        <div className="gs-skeleton h-40 w-full" />
      </div>
    );
  }

  const { product, quiz, section, prevId, nextId } = data;
  const isVideo = section.type === 'video';

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/zone/${section.slug}`}
          className="flex min-h-touch items-center gap-1 rounded-pill px-2 text-sm font-semibold text-gs-muted hover:bg-white"
        >
          <ArrowLeft size={18} /> {section.title}
        </Link>
        {done && (
          <span className="flex items-center gap-1 rounded-pill bg-gs-mint/20 px-3 py-1.5 text-sm font-bold text-gs-mint-dark">
            <Check size={15} /> 완료
          </span>
        )}
      </div>

      <header className="mb-4">
        <span
          className="inline-block rounded-pill px-3 py-1 text-xs font-bold text-white"
          style={{ background: product.color ?? '#0056b3' }}
        >
          {product.category}
        </span>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{product.name}</h1>
        {product.launchDate && (
          <p className="mt-1 text-sm text-gs-muted">출시 예정 · {product.launchDate}</p>
        )}
      </header>

      {/* 핵심 포인트 3줄 */}
      <ul className="gs-card mb-4 space-y-2 p-4">
        {product.summary3.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-base leading-relaxed">
            <span className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full bg-gs-mint" />
            {s}
          </li>
        ))}
      </ul>

      {/* 오디오 가이드 / 영상 */}
      <div className="mb-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gs-muted">
          <Headphones size={15} /> {isVideo ? '영상 설명' : 'MD 오디오 설명'}
        </p>
        <MediaPlayer
          key={product.id}
          src={null /* 운영: Storage 15분 만료 서명 URL */}
          durationSec={data.message?.durationSec ?? Math.max(45, Math.round(product.script.length / 5))}
          kind={isVideo ? 'video' : 'audio'}
          autoPlayMuted={isVideo}
          onConsumed={() => setAudioDone(true)}
        />
      </div>

      {/* 스크립트 리더 — 끝 도달 감지 */}
      <section className="gs-card mb-4 overflow-hidden">
        <header className="flex items-center justify-between border-b border-gs-line px-4 py-3">
          <h2 className="text-base font-bold">설명 원고</h2>
          <span className={cn('text-sm font-semibold', scrolledEnd ? 'text-gs-mint-dark' : 'text-gs-muted')}>
            {scrolledEnd ? '끝까지 읽음' : '스크롤해서 끝까지 읽어 주세요'}
          </span>
        </header>
        <div
          ref={scriptRef}
          className="max-h-72 overflow-y-auto px-4 py-4 text-base leading-[1.85]"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledEnd(true);
          }}
        >
          {scriptParas.map((p, i) => (
            <p key={i} className="mb-4 last:mb-0">
              {p}
            </p>
          ))}
          <div className="h-px" />
        </div>
      </section>

      {/* 완료 조건 안내 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Cond on={consumedOk} label={isVideo ? '영상 90% 시청' : '오디오 90% 또는 원고 완독'} />
        <Cond
          on={dwellRemain === 0}
          label={dwellRemain === 0 ? `체류 ${minDwell}초 충족` : `체류 ${dwellRemain}초 남음`}
          icon={<Clock size={13} />}
        />
        {quiz && <Cond on={!!rec?.quizCorrect} label="확인 퀴즈 정답" />}
      </div>

      {/* 퀴즈 */}
      {quiz && (
        <QuizCard
          quiz={quiz}
          alreadyCorrect={!!rec?.quizCorrect}
          disabled={!consumedOk}
          disabledReason="설명을 먼저 듣거나 원고를 끝까지 읽어 주세요."
          onSubmit={async (choice) => {
            const res = await submitQuiz(product.id, choice);
            return { correct: res.correct, explanation: res.explanation, attempts: res.attempts };
          }}
        />
      )}

      {/* 이전/다음 상품 (WithSpace 식 자동 이동) */}
      <nav className="mt-6 flex items-center justify-between gap-3">
        <button
          className="gs-btn-ghost flex-1 disabled:opacity-40"
          disabled={!prevId}
          onClick={() => prevId && router.push(`/zone/${section.slug}/product/${prevId}`)}
        >
          <ArrowLeft size={17} /> 이전
        </button>
        <button
          className="gs-btn-primary flex-1"
          onClick={() =>
            nextId
              ? router.push(`/zone/${section.slug}/product/${nextId}`)
              : router.push(`/zone/${section.slug}`)
          }
        >
          {nextId ? '다음 상품' : '섹션으로'} <ArrowRight size={17} />
        </button>
      </nav>

      <SectionBot
        sectionId={section.id}
        sectionTitle={section.title}
        productName={product.name}
        onAskMd={(t) => {
          setPrefill(t ?? `[${product.name}] `);
          setAskOpen(true);
        }}
      />
      <button
        onClick={() => {
          setPrefill(`[${product.name}] `);
          setAskOpen(true);
        }}
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gs-mint text-gs-ink shadow-lift lg:right-6"
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
        productId={product.id}
        prefill={prefill}
      />
    </div>
  );
}

function Cond({ on, label, icon }: { on: boolean; label: string; icon?: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold',
        on ? 'bg-gs-mint/20 text-gs-mint-dark' : 'bg-gs-line/60 text-gs-muted',
      )}
    >
      {on ? <Check size={14} /> : (icon ?? <span className="h-3.5 w-3.5 rounded-full border-2 border-current" />)}
      {label}
    </span>
  );
}
