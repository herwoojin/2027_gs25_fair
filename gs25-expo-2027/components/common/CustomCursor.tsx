'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 데스크톱 전용 커스텀 커서.
 * 마우스가 있는 기기(pointer: fine)에서만 붙고, 터치·저사양·reduced-motion 에서는 아무것도 하지 않는다.
 * 기본 커서를 숨기지 않으므로(접근성) 보조 링만 따라다닌다.
 */
export function CustomCursor({ accent = '#2b7fff' }: { accent?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [hot, setHot] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;
    setEnabled(true);

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const el = e.target as HTMLElement | null;
      setHot(!!el?.closest('a, button, [role="button"], input, textarea, select'));
    };

    const tick = () => {
      // 살짝 지연시켜 따라오게 한다(관성)
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      if (ref.current) ref.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[400] hidden lg:block"
      style={{ willChange: 'transform' }}
    >
      <span
        className="block rounded-full border-2 transition-all duration-200"
        style={{
          width: hot ? 38 : 22,
          height: hot ? 38 : 22,
          marginLeft: hot ? -19 : -11,
          marginTop: hot ? -19 : -11,
          borderColor: accent,
          background: hot ? `${accent}22` : 'transparent',
        }}
      />
    </div>
  );
}
