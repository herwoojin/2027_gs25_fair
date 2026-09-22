'use client';

import { useEffect, useState } from 'react';
import type { PopupNews as PopupNewsType } from '@/types';
import { callFn } from '@/lib/api';
import { useRequireAuth } from '@/lib/hooks/useSession';
import { AppShell } from '@/components/common/AppShell';
import { PopupNews } from '@/components/common/PopupNews';
import { ToastProvider } from '@/components/common/Toast';
import { StampCelebrationProvider } from '@/components/exhibit/StampCelebration';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireAuth();
  const [popup, setPopup] = useState<PopupNewsType | null>(null);

  useEffect(() => {
    if (!user) return;
    callFn<{ popup: PopupNewsType | null }>('getAppPopup')
      .then((r) => setPopup(r.popup))
      .catch(() => {});
  }, [user]);

  if (loading || !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-gs-surface">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-gs-line border-t-gs-blue" />
          <p className="text-gs-muted">불러오는 중…</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <StampCelebrationProvider>
        <AppShell>{children}</AppShell>
        <PopupNews popup={popup} />
      </StampCelebrationProvider>
    </ToastProvider>
  );
}
