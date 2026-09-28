'use client';

import { Quote, Store, Users } from 'lucide-react';
import { REGION_MENTORS } from '@/lib/seed/outreach';
import { Reveal } from '@/components/common/Reveal';
import { CrowdCanvas } from '@/components/ui/crowd-canvas';

/**
 * 지역 멘토 경영주 — 앞선 전시회에서 얻어간 내용을 지역에 전한다.
 *
 * ⚠️ 이름과 사례는 자리표시자다. 실제 후기는 **본인 동의를 받아** 관리자가 입력한다.
 * 동의 없이 만든 후기를 올리면 그 자체가 사고다.
 */
export function MentorBlock({ accent }: { accent: string }) {
  return (
    <section className="relative overflow-hidden border-t border-canvas-ink/10 px-5 pb-20 pt-56">
      {/*
        배경 — 섹션 위쪽을 가로지르는 군중 띠.
        인물이 캔버스 아래쪽에 서므로, 캔버스 높이(13rem)만큼 위 여백(pt-56)을 줘서
        군중이 선 자리 아래에서 본문이 시작되게 한다. 글과 겹치지 않는다.
      */}
      <CrowdCanvas
        src="/media/crowd.png"
        count={22}
        className="pointer-events-none absolute inset-x-0 top-0 h-[13rem] w-full opacity-60"
      />
      {/* 군중이 선 자리 아래로 배경색에 자연스럽게 잠기게 한다 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[13rem]"
        style={{
          background:
            'linear-gradient(to bottom, rgb(5 10 24 / 0.12) 0%, rgb(5 10 24 / 0.28) 52%, rgb(5 10 24 / 0.86) 88%, rgb(5 10 24) 100%)',
        }}
      />
      <div className="relative mx-auto max-w-6xl">
        <Reveal>
          <p
            className="mb-3 inline-flex items-center gap-2 rounded-pill border px-4 py-1.5 text-sm font-bold"
            style={{ borderColor: `${accent}66`, color: accent, background: `${accent}14` }}
          >
            <Users size={14} /> 지역 멘토 경영주
          </p>
          <h2 className="text-3xl font-black leading-tight sm:text-5xl">
            먼저 다녀오신 분들이
            <br />
            전해 주는 이야기
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-canvas-ink/70">
            앞선 상품전시회에서 보고 배운 것을 점포에 적용해 본 지역 멘토 경영주님들이,
            무엇을 어떻게 바꿨는지 직접 전해 드립니다.
          </p>
        </Reveal>

        <Reveal delay={0.12}>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {REGION_MENTORS.map((m) => (
              <li
                key={m.eventId}
                className="flex flex-col rounded-2xl border border-canvas-ink/10 bg-canvas-ink/[0.04] p-5"
              >
                <span
                  className="w-fit rounded-pill px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {m.region}
                </span>
                <Quote size={18} className="mt-3 text-canvas-ink/25" aria-hidden />
                <p className="mt-1.5 flex-1 text-[0.95rem] leading-relaxed text-canvas-ink/80">
                  {m.takeaway}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-canvas-ink/50">{m.result}</p>
                <p className="mt-3 flex items-center gap-1.5 border-t border-canvas-ink/10 pt-3 text-xs text-canvas-ink/45">
                  <Store size={12} aria-hidden /> {m.storeName} · {m.ownerName}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.18}>
          <p className="mt-6 rounded-2xl border border-canvas-ink/10 bg-canvas-ink/[0.03] px-5 py-4 text-sm leading-relaxed text-canvas-ink/55">
            멘토 경영주님의 이름과 사례는 <b className="text-canvas-ink/80">본인 동의를 받은 뒤</b> 등록됩니다.
            참여를 원하시면 담당 OFC 에게 말씀해 주세요.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
