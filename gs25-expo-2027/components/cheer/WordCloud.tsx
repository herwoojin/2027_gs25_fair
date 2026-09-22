'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordCloudItem } from '@/types';

/**
 * T5-7 · 워드클라우드.
 * 서버가 집계한 상위 80단어(aggregates/wordcloud_*)를 아르키메데스 나선으로 배치한다.
 * 캔버스는 컨테이너 크기에 맞춰 리사이즈되고, 단어 클릭 시 해당 단어를 상위로 전달한다.
 */
const PALETTE = ['#0056b3', '#00c2a8', '#003a7a', '#0096a2', '#2b7fff', '#0f223e'];

interface Placed {
  item: WordCloudItem;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  color: string;
}

export function WordCloud({
  items,
  selected,
  onSelect,
}: {
  items: WordCloudItem[];
  selected?: string | null;
  onSelect: (word: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const placedRef = useRef<Placed[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (items.length === 0) {
      ctx.fillStyle = '#98a8bd';
      ctx.font = '600 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('아직 응원 메시지가 없습니다.', W / 2, H / 2);
      placedRef.current = [];
      return;
    }

    const max = items[0].value;
    const min = items[items.length - 1].value;
    const base = Math.min(W, H) / 12;
    const placed: Placed[] = [];

    const hits = (a: Placed, b: Placed) =>
      Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

    items.forEach((item, i) => {
      const t = max === min ? 1 : (item.value - min) / (max - min);
      const size = Math.max(13, base * (0.45 + t * 1.25));
      ctx.font = `800 ${size}px sans-serif`;
      const w = ctx.measureText(item.text).width + 10;
      const h = size * 1.25;
      const color = PALETTE[i % PALETTE.length];

      let angle = 0;
      let radius = 0;
      let cand: Placed | null = null;
      for (let step = 0; step < 900; step++) {
        const x = W / 2 + radius * Math.cos(angle);
        const y = H / 2 + radius * Math.sin(angle) * 0.62;
        const p: Placed = { item, x, y, w, h, size, color };
        if (
          x - w / 2 > 2 &&
          x + w / 2 < W - 2 &&
          y - h / 2 > 2 &&
          y + h / 2 < H - 2 &&
          !placed.some((q) => hits(p, q))
        ) {
          cand = p;
          break;
        }
        angle += 0.32;
        radius += 0.85;
      }
      if (cand) placed.push(cand);
    });

    placedRef.current = placed;

    for (const p of placed) {
      ctx.font = `800 ${p.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const active = selected === p.item.text || hover === p.item.text;
      ctx.globalAlpha = selected && !active ? 0.28 : 1;
      ctx.fillStyle = active ? '#0f223e' : p.color;
      ctx.fillText(p.item.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }, [items, selected, hover]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return placedRef.current.find(
      (p) => Math.abs(p.x - x) < p.w / 2 && Math.abs(p.y - y) < p.h / 2,
    );
  };

  return (
    <div ref={wrapRef} className="relative h-56 w-full sm:h-72">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-pointer"
        onMouseMove={(e) => setHover(pick(e)?.item.text ?? null)}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const hit = pick(e);
          onSelect(hit ? (selected === hit.item.text ? null : hit.item.text) : null);
        }}
        role="img"
        aria-label={`응원 메시지 워드클라우드, 상위 단어 ${items.slice(0, 5).map((i) => i.text).join(', ')}`}
      />
    </div>
  );
}
