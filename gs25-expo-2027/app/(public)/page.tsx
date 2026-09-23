'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BellRing, ChevronLeft, ChevronRight, Lock, MapPin, Pause, Play } from 'lucide-react';
import type { AppConfig, PopupNews as PopupNewsType } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { DEFAULT_CONFIG, SITE } from '@/lib/config';
import { formatDateTimeKo, formatRange } from '@/lib/utils';
import { themeOf } from '@/lib/cityTheme';
import { useViewMode } from '@/lib/gpuTier';
import { Countdown } from '@/components/public/Countdown';
import { PopupNews } from '@/components/common/PopupNews';
import { BrandMark } from '@/components/common/AppShell';
import { FilmOverlay } from '@/components/common/FilmOverlay';
import { CustomCursor } from '@/components/common/CustomCursor';
import { Reveal, RevealText } from '@/components/common/Reveal';
import { useToast } from '@/components/common/Toast';

const CinematicTour = dynamic(
  () => import('@/components/public/CinematicTour').then((m) => m.CinematicTour),
  { ssr: false, loading: () => null },
);

interface City {
  id: string;
  city: string;
  startDate: string;
  endDate: string;
  lat: number;
  lng: number;
  venueName: string;
  order: number;
  region: string;
}

interface HomeData {
  config: AppConfig;
  popup: PopupNewsType | null;
  cities: City[];
  souvenirCount: number;
}

/** 전체 투어 1회전 길이 */
const TOUR_SECONDS = 54;

/**
 * T2-1 · 프리오픈 랜딩 — 시네마틱 순회 투어.
 * 카메라가 9개 도시를 날아다니고, 도시가 바뀔 때마다 accent 컬러로 화면 전체가 리테마된다.
 * 진행바는 영상이 아니라 **카메라 경로 스크러버**다.
 *
 * ⚠️ 상품 정보는 절대 넣지 않는다 (PRD F-01 / S-08). 일정·장소·분위기 카피만.
 */
