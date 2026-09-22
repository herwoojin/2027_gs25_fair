'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Gift, MapPin } from 'lucide-react';
import { callFn } from '@/lib/api';
import type { SouvenirView } from '@/components/exhibit/SouvenirZone';

const SHAPE_EMOJI: Record<string, string> = {
  badge: '🎖️',
  keyring: '🔑',
  kit: '📦',
  pen: '🖊️',
  apparel: '🦺',
};

/** T7-5 · /souvenir-promo — 현장 기념품 홍보 (공개 일정별 리빌) */
export default function SouvenirPromoPage() {
  const { data } = useQuery({
    queryKey: ['souvenirs'],
    queryFn: () => callFn<{ souvenirs: SouvenirView[]; stampCount: number }>('getSouvenirs'),
  });

  const items = data?.souvenirs ?? [];
  const revealedCount = items.filter((i) => i.revealed).length;

  return (
    <div className="pb-24">
      <section className="bg-gs-ink px-5 py-12 text-center text-white">
        <p className="text-sm font-bold text-gs-mint">현장에서만 받을 수 있어요</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">기념품 {items.length}종</h1>
        <p className="mx-auto mt-3 max-w-md text-white/70">
          {revealedCount === 0
            ? '아직 아무것도 공개되지 않았습니다. 각 도시 행사 시작일에 하나씩 열립니다.'
            : `${revealedCount}종이 공개되었습니다. 나머지는 순회가 진행되며 열립니다.`}
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="relative aspect-[3/4] overflow-hidden rounded-card border border-gs-line bg-white p-3 shadow-card"
            >
              {s.soldOut && (
                <span className="absolute right-2 top-2 rounded-pill bg-state-critical px-2 py-0.5 text-[0.65rem] font-bold text-white">
                  조기 소진
                </span>
              )}
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                {s.revealed ? (
                  <>
                    <span className="text-4xl">{SHAPE_EMOJI[s.shape] ?? '🎁'}</span>
                    <p className="text-sm font-bold leading-tight">{s.name}</p>
                    <p className="text-xs leading-snug text-gs-muted">{s.hint}</p>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-black text-gs-line">?</span>
                    <p className="text-xs font-semibold text-gs-muted">
                      {new Date(s.revealAt).toLocaleDateString('ko-KR', {
                        month: 'numeric',
                        day: 'numeric',
                      })}{' '}
                      공개
                    </p>
                    {s.hint && <p className="text-[0.65rem] leading-snug text-gs-muted">{s.hint}</p>}
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="gs-card mt-8 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Gift size={20} className="text-gs-blue" /> 받는 방법
          </h2>
          <ol className="mt-3 space-y-2 text-base text-gs-muted">
            <li>1. 우리 지역 행사 타임을 예약합니다.</li>
            <li>2. 각인이 들어가는 품목은 예약할 때 문구를 미리 입력합니다.</li>
            <li>3. 현장에서 QR을 보여 주고 체크인하면 바로 받으실 수 있습니다.</li>
          </ol>
          <p className="mt-3 text-sm text-gs-muted">
            수량이 한정되어 있어 타임별로 조기 소진될 수 있습니다.
          </p>
        </div>
      </section>

      {/* 하단 고정 CTA */}
      <div
        className="fixed inset-x-0 z-30 border-t border-gs-line bg-white/98 px-4 py-3 backdrop-blur lg:left-60"
        style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
      >
        <Link href="/offline/reserve" className="gs-btn-primary mx-auto w-full max-w-md">
          <MapPin size={18} /> 방문 예약하기
        </Link>
      </div>
    </div>
  );
}
