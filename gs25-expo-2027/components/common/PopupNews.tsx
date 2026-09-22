'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { PopupNews as PopupNewsType } from '@/types';
import { safeStorage, todayKey } from '@/lib/utils';

/**
 * T2-2 · 팝업 뉴스.
 * 데스크톱은 가운데 모달, 모바일은 하단 시트. "오늘 하루 보지 않기"는 localStorage(try/catch).
 */
export function PopupNews({ popup }: { popup: PopupNewsType | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!popup) return;
    const hidden = safeStorage.get(`popup.${popup.id}.hideUntil`);
    if (hidden === todayKey()) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [popup]);

  if (!popup) return null;

  const hideToday = () => {
    safeStorage.set(`popup.${popup.id}.hideUntil`, todayKey());
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="popup-title"
            className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-lift sm:rounded-3xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-br from-gs-blue to-gs-blue-dark px-6 pb-8 pt-7 text-white">
              <button
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-white/85 hover:bg-white/15"
              >
                <X size={22} />
              </button>
              <p className="mb-1 text-sm font-bold text-gs-mint">공지</p>
              <h2 id="popup-title" className="pr-10 text-xl font-bold leading-snug">
                {popup.title}
              </h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="whitespace-pre-line text-base leading-relaxed text-gs-muted">{popup.body}</p>
              {popup.ctaLabel && popup.ctaHref && (
                <Link
                  href={popup.ctaHref}
                  className="gs-btn-mint w-full"
                  onClick={() => setOpen(false)}
                >
                  {popup.ctaLabel}
                </Link>
              )}
            </div>
            <div className="flex border-t border-gs-line">
              <button
                onClick={hideToday}
                className="flex-1 py-4 text-sm font-semibold text-gs-muted hover:bg-gs-surface"
              >
                오늘 하루 보지 않기
              </button>
              <span className="w-px bg-gs-line" />
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-4 text-sm font-semibold text-gs-ink hover:bg-gs-surface"
              >
                닫기
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
