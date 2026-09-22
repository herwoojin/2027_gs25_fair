import { HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue } from './admin';

/**
 * TRD 3.4 · 슬라이딩 윈도 rate limit.
 * rateLimits/{key} 문서를 트랜잭션으로 갱신한다. (클라이언트 read/write 전면 차단)
 */
export async function consume(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const ref = db.collection('rateLimits').doc(key.replace(/\//g, '_'));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = snap.data() as { count?: number; windowStart?: number; lockedUntil?: number } | undefined;

    if (data?.lockedUntil && data.lockedUntil > now) {
      return { ok: false, retryAfterSec: Math.ceil((data.lockedUntil - now) / 1000) };
    }
    if (!data?.windowStart || now - data.windowStart > windowMs) {
      tx.set(ref, { count: 1, windowStart: now, expireAt: new Date(now + windowMs + 3600_000) });
      return { ok: true, retryAfterSec: 0 };
    }
    if ((data.count ?? 0) >= limit) {
      return { ok: false, retryAfterSec: Math.ceil((data.windowStart + windowMs - now) / 1000) };
    }
    tx.update(ref, { count: FieldValue.increment(1) });
    return { ok: true, retryAfterSec: 0 };
  });
}

export async function lock(key: string, ms: number) {
  const ref = db.collection('rateLimits').doc(key.replace(/\//g, '_'));
  await ref.set(
    {
      count: 9999,
      windowStart: Date.now(),
      lockedUntil: Date.now() + ms,
      expireAt: new Date(Date.now() + ms + 3600_000),
    },
    { merge: true },
  );
}

export async function guard(key: string, limit: number, windowMs: number, message: string) {
  const r = await consume(key, limit, windowMs);
  if (!r.ok) {
    throw new HttpsError('resource-exhausted', `${message} (${r.retryAfterSec}초 후 다시 시도해 주세요)`);
  }
}
