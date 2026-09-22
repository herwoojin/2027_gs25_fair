'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, RotateCcw, X } from 'lucide-react';
import type { Quiz } from '@/types';
import { cn } from '@/lib/utils';

/**
 * T4-3 · 확인 퀴즈 (4지선다, 큰 버튼).
 * 채점은 반드시 서버에서 한다. 클라이언트는 정답 인덱스를 알지 못한다.
 */
export function QuizCard({
  quiz,
  disabled,
  disabledReason,
  alreadyCorrect,
  onSubmit,
}: {
  quiz: Quiz;
  disabled?: boolean;
  disabledReason?: string;
  alreadyCorrect?: boolean;
  onSubmit: (choice: number) => Promise<{ correct: boolean; explanation: string; attempts: number }>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (selected === null) return;
    setBusy(true);
    try {
      const res = await onSubmit(selected);
      setResult({ correct: res.correct, explanation: res.explanation });
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setResult(null);
    setSelected(null);
  };

  if (alreadyCorrect && !result) {
    return (
      <div className="gs-card border-gs-mint/50 bg-gs-mint/10 p-5">
        <p className="flex items-center gap-2 text-base font-bold text-gs-mint-dark">
          <Check size={20} /> 확인 퀴즈를 맞히셨습니다
        </p>
        <p className="mt-1 text-sm text-gs-muted">{quiz.question}</p>
      </div>
    );
  }

  return (
    <section className="gs-card p-5">
      <p className="mb-1 text-sm font-bold text-gs-blue">확인 퀴즈</p>
      <h3 className="text-lg font-bold leading-snug">{quiz.question}</h3>

      <ul className="mt-4 space-y-2">
        {quiz.options.map((opt, i) => {
          const on = selected === i;
          const showWrong = result && !result.correct && on;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!!result || disabled}
                onClick={() => setSelected(i)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base font-semibold transition',
                  'min-h-[3.25rem]',
                  on && !result && 'border-gs-blue bg-gs-blue-light text-gs-blue',
                  !on && !result && 'border-gs-line hover:bg-gs-surface',
                  showWrong && 'border-state-critical bg-red-50 text-state-critical',
                  result?.correct && on && 'border-gs-mint bg-gs-mint/15 text-gs-mint-dark',
                  disabled && 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black',
                    on ? 'bg-gs-blue text-white' : 'bg-gs-line text-gs-muted',
                    showWrong && 'bg-state-critical text-white',
                    result?.correct && on && 'bg-gs-mint text-white',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {disabled && disabledReason && (
        <p className="mt-3 rounded-xl bg-gs-surface px-4 py-3 text-sm text-gs-muted">{disabledReason}</p>
      )}

      {!result ? (
        <button
          className="gs-btn-primary mt-4 w-full"
          disabled={selected === null || busy || disabled}
          onClick={submit}
        >
          {busy ? '채점 중…' : '정답 확인'}
        </button>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          <div
            className={cn(
              'rounded-xl p-4',
              result.correct ? 'bg-gs-mint/15' : 'bg-red-50',
            )}
          >
            <p
              className={cn(
                'flex items-center gap-2 text-base font-bold',
                result.correct ? 'text-gs-mint-dark' : 'text-state-critical',
              )}
            >
              {result.correct ? <Check size={20} /> : <X size={20} />}
              {result.correct ? '정답입니다!' : '다시 한 번 생각해 볼까요?'}
            </p>
            <p className="mt-2 text-base leading-relaxed text-gs-ink">{result.explanation}</p>
          </div>
          {!result.correct && (
            <button className="gs-btn-ghost mt-3 w-full" onClick={retry}>
              <RotateCcw size={17} /> 다시 풀기
            </button>
          )}
        </motion.div>
      )}
    </section>
  );
}