export default function LandingPage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string>('seoul');
  const [playing, setPlaying] = useState(true);

  const progressRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // mode 는 useEffect 안에서 정해지므로 SSR·첫 렌더 모두 null → 정적 히어로.
  // 동작 줄이기 설정은 useViewMode 내부에서 함께 판단한다.
  const { mode, quality } = useViewMode(false);
  const use3D = mode === '3d';

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    callFn<HomeData>('getPublicHome')
      .then(setData)
      .catch(() => setData(null));
    return () => clearInterval(id);
  }, []);

  const cities = useMemo(() => [...(data?.cities ?? [])].sort((a, b) => a.order - b.order), [data]);
  const activeIdx = Math.max(0, cities.findIndex((c) => c.id === activeId));
  const active = cities[activeIdx] ?? null;
  const theme = themeOf(active?.id);

  // ── 투어 진행 루프 ──────────────────────────────────────
  // 매 프레임 setState 하지 않고 DOM 을 직접 갱신해 리렌더를 피한다.
  const paint = useCallback(() => {
    const pct = Math.min(1, Math.max(0, progressRef.current)) * 100;
    if (barRef.current) barRef.current.style.width = `${pct}%`;
    if (knobRef.current) knobRef.current.style.left = `${pct}%`;
  }, []);

  useEffect(() => {
    if (!use3D || cities.length === 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      if (playing) {
        progressRef.current += dt / TOUR_SECONDS;
        if (progressRef.current >= 1) progressRef.current = 0; // 순환
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, use3D, cities.length, paint]);

  const seekTo = useCallback(
    (ratio: number) => {
      progressRef.current = Math.min(0.999, Math.max(0, ratio));
      paint();
    },
    [paint],
  );

  const goCity = useCallback(
    (idx: number) => {
      const n = cities.length;
      if (n === 0) return;
      const i = (idx + n) % n;
      setActiveId(cities[i].id);
      seekTo(i / (n - 1));
    },
    [cities, seekTo],
  );

  const onTrack = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    seekTo((e.clientX - rect.left) / rect.width);
  };

  const config = data?.config ?? DEFAULT_CONFIG;
  const opened = now !== null && now >= config.openAt;
  const target = opened ? config.tourStartAt : config.openAt;

  return (
    <div className="min-h-dvh bg-[#050a18] text-white">
      <PopupNews popup={data?.popup ?? null} />
      <CustomCursor accent={theme.accent} />

      {/* ═══ 히어로: 시네마틱 투어 ═══ */}
      <section className="relative h-dvh min-h-[38rem] w-full overflow-hidden">
        {/* 3D 배경 */}
        <div className="absolute inset-0">
          {use3D && cities.length > 0 ? (
            <CinematicTour
              cities={cities}
              progressRef={progressRef}
              onCityChange={setActiveId}
              quality={quality}
            />
          ) : (
            <StaticHeroBackdrop accent={theme.accent} />
          )}
        </div>

        {/* 가독성 확보용 그라데이션 — 3D 위에 텍스트를 얹기 위해 필요 */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'linear-gradient(to bottom, rgb(5 10 24 / 0.82) 0%, rgb(5 10 24 / 0.25) 38%, rgb(5 10 24 / 0.55) 68%, rgb(5 10 24 / 0.95) 100%)',
          }}
        />
        <FilmOverlay letterbox grain vignette scanline accent={theme.accent} />

        {/* 상단바 */}
        <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 pt-10 sm:pt-12">
          <span className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-sm font-black text-gs-blue">
              GS
            </span>
            <span className="text-sm font-bold tracking-wide text-white/85">GS25</span>
          </span>
          <Link
            href="/staff/login"
            className="rounded-pill border border-white/25 px-4 py-2 text-sm font-semibold text-white/85 backdrop-blur transition hover:bg-white/10"
          >
            본부 로그인
          </Link>
        </header>

        {/* 타이틀 */}
        <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-[58%] px-5">
          <div className="mx-auto max-w-5xl">
            <motion.p
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-4 inline-flex items-center gap-2 rounded-pill border px-4 py-1.5 text-sm font-bold backdrop-blur"
              style={{ borderColor: `${theme.accent}66`, color: theme.accent, background: `${theme.accent}14` }}
            >
              <Lock size={14} /> 등록 경영주 전용
            </motion.p>

            <h1 className="text-[2.6rem] font-black leading-[1.08] tracking-tight sm:text-7xl">
              <RevealText text="2027" delay={0.15} className="block text-white/55" />
              <RevealText text="GS25 상품전략공유회" delay={0.35} className="block" />
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              className="mt-5 max-w-lg text-lg text-white/75 sm:text-xl"
            >
              {SITE.tagline}. 전시장 그대로의 동선을 온라인에서 걸어 보세요.
            </motion.p>

            {/* 카운트다운 */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25 }}
              className="mt-8"
            >
              <p className="mb-2.5 text-sm font-semibold text-white/55">
                {opened ? '순회 시작까지' : '온라인 오픈까지'}
              </p>
              <Countdown target={target} />
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              {opened ? (
                <Link
                  href="/login"
                  className="gs-btn text-gs-ink transition-colors duration-700 sm:px-8"
                  style={{ background: theme.accent }}
                >
                  입장하기 <ArrowRight size={18} />
                </Link>
              ) : (
                <div className="flex flex-col gap-1">
                  <button className="gs-btn bg-white/20 text-white/60" disabled>
                    입장하기
                  </button>
                  <span className="text-sm text-white/55">
                    {formatDateTimeKo(config.openAt, {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    오픈
                  </span>
                </div>
              )}
              <a
                href="#prenotify"
                className="gs-btn border border-white/35 text-white backdrop-blur hover:bg-white/10 sm:px-8"
              >
                <BellRing size={18} /> 사전 알림 받기
              </a>
            </motion.div>
          </div>
        </div>

        {/* ═══ 하단: 투어 스크러버 ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.6 }}
          className="absolute inset-x-0 bottom-0 z-30 px-5 pb-10 sm:pb-12"
        >
          <div className="mx-auto max-w-5xl">
            {/* 현재 도시 정보 */}
            <AnimatePresence mode="wait">
              {active && (
                <motion.div
                  key={active.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4 }}
                  className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-1"
                >
                  <span className="text-3xl" aria-hidden>
                    {themeOf(active.id).emoji}
                  </span>
                  <span>
                    <span className="block text-xs font-bold tracking-widest" style={{ color: theme.accent }}>
                      {String(active.order).padStart(2, '0')} · {formatRange(active.startDate, active.endDate)}
                    </span>
                    <span className="block text-2xl font-black sm:text-3xl">{active.city}</span>
                  </span>
                  <span className="mb-1 flex items-center gap-1.5 text-sm text-white/60">
                    <MapPin size={14} /> {active.venueName}
                  </span>
                  <span className="mb-1 ml-auto hidden text-sm text-white/70 sm:block">
                    {themeOf(active.id).tagline}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 스크러버 */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? '투어 일시정지' : '투어 재생'}
                disabled={!use3D}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/25 backdrop-blur transition hover:bg-white/10 disabled:opacity-35"
              >
                {playing ? <Pause size={17} /> : <Play size={17} />}
              </button>

              <div
                ref={trackRef}
                onClick={onTrack}
                role="slider"
                aria-label="순회 투어 진행"
                aria-valuemin={1}
                aria-valuemax={cities.length || 9}
                aria-valuenow={activeIdx + 1}
                aria-valuetext={active ? `${active.city} 구간` : undefined}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') goCity(activeIdx + 1);
                  if (e.key === 'ArrowLeft') goCity(activeIdx - 1);
                }}
                className="relative h-11 flex-1 cursor-pointer"
              >
                <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-white/15" />
                <div
                  ref={barRef}
                  className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-pill transition-colors duration-700"
                  style={{ width: '0%', background: theme.accent }}
                />
                {/* 도시 마커 */}
                {cities.map((c, i) => {
                  const pos = cities.length > 1 ? (i / (cities.length - 1)) * 100 : 0;
                  const on = c.id === activeId;
                  return (
                    <button
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        goCity(i);
                      }}
                      aria-label={`${c.city}로 이동`}
                      className="absolute top-1/2 grid h-11 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center"
                      style={{ left: `${pos}%` }}
                    >
                      <span
                        className="block rounded-full transition-all duration-300"
                        style={{
                          width: on ? 12 : 7,
                          height: on ? 12 : 7,
                          background: on ? theme.accent : 'rgba(255,255,255,0.45)',
                          boxShadow: on ? `0 0 14px ${theme.accent}` : 'none',
                        }}
                      />
                    </button>
                  );
                })}
                <div
                  ref={knobRef}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                  style={{ left: '0%', background: theme.accent }}
                />
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => goCity(activeIdx - 1)}
                  aria-label="이전 도시"
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/25 backdrop-blur transition hover:bg-white/10"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => goCity(activeIdx + 1)}
                  aria-label="다음 도시"
                  className="grid h-11 w-11 place-items-center rounded-full border border-white/25 backdrop-blur transition hover:bg-white/10"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══ 9개 도시 ═══ */}
      <CityLine cities={cities} activeId={activeId} onHover={setActiveId} accent={theme.accent} />

      {/* ═══ 기념품 티저 ═══ */}
      <SouvenirTeaser count={data?.souvenirCount ?? 5} accent={theme.accent} />

      {/* ═══ 사전 알림 ═══ */}
      <PreNotifyForm accent={theme.accent} />

      <footer className="border-t border-white/10 px-5 py-10 text-center text-sm text-white/45">
        <div className="mx-auto max-w-3xl space-y-2">
          <div className="flex justify-center opacity-80">
            <BrandMark />
          </div>
          <p>본 사이트는 사전 등록된 GS25 경영주 전용입니다. 화면 캡처 및 외부 공유는 금지됩니다.</p>
          <p>번호가 바뀌셨나요? 담당 OFC 또는 {SITE.ofcPhone} 로 문의해 주세요.</p>
        </div>
      </footer>
    </div>
  );
}

