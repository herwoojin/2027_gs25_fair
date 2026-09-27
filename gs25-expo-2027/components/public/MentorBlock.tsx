'use client';

import { Quote, Store, Users } from 'lucide-react';
import { REGION_MENTORS } from '@/lib/seed/outreach';
import { Reveal } from '@/components/common/Reveal';

/**
 * 지역 멘토 경영주 — 앞선 전시회에서 얻어간 내용을 지역에 전한다.
 *
 * ⚠️ 이름과 사례는 자리표시자다. 실제 후기는 **본인 동의를 받아** 관리자가 입력한다.
 * 동의 없이 만든 후기를 올리면 그 자체가 사고다.
 */
export function MentorBlock({ accent }: { accent: string }) {
  return (
    <section className="relative border-t border-white/10 px-5 py-20">
      <div className="mx-auto max-w-6xl">
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
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
            앞선 상품전시회에서 보고 배운 것을 점포에 적용해 본 지역 멘토 경영주님들이,
            무엇을 어떻게 바꿨는지 직접 전해 드립니다.
          </p>
        </Reveal>

        <Reveal delay={0.12}>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {REGION_MENTORS.map((m) => (
              <li
                key={m.eventId}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <span
                  className="w-fit rounded-pill px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {m.region}
                </span>
                <Quote size={18} className="mt-3 text-white/25" aria-hidden />
                <p className="mt-1.5 flex-1 text-[0.95rem] leading-relaxed text-white/80">
                  {m.takeaway}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{m.result}</p>
                <p className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-white/45">
                  <Store size={12} aria-hidden /> {m.storeName} · {m.ownerName}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.18}>
          <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm leading-relaxed text-white/55">
            멘토 경영주님의 이름과 사례는 <b className="text-white/80">본인 동의를 받은 뒤</b> 등록됩니다.
            참여를 원하시면 담당 OFC 에게 말씀해 주세요.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
