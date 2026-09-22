'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { callFn, type ApiError } from '@/lib/api';
import { useToast } from '@/components/common/Toast';

/**
 * T5-1 · MD에게 질문 바텀시트.
 * 질문 등록 즉시 서버가 담당 MD에게 문자를 보낸다(onQuestionCreate).
 */
export function AskMdSheet({
  open,
  onClose,
  sectionId,
  sectionTitle,
  productId,
  prefill,
  channel = 'section',
}: {
  open: boolean;
  onClose: () => void;
  sectionId?: string;
  sectionTitle?: string;
  productId?: string;
  prefill?: string;
  channel?: 'section' | 'hq';
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setText(prefill ?? '');
  }, [open, prefill]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await callFn('createQuestion', { channel, sectionId, productId, text: text.trim() });
      toast.push('질문이 접수되었습니다. 답변은 문자로 보내 드립니다.', 'success');
      setText('');
      onClose();
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-lift sm:rounded-3xl"
            initial={{ y: 60 }}
            animate={{ y: 0 }}
            exit={{ y: 50 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">
                  {channel === 'hq' ? '본사에 무엇이든 물어보세요' : 'MD에게 질문하기'}
                </h2>
                <p className="mt-0.5 text-sm text-gs-muted">
                  {channel === 'hq'
                    ? '답변은 공개 피드에 함께 올라갑니다.'
                    : `${sectionTitle ?? ''} 담당 MD에게 바로 전달됩니다.`}
                </p>
              </div>
              <button type="button" aria-label="닫기" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full text-gs-muted hover:bg-gs-surface">
                <X size={22} />
              </button>
            </div>

            <textarea
              className="gs-input min-h-[8rem] resize-none py-3 leading-relaxed"
              placeholder="궁금한 점을 자유롭게 적어 주세요. (최대 500자)"
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
            <div className="mt-1 text-right text-xs text-gs-muted">{text.length}/500</div>

            <p className="mt-3 rounded-xl bg-gs-surface p-3 text-xs text-gs-muted">
              작성자는 “○○권 경영주”로 익명 표시되며, 점포명은 공개되지 않습니다. 답변이 등록되면 등록된
              번호로 문자를 보내 드립니다.
            </p>

            <button className="gs-btn-primary mt-4 w-full" disabled={text.trim().length < 2 || busy}>
              {busy ? '보내는 중…' : '질문 보내기'}
            </button>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
