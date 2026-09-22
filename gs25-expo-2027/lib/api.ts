'use client';

import { firebaseConfigured, getFirebase } from './firebase';

const TOKEN_KEY = 'gs25expo.session';

export interface ApiError extends Error {
  code: string;
  status: number;
  extra?: Record<string, unknown>;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 사파리 프라이빗 모드 등 — 저장 실패해도 앱은 동작해야 한다 */
  }
}

function toError(status: number, body: { error?: { code?: string; message?: string } } | null) {
  const e = new Error(body?.error?.message ?? '요청을 처리하지 못했습니다.') as ApiError;
  e.code = body?.error?.code ?? 'internal';
  e.status = status;
  e.extra = (body?.error ?? {}) as Record<string, unknown>;
  return e;
}

/**
 * callable 호출 단일 진입점.
 * - Firebase 설정이 있으면 Cloud Functions(httpsCallable, App Check 토큰 자동 첨부)
 * - 없으면 개발 모드 API(/api/fn/*)
 * 어느 쪽이든 호출부 코드는 동일하다.
 */
export async function callFn<T = unknown>(name: string, payload: unknown = {}): Promise<T> {
  if (firebaseConfigured) {
    const fb = getFirebase()!;
    const { httpsCallable } = await import('firebase/functions');
    try {
      const res = await httpsCallable(fb.functions, name)(payload);
      return res.data as T;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const out = new Error(e.message ?? '요청을 처리하지 못했습니다.') as ApiError;
      out.code = e.code ?? 'internal';
      out.status = 500;
      throw out;
    }
  }

  const res = await fetch(`/api/fn/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'x-session-token': getToken()! } : {}),
    },
    body: JSON.stringify(payload ?? {}),
    cache: 'no-store',
  });

  let body: { result?: T; error?: { code?: string; message?: string } } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = toError(res.status, body);
    // 동시접속·만료 시 토큰을 비우고 로그인으로 유도한다.
    if (err.code === 'unauthenticated' || err.code === 'session-expired' || err.code === 'session-superseded') {
      setToken(null);
    }
    throw err;
  }
  return body!.result as T;
}
