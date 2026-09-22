'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Section } from '@/types';

interface CelebrationState {
  celebrate: (section: Section, stampCount: number) => void;
}

const Ctx = createContext<CelebrationState | null>(null);

/**
 * T4-3 · 스탬프 획득 연출.
 * 화면 중앙에 도장이 쾅 찍히고, 진동 + "n/11 스탬프" 토스트.
 */
export function StampCelebrationProvider({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState<{ section: Section; count: number } | null>(null);

  const celebrate = useCallback((section: Section, stampCount: number) => {
    setShown({ section, count: stampCount });
    try {
      navigator.vibrate?.([30, 40, 90]);
    } catch {
      /* 지원하지 않는 기기 */
    }
    setTimeout(() => setShown(null), 2600);
  }, []);

  const value = useMemo(() => ({ celebrate }), [celebrate]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AnimatePresence>
        {shown && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[150] grid place-items-center bg-black/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <motion.div
                className="mx-auto grid h-44 w-44 place-items-center rounded-full border-[6px] border-gs-mint bg-white/95 shadow-lift"
                initial={{ scale: 2.6, rotate: -22, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 9, stiffness: 240 }}
              >
                <div className="px-3 text-center">
                  <p className="text-xs font-black tracking-widest text-gs-mint-dark">STAMP</p>
                  <p className="mt-1 text-xl font-black leading-tight text-gs-ink">{shown.section.title}</p>
                  <p className="mt-1 text-sm font-bold text-gs-muted">
                    {String(shown.section.order).padStart(2, '0')}
                  </p>
                </div>
              </motion.div>
              <motion.p
                className="mt-6 inline-block rounded-pill bg-white px-6 py-3 text-lg font-black text-gs-blue shadow-lift"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.35 }}
              >
                {shown.count}/11 스탬프
              </motion.p>
              {shown.count >= 10 && (
                <motion.p
                  className="mt-3 text-base font-bold text-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  퇴점에서 완주를 확인하세요!
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export function useStampCelebration() {
  return useContext(Ctx) ?? { celebrate: () => {} };
}
