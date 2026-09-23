'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home,
  Trophy,
  MessageCircleQuestion,
  Heart,
  User,
  MapPin,
  Radio,
  Gift,
  LogOut,
} from 'lucide-react';
import { useSession } from '@/lib/hooks/useSession';
import { cn } from '@/lib/utils';
import { FontSizeToggle } from './FontSizeToggle';
import { Watermark } from './Watermark';

/** PRD 3장 사이트맵 기준 · 모바일 하단 탭바 5개 */
const TABS = [
  { href: '/lobby', label: '로비', icon: Home },
  { href: '/ranking', label: '랭킹', icon: Trophy },
  { href: '/ask', label: '물어보세요', icon: MessageCircleQuestion },
  { href: '/cheer', label: '응원', icon: Heart },
  { href: '/my', label: '마이', icon: User },
];

/** 태블릿 가로·PC 사이드바 (탭 5개 + 부가 메뉴) */
const SIDE_EXTRA = [
  { href: '/offline', label: '오프라인 순회', icon: MapPin },
  { href: '/live', label: 'MD 라이브', icon: Radio },
  { href: '/souvenir-promo', label: '현장 기념품', icon: Gift },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, progress, signOut, kickedReason } = useSession();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh bg-gs-surface">
      <Watermark />

      {kickedReason && (
        <div className="sticky top-0 z-50 bg-state-critical px-4 py-2 text-center text-sm font-semibold text-white">
          {kickedReason}{' '}
          <button className="underline" onClick={() => router.push('/login')}>
            다시 로그인
          </button>
        </div>
      )}

      {/* 사이드바: 1024px 이상 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-gs-line bg-white lg:flex">
        <Link href="/lobby" className="flex items-center gap-2 px-5 py-5">
          <BrandMark />
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          {[...TABS, ...SIDE_EXTRA].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'flex min-h-touch items-center gap-3 rounded-xl px-3 text-base font-semibold transition',
                isActive(t.href) ? 'bg-gs-blue-light text-gs-blue' : 'text-gs-muted hover:bg-gs-surface',
              )}
            >
              <t.icon size={20} aria-hidden />
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 border-t border-gs-line p-4">
          <div className="text-sm">
            <p className="font-bold text-gs-ink">{user?.displayName}</p>
            <p className="text-gs-muted">
              스탬프 {progress?.stampCount ?? 0}/11
            </p>
          </div>
          <FontSizeToggle />
          <button
            className="flex min-h-touch w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-gs-muted hover:bg-gs-surface"
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
          >
            <LogOut size={18} /> 로그아웃
          </button>
        </div>
      </aside>

      {/* 상단바: 모바일·태블릿 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-gs-line bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
        <Link href="/lobby" className="flex items-center gap-2">
          <BrandMark compact />
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-pill bg-gs-blue-light px-3 py-1 text-sm font-bold text-gs-blue sm:inline">
            {progress?.stampCount ?? 0}/11
          </span>
          <FontSizeToggle />
        </div>
      </header>

      <main className="pb-nav lg:ml-60 lg:pb-8">
        {/* 라우트 전환 시 가벼운 페이드·업 (reduced-motion 이면 즉시 표시) */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 하단 탭바: 1024px 미만 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gs-line bg-white/98 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-3xl">
          {TABS.map((t) => {
            const on = isActive(t.href);
            return (
              <li key={t.href} className="flex-1">
                <Link
                  href={t.href}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[0.75rem] font-semibold transition',
                    on ? 'text-gs-blue' : 'text-gs-muted',
                  )}
                >
                  <t.icon size={22} aria-hidden strokeWidth={on ? 2.4 : 2} />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gs-blue text-sm font-black text-white">
        GS
      </span>
      <span className="leading-tight">
        <span className="block text-[0.7rem] font-bold tracking-wide text-gs-mint-dark">2027</span>
        <span className={cn('block font-bold text-gs-ink', compact ? 'text-sm' : 'text-base')}>
          상품전략공유회
        </span>
      </span>
    </span>
  );
}
