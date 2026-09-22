import crypto from 'node:crypto';
import type { AppUser, RegionCode, Role } from '@/types';
import { audit, db, newId, persist } from './store';

export const SESSION_TTL_MS = 12 * 3600 * 1000; // PRD F-02 · 세션 12시간

export interface Caller {
  uid: string;
  role: Role;
  storeCode?: string;
  region?: RegionCode;
  sessionKey: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * TRD 3.3 · 동시접속 1대 제한.
 * 로그인마다 activeSessionKey 를 교체하고, 기존 세션의 키는 더 이상 유효하지 않다.
 */
export function issueSession(user: {
  uid: string;
  role: Role;
  storeCode?: string;
  region?: RegionCode;
  displayName: string;
}): { token: string; sessionKey: string; expiresAt: number } {
  const token = newId('t_') + crypto.randomBytes(24).toString('base64url');
  const sessionKey = newId('k_');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  // 기존 세션 토큰은 지우지 않고 남겨 둔다.
  // activeSessionKey 가 바뀌면서 자동으로 무효가 되는데, 토큰을 남겨야
  // 기존 기기에 "다른 기기에서 로그인되었습니다" 라는 정확한 안내를 줄 수 있다.
  // (토큰을 지우면 단순 '로그인 필요' 로만 보인다.)
  for (const [t, s] of Object.entries(db.sessions)) {
    if (s.expiresAt < now) delete db.sessions[t];
  }

  db.sessions[token] = {
    token,
    uid: user.uid,
    sessionKey,
    role: user.role,
    storeCode: user.storeCode,
    region: user.region,
    issuedAt: now,
    expiresAt,
  };

  const existing = db.users[user.uid];
  const nextUser: AppUser = {
    uid: user.uid,
    role: user.role,
    storeCode: user.storeCode,
    region: user.region,
    displayName: user.displayName,
    activeSessionKey: sessionKey,
    consentAt: existing?.consentAt,
    firstLoginAt: existing?.firstLoginAt ?? now,
    lastLoginAt: now,
    fontScale: existing?.fontScale ?? 1,
    offlineVisited: existing?.offlineVisited ?? false,
  };
  db.users[user.uid] = nextUser;
  persist();
  return { token, sessionKey, expiresAt };
}

export function readSession(token: string | null): Caller {
  if (!token) throw new HttpError(401, '로그인이 필요합니다.', 'unauthenticated');
  const s = db.sessions[token];
  if (!s) throw new HttpError(401, '로그인이 필요합니다.', 'unauthenticated');
  if (s.expiresAt < Date.now()) {
    delete db.sessions[token];
    persist();
    throw new HttpError(401, '세션이 만료되었습니다. 다시 로그인해 주세요.', 'session-expired');
  }
  const user = db.users[s.uid];
  if (!user || user.activeSessionKey !== s.sessionKey) {
    delete db.sessions[token];
    persist();
    throw new HttpError(
      409,
      '다른 기기에서 로그인되어 현재 기기의 접속이 종료되었습니다.',
      'session-superseded',
    );
  }
  return {
    uid: s.uid,
    role: s.role,
    storeCode: s.storeCode,
    region: s.region,
    sessionKey: s.sessionKey,
  };
}

export function requireOwner(caller: Caller): Caller & { storeCode: string; region: RegionCode } {
  if (caller.role !== 'owner' || !caller.storeCode || !caller.region) {
    throw new HttpError(403, '경영주 계정만 이용할 수 있습니다.', 'permission-denied');
  }
  return caller as Caller & { storeCode: string; region: RegionCode };
}

export function requireStaff(caller: Caller, roles: Role[] = ['md', 'operator', 'admin']): Caller {
  if (!roles.includes(caller.role)) {
    throw new HttpError(403, '권한이 없습니다.', 'permission-denied');
  }
  return caller;
}

export function logout(token: string | null) {
  if (!token) return;
  const s = db.sessions[token];
  if (s) {
    audit({ uid: s.uid, role: s.role, action: 'logout' });
    delete db.sessions[token];
    persist();
  }
}
