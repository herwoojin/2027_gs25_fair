'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Footprints, MapPin } from 'lucide-react';
import { SECTIONS } from '@/lib/seed/sections';
import { Reveal } from '@/components/common/Reveal';

/**
 * 가이드맵 — 2023 GUIDE MAP 의 아이소메트릭 포맷을 2027 배치로 다시 그린 것.
 *
 * 좌표는 `SECTIONS[].hallPosition` 을 그대로 아이소메트릭으로 투영한다.
 * 3D 전시장이 보는 데이터와 같아서, 배치를 바꾸면 지도와 3D 가 함께 따라온다.
 * (GUIDE 5장 — 코드가 아니라 데이터가 배치를 정한다)
 *
 * 목적은 두 가지다.
 *   1) 어떤 전략이 나올지 미리 흘려 궁금하게 만든다 — 이름만 보여 주고 내용은 잠가 둔다.
 *   2) 그 궁금함을 오프라인 순회 참석으로 잇는다.
 */

/**
 * 온라인 전시장 주소. 전시장은 별도 앱(Phaser)이라 도메인이 다르다.
 * 값이 없으면 예전처럼 로그인으로 보낸다 — 주소를 넣기 전에 죽은 버튼이 되면 안 된다.
 */
const EXHIBITION_URL = process.env.NEXT_PUBLIC_EXHIBITION_URL ?? '';

