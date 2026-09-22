'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Lock, MapPin } from 'lucide-react';
import type { Product, Section } from '@/types';
import { callFn } from '@/lib/api';

export interface SouvenirView {
  id: string;
  order: number;
  shape: string;
  stampToHint: number;
  revealAt: number;
  revealed: boolean;
  hintOpen: boolean;
  name: string;
  hint: string | null;
  soldOut: boolean;
}

const SHAPE_EMOJI: Record<string, string> = {
  badge: '🎖️',
  keyring: '🔑',
  kit: '📦',
  pen: '🖊️',
  apparel: '🦺',
};

/** T7-5 · 기념품존(온라인) — 미스터리 박스 + 스탬프 단계 힌트 */
export function SouvenirZone({ section, products }: { section: Section; products: Product[] }) {
  const { data } = useQuery({
    queryKey: ['souvenirs'],
    queryFn: () => callFn<{ souvenirs: SouvenirView[]; stampCount: number }>('getSouvenirs'),
  });

  const items = data?.souvenirs ?? [];
  const stampCount = data?.stampCount ?? 0;
  const product = products[0];

  return (
    <div className="space-y-6">
      <div className="rounded-card bg-gs-ink px-5 py-6 text-white">
        <p className="text-sm font-bold text-gs-mint">현장 방문 한정</p>
        <h2 className="mt-1 text-2xl font-bold">무엇이 들어 있을까요?</h2>
        <p className="mt-2 text-white/70">
          스탬프 3 · 6 · 9개를 모으면 힌트가 하나씩 열립니다. 지금 스탬프 {stampCount}개.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((s, i) => (
          <SouvenirCard key={s.id} item={s} index={i} stampCount={stampCount} />
        ))}
      </div>

      {product && (
        <Link href={`/zone/${section.slug}/product/${product.id}`} className="gs-card block p-5 transition hover:shadow-lift">
          <p className="text-sm font-bold text-gs-blue">스탬프 받기</p>
          <p className="mt-1 text-lg font-bold">{product.name}</p>
          <p className="mt-1 text-sm text-gs-muted">
            기념품 운영 방식을 확인하고 퀴즈를 풀면 이 섹션 스탬프가 찍힙니다.
          </p>
        </Link>
      )}

      <Link href="/offline/reserve" className="gs-btn-mint w-full sm:w-auto">
        <MapPin size={18} /> 방문 예약하고 기념품 받기
      </Link>
    </div>
  );
}

function SouvenirCard({
  item,
  index,
  stampCount,
}: {
  item: SouvenirView;
  index: number;
  stampCount: number;
}) {
  const needed = Math.max(0, item.stampToHint - stampCount);

  return (
    <motion.div
      className="relative aspect-[3/4] overflow-hidden rounded-card border border-gs-line bg-white p-3 shadow-card"
      animate={item.hintOpen && !item.revealed ? { rotate: [0, -2, 2, -1.5, 0] } : {}}
      transition={{ duration: 0.7, repeat: item.hintOpen && !item.revealed ? Infinity : 0, repeatDelay: 3 }}
    >
      {item.soldOut && (
        <span className="absolute right-2 top-2 z-10 rounded-pill bg-state-critical px-2 py-0.5 text-[0.65rem] font-bold text-white">
          조기 소진
        </span>
      )}

      <div className="flex h-full flex-col items-center justify-center text-center">
        {item.revealed ? (
          <motion.div
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: index * 0.08 }}
            className="space-y-2"
          >
            <span className="text-4xl">{SHAPE_EMOJI[item.shape] ?? '🎁'}</span>
            <p className="text-sm font-bold leading-tight text-gs-ink">{item.name}</p>
            <p className="text-xs leading-snug text-gs-muted">{item.hint}</p>
          </motion.div>
        ) : item.hintOpen ? (
          <div className="space-y-2">
            <span className="text-4xl opacity-30">{SHAPE_EMOJI[item.shape] ?? '🎁'}</span>
            <p className="text-xs font-semibold leading-snug text-gs-ink">{item.hint}</p>
            <p className="text-[0.65rem] text-gs-muted">
              {new Date(item.revealAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 공개
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-4xl font-black text-gs-line">?</span>
            <p className="flex items-center justify-center gap-1 text-xs font-semibold text-gs-muted">
              <Lock size={12} /> 스탬프 {item.stampToHint}개
            </p>
            <p className="text-[0.65rem] text-gs-muted">{needed}개 더 모으면 힌트 공개</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
