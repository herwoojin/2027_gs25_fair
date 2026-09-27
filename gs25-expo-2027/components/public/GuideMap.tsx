'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, MapPin, Footprints } from 'lucide-react';
import { SECTIONS } from '@/lib/seed/sections';
import { Reveal } from '@/components/common/Reveal';

/**
 * 가이드맵 — 전시장 평면도.
 *
 * 좌표는 `SECTIONS[].hallPosition` 을 그대로 쓴다. 3D 전시장이 보는 데이터와 같아서
 * 배치를 바꾸면 3D 와 이 지도가 함께 따라온다. (GUIDE 5장 · 코드가 아니라 데이터가 배치를 정한다)
 *
 * 목적은 두 가지다.
 *   1) 어떤 전략이 나올지 미리 흘려 궁금하게 만든다 — 제목·부제만 보여 주고 내용은 잠가 둔다.
 *   2) 그 궁금함을 오프라인 순회 참석으로 잇는다.
 */

const M = 20; // 1m = 20px
const MIN_X = -24.5;
const MAX_Z = 17.5;
const W = 49 * M;
const H = 35 * M;

const sx = (x: number) => (x - MIN_X) * M;
const sy = (z: number) => (MAX_Z - z) * M;

const TOTAL_MIN = SECTIONS.reduce((a, s) => a + s.estMinutes, 0);

export function GuideMap({ accent }: { accent: string }) {
  const [active, setActive] = useState<string | null>(null);

  const route = SECTIONS.map((s) => `${sx(s.hallPosition.x)},${sy(s.hallPosition.z)}`).join(' ');

  return (
    <section id="guide" className="relative scroll-mt-4 border-y border-white/10 px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p
            className="mb-3 inline-flex items-center gap-2 rounded-pill border px-4 py-1.5 text-sm font-bold"
            style={{ borderColor: `${accent}66`, color: accent, background: `${accent}14` }}
          >
            <MapPin size={14} /> 가이드맵
          </p>
          <h2 className="text-3xl font-black leading-tight sm:text-5xl">
            올해는 이런 전략을
            <br />
            준비하고 있습니다
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-white/70">
            11개 존을 순서대로 도는 동선입니다. 자세한 내용은 입장 후 공개되며, 현장에서는 실물과 함께
            보실 수 있습니다.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <Footprints size={15} style={{ color: accent }} /> 11개 존
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} style={{ color: accent }} /> 전체 관람 약 {TOTAL_MIN}분
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} style={{ color: accent }} /> 전시장 49m × 35m
            </span>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {/* ── 평면도 ── */}
          <Reveal delay={0.15}>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-5">
              <svg
                viewBox={`-30 -30 ${W + 60} ${H + 60}`}
                className="h-auto w-full"
                role="img"
                aria-label="2027 상품전략공유회 전시장 평면도 — 11개 존 관람 동선"
              >
                {/* 전시장 외곽 */}
                <rect
                  x={0}
                  y={0}
                  width={W}
                  height={H}
                  rx={16}
                  fill="rgba(255,255,255,0.03)"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth={2}
                />

                {/* 관람 동선 */}
                <polyline
                  points={route}
                  fill="none"
                  stroke={accent}
                  strokeWidth={3}
                  strokeDasharray="10 8"
                  strokeLinecap="round"
                  opacity={0.5}
                />

                {SECTIONS.map((s) => {
                  const { x, z, w, d } = s.hallPosition;
                  const on = active === s.id;
                  return (
                    <g
                      key={s.id}
                      onMouseEnter={() => setActive(s.id)}
                      onMouseLeave={() => setActive(null)}
                      style={{ cursor: 'default' }}
                    >
                      <rect
                        x={sx(x - w / 2)}
                        y={sy(z + d / 2)}
                        width={w * M}
                        height={d * M}
                        rx={12}
                        fill={s.color}
                        opacity={on ? 0.95 : 0.6}
                        stroke={on ? '#ffffff' : 'rgba(255,255,255,0.25)'}
                        strokeWidth={on ? 3 : 1.5}
                      />
                      <text
                        x={sx(x)}
                        y={sy(z) + 12}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={46}
                        fontWeight={800}
                      >
                        {s.order}
                      </text>
                    </g>
                  );
                })}

                {/* 입구 · 출구 */}
                <text x={sx(-19)} y={sy(17.5) - 10} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={28}>
                  입구
                </text>
                <text x={sx(19)} y={sy(-17.5) + 24} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={28}>
                  출구
                </text>
              </svg>
            </div>
          </Reveal>

          {/* ── 존 목록 ── */}
          <Reveal delay={0.2}>
            <ol className="space-y-2">
              {SECTIONS.map((s) => {
                const on = active === s.id;
                return (
                  <li key={s.id}>
                    <div
                      onMouseEnter={() => setActive(s.id)}
                      onMouseLeave={() => setActive(null)}
                      className="flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition"
                      style={{
                        borderColor: on ? `${s.color}99` : 'rgba(255,255,255,0.08)',
                        background: on ? `${s.color}1f` : 'transparent',
                      }}
                    >
                      <span
                        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black text-white"
                        style={{ background: s.color }}
                      >
                        {s.order}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.95rem] font-bold text-white">{s.title}</span>
                        <span className="block text-sm leading-snug text-white/55">{s.subtitle}</span>
                      </span>
                      <span className="ml-auto shrink-0 pt-1 text-xs text-white/40">
                        {s.estMinutes}분
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Reveal>
        </div>

        {/* ── 현장으로 잇기 ── */}
        <Reveal delay={0.25}>
          <motion.div
            className="mt-10 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-6 sm:flex-row sm:items-center sm:justify-between"
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <div>
              <p className="text-lg font-bold text-white">현장에서는 실물과 함께 보실 수 있습니다</p>
              <p className="mt-1 text-white/60">
                전국 9개 도시를 순회합니다. 가까운 도시의 일정을 확인하고 방문을 예약해 주세요.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/login"
                className="gs-btn text-white"
                style={{ background: accent }}
              >
                전시 입장하기 <ArrowRight size={17} />
              </Link>
              <a
                href="#cities"
                className="gs-btn border border-white/20 text-white/85 transition hover:bg-white/10"
              >
                순회 일정 보기
              </a>
            </div>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}