/** WebGL 미지원·reduced-motion 일 때의 정적 히어로 배경 */
function StaticHeroBackdrop({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 transition-colors duration-1000"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 20% 30%, ${accent}33, transparent 60%),
                       radial-gradient(ellipse 70% 50% at 80% 70%, #00c2a826, transparent 60%),
                       linear-gradient(160deg, #050a18, #071229 60%, #050a18)`,
        }}
      />
      {/* 도시 점이 순서대로 빛나는 라인 */}
      <div className="absolute inset-x-0 bottom-1/3 flex justify-center gap-6">
        {Array.from({ length: 9 }, (_, i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ background: accent }}
            animate={{ opacity: [0.25, 1, 0.25], scale: [1, 1.5, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.22 }}
          />
        ))}
      </div>
    </div>
  );
}

function CityLine({
  cities,
  activeId,
  onHover,
  accent,
}: {
  cities: City[];
  activeId: string;
  onHover: (id: string) => void;
  accent: string;
}) {
  return (
    <section className="relative px-5 py-20">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="mb-2 text-sm font-bold tracking-widest" style={{ color: accent }}>
            TOUR
          </p>
          <h2 className="text-3xl font-black sm:text-4xl">전국 9개 도시를 순회합니다</h2>
          <p className="mt-2 text-white/60">
            가까운 도시에서 직접 보시고, 온라인에서 한 번 더 확인하세요.
          </p>
        </Reveal>

        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(cities.length ? cities : Array.from({ length: 9 }, () => null)).map((c, i) => {
            const t = c ? themeOf(c.id) : null;
            const on = c?.id === activeId;
            return (
              <Reveal key={c?.id ?? i} delay={i * 0.05}>
                <li
                  onMouseEnter={() => c && onHover(c.id)}
                  className="group relative overflow-hidden rounded-card border p-4 transition-all duration-500"
                  style={{
                    borderColor: on ? `${t?.accent}88` : 'rgba(255,255,255,0.1)',
                    background: on ? `${t?.accent}12` : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-black transition-colors duration-500"
                      style={{
                        background: on ? t?.accent : 'rgba(255,255,255,0.08)',
                        color: on ? '#050a18' : 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {c ? String(c.order).padStart(2, '0') : '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-lg font-bold">
                        {c?.city ?? <span className="gs-skeleton inline-block h-5 w-20" />}
                        <span aria-hidden className="text-base">
                          {t?.emoji}
                        </span>
                      </p>
                      <p className="flex items-center gap-1 text-sm text-white/55">
                        <MapPin size={13} />
                        {c ? formatRange(c.startDate, c.endDate) : '일정 준비 중'}
                      </p>
                      {t && (
                        <p className="mt-1.5 text-sm text-white/45 transition-opacity duration-500 group-hover:text-white/70">
                          {t.tagline}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[2px] origin-left transition-transform duration-500"
                    style={{ background: t?.accent, transform: on ? 'scaleX(1)' : 'scaleX(0)' }}
                  />
                </li>
              </Reveal>
            );
          })}
        </ol>

        <Reveal delay={0.2}>
          <Link
            href="/offline"
            className="gs-btn mt-10 border border-white/25 text-white hover:bg-white/10"
          >
            순회 일정 자세히 보기 <ArrowRight size={16} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

function SouvenirTeaser({ count, accent }: { count: number; accent: string }) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  return (
    <section className="relative overflow-hidden border-y border-white/10 px-5 py-20">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="text-sm font-bold tracking-widest" style={{ color: accent }}>
            SOUVENIR
          </p>
          <h2 className="mt-2 text-3xl font-black sm:text-4xl">무엇이 들어 있을까요?</h2>
          <p className="mt-2 text-white/60">
            {count}가지 기념품을 준비했습니다. 온라인 스탬프를 모으면 힌트가 하나씩 열립니다.
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-5 gap-2 sm:gap-4">
          {items.map((i) => (
            <Reveal key={i} delay={i * 0.08}>
              <motion.div
                className="grid aspect-square place-items-center rounded-2xl border border-white/12 bg-white/[0.04]"
                animate={{ y: [0, -9, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, delay: i * 0.35, ease: 'easeInOut' }}
              >
                <span className="text-2xl font-black text-white/25 sm:text-4xl">?</span>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreNotifyForm({ accent }: { accent: string }) {
  const toast = useToast();
  const [storeCode, setStoreCode] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return;
    setBusy(true);
    try {
      await callFn('requestPreNotify', {
        storeCode: storeCode.trim(),
        phone: phone.replace(/\D/g, ''),
        consent: true,
      });
      setDone(true);
      toast.push('사전 알림 신청이 완료되었습니다.', 'success');
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="prenotify" className="scroll-mt-4 px-5 py-20">
      <div className="mx-auto max-w-lg">
        <Reveal>
          <p className="text-sm font-bold tracking-widest" style={{ color: accent }}>
            NOTIFY ME
          </p>
          <h2 className="mt-2 text-3xl font-black">사전 알림 받기</h2>
          <p className="mt-2 text-white/60">
            오픈 D-7, D-1, 오픈 당일과 우리 지역 행사 3일 전에 문자로 알려 드립니다.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          {done ? (
            <div className="mt-8 rounded-card border border-white/12 bg-white/[0.04] p-6 text-center">
              <p className="text-lg font-bold" style={{ color: accent }}>
                신청이 접수되었습니다
              </p>
              <p className="mt-2 text-white/60">등록하신 번호로 안내 문자를 보내 드리겠습니다.</p>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="mt-8 space-y-4 rounded-card border border-white/12 bg-white/[0.04] p-5"
            >
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-white/80">점포코드</span>
                <input
                  className="gs-input border-white/15 bg-white/[0.06] text-white placeholder:text-white/30"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="예: 20001"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-white/80">휴대폰 번호</span>
                <input
                  className="gs-input border-white/15 bg-white/[0.06] text-white placeholder:text-white/30"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="01012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </label>
              <label className="flex items-start gap-3 rounded-xl bg-white/[0.05] p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  style={{ accentColor: accent }}
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span className="text-white/60">
                  <b className="text-white">[필수]</b> 행사 안내 문자 수신에 동의합니다. 수집한 번호는 행사
                  종료 후 3개월 내 파기됩니다.
                </span>
              </label>
              <button
                className="gs-btn w-full text-gs-ink transition-colors duration-700"
                style={{ background: accent }}
                disabled={!consent || busy}
              >
                {busy ? '신청 중…' : '알림 신청하기'}
              </button>
              <p className="text-center text-xs text-white/45">
                등록된 점포 정보로만 신청하실 수 있습니다.
              </p>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}
