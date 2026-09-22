import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { z } from 'zod';
import {
  db,
  FieldValue,
  CALLABLE_OPTS,
  HOT_CALLABLE_OPTS,
  SCHEDULE_OPTS,
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SOLAPI_SENDER,
  PHONE_ENC_KEY,
  PHONE_HMAC_KEY,
} from '../shared/admin';
import { requireOwner, requireStaff } from '../shared/guards';
import { decryptPhone, hmac, randomToken } from '../shared/crypto';
import { sendSms } from '../shared/solapi';
import { audit } from '../shared/audit';
import { queueRow } from '../shared/sheets';

const SLOT_LABEL: Record<number, string> = { 1: '10:00–12:00', 2: '13:00–15:00', 3: '15:00–17:00' };

/** 전일 18시 마감 (PRD F-11) */
function deadlinePassed(date: string): boolean {
  const deadline = new Date(`${date}T18:00:00+09:00`).getTime() - 86_400_000;
  return Date.now() > deadline;
}

const reserveSchema = z.object({
  eventId: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotNo: z.number().int().min(1).max(3),
  partySize: z.number().int().min(1).max(2).default(1),
  engravingText: z.string().trim().max(12).default(''),
});

/**
 * T7-2 ⚡ · 타임 예약.
 * 트랜잭션으로 reservedCount < capacity 를 확인하고, 1점포 1예약(기존 예약은 변경 처리)한다.
 */
export const reserveSlot = onCall(
  {
    ...HOT_CALLABLE_OPTS,
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY, PHONE_HMAC_KEY],
  },
  async (req) => {
    const caller = requireOwner(req);
    const parsed = reserveSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', '예약 정보를 확인해 주세요.');
    const { eventId, date, slotNo, partySize, engravingText } = parsed.data;

    if (deadlinePassed(date)) {
      throw new HttpsError('failed-precondition', '예약은 전일 18시에 마감됩니다.');
    }

    const eventSnap = await db.collection('events').doc(eventId).get();
    if (!eventSnap.exists) throw new HttpsError('not-found', '존재하지 않는 행사입니다.');
    const ev = eventSnap.data() as { city: string; venueName: string; startDate: string; endDate: string };
    if (date < ev.startDate || date > ev.endDate) {
      throw new HttpsError('invalid-argument', '해당 도시의 개최일이 아닙니다.');
    }

    const slotId = `${eventId}_${date.replace(/-/g, '')}_${slotNo}`;
    const slotRef = db.collection('slots').doc(slotId);
    const storeSnap = await db.collection('stores').doc(caller.storeCode).get();
    const storeName = (storeSnap.data()?.storeName as string) ?? caller.storeCode;

    const qrToken = `${randomToken(16)}.${hmac(`${slotId}:${caller.uid}`, PHONE_HMAC_KEY.value()).slice(0, 24)}`;

    const reservationId = await db.runTransaction(async (tx) => {
      const slot = await tx.get(slotRef);
      if (!slot.exists) throw new HttpsError('not-found', '존재하지 않는 타임입니다.');
      const s = slot.data() as { capacity: number; reservedCount: number };
      if ((s.reservedCount ?? 0) >= s.capacity) {
        throw new HttpsError('resource-exhausted', '해당 타임은 정원이 모두 찼습니다.');
      }

      // 1점포 1예약 — 기존 예약이 있으면 취소하고 좌석을 반납한다.
      const prevQuery = await tx.get(
        db.collection('reservations').where('uid', '==', caller.uid).where('status', '==', 'reserved'),
      );
      for (const prev of prevQuery.docs) {
        const p = prev.data() as { date: string; slotId: string };
        if (deadlinePassed(p.date)) {
          throw new HttpsError('failed-precondition', '기존 예약은 전일 18시 이후 변경할 수 없습니다.');
        }
        tx.update(prev.ref, { status: 'cancelled' });
        tx.update(db.collection('slots').doc(p.slotId), { reservedCount: FieldValue.increment(-1) });
      }

      const ref = db.collection('reservations').doc();
      tx.set(ref, {
        uid: caller.uid,
        storeCode: caller.storeCode,
        region: caller.region,
        eventId,
        slotId,
        date,
        slotNo,
        partySize,
        engravingText: engravingText || storeName.slice(0, 12),
        status: 'reserved',
        qrToken,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(slotRef, { reservedCount: FieldValue.increment(1) });
      return ref.id;
    });

    const phoneEnc = storeSnap.data()?.phoneEnc as string | undefined;
    if (phoneEnc) {
      await sendSms({
        code: 'RESERVE_OK',
        to: decryptPhone(phoneEnc, PHONE_ENC_KEY.value()),
        text: `[GS25 공유회] ${ev.city} ${date} ${SLOT_LABEL[slotNo]} 예약이 확정되었습니다. 장소: ${ev.venueName}`,
        apiKey: SOLAPI_API_KEY.value(),
        apiSecret: SOLAPI_API_SECRET.value(),
        sender: SOLAPI_SENDER.value(),
      });
    }

    await queueRow('Reservations', [
      new Date().toISOString(),
      caller.storeCode,
      ev.city,
      date,
      slotNo,
      'reserved',
      engravingText || storeName.slice(0, 12),
    ]);

    return { reservationId, qrToken };
  },
);

export const cancelReservation = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireOwner(req);
  const snap = await db
    .collection('reservations')
    .where('uid', '==', caller.uid)
    .where('status', '==', 'reserved')
    .limit(1)
    .get();
  if (snap.empty) throw new HttpsError('not-found', '예약이 없습니다.');

  const doc = snap.docs[0];
  const r = doc.data() as { date: string; slotId: string; eventId: string; slotNo: number };
  if (deadlinePassed(r.date)) {
    throw new HttpsError('failed-precondition', '전일 18시 이후에는 취소할 수 없습니다.');
  }

  await db.runTransaction(async (tx) => {
    tx.update(doc.ref, { status: 'cancelled' });
    tx.update(db.collection('slots').doc(r.slotId), { reservedCount: FieldValue.increment(-1) });
  });

  await queueRow('Reservations', [
    new Date().toISOString(),
    caller.storeCode,
    r.eventId,
    r.date,
    r.slotNo,
    'cancelled',
    '',
  ]);
  return { ok: true };
});

