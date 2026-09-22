'use client';

import { useEffect, useState } from 'react';
import { safeStorage } from './utils';

export type ViewMode = '3d' | '2d';
export type Quality = 'high' | 'low';

const PREF_KEY = 'gs25expo.viewMode';

function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * T3-2 ⚡ · GPU 등급 판별 → 저사양이면 2D 폴백.
 * 우선순위: 관리자 강제 2D > 사용자 수동 선택 > 자동 판별
 */
export function useViewMode(force2D: boolean) {
  const [mode, setMode] = useState<ViewMode | null>(null);
  const [quality, setQuality] = useState<Quality>('low');
  const [auto, setAuto] = useState<{ tier: number; reason: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (force2D) {
        if (!cancelled) {
          setMode('2d');
          setAuto({ tier: -1, reason: '관리자 설정으로 전체 2D 모드입니다.' });
        }
        return;
      }

      const saved = safeStorage.get(PREF_KEY) as ViewMode | null;
      if (!webglSupported()) {
        if (!cancelled) {
          setMode('2d');
          setAuto({ tier: 0, reason: '이 기기는 3D(WebGL)를 지원하지 않습니다.' });
        }
        return;
      }

      let tier = 2;
      try {
        const { getGPUTier } = await import('detect-gpu');
        const res = await getGPUTier();
        tier = res.tier ?? 2;
      } catch {
        tier = 2;
      }
      if (cancelled) return;

      setQuality(tier >= 3 ? 'high' : 'low');
      setAuto({
        tier,
        reason: tier <= 1 ? '기기 성능에 맞춰 2D 평면도로 보여 드립니다.' : '',
      });
      setMode(saved ?? (tier <= 1 ? '2d' : '3d'));
    })();

    return () => {
      cancelled = true;
    };
  }, [force2D]);

  const choose = (next: ViewMode) => {
    if (force2D) return;
    safeStorage.set(PREF_KEY, next);
    setMode(next);
  };

  return { mode, quality, auto, choose, locked: force2D };
}
