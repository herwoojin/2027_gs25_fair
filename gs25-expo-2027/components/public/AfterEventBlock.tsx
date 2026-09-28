'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CalendarClock, ChevronDown, Download, GraduationCap, Smartphone } from 'lucide-react';
import { Reveal } from '@/components/common/Reveal';

/**
 * 향후 일정 — 공유회가 끝난 뒤 이어지는 교육 안내.
 *
 * **접힌 채로 시작한다.** 지금 시점에 확정된 게 "4월 중순 이후 시작" 하나뿐이라,
 * 펼쳐 두면 본 행사 안내보다 먼저 눈에 들어와 자리를 뺏는다. 궁금한 분만 여신다.
 *
 * ⚠️ 알림 채널에 대해 지키는 선.
 * 이 사이트에는 서비스 워커도 웹 푸시도 없다(매니페스트만 있다). 그래서
 * "앱 알림을 켜 두세요" 라고 쓰면 오지 않을 알림을 약속하는 것이 된다.
 * 실제로 동작하는 것은 두 가지뿐이라 딱 그만큼만 안내한다.
 *   1) 홈 화면에 추가 — 매니페스트로 지금도 된다
 *   2) 사전 알림 등록 — 문자로 실제 발송된다(SOLAPI)
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function AfterEventBlock({ accent }: { accent: string }) {
  const [open, setOpen] = useState(false);
  // 안드로이드·크롬에서만 잡힌다. SSR 과 어긋나지 않도록 마운트 뒤에만 채운다.
  const [installer, setInstaller] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // preventDefault() 를 부르지 않는다.
      // 부르면 브라우저 기본 설치 안내가 사라지는데, 우리 버튼은 이 섹션을 펼쳐야
      // 보이므로 접어 둔 분들은 설치할 길이 아예 없어진다. 콘솔에도
      // "Banner not shown: preventDefault() called" 가 계속 남는다.
      // 이벤트는 막지 않아도 그대로 보관해 뒀다가 쓸 수 있다 — 둘 다 챙긴다.
      setInstaller(e as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstaller(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installer) return;
    try {
      await installer.prompt();
      const { outcome } = await installer.userChoice;
      if (outcome === 'accepted') setInstalled(true);
    } catch {
      // 브라우저가 이미 자체 안내로 처리한 뒤면 prompt() 가 거부된다.
      // 그 경우 사용자는 이미 설치 여부를 답한 상태라 그대로 넘어가면 된다.
    }
    setInstaller(null);
  };

  return (
    <section id="after" className="scroll-mt-4 border-t border-canvas-ink/10 px-5 py-20">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <p
            className="mb-3 inline-flex items-center gap-2 rounded-pill border px-4 py-1.5 text-sm font-bold"
            style={{ borderColor: `${accent}66`, color: accent, background: `${accent}14` }}
          >
            <CalendarClock size={14} /> 향후 일정
          </p>
          <h2 className="text-3xl font-black leading-tight sm:text-4xl">공유회가 끝난 뒤에도 이어집니다</h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-6 overflow-hidden rounded-2xl border border-canvas-ink/12 bg-canvas-ink/[0.04]">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="after-panel"
              className="flex w-full items-center gap-4 px-6 py-5 text-left transition hover:bg-canvas-ink/[0.03]"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                style={{ background: `${accent}1f`, color: accent }}
              >
                <GraduationCap size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-canvas-ink/90">
                  미처 참석하지 못하신 분들을 위한 영상 · 교육 일정
                </span>
                <span className="mt-0.5 block text-sm text-canvas-ink/55">
                  2027년 4월 중순 이후 시작 예정 · 자세한 일정은 별도 공지
                </span>
              </span>
              <motion.span
                aria-hidden
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.25 }}
                className="shrink-0 text-canvas-ink/50"
              >
                <ChevronDown size={22} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  id="after-panel"
                  ref={panelRef}
                  key="panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-5 border-t border-canvas-ink/10 px-6 py-6">
                    <p className="leading-relaxed text-canvas-ink/75">
                      전국 순회와 온라인 전시가 모두 끝난 뒤, <b className="text-canvas-ink">온라인·오프라인
                      어느 쪽에도 참석하지 못하신 경영주님</b>을 위해 본부가 별도로 자리를 마련합니다.
                      공유회에서 다룬 내용을 영상으로 다시 보실 수 있게 하고, 본부 담당자가 직접 진행하는
                      경영주 교육도 함께 엽니다.
                    </p>

                    <ul className="grid gap-3 sm:grid-cols-2">
                      <li className="rounded-xl border border-canvas-ink/10 bg-canvas-ink/[0.04] px-5 py-4">
                        <p className="flex items-center gap-2 font-bold text-canvas-ink/90">
                          <CalendarClock size={16} style={{ color: accent }} aria-hidden /> 언제
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-canvas-ink/60">
                          <b className="text-canvas-ink/85">2027년 4월 중순 이후</b>부터 시작합니다.
                          날짜·장소·신청 방법은 확정되는 대로 <b className="text-canvas-ink/85">별도 공지</b>해
                          드립니다.
                        </p>
                      </li>
                      <li className="rounded-xl border border-canvas-ink/10 bg-canvas-ink/[0.04] px-5 py-4">
                        <p className="flex items-center gap-2 font-bold text-canvas-ink/90">
                          <GraduationCap size={16} style={{ color: accent }} aria-hidden /> 무엇을
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-canvas-ink/60">
                          공유회 내용을 담은 <b className="text-canvas-ink/85">다시보기 영상</b>과, 본부가
                          진행하는 <b className="text-canvas-ink/85">경영주 교육</b>입니다.
                        </p>
                      </li>
                    </ul>

                    {/* 실제로 동작하는 두 가지만 안내한다 */}
                    <div className="rounded-xl border px-5 py-5" style={{ borderColor: `${accent}40`, background: `${accent}0f` }}>
                      <p className="flex items-center gap-2 font-bold text-canvas-ink/90">
                        <Bell size={16} style={{ color: accent }} aria-hidden /> 공지를 놓치지 않으시려면
                      </p>
                      <ol className="mt-3 space-y-3 text-sm leading-relaxed text-canvas-ink/70">
                        <li className="flex gap-3">
                          <span
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black"
                            style={{ background: `${accent}2e`, color: accent }}
                          >
                            1
                          </span>
                          <span>
                            <b className="text-canvas-ink/90">이 사이트를 홈 화면에 추가</b>해 두세요. 앱처럼
                            바로 열리고, 공지가 올라오면 한 번에 확인하실 수 있습니다.
                            <span className="mt-2 block text-canvas-ink/50">
                              아이폰: 공유 버튼 → <b className="text-canvas-ink/70">홈 화면에 추가</b> ·
                              안드로이드: 메뉴(⋮) → <b className="text-canvas-ink/70">앱 설치</b>
                            </span>
                            {installed ? (
                              <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill bg-canvas-ink/10 px-3 py-1.5 text-xs font-bold text-canvas-ink/70">
                                <Smartphone size={13} /> 홈 화면에 추가되었습니다
                              </span>
                            ) : installer ? (
                              <button
                                type="button"
                                onClick={install}
                                className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-xs font-black text-[#0b1220] transition hover:brightness-110"
                                style={{ background: accent }}
                              >
                                <Download size={13} /> 홈 화면에 추가하기
                              </button>
                            ) : null}
                          </span>
                        </li>
                        <li className="flex gap-3">
                          <span
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black"
                            style={{ background: `${accent}2e`, color: accent }}
                          >
                            2
                          </span>
                          <span>
                            아래 <a href="#prenotify" className="font-bold underline underline-offset-4" style={{ color: accent }}>사전 알림 받기</a>
                            에 번호를 남겨 주세요. 교육 일정이 정해지면{' '}
                            <b className="text-canvas-ink/90">문자로 보내 드립니다.</b>
                          </span>
                        </li>
                      </ol>
                    </div>

                    <p className="text-xs leading-relaxed text-canvas-ink/45">
                      교육 일정은 확정 전이라 이 안내에는 날짜가 없습니다. 정해지는 대로 이 자리와 문자로
                      함께 알려 드립니다.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
