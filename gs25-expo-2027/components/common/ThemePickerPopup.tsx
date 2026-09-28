'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, BookOpen } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/lib/hooks/useTheme';

const OPTIONS: { mode: ThemeMode; label: string; desc: string; icon: typeof Sun; preview: string }[] = [
  {
    mode: 'light',
    label: '밝은 모드',
    desc: '주간 관람에 적합한 기본 모드',
    icon: Sun,
    preview: 'bg-[#f7fafe] border-[#d7e0ec] text-[#0e1a30]',
  },
  {
    mode: 'dark',
    label: '어두운 모드',
    desc: '눈의 피로를 줄여주는 다크 모드',
    icon: Moon,
    preview: 'bg-[#0f1b2e] border-[#1e3252] text-white',
  },
  {
    mode: 'paper',
    label: '편안한 모드',
    desc: '따뜻한 종이 느낌의 세피아 모드',
    icon: BookOpen,
    preview: 'bg-[#f5efe0] border-[#d9cdb7] text-[#3b2f1e]',
  },
];

/** 첫 방문 시 뜨는 테마 선택 팝업 */
export function ThemePickerPopup() {
  const { needPicker, setTheme, dismissPicker } = useTheme();

  return (
    <AnimatePresence>
      {needPicker && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={dismissPicker}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl border border-gs-line bg-gs-card p-6 shadow-2xl"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-gs-ink mb-1">보기 모드를 선택해 주세요</h2>
            <p className="text-sm text-gs-muted mb-5">선택은 하루 동안 유지됩니다. 언제든 상단에서 변경할 수 있어요.</p>

            <div className="space-y-3">
              {OPTIONS.map((o) => (
                <button
                  key={o.mode}
                  className="flex w-full items-center gap-4 rounded-xl border-2 border-gs-line bg-gs-card px-4 py-3.5 text-left transition hover:border-gs-blue hover:shadow-md active:scale-[0.98]"
                  onClick={() => setTheme(o.mode)}
                >
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${o.preview}`}>
                    <o.icon size={22} />
                  </span>
                  <span>
                    <span className="block text-base font-bold text-gs-ink">{o.label}</span>
                    <span className="block text-sm text-gs-muted">{o.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
