import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';

export type Role = 'owner' | 'md' | 'operator' | 'admin';

export interface Caller {
  uid: string;
  role: Role;
  storeCode?: string;
  region?: string;
  ip: string;
  ua: string;
}

export function requireAuth(req: CallableRequest): Caller {
  if (!req.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const token = req.auth.token as Record<string, unknown>;
  const role = token.role as Role | undefined;
  if (!role) throw new HttpsError('permission-denied', '권한 정보가 없습니다. 다시 로그인해 주세요.');
  return {
    uid: req.auth.uid,
    role,
    storeCode: token.store as string | undefined,
    region: token.region as string | undefined,
    ip: req.rawRequest?.ip ?? '0.0.0.0',
    ua: req.rawRequest?.headers?.['user-agent']?.toString() ?? 'unknown',
  };
}

export function requireOwner(req: CallableRequest): Caller & { storeCode: string; region: string } {
  const c = requireAuth(req);
  if (c.role !== 'owner' || !c.storeCode || !c.region) {
    throw new HttpsError('permission-denied', '경영주 계정만 이용할 수 있습니다.');
  }
  return c as Caller & { storeCode: string; region: string };
}

export function requireStaff(req: CallableRequest, roles: Role[] = ['md', 'operator', 'admin']): Caller {
  const c = requireAuth(req);
  if (!roles.includes(c.role)) throw new HttpsError('permission-denied', '권한이 없습니다.');
  return c;
}

/**
 * TRD 3.3 · 동시접속 1대 제한.
 * 클라이언트가 보관한 sessionKey 와 users/{uid}.activeSessionKey 가 다르면 거부한다.
 */
export async function requireActiveSession(caller: Caller, sessionKey?: string): Promise<void> {
  if (!sessionKey) return; // 세션키를 보내지 않는 호출은 Firestore 리스너 쪽에서 감지
  const snap = await db.collection('users').doc(caller.uid).get();
  if (snap.data()?.activeSessionKey !== sessionKey) {
    throw new HttpsError('aborted', '다른 기기에서 로그인되어 현재 기기의 접속이 종료되었습니다.');
  }
}
