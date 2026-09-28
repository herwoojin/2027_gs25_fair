'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, MessageCircleQuestion, Radio, Sparkles } from 'lucide-react';
import { STRATEGY_HELPERS } from '@/lib/seed/outreach';
import { Reveal } from '@/components/common/Reveal';
import { SpiralAnimation } from '@/components/ui/spiral-animation';

/**
 * 2027 신규 코너 — 지역별 상품전략도우미.
 *
 * 지정된 시간에 현장에 오지 못한 경영주를 위해, 지역 담당 도우미가
 * 유튜브 라이브로 접속해 직접 묻고 답하는 자리다.
 * 기존 'MD 라이브'가 일방향 설명이라면 이쪽은 질의응답이 중심이다.
 */
export function StrategyHelperBlock({ accent }: { accent: string }) {
  return (
    <section className="relative overflow-hidden border-t border-canvas-ink/10 px-5 py-20">
      {/*
        배경 — 나선을 그리며 퍼지는 입자. '한 곳에서 전국으로 뻗어 나가는 방송' 을 나타낸다.
        섹션 강조색으로 물들이고, 콘텐츠 뒤에서 옅게만 돌린다.
      */}
      <SpiralAnimation
        color={accent}
        count={700}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      />
      {/* 입자 위로 살짝 덮어 본문 대비를 지킨다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgb(5 10 24 / 0.1) 0%, rgb(5 10 24 / 0.42) 58%, rgb(5 10 24 / 0.78) 100%)',
        }}
      />
      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <p className="mb-3 inline-flex items-center gap-2 rounded-pill px-4 py-1.5 text-sm font-black text-[#0b1220]" style={{ background: accent }}>
            <Sparkles size={14} /> NEW · 2027 신규 코너
          </p>
          <h2 className="text-3xl font-black leading-tight sm:text-5xl">
            못 오셔도 괜찮습니다.
            <br />
            <span style={{ color: accent }}>상품전략도우미</span>가 찾아갑니다
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-canvas-ink/70">
            지정된 시간에 현장에 오지 못하신 경영주님을 위해, <b className="text-canvas-ink">지역별 상품전략도우미</b>가
            유튜브 라이브로 접속합니다. 설명만 듣는 자리가 아니라 <b className="text-canvas-ink">직접 묻고 그 자리에서
            답을 듣는</b> 시간입니다.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Feature icon={<Radio size={18} />} title="지역별 전담" body="우리 지역 사정을 아는 도우미가 직접 진행합니다" accent={accent} />
            <Feature icon={<MessageCircleQuestion size={18} />} title="실시간 질의응답" body="채팅으로 묻고 방송 중에 답을 받습니다" accent={accent} />
            <Feature icon={<Clock size={18} />} title="다시보기" body="시간이 안 맞으면 나중에 보셔도 됩니다" accent={accent} />
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {STRATEGY_HELPERS.map((h) => (
              <li
                key={h.eventId}
                className="rounded-2xl border border-canvas-ink/10 bg-canvas-ink/[0.04] px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-canvas-ink">{h.region}</span>
                  <span className="text-xs text-canvas-ink/45">{h.helperName}</span>
                </div>
                <p className="mt-1 text-sm text-canvas-ink/60">{h.focus}</p>
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: accent }}>
                  <Clock size={12} /> {h.airtime}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.2}>
          <motion.div
            className="mt-8 flex flex-col gap-4 rounded-2xl border border-canvas-ink/10 bg-canvas-ink/[0.04] px-6 py-6 sm:flex-row sm:items-center sm:justify-between"
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <div>
              <p className="text-lg font-bold text-canvas-ink">편성표와 다시보기는 입장 후 확인하실 수 있습니다</p>
              <p className="mt-1 text-canvas-ink/60">
                방송 시작 전 알림을 신청해 두시면 시작할 때 문자로 알려 드립니다.
              </p>
            </div>
            <Link href="/login" className="gs-btn shrink-0 text-[#0b1220]" style={{ background: accent }}>
              편성표 보기 <ArrowRight size={17} />
            </Link>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}

function Feature({
  icon,
  title,
  body,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-canvas-ink/10 bg-canvas-ink/[0.03] px-5 py-4">
      <span className="inline-flex items-center gap-2 font-bold text-canvas-ink">
        <span style={{ color: accent }}>{icon}</span>
        {title}
      </span>
      <p className="mt-1 text-sm leading-relaxed text-canvas-ink/60">{body}</p>
    </div>
  );
}
