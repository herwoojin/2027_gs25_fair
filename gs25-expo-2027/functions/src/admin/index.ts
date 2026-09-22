import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  db,
  FieldValue,
  CALLABLE_OPTS,
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SOLAPI_SENDER,
  PHONE_ENC_KEY,
} from '../shared/admin';
import { requireStaff } from '../shared/guards';
import { decryptPhone } from '../shared/crypto';
import { isNightBlocked, sendBatch } from '../shared/solapi';
import { audit } from '../shared/audit';
import { queueRow } from '../shared/sheets';

/** T8-2 · 참여자 목록 (서버 페이지네이션) */
export const adminParticipants = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 120 }, async (req) => {
  // 참여자 명단은 개인정보에 준하므로 관리자만 볼 수 있다.
  const caller = requireStaff(req, ['admin']);
  const parsed = z
    .object({
      filter: z.enum(['all', 'completed', 'incomplete', 'never']).default('all'),
      region: z.string().default('ALL'),
      search: z.string().default(''),
      cursor: z.string().optional(),
      pageSize: z.number().int().min(10).max(200).default(25),
    })
    .safeParse(req.data ?? {});
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');
  const { filter, region, search, cursor, pageSize } = parsed.data;

  let q = db.collection('stores').where('active', '==', true).orderBy('storeCode');
  if (region !== 'ALL') {
    q = db.collection('stores').where('active', '==', true).where('region', '==', region).orderBy('storeCode');
  }
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.limit(pageSize * 3).get();
  const rows: Record<string, unknown>[] = [];

  for (const d of snap.docs) {
    const s = d.data() as { storeCode: string; storeName: string; region: string };
    if (search && !s.storeCode.includes(search) && !s.storeName.includes(search)) continue;

    const uid = `store_${s.storeCode}`;
    const [user, prog, resSnap, coupon] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('progress').doc(uid).get(),
      db.collection('reservations').where('uid', '==', uid).where('status', 'in', ['reserved', 'checked_in']).limit(1).get(),
      db.collection('coupons').doc(uid).get(),
    ]);

    const loggedIn = !!user.data()?.lastLoginAt;
    const completedAt = prog.data()?.completedAt as number | undefined;
    if (filter === 'completed' && !completedAt) continue;
    if (filter === 'incomplete' && (!loggedIn || completedAt)) continue;
    if (filter === 'never' && loggedIn) continue;

    const r = resSnap.docs[0]?.data() as { eventId?: string; date?: string; status?: string } | undefined;
    rows.push({
      storeCode: s.storeCode,
      storeName: s.storeName,
      region: s.region,
      loggedIn,
      lastLoginAt: user.data()?.lastLoginAt?.toMillis?.() ?? null,
      stampCount: (prog.data()?.stampCount as number) ?? 0,
      completedAt: completedAt ?? null,
      reserved: r ? `${r.eventId} ${r.date}` : null,
      visited: r?.status === 'checked_in',
      coupon: (coupon.data()?.status as string) ?? null,
    });
    if (rows.length >= pageSize) break;
  }

  await audit({ uid: caller.uid, role: caller.role, action: 'participants.list', detail: `${rows.length}건` });
  return { rows, nextCursor: snap.docs.at(-1)?.id ?? null };
});

/** T8-2 · 엑셀(CSV) 내보내기 — 감사 로그 필수 */
export const exportParticipants = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 300 }, async (req) => {
  const caller = requireStaff(req, ['admin']);
  const stores = await db.collection('stores').where('active', '==', true).orderBy('storeCode').get();

  const header = ['점포코드', '점포명', '지역', '영업팀', '로그인', '스탬프', '완주시각', '쿠폰'];
  const lines = [header.join(',')];

  for (const d of stores.docs) {
    const s = d.data() as { storeCode: string; storeName: string; region: string; fcTeam: string };
    const uid = `store_${s.storeCode}`;
    const [user, prog, coupon] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('progress').doc(uid).get(),
      db.collection('coupons').doc(uid).get(),
    ]);
    const completedAt = prog.data()?.completedAt as number | undefined;
    lines.push(
      [
        s.storeCode,
        `"${s.storeName}"`,
        s.region,
        `"${s.fcTeam ?? ''}"`,
        user.data()?.lastLoginAt ? 'Y' : 'N',
        `${(prog.data()?.stampCount as number) ?? 0}/11`,
        completedAt ? new Date(completedAt).toISOString() : '',
        (coupon.data()?.status as string) ?? '',
      ].join(','),
    );
  }

  await audit({
    uid: caller.uid,
    role: caller.role,
    action: 'participants.export',
    detail: `${stores.size}건 내보내기`,
  });
  return { csv: `﻿${lines.join('\n')}`, count: stores.size };
});

