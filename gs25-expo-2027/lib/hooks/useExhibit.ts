'use client';

import { useCallback, useRef } from 'react';
import type { Progress, Section } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { useSession } from './useSession';
import { useStampCelebration } from '@/components/exhibit/StampCelebration';
import { useToast } from '@/components/common/Toast';

/**
 * 상품 진행 이벤트를 서버로 보내는 단일 창구.
 * 클라이언트는 상태를 만들지 않고 **서버가 돌려준 progress 만** 신뢰한다.
 */
export function useExhibit(sections: Section[] = []) {
  const { progress, setProgress } = useSession();
  const { celebrate } = useStampCelebration();
  const toast = useToast();
  const sentEnter = useRef<Set<string>>(new Set());
  const sentConsumed = useRef<Set<string>>(new Set());

  const applyProgress = useCallback(
    (next: Progress, prev: Progress | null) => {
      setProgress(next);
      const before = new Set(Object.keys(prev?.stamps ?? {}));
      const added = Object.keys(next.stamps).find((id) => !before.has(id));
      if (added) {
        const section = sections.find((s) => s.id === added);
        if (section) celebrate(section, next.stampCount);
      }
    },
    [setProgress, celebrate, sections],
  );

  const enter = useCallback(
    async (productId: string) => {
      if (sentEnter.current.has(productId)) return;
      sentEnter.current.add(productId);
      try {
        const res = await callFn<{ progress: Progress }>('markProductProgress', {
          productId,
          event: 'enter',
        });
        applyProgress(res.progress, progress);
      } catch (err) {
        sentEnter.current.delete(productId);
        toast.push((err as ApiError).message, 'error');
      }
    },
    [applyProgress, progress, toast],
  );

  const consumed = useCallback(
    async (productId: string) => {
      if (sentConsumed.current.has(productId)) return;
      sentConsumed.current.add(productId);
      try {
        const res = await callFn<{ progress: Progress }>('markProductProgress', {
          productId,
          event: 'consumed',
        });
        applyProgress(res.progress, progress);
      } catch (err) {
        sentConsumed.current.delete(productId);
        const e = err as ApiError;
        // enter 없이 호출된 경우 등 — 서버가 거부한다.
        if (e.code !== 'invalid-sequence') toast.push(e.message, 'error');
      }
    },
    [applyProgress, progress, toast],
  );

  const submitQuiz = useCallback(
    async (productId: string, choice: number) => {
      const res = await callFn<{
        correct: boolean;
        explanation: string;
        firstTry: boolean;
        attempts: number;
        progress: Progress;
        stampGranted: Section | null;
      }>('submitQuiz', { productId, choice });
      applyProgress(res.progress, progress);
      return res;
    },
    [applyProgress, progress],
  );

  /** 완료 조건 재확인 — 최소 체류시간이 지난 뒤 서버에 한 번 더 알린다. */
  const recheck = useCallback(
    async (productId: string) => {
      try {
        const res = await callFn<{ progress: Progress }>('markProductProgress', {
          productId,
          event: 'consumed',
        });
        applyProgress(res.progress, progress);
      } catch {
        /* 아직 조건 미충족 */
      }
    },
    [applyProgress, progress],
  );

  return { progress, enter, consumed, submitQuiz, recheck };
}