/** 전시장은 새 창으로 연다. 랜딩은 그대로 두고 돌아올 자리를 남긴다. */
function openExhibition() {
  const w = Math.min(1440, window.screen.availWidth);
  const h = Math.min(900, window.screen.availHeight);
  const left = Math.max(0, (window.screen.availWidth - w) / 2);
  const top = Math.max(0, (window.screen.availHeight - h) / 2);
  const win = window.open(
    EXHIBITION_URL,
    'gs25-exhibition',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no`,
  );
  // 팝업이 막히면 현재 탭으로라도 보낸다
  if (win) win.focus();
  else window.location.href = EXHIBITION_URL;
}

// ── 아이소메트릭 투영 ────────────────────────────────────────────
const COS30 = Math.cos(Math.PI / 6);
const S = 17; // 1m 당 픽셀
const ix = (x: number, z: number) => (x - z) * COS30 * S;
const iy = (x: number, z: number) => (x + z) * 0.5 * S;

/** 전시장 외곽 (m) */
const HX = 24.5;
const HZ = 17.5;
const SLAB = 54; // 바닥 두께
const WALL = 104; // 뒷벽 높이

const pt = (x: number, z: number, dy = 0) => `${ix(x, z)},${iy(x, z) + dy}`;

/** 직사각형 구역의 윗면 */
function topFace(x: number, z: number, w: number, d: number) {
  return [
    pt(x - w / 2, z - d / 2),
    pt(x + w / 2, z - d / 2),
    pt(x + w / 2, z + d / 2),
    pt(x - w / 2, z + d / 2),
  ].join(' ');
}

// ── 구역 묶음 ────────────────────────────────────────────────────
// 2023 맵처럼 세 덩어리로 나눠 색과 간판을 준다. 전시장 행(z) 기준으로 나뉜다.
const AREAS = [
  {
    id: 'welcome',
    sign: 'WELCOME STAGE',
    ids: ['welcome', 'media', 'standard-store'],
    fill: '#3AA76D',
    edge: '#25814F',
    signFill: '#3AA76D',
    signFrame: '#E8407F',
    signDx: -140,
    signY: -505,
  },
  {
    id: 'product',
    sign: 'PRODUCT ADVENTURE',
    ids: ['counter-ff', 'fresh', 'new-format', 'education'],
    fill: '#2B6FD4',
    edge: '#1B4E9E',
    signFill: '#163A7D',
    signFrame: '#E8407F',
    signDx: 30,
    signY: -610,
  },
  {
    id: 'play',
    sign: 'STRATEGY PLAYGROUND',
    ids: ['ax-auto-order', 'win-win', 'souvenir', 'exit'],
    fill: '#EE6640',
    edge: '#C4482A',
    signFill: '#EE6640',
    signFrame: '#163A7D',
    signDx: 165,
    signY: -470,
  },
] as const;

const areaOf = (id: string) =>
  AREAS.find((a) => (a.ids as readonly string[]).includes(id)) ?? AREAS[0];

/** 범례용 영문 표기. 이 지도에만 쓰이는 표기라 시드가 아니라 여기에 둔다. */
const NAME_EN: Record<string, string> = {
  welcome: 'WELCOME ZONE',
  media: 'MEDIA THEATER',
  'standard-store': 'STANDARD STORE',
  'counter-ff': 'COUNTER FF',
  fresh: 'FRESH STORE',
  'new-format': 'NEW FORMAT',
  education: 'EDUCATION',
  'ax-auto-order': 'AX AUTO ORDER',
  'win-win': 'WIN-WIN COUNCIL',
  souvenir: 'SOUVENIR ZONE',
  exit: 'EXIT',
};

const INK = '#17233F';
const PAPER = '#F5D14B';
const TOTAL_MIN = SECTIONS.reduce((a, s) => a + s.estMinutes, 0);

/** 번호 핀 — 2023 맵의 물방울 모양 */
function Pin({ x, y, n, on }: { x: number; y: number; n: number; on: boolean }) {
  return (
    <g transform={`translate(${x} ${y - 78})`}>
      <path
        d="M 0 36 C -7 22 -24 15 -24 -4 A 24 24 0 1 1 24 -4 C 24 15 7 22 0 36 Z"
        fill={on ? '#FFFFFF' : PAPER}
        stroke={INK}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <text x={0} y={4} textAnchor="middle" fill={INK} fontSize={26} fontWeight={800}>
        {n}
      </text>
    </g>
  );
}

/** 전구 테두리 마퀴 간판 */
function Sign({
  x,
  y,
  label,
  fill,
  frame,
  w,
}: {
  x: number;
  y: number;
  label: string;
  fill: string;
  frame: string;
  w: number;
}) {
  const h = 62;
  const bulbs = Math.max(4, Math.round(w / 34));
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill={frame}
        stroke={INK}
        strokeWidth={3.5}
      />
      <rect
        x={-w / 2 + 9}
        y={-h / 2 + 9}
        width={w - 18}
        height={h - 18}
        rx={(h - 18) / 2}
        fill={fill}
        stroke={INK}
        strokeWidth={2.5}
      />
      {Array.from({ length: bulbs }).map((_, i) => {
        const cx = -w / 2 + 17 + (i * (w - 34)) / (bulbs - 1);
        return (
          <g key={i}>
            <circle cx={cx} cy={-h / 2 + 4.5} r={3.2} fill="#FFF3C4" stroke={INK} strokeWidth={1.2} />
            <circle cx={cx} cy={h / 2 - 4.5} r={3.2} fill="#FFF3C4" stroke={INK} strokeWidth={1.2} />
          </g>
        );
      })}
      <text
        x={0}
        y={7}
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={22}
        fontWeight={800}
        letterSpacing={1.5}
      >
        {label}
      </text>
    </g>
  );
}

export function GuideMap({ accent }: { accent: string }) {
  const [active, setActive] = useState<string | null>(null);

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

        {/* ── 아이소메트릭 맵 ── */}
        <Reveal delay={0.12}>
          <div
            className="mt-8 overflow-hidden rounded-3xl px-4 py-6 sm:px-8 sm:py-8"
            style={{ background: PAPER }}
          >
            <p
              className="text-3xl font-black tracking-tight sm:text-5xl"
              style={{ color: '#EE6640', WebkitTextStroke: `2px ${INK}` }}
            >
              GUIDE MAP
            </p>

            <svg
              viewBox="-820 -700 1640 1260"
              className="mt-2 h-auto w-full"
              role="img"
              aria-label="2027 상품전략공유회 전시장 가이드맵 — 11개 존의 위치와 관람 동선"
            >
              {/* 바닥 두께 (앞쪽 두 면) */}
              <polygon
                points={`${pt(-HX, HZ)} ${pt(HX, HZ)} ${pt(HX, HZ, SLAB)} ${pt(-HX, HZ, SLAB)}`}
                fill="#2E8C5C"
                stroke={INK}
                strokeWidth={3}
                strokeLinejoin="round"
              />
              <polygon
                points={`${pt(HX, HZ)} ${pt(HX, -HZ)} ${pt(HX, -HZ, SLAB)} ${pt(HX, HZ, SLAB)}`}
                fill="#C4482A"
                stroke={INK}
                strokeWidth={3}
                strokeLinejoin="round"
              />

              {/* 뒷벽 두 면 */}
              <polygon
                points={`${pt(-HX, -HZ)} ${pt(HX, -HZ)} ${pt(HX, -HZ, -WALL)} ${pt(-HX, -HZ, -WALL)}`}
                fill="#2B6FD4"
                stroke={INK}
                strokeWidth={3}
                strokeLinejoin="round"
              />
              <polygon
                points={`${pt(-HX, -HZ)} ${pt(-HX, HZ)} ${pt(-HX, HZ, -WALL)} ${pt(-HX, -HZ, -WALL)}`}
                fill="#3AA76D"
                stroke={INK}
                strokeWidth={3}
                strokeLinejoin="round"
              />

              {/* 바닥면 */}
              <polygon
                points={`${pt(-HX, -HZ)} ${pt(HX, -HZ)} ${pt(HX, HZ)} ${pt(-HX, HZ)}`}
                fill="#F3E7B8"
                stroke={INK}
                strokeWidth={3}
                strokeLinejoin="round"
              />

              {/* 구역 */}
              {SECTIONS.map((s) => {
                const a = areaOf(s.id);
                const on = active === s.id;
                const { x, z, w, d } = s.hallPosition;
                return (
                  <g
                    key={s.id}
                    onMouseEnter={() => setActive(s.id)}
                    onMouseLeave={() => setActive(null)}
                  >
                    {/* 살짝 띄워 입체감을 준다 */}
                    <polygon
                      points={topFace(x, z, w, d)}
                      transform="translate(0 9)"
                      fill={a.edge}
                      stroke={INK}
                      strokeWidth={3}
                      strokeLinejoin="round"
                    />
                    <polygon
                      points={topFace(x, z, w, d)}
                      fill={on ? '#FFFFFF' : a.fill}
                      stroke={INK}
                      strokeWidth={3}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}

              {/* 관람 동선 */}
              <polyline
                points={SECTIONS.map((s) => pt(s.hallPosition.x, s.hallPosition.z)).join(' ')}
                fill="none"
                stroke={INK}
                strokeWidth={3}
                strokeDasharray="11 10"
                strokeLinecap="round"
                opacity={0.45}
              />

              {/* 구역 간판 — 전시장 바깥 위쪽에 세우고 지지대로 구역과 잇는다 */}
              {AREAS.map((a) => {
                const zs = SECTIONS.filter((s) => (a.ids as readonly string[]).includes(s.id));
                const mx = zs.reduce((t, s) => t + s.hallPosition.x, 0) / zs.length;
                const mz = zs.reduce((t, s) => t + s.hallPosition.z, 0) / zs.length;
                const w = a.sign.length * 14 + 50;
                const sxp = ix(mx, mz) + a.signDx;
                const syp = a.signY;
                return (
                  <g key={a.id}>
                    {/* 지지대 */}
                    <line
                      x1={sxp}
                      y1={syp + 31}
                      x2={ix(mx, mz)}
                      y2={iy(mx, mz) - 30}
                      stroke={INK}
                      strokeWidth={5}
                      strokeLinecap="round"
                      opacity={0.75}
                    />
                    <Sign x={sxp} y={syp} label={a.sign} fill={a.signFill} frame={a.signFrame} w={w} />
                  </g>
                );
              })}

              {/* 번호 핀 */}
              {SECTIONS.map((s) => (
                <g
                  key={s.id}
                  onMouseEnter={() => setActive(s.id)}
                  onMouseLeave={() => setActive(null)}
                >
                  <Pin
                    x={ix(s.hallPosition.x, s.hallPosition.z)}
                    y={iy(s.hallPosition.x, s.hallPosition.z)}
                    n={s.order}
                    on={active === s.id}
                  />
                </g>
              ))}

              {/* 입구 · 출구 */}
              <text
                x={ix(-19, HZ)}
                y={iy(-19, HZ) + SLAB + 36}
                textAnchor="middle"
                fill={INK}
                fontSize={26}
                fontWeight={800}
              >
                입구 ENTRANCE
              </text>
              <text
                x={ix(HX, -13)}
                y={iy(HX, -13) + SLAB + 36}
                textAnchor="middle"
                fill={INK}
                fontSize={26}
                fontWeight={800}
              >
                출구 EXIT
              </text>
            </svg>

            {/* ── 범례 ── */}
            <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
              {SECTIONS.map((s) => {
                const a = areaOf(s.id);
                const on = active === s.id;
                return (
                  <li key={s.id}>
                    <div
                      onMouseEnter={() => setActive(s.id)}
                      onMouseLeave={() => setActive(null)}
                      className="flex items-start gap-2 rounded-xl px-2 py-1.5 transition"
                      style={{ background: on ? 'rgba(23,35,63,0.10)' : 'transparent' }}
                    >
                      <span
                        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black text-white"
                        style={{ background: a.fill, border: `2px solid ${INK}` }}
                      >
                        {s.order}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black leading-tight" style={{ color: INK }}>
                          {s.title}
                        </span>
                        <span
                          className="block text-[0.68rem] font-bold leading-tight tracking-wide"
                          style={{ color: 'rgba(23,35,63,0.62)' }}
                        >
                          {NAME_EN[s.id]}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Reveal>

        {/* ── 현장으로 잇기 ── */}
        <Reveal delay={0.2}>
          <motion.div
            className="mt-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-6 sm:flex-row sm:items-center sm:justify-between"
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
              {EXHIBITION_URL ? (
                <button
                  type="button"
                  onClick={openExhibition}
                  className="gs-btn text-white"
                  style={{ background: accent }}
                >
                  전시 입장하기 <ArrowRight size={17} />
                </button>
              ) : (
                <Link href="/login" className="gs-btn text-white" style={{ background: accent }}>
                  전시 입장하기 <ArrowRight size={17} />
                </Link>
              )}
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