/** T8-3 · 독려 문자 일괄 발송 (야간 차단 + 미리보기) */
export const sendNudge = onCall(
  {
    ...CALLABLE_OPTS,
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
    timeoutSeconds: 540,
  },
  async (req) => {
    const caller = requireStaff(req, ['admin']);
    const parsed = z
      .object({
        target: z.enum(['never', 'incomplete']),
        preview: z.boolean().default(true),
        region: z.string().default('ALL'),
      })
      .safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');

    if (!parsed.data.preview && isNightBlocked()) {
      throw new HttpsError('failed-precondition', '21시~08시에는 발송할 수 없습니다.');
    }

    const body =
      parsed.data.target === 'never'
        ? '[GS25 공유회] 아직 온라인 전시에 접속하지 않으셨습니다. 지금 참여해 보세요.'
        : '[GS25 공유회] 스탬프가 몇 개 남았습니다! 완주하시면 쿠폰을 보내 드립니다.';

    let q = db.collection('stores').where('active', '==', true);
    if (parsed.data.region !== 'ALL') q = q.where('region', '==', parsed.data.region);
    const stores = await q.limit(5000).get();

    const targets: { to: string; text: string }[] = [];
    for (const d of stores.docs) {
      const s = d.data() as { storeCode: string; phoneEnc?: string };
      const uid = `store_${s.storeCode}`;
      const [user, prog] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('progress').doc(uid).get(),
      ]);
      const loggedIn = !!user.data()?.lastLoginAt;
      const completed = !!prog.data()?.completedAt;
      const hit = parsed.data.target === 'never' ? !loggedIn : loggedIn && !completed;
      if (!hit || !s.phoneEnc) continue;
      targets.push({ to: decryptPhone(s.phoneEnc, PHONE_ENC_KEY.value()), text: body });
    }

    if (parsed.data.preview) return { count: targets.length, body, preview: true };

    const res = await sendBatch(targets, {
      code: 'NUDGE',
      apiKey: SOLAPI_API_KEY.value(),
      apiSecret: SOLAPI_API_SECRET.value(),
      sender: SOLAPI_SENDER.value(),
    });
    await audit({
      uid: caller.uid,
      role: caller.role,
      action: 'nudge.sent',
      detail: `성공 ${res.sent} 실패 ${res.failed}`,
    });
    return { count: targets.length, sent: res.sent, failed: res.failed, preview: false };
  },
);

