'use client';

import { useState } from 'react';
import type { Section } from '@/types';

/**
 * T3-2 ⚡ · 2D 일러스트 평면도 폴백.
 * 3D 씬과 같은 11개 클릭 영역·같은 좌표계(hallPosition)를 사용하므로
 * 3D/2D 를 오가도 배치가 동일하다.
 */
const VIEW = { minX: -28, maxX: 28, minZ: -20, maxZ: 20 };
const W = VIEW.maxX - VIEW.minX;
const H = VIEW.maxZ - VIEW.minZ;

export function Map2DFallback({
  sections,
  stamps,
  nextSectionId,
  onSelect,
}: {
  sections: Section[];
  stamps: Record<string, number>;
  nextSectionId: string | null;
  onSelect: (s: Section) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const ordered = [...sections].sort((a, b) => a.order - b.order);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full touch-pan-y"
      role="img"
      aria-label="박람회장 평면도"
    >
      <defs>
        <pattern id="grid2d" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M 4 0 L 0 0 0 4" fill="none" stroke="#e4ecf6" strokeWidth="0.15" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#f7fafd" />
      <rect width={W} height={H} fill="url(#grid2d)" />

      {/* 동선 */}
      <polyline
        points={ordered
          .map((s) => `${s.hallPosition.x - VIEW.minX},${VIEW.maxZ - s.hallPosition.z}`)
          .join(' ')}
        fill="none"
        stroke="#00c2a8"
        strokeWidth="0.5"
        strokeDasharray="1.2 0.8"
        strokeLinecap="round"
      />

      {ordered.map((s) => {
        const x = s.hallPosition.x - VIEW.minX - s.hallPosition.w / 2;
        const y = VIEW.maxZ - s.hallPosition.z - s.hallPosition.d / 2;
        const stamped = !!stamps[s.id];
        const isNext = nextSectionId === s.id;
        const on = hover === s.id;
        return (
          <g
            key={s.id}
            tabIndex={0}
            role="button"
            aria-label={`${s.title} ${stamped ? '스탬프 완료' : '미완료'}`}
            className="cursor-pointer outline-none"
            onMouseEnter={() => setHover(s.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(s.id)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(s)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(s)}
          >
            <rect
              x={x}
              y={y}
              width={s.hallPosition.w}
              height={s.hallPosition.d}
              rx="0.8"
              fill={stamped ? '#cfdcec' : (s.color ?? '#0056b3')}
              opacity={on ? 1 : 0.92}
              stroke={isNext ? '#00c2a8' : 'transparent'}
              strokeWidth={isNext ? 0.7 : 0}
            />
            <text
              x={x + s.hallPosition.w / 2}
              y={y + s.hallPosition.d / 2 - 0.6}
              textAnchor="middle"
              fontSize="2.4"
              fontWeight="800"
              fill={stamped ? '#7a8ca3' : '#ffffff'}
            >
              {String(s.order).padStart(2, '0')}
            </text>
            <text
              x={x + s.hallPosition.w / 2}
              y={y + s.hallPosition.d / 2 + 2}
              textAnchor="middle"
              fontSize="1.5"
              fontWeight="700"
              fill={stamped ? '#7a8ca3' : '#ffffff'}
            >
              {s.title}
            </text>
            {stamped && (
              <circle cx={x + s.hallPosition.w - 1.4} cy={y + 1.4} r="0.9" fill="#00c2a8" />
            )}
          </g>
        );
      })}

      <text x={ordered[0] ? ordered[0].hallPosition.x - VIEW.minX : 4} y={H - 1.2} textAnchor="middle" fontSize="1.6" fill="#0056b3" fontWeight="700">
        입구
      </text>
    </svg>
  );
}
