'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type ToastKind = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

const Ctx = createContext<{ push: (text: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 3600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {items.map((i) => (
            <motion.div
              key={i.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className={cn(
                'pointer-events-auto max-w-md rounded-pill px-5 py-3 text-base font-semibold shadow-lift',
                i.kind === 'success' && 'bg-gs-mint text-gs-ink',
                i.kind === 'error' && 'bg-state-critical text-white',
                i.kind === 'info' && 'bg-gs-ink text-white',
              )}
            >
              {i.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  // Provider 밖에서도 크래시 없이 동작하도록 no-op 폴백을 준다.
  return ctx ?? { push: () => {} };
}
