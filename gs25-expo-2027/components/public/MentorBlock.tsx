'use client';

import { Quote, Store, Users } from 'lucide-react';
import type { PublicMentor } from '@/types';
import { Reveal } from '@/components/common/Reveal';
import { CrowdCanvas } from '@/components/ui/crowd-canvas';

/**
 * 지역 멘토 경영주 — 앞선 전시회에서 얻어간 내용을 지역에 전한다.
 *
 * 여기 실리는 글은 경영주님이 `/mentor` 에서 직접 쓰고, **본인이 공개에 동의**하고,
 * **본부가 승인한 것**만이다. 서버(`publicMentors()`)가 그 세 조건을 모두 통과한 것만
 * 내려 주므로, 이 컴포넌트는 받은 것을 그대로 그리기만 한다.
 * 이름도 이미 표기 방식(실명/성만/비공개)대로 가공돼 온다 — 여기서 다시 만지지 않는다.
 *
 * 아직 승인된 사례가 없는 동안에는 지어낸 후기를 채우지 않고 모집 안내를 보여 준다.
 */
export function MentorBlock({ accent, mentors }: { accent: string; mentors: PublicMentor[] }) {
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

        {mentors.length === 0 ? (
          <Reveal delay={0.12}>
            <div className="mt-8 rounded-2xl border border-canvas-ink/10 bg-canvas-ink/[0.04] px-6 py-10 text-center">
              <p className="text-lg font-bold text-canvas-ink/85">첫 번째 이야기를 기다리고 있습니다</p>
              <p className="mt-2 text-canvas-ink/60">
                앞선 전시회에서 얻어가 점포에 적용해 보신 경영주님의 사례를 모으고 있습니다.
              </p>
            </div>
          </Reveal>
        ) : (
        <Reveal delay={0.12}>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mentors.map((m) => (
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
                  <Store size={12} aria-hidden /> {m.storeName} · {m.authorLabel}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
        )}

        <Reveal delay={0.18}>
          <p className="mt-6 rounded-2xl border border-canvas-ink/10 bg-canvas-ink/[0.03] px-5 py-4 text-sm leading-relaxed text-canvas-ink/55">
            사례는 경영주님이 직접 쓰시고, <b className="text-canvas-ink/80">본인이 공개에 동의</b>한 뒤
            본부 확인을 거쳐 실립니다. 언제든 직접 내리실 수 있습니다.
            참여를 원하시면 로그인 후 <b className="text-canvas-ink/80">「멘토 사례 보내기」</b>에서 보내 주세요.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