/** T8-4 · 완주자 쿠폰 발송 (CSV 코드 매칭 → 100건 배치 → 실패 재발송) */
export const sendCoupons = onCall(
  {
    ...CALLABLE_OPTS,
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
    timeoutSeconds: 540,
  },
  async (req) => {
    const caller = requireStaff(req, ['admin']);
    const parsed = z
      .object({
        codes: z.array(z.string().trim().min(4).max(64)).max(20000).default([]),
        dryRun: z.boolean().default(true),
        retryFailedOnly: z.boolean().default(false),
      })
      .safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');
    const { codes, dryRun, retryFailedOnly } = parsed.data;

    if (!dryRun && isNightBlocked()) {
      throw new HttpsError('failed-precondition', '21시~08시에는 발송할 수 없습니다.');
    }

    const finishers = await db.collection('progress').where('completedAt', '>', 0).orderBy('completedAt').get();

    const matched: { uid: string; storeCode: string; storeName: string; code: string | null }[] = [];
    let ci = 0;
    for (const d of finishers.docs) {
      const p = d.data() as { storeCode: string };
      const existing = await db.collection('coupons').doc(d.id).get();
      const status = existing.data()?.status as string | undefined;
      if (retryFailedOnly && status !== 'failed') continue;
      if (!retryFailedOnly && status === 'sent') continue;

      const store = await db.collection('stores').doc(p.storeCode).get();
      matched.push({
        uid: d.id,
        storeCode: p.storeCode,
        storeName: (store.data()?.storeName as string) ?? p.storeCode,
        code: (existing.data()?.code as string) ?? codes[ci++] ?? null,
      });
    }

    if (dryRun) {
      return {
        dryRun: true,
        matched: matched.slice(0, 200),
        matchedCount: matched.filter((m) => m.code).length,
        unmatchedCount: matched.filter((m) => !m.code).length,
        spareCodes: Math.max(0, codes.length - matched.length),
      };
    }

    const targets: { to: string; text: string }[] = [];
    const order: typeof matched = [];
    for (const m of matched) {
      if (!m.code) continue;
      const store = await db.collection('stores').doc(m.storeCode).get();
      const phoneEnc = store.data()?.phoneEnc as string | undefined;
      if (!phoneEnc) continue;
      targets.push({
        to: decryptPhone(phoneEnc, PHONE_ENC_KEY.value()),
        text: `[GS25 공유회] 완주를 축하드립니다! 쿠폰번호: ${m.code}`,
      });
      order.push(m);
    }

    const res = await sendBatch(targets, {
      code: 'COUPON',
      apiKey: SOLAPI_API_KEY.value(),
      apiSecret: SOLAPI_API_SECRET.value(),
      sender: SOLAPI_SENDER.value(),
    });

    for (let i = 0; i < order.length; i++) {
      const m = order[i];
      const ok = res.results[i]?.ok ?? false;
      await db.collection('coupons').doc(m.uid).set(
        {
          storeCode: m.storeCode,
          code: m.code,
          status: ok ? 'sent' : 'failed',
          sentAt: FieldValue.serverTimestamp(),
          retries: FieldValue.increment(retryFailedOnly ? 1 : 0),
        },
        { merge: true },
      );
      await queueRow('Coupons', [new Date().toISOString(), m.storeCode, ok ? 'sent' : 'failed', m.code!]);
    }

    await audit({
      uid: caller.uid,
      role: caller.role,
      action: 'coupons.sent',
      detail: `성공 ${res.sent} 실패 ${res.failed}`,
    });
    return { dryRun: false, sent: res.sent, failed: res.failed };
  },
);

/** 관리자 설정 (전체 2D 모드 강제 등) */
export const adminSetConfig = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireStaff(req, ['admin']);
  const parsed = z
    .object({
      force2D: z.boolean().optional(),
      maintenanceNotice: z.string().max(200).optional(),
      excludeCheerWords: z.boolean().optional(),
    })
    .safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');

  await db.collection('config').doc('app').set(parsed.data, { merge: true });
  await audit({
    uid: caller.uid,
    role: caller.role,
    action: 'config.update',
    detail: JSON.stringify(parsed.data),
  });
  return { ok: true };
});

/** 15분 만료 서명 URL 발급 (S-06) — 상품 이미지·오디오·영상 */
export const getSignedMediaUrl = onCall(CALLABLE_OPTS, async (req) => {
  const { requireAuth } = await import('../shared/guards');
  const caller = requireAuth(req);
  const parsed = z.object({ path: z.string().min(1).max(300) }).safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');
  if (!parsed.data.path.startsWith('private/')) {
    throw new HttpsError('permission-denied', '허용되지 않은 경로입니다.');
  }

  const { storage } = await import('../shared/admin');
  const [url] = await storage
    .bucket()
    .file(parsed.data.path)
    .getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60_000 });

  void caller;
  return { url, expiresInSec: 900 };
});
