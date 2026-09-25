/**
 * 서버리스 인스턴스 간 공유 상태.
 *
 * 왜 필요한가 — 넷리파이의 Next.js 런타임은 요청마다 다른 컨테이너가 응답할 수 있다.
 * 인증번호 세션·메일 대기열·본부 계정 원장이 프로세스 메모리에만 있으면,
 * 발송 요청을 받은 인스턴스와 Apps Script 트리거가 찾아온 인스턴스가 달라
 * **메일이 영영 나가지 않는다.** (실측: 같은 시각 ping 이 인스턴스에 따라
 * sent=2 / sent=0 으로 갈렸다)
 *
 * 그래서 인증·발송 경로가 쓰는 키만 넷리파이 Blobs 에 얹는다.
 * Blobs 를 못 쓰는 환경(로컬 개발 등)에서는 조용히 기존 동작으로 돌아간다.
 *
 * 한계 — 마지막에 쓴 쪽이 이긴다. 인증·발송 경로는 동시 요청이 적어 감수할 만하지만,
 * 근본 해결은 Firestore 이전이다(TECH_STACK '알려진 한계' 참고).
 */
import type { getStore as GetStore } from '@netlify/blobs';
import { db, persist } from './store';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/sharedState.ts is server-only');
}

/** 인스턴스가 갈리면 곧바로 깨지는 키들. 스탬프·콘텐츠는 대상이 아니다. */
const SHARED_KEYS = [
  'otpSessions',
  'sessions',
  'mailQueue',
  'pullNonces',
  'staffDirectory',
  'staffSyncedAt',
  'mailerLastPullAt',
  'rateLimits',
] as const;

const STORE_NAME = 'gs25-expo-auth';
const BLOB_KEY = 'shared-v1';

type Shared = Partial<Record<(typeof SHARED_KEYS)[number], unknown>>;

let store: ReturnType<typeof GetStore> | null = null;
let disabled = false;

/** Blobs 는 넷리파이 런타임에서만 동작한다. 실패하면 한 번만 끄고 다시 시도하지 않는다. */
async function getStoreOnce() {
  if (disabled) return null;
  if (store) return store;
  try {
    const { getStore } = await import('@netlify/blobs');
    store = getStore({ name: STORE_NAME, consistency: 'strong' });
    return store;
  } catch {
    disabled = true;
    return null;
  }
}

export function sharedStateEnabled(): boolean {
  return !disabled && !!process.env.NETLIFY_BLOBS_CONTEXT;
}

/** 요청 처리 전 — 공유 저장소의 값을 메모리 DB 에 덮어쓴다. */
export async function hydrateShared(): Promise<void> {
  const s = await getStoreOnce();
  if (!s) return;
  try {
    const raw = (await s.get(BLOB_KEY, { type: 'json' })) as Shared | null;
    if (!raw) return;
    for (const key of SHARED_KEYS) {
      if (raw[key] !== undefined) {
        (db as unknown as Record<string, unknown>)[key] = raw[key];
      }
    }
  } catch {
    /* 공유 저장소 장애가 로그인 전체를 막으면 안 된다 — 메모리 상태로 계속 간다 */
  }
}

/** 요청 처리 후 — 바뀐 값을 공유 저장소에 올린다. */
export async function flushShared(): Promise<void> {
  const s = await getStoreOnce();
  if (!s) return;
  try {
    const out: Shared = {};
    for (const key of SHARED_KEYS) {
      out[key] = (db as unknown as Record<string, unknown>)[key];
    }
    await s.setJSON(BLOB_KEY, out);
  } catch {
    /* 저장 실패는 다음 요청에서 다시 시도된다 */
  }
  persist();
}
