'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Send, X, MessageSquarePlus } from 'lucide-react';
import { callFn, type ApiError } from '@/lib/api';

interface Turn {
  role: 'user' | 'bot';
  text: string;
  grounded?: boolean;
}

/**
 * T5-5 · 섹션 AI 챗봇.
 * 등록된 상품자료 범위 안에서만 답하고, 모르면 "MD에게 질문하기"로 연결한다.
 * 1인 1일 50회 제한은 서버에서 강제한다.
 */
export function SectionBot({
  sectionId,
  sectionTitle,
  productName,
  onAskMd,
}: {
  sectionId: string;
  sectionTitle: string;
  productName?: string;
  onAskMd: (prefill?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || chips.length) return;
    callFn<{ chips: string[] }>('getSuggestedQuestions', { sectionId })
      .then((r) => setChips(r.chips))
      .catch(() => {});
  }, [open, sectionId, chips.length]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setTurns((t) => [...t, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await callFn<{ text: string; grounded: boolean; remaining: number }>('askSectionBot', {
        sectionId,
        message,
      });
      setTurns((t) => [...t, { role: 'bot', text: res.text, grounded: res.grounded }]);
      setRemaining(res.remaining);
    } catch (err) {
      setTurns((t) => [...t, { role: 'bot', text: (err as ApiError).message, grounded: false }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="AI 안내 도우미 열기"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gs-blue text-white shadow-lift transition hover:bg-gs-blue-dark lg:bottom-20 lg:right-6"
        style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
      >
        <Bot size={26} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="flex h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift sm:h-[70dvh] sm:rounded-3xl"
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              exit={{ y: 50 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-gs-line px-4 py-3">
                <div>
                  <p className="flex items-center gap-2 text-base font-bold">
                    <Bot size={18} className="text-gs-blue" /> 안내 도우미
                  </p>
                  <p className="text-xs text-gs-muted">
                    {sectionTitle}
                    {productName ? ` · ${productName}` : ''} 자료 기준으로 답변합니다
                  </p>
                </div>
                <button aria-label="닫기" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-full text-gs-muted hover:bg-gs-surface">
                  <X size={22} />
                </button>
              </header>

              <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {turns.length === 0 && (
                  <div className="rounded-2xl bg-gs-surface p-4 text-sm text-gs-muted">
                    이 섹션에 등록된 상품 자료 안에서 답변해 드립니다. 자료에 없는 내용은 추측하지 않고 담당
                    MD 연결을 안내합니다.
                  </div>
                )}
                {turns.map((t, i) => (
                  <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div
                      className={
                        t.role === 'user'
                          ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-gs-blue px-4 py-2.5 text-base text-white'
                          : 'max-w-[90%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-gs-surface px-4 py-3 text-base text-gs-ink'
                      }
                    >
                      {t.text}
                      {t.role === 'bot' && (
                        <button
                          onClick={() => {
                            setOpen(false);
                            onAskMd(turns.filter((x) => x.role === 'user').slice(-1)[0]?.text);
                          }}
                          className="mt-3 flex min-h-[2.25rem] items-center gap-1.5 rounded-pill border border-gs-line bg-white px-3 text-sm font-semibold text-gs-blue"
                        >
                          <MessageSquarePlus size={15} /> MD에게 질문하기
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex gap-1.5 px-2">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-gs-muted/50"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {chips.length > 0 && turns.length === 0 && (
                <div className="flex gap-2 overflow-x-auto px-4 pb-2">
                  {chips.map((c) => (
                    <button key={c} onClick={() => send(c)} className="gs-chip shrink-0">
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <form
                className="flex items-center gap-2 border-t border-gs-line p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <input
                  className="gs-input flex-1 text-base"
                  placeholder="궁금한 점을 입력해 주세요"
                  value={input}
                  maxLength={300}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gs-blue text-white disabled:opacity-40"
                  disabled={!input.trim() || busy}
                  aria-label="보내기"
                >
                  <Send size={18} />
                </button>
              </form>
              {remaining !== null && (
                <p className="pb-2 text-center text-xs text-gs-muted">오늘 남은 질문 {remaining}회</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
