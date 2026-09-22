'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarCheck,
  FileText,
  Heart,
  Layers,
  LayoutList,
  LogOut,
  MessageCircleQuestion,
  Radio,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react';
import type { Role } from '@/types';
import { useRequireAuth, useSession } from '@/lib/hooks/useSession';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/common/Toast';
import { Watermark } from '@/components/common/Watermark';
import { BrandMark } from '@/components/common/AppShell';

const MENU: { href: string; label: string; icon: React.ElementType; roles: Role[] }[] = [
  { href: '/admin/dashboard', label: '대시보드', icon: BarChart3, roles: ['admin', 'md', 'operator'] },
  { href: '/admin/participants', label: '참여자', icon: Users, roles: ['admin'] },
  { href: '/admin/questions', label: '질의 인박스', icon: MessageCircleQuestion, roles: ['admin', 'md'] },
  { href: '/admin/reservations', label: '예약·체크인', icon: CalendarCheck, roles: ['admin', 'operator'] },
  { href: '/admin/coupons', label: '쿠폰 발송', icon: Ticket, roles: ['admin'] },
  { href: '/admin/cheers', label: '응원 검수', icon: Heart, roles: ['admin', 'operator'] },
  { href: '/admin/live', label: '라이브 편성', icon: Radio, roles: ['admin', 'md'] },
  { href: '/admin/content', label: '콘텐츠', icon: LayoutList, roles: ['admin'] },
  { href: '/admin/whitelist', label: '화이트리스트', icon: ShieldCheck, roles: ['admin'] },
  { href: '/admin/audit', label: '감사 로그', icon: FileText, roles: ['admin'] },
  { href: '/admin/techstack', label: '기술 스택', icon: Layers, roles: ['admin'] },
];

/** T1-6 · RoleGuard — 본부 계정만, 역할별 메뉴 노출 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth('staff');
  const { signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (loading || !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-gs-surface">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gs-line border-t-gs-blue" />
      </div>
    );
  }

  const menu = MENU.filter((m) => m.roles.includes(user.role));

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-gs-surface">
        <Watermark />

        <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-gs-line bg-white lg:flex">
          <div className="px-4 py-4">
            <BrandMark compact />
            <p className="mt-1 text-xs font-bold text-gs-mint-dark">관리자</p>
          </div>
          <nav className="flex-1 space-y-0.5 px-2">
            {menu.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className={cn(
                  'flex min-h-touch items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition',
                  pathname.startsWith(m.href) ? 'bg-gs-blue-light text-gs-blue' : 'text-gs-muted hover:bg-gs-surface',
                )}
              >
                <m.icon size={17} /> {m.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-gs-line p-3 text-sm">
            <p className="font-bold">{user.displayName}</p>
            <p className="mb-2 text-xs uppercase text-gs-muted">{user.role}</p>
            <button
              className="flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-gs-muted hover:bg-gs-surface"
              onClick={async () => {
                await signOut();
                router.push('/staff/login');
              }}
            >
              <LogOut size={16} /> 로그아웃
            </button>
          </div>
        </aside>

        {/* 모바일 상단 메뉴 (MD·운영자는 현장에서 폰으로 사용) */}
        <header className="sticky top-0 z-30 border-b border-gs-line bg-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-2">
            <BrandMark compact />
            <button
              className="text-sm font-semibold text-gs-muted"
              onClick={async () => {
                await signOut();
                router.push('/staff/login');
              }}
            >
              로그아웃
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {menu.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className={cn(
                  'flex min-h-[2.25rem] shrink-0 items-center gap-1 rounded-pill border px-3 text-sm font-semibold',
                  pathname.startsWith(m.href)
                    ? 'border-gs-blue bg-gs-blue-light text-gs-blue'
                    : 'border-gs-line text-gs-muted',
                )}
              >
                <m.icon size={15} /> {m.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="px-4 py-4 sm:px-6 lg:ml-56">{children}</main>
      </div>
    </ToastProvider>
  );
}
