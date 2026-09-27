'use client';

import { useEffect, useRef } from 'react';

/**
 * 걸어 다니는 군중 캔버스 — 섹션 배경 장식.
 *
 * 원안(Skiper39 / codepen zadvorsky)은 gsap 으로 트윈을 돌린다.
 * 여기서는 **gsap 없이** requestAnimationFrame 으로 같은 움직임을 만든다.
 * 공개 랜딩에 배경 장식 하나 때문에 애니메이션 라이브러리(약 70KB)를 얹을 이유가 없다.
 * 움직임은 x 등속 이동 + 위아래 흔들림 두 가지뿐이라 직접 계산하는 편이 가볍다.
 *
 * 스프라이트: Open Peeps (CC0). 외부 CDN 을 쓰지 않고 직접 호스팅한다 —
 * 이 플랫폼은 폐쇄형이라 CSP 가 외부 이미지를 막는다.
 *
 * 접근성 — '동작 줄이기' 설정이면 애니메이션 없이 한 장면만 그린다.
 */

interface Peep {
  col: number;
  row: number;
  x: number;
  y: number;
  baseY: number;
  dir: 1 | -1;
  speed: number;
  bobPhase: number;
  bobSpeed: number;
  scale: number;
}

const BOB_PX = 6;

export function CrowdCanvas({
  src,
  rows = 15,
  cols = 7,
  count = 26,
  className,
}: {
  src: string;
  rows?: number;
  cols?: number;
  /** 동시에 걸어 다니는 인원 */
  count?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }

    let raf = 0;
    let disposed = false;
    const img = new Image();
    const peeps: Peep[] = [];
    let stageW = 0;
    let stageH = 0;
    let tileW = 0;
    let tileH = 0;

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    /** 한 명을 화면 밖 시작 위치로 돌려놓는다 */
    const reset = (p: Peep, spread: boolean) => {
      p.col = Math.floor(rand(0, rows));
      p.row = Math.floor(rand(0, cols));
      p.dir = Math.random() > 0.5 ? 1 : -1;
      // 원근감 — 아래쪽일수록 크게
      p.scale = rand(0.55, 1);
      const drawH = tileH * p.scale;
      // 아래쪽에 몰리되 약간 위로도 퍼지게
      p.baseY = stageH - drawH + rand(-stageH * 0.22, 8);
      p.y = p.baseY;
      p.speed = rand(14, 34) * p.scale;
      p.bobPhase = rand(0, Math.PI * 2);
      p.bobSpeed = rand(3.4, 5.2);
      const drawW = tileW * p.scale;
      if (spread) p.x = rand(-drawW, stageW);
      else p.x = p.dir === 1 ? -drawW : stageW;
    };

    const layout = () => {
      stageW = canvas.clientWidth;
      stageH = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(stageW * dpr));
      canvas.height = Math.max(1, Math.round(stageH * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tileW = img.naturalWidth / rows;
      tileH = img.naturalHeight / cols;
      peeps.forEach((p) => reset(p, true));
      peeps.sort((a, b) => a.baseY - b.baseY);
    };

    const draw = () => {
      ctx.clearRect(0, 0, stageW, stageH);
      for (const p of peeps) {
        const dw = tileW * p.scale;
        const dh = tileH * p.scale;
        ctx.save();
        ctx.translate(p.x + (p.dir === -1 ? dw : 0), p.y);
        ctx.scale(p.dir, 1);
        ctx.drawImage(
          img,
          p.col * tileW,
          p.row * tileH,
          tileW,
          tileH,
          0,
          0,
          dw,
          dh,
        );
        ctx.restore();
      }
    };

    let last = 0;
    const tick = (t: number) => {
      if (disposed) return;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;

      for (const p of peeps) {
        p.x += p.speed * p.dir * dt;
        p.bobPhase += p.bobSpeed * dt;
        p.y = p.baseY - Math.abs(Math.sin(p.bobPhase)) * BOB_PX * p.scale;
        const dw = tileW * p.scale;
        if (p.dir === 1 ? p.x > stageW : p.x < -dw) reset(p, false);
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      if (disposed) return;
      layout();
      if (reduced) draw();
    };

    img.onload = () => {
      if (disposed) return;
      for (let i = 0; i < count; i += 1) {
        peeps.push({
          col: 0,
          row: 0,
          x: 0,
          y: 0,
          baseY: 0,
          dir: 1,
          speed: 0,
          bobPhase: 0,
          bobSpeed: 0,
          scale: 1,
        });
      }
      layout();
      if (reduced) draw();
      else raf = requestAnimationFrame(tick);
      window.addEventListener('resize', onResize);
    };
    // 이미지를 못 불러와도 섹션은 그대로 보인다 — 배경 장식일 뿐이다.
    img.onerror = () => undefined;
    img.src = src;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      img.onload = null;
    };
  }, [src, rows, cols, count]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
