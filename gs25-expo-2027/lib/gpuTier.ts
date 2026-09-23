'use client';

import { useEffect, useState } from 'react';
import { safeStorage } from './utils';

export type ViewMode = '3d' | '2d';
export type Quality = 'high' | 'low';

const PREF_KEY = 'gs25expo.viewMode';

/**
 * GPU 등급 판정.
 *
 * ⚠️ detect-gpu 는 unpkg.com 에서 벤치마크 JSON 을 내려받는다.
 * 이 플랫폼은 폐쇄형이라 CSP 가 외부 CDN 을 차단하므로(의도된 정책) 매번 위반 로그가 남고
 * 결국 폴백 등급으로 떨어진다. 그래서 **외부 요청 없이** 로컬에서 판정한다.
 *
 * tier 0 = WebGL 미지원 · 1 = 저사양 · 2 = 보통 · 3 = 고사양
 */
function detectTier(): { tier: number; renderer: string } {
  let gl: WebGLRenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return { tier: 0, renderer: '' };

  let renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
  } catch {
    renderer = '';
  }
  const r = renderer.toLowerCase();

  // 소프트웨어 렌더링 — 3D 를 띄우면 사실상 멈춘다.
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(r)) return { tier: 0, renderer };

  // 구형 모바일 GPU / 저사양 내장그래픽
  const lowEnd =
    /mali-(4|6|t6|t7|t8)/.test(r) ||
    /adreno \(tm\) (3|4|5)\d\d/.test(r) ||
    /powervr (sgx|rogue g6)/.test(r) ||
    /intel.*(hd graphics (2|3|4)\d\d\d|gma)/.test(r);

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  if (lowEnd || cores <= 2 || memory <= 2) return { tier: 1, renderer };

  // 고사양 — 외장 GPU 또는 Apple Silicon 계열
  const highEnd =
    /nvidia|geforce|rtx|radeon (rx|pro)|apple m\d/.test(r) || (cores >= 8 && memory >= 8);

  return { tier: highEnd ? 3 : 2, renderer };
}

/**
 * T3-2 ⚡ · GPU 등급 판별 → 저사양이면 2D 폴백.
 * 우선순위: 관리자 강제 2D > 사용자 수동 선택 > 자동 판별
 * '동작 줄이기(prefers-reduced-motion)' 설정도 2D 로 본다.
 */
export function useViewMode(force2D: boolean) {
  const [mode, setMode] = useState<ViewMode | null>(null);
  const [quality, setQuality] = useState<Quality>('low');
  const [auto, setAuto] = useState<{ tier: number; reason: string } | null>(null);

  useEffect(() => {
    if (force2D) {
      setMode('2d');
      setAuto({ tier: -1, reason: '관리자 설정으로 전체 2D 모드입니다.' });
      return;
    }

    const saved = safeStorage.get(PREF_KEY) as ViewMode | null;
    const { tier } = detectTier();

    if (tier === 0) {
      setMode('2d');
      setAuto({ tier: 0, reason: '이 기기는 3D(WebGL)를 지원하지 않습니다.' });
      return;
    }

    let reducedMotion = false;
    try {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reducedMotion = false;
    }

    setQuality(tier >= 3 ? 'high' : 'low');
    setAuto({
      tier,
      reason: reducedMotion
        ? '동작 줄이기 설정이 켜져 있어 2D 평면도로 보여 드립니다.'
        : tier <= 1
          ? '기기 성능에 맞춰 2D 평면도로 보여 드립니다.'
          : '',
    });
    setMode(saved ?? (tier <= 1 || reducedMotion ? '2d' : '3d'));
  }, [force2D]);

  const choose = (next: ViewMode) => {
    if (force2D) return;
    safeStorage.set(PREF_KEY, next);
    setMode(next);
  };

  return { mode, quality, auto, choose, locked: force2D };
}