const checkInSchema = z.object({
  qrToken: z.string().min(8).max(128),
  souvenirIds: z.array(z.string().max(40)).max(10).default([]),
});

/** T7-3 · 운영자 체크인 — QR 검증, 당일·해당 타임 확인, 중복 거부, 기념품 재고 차감 */
export const checkIn = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireStaff(req, ['operator', 'admin']);
  const parsed = checkInSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 QR입니다.');
  const { qrToken, souvenirIds } = parsed.data;

  const snap = await db.collection('reservations').where('qrToken', '==', qrToken).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', '유효하지 않은 QR입니다.');
  const doc = snap.docs[0];
  const r = doc.data() as {
    uid: string;
    storeCode: string;
    eventId: string;
    slotId: string;
    slotNo: number;
    date: string;
    status: string;
    engravingText: string;
  };

  if (r.status === 'checked_in') throw new HttpsError('already-exists', '이미 체크인된 예약입니다.');
  if (r.status === 'cancelled') throw new HttpsError('failed-precondition', '취소된 예약입니다.');

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  if (r.date !== today && process.env.CHECKIN_ALLOW_ANY_DAY !== 'true') {
    throw new HttpsError('failed-precondition', `예약일(${r.date})이 아닙니다.`);
  }

  await db.runTransaction(async (tx) => {
    // 기념품 재고 확인·차감
    for (const itemId of souvenirIds) {
      const stockRef = db.collection('souvenirStock').doc(`${r.eventId}_${itemId}`);
      const stock = await tx.get(stockRef);
      const s = stock.data() as { total?: number; given?: number } | undefined;
      if (s && (s.given ?? 0) >= (s.total ?? 0)) {
        throw new HttpsError('resource-exhausted', `${itemId} 재고가 소진되었습니다.`);
      }
      tx.set(stockRef, { given: FieldValue.increment(1) }, { merge: true });
    }

    tx.update(doc.ref, {
      status: 'checked_in',
      checkedInAt: FieldValue.serverTimestamp(),
      checkedInBy: caller.uid,
      souvenirGiven: Object.fromEntries(souvenirIds.map((id) => [id, true])),
    });
    tx.update(db.collection('slots').doc(r.slotId), { checkedInCount: FieldValue.increment(1) });
    // 오프라인 방문 뱃지 (랭킹 가산 없음, 표시용)
    tx.set(db.collection('users').doc(r.uid), { offlineVisited: true }, { merge: true });
  });

  const store = await db.collection('stores').doc(r.storeCode).get();

  await queueRow('CheckIns', [
    new Date().toISOString(),
    r.storeCode,
    r.eventId,
    r.slotNo,
    souvenirIds.join('|'),
  ]);
  await audit({ uid: caller.uid, role: caller.role, action: 'checkin', target: doc.id });

  return {
    storeName: (store.data()?.storeName as string) ?? r.storeCode,
    engravingText: r.engravingText,
    slotNo: r.slotNo,
    date: r.date,
  };
});

/** T7-2 · 전일 17시 리마인드 문자 */
export const remindReservations = onSchedule(
  {
    ...SCHEDULE_OPTS,
    schedule: '0 17 * * *',
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
  },
  async () => {
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
      new Date(Date.now() + 86_400_000),
    );
    const snap = await db
      .collection('reservations')
      .where('date', '==', tomorrow)
      .where('status', '==', 'reserved')
      .get();

    for (const doc of snap.docs) {
      const r = doc.data() as { storeCode: string; eventId: string; slotNo: number };
      const store = await db.collection('stores').doc(r.storeCode).get();
      const phoneEnc = store.data()?.phoneEnc as string | undefined;
      if (!phoneEnc) continue;
      const ev = await db.collection('events').doc(r.eventId).get();
      await sendSms({
        code: 'RESERVE_REMIND',
        to: decryptPhone(phoneEnc, PHONE_ENC_KEY.value()),
        text: `[GS25 공유회] 내일 ${ev.data()?.city} ${SLOT_LABEL[r.slotNo]} 방문 예정입니다. 장소: ${ev.data()?.venueName}`,
        apiKey: SOLAPI_API_KEY.value(),
        apiSecret: SOLAPI_API_SECRET.value(),
        sender: SOLAPI_SENDER.value(),
      });
    }
  },
);

/** 미방문 예약을 노쇼로 정리 (익일 새벽) */
export const markNoShows = onSchedule({ ...SCHEDULE_OPTS, schedule: '0 2 * * *' }, async () => {
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
    new Date(Date.now() - 86_400_000),
  );
  const snap = await db
    .collection('reservations')
    .where('date', '==', yesterday)
    .where('status', '==', 'reserved')
    .get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: 'no_show' }));
  await batch.commit();
});
