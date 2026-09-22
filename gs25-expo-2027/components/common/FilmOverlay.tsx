'use client';

import { cn } from '@/lib/utils';

/**
 * 시네마틱 질감 레이어 — 필름 그레인 · 비네트 · 레터박스 · 스캔라인.
 * 전부 CSS 로만 처리해 GPU 부담이 거의 없고, 모두 pointer-events:none 이라
 * 아래 콘텐츠의 클릭·스크롤을 방해하지 않는다.
 * `prefers-reduced-motion` 에서는 애니메이션이 멈춘다(globals.css).
 */
export function FilmOverlay({
  letterbox = false,
  grain = true,
  vignette = true,
  scanline = false,
  accent = '#2b7fff',
}: {
  letterbox?: boolean;
  grain?: boolean;
  vignette?: boolean;
  scanline?: boolean;
  accent?: string;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {grain && <div className="gs-grain" />}
      {vignette && <div className="gs-vignette" />}
      {scanline && (
        <div className="gs-scan" style={{ background: `linear-gradient(90deg, transparent, ${accent}22, transparent)` }} />
      )}
      {letterbox && (
        <>
          <div className="gs-letterbox gs-letterbox-top" />
          <div className="gs-letterbox gs-letterbox-bottom" />
        </>
      )}
    </div>
  );
}

/** 섹션 상단에 얹는 얇은 accent 진행 라인 */
export function AccentRule({ accent, className }: { accent: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block h-[3px] w-full rounded-pill transition-colors duration-700', className)}
      style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
    />
  );
}
