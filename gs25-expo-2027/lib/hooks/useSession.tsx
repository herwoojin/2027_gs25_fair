'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppConfig, AppUser, Progress } from '@/types';
import { callFn, setToken, getToken, type ApiError } from '@/lib/api';
import { DEFAULT_CONFIG } from '@/lib/config';
import { safeStorage } from '@/lib/utils';

interface SessionState {
  user: AppUser | null;
  progress: Progress | null;
  config: AppConfig;
  loading: boolean;
  /** 동시접속으로 종료된 경우 안내 문구 */
  kickedReason: string | null;
  refresh: () => Promise<void>;
  applySession: (token: string, user: AppUser) => void;
  signOut: () => Promise<void>;
  setProgress: (p: Progress) => void;
  fontScale: number;
  setFontScale: (n: number) => void;
}

const Ctx = createContext<SessionState | null>(null);

const FONT_KEY = 'gs25expo.fontScale';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [progress, setProgressState] = useState<Progress | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [kickedReason, setKicked] = useState<string | null>(null);
  const [fontScale, setFontScaleState] = useState(1);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setProgressState(null);
      setLoading(false);
      // 비로그인도 오픈 일시는 알아야 한다.
      try {
        const { config: c } = await callFn<{ config: AppConfig }>('getPublicConfig');
        setConfig(c);
      } catch {
        /* 기본값 사용 */
      }
      return;
    }
    try {
      const res = await callFn<{ user: AppUser; progress: Progress | null; config: AppConfig }>('me');
      setUser(res.user);
      setProgressState(res.progress);
      setConfig(res.config);
      setKicked(null);
    } catch (err) {
      const e = err as ApiError;
      setUser(null);
      setProgressState(null);
      if (e.code === 'session-superseded') setKicked(e.message);
      else if (e.code === 'session-expired') setKicked('세션이 만료되었습니다. 다시 로그인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setFontScaleState(Number(safeStorage.get(FONT_KEY) ?? 1) || 1);
    void refresh();
  }, [refresh]);

  // TRD 3.3 · 동시접속 감시: 주기적으로 세션 유효성을 확인한다.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [user, refresh]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
  }, [fontScale]);

  const setFontScale = useCallback((n: number) => {
    setFontScaleState(n);
    safeStorage.set(FONT_KEY, String(n));
    void callFn('setFontScale', { scale: n }).catch(() => {});
  }, []);

  const applySession = useCallback((token: string, u: AppUser) => {
    setToken(token);
    setUser(u);
    setKicked(null);
  }, []);

  const doSignOut = useCallback(async () => {
    try {
      await callFn('signOut');
    } catch {
      /* 이미 만료된 세션일 수 있다 */
    }
    setToken(null);
    setUser(null);
    setProgressState(null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      user,
      progress,
      config,
      loading,
      kickedReason,
      refresh,
      applySession,
      signOut: doSignOut,
      setProgress: setProgressState,
      fontScale,
      setFontScale,
    }),
    [user, progress, config, loading, kickedReason, refresh, applySession, doSignOut, fontScale, setFontScale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** T1-6 · AuthGuard — 비로그인은 /login 으로 */
export function useRequireAuth(role?: 'owner' | 'staff') {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(role === 'staff' ? '/staff/login' : '/login');
      return;
    }
    if (role === 'owner' && user.role !== 'owner') router.replace('/admin/dashboard');
    if (role === 'staff' && user.role === 'owner') router.replace('/lobby');
  }, [user, loading, role, router]);
  return { user, loading };
}
