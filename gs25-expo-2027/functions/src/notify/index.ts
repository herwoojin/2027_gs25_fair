import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { z } from 'zod';
import {
  db,
  FieldValue,
  CALLABLE_OPTS,
  SCHEDULE_OPTS,
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SOLAPI_SENDER,
  PHONE_ENC_KEY,
  PHONE_HMAC_KEY,
} from '../shared/admin';
import { encryptPhone, decryptPhone, hashLast4 } from '../shared/crypto';
import { sendSms } from '../shared/solapi';
import { consume } from '../shared/rateLimit';
import { audit } from '../shared/audit';

const APP_URL = process.env.APP_URL ?? 'https://expo.gs25.example';

/**
 * T2-3 · 사전 알림 신청.
 * 화이트리스트 점포만 신청 가능하되, 점포 존재 여부는 노출하지 않는다(F-01).
 */
export const requestPreNotify = onCall(
  { ...CALLABLE_OPTS, secrets: [PHONE_ENC_KEY, PHONE_HMAC_KEY] },
  async (req) => {
    const parsed = z
      .object({
        storeCode: z.string().trim().min(3).max(12),
        phone: z.string().trim().regex(/^01[016789]\d{7,8}$/),
        consent: z.literal(true),
      })
      .safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', '입력 정보를 확인해 주세요.');

    const ip = req.rawRequest?.ip ?? '0.0.0.0';
    const rate = await consume(`prenotify:${ip}`, 10, 3600_000);
    if (!rate.ok) throw new HttpsError('resource-exhausted', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');

    const store = await db.collection('stores').doc(parsed.data.storeCode).get();
    if (!store.exists || store.data()?.active !== true) {
      await audit({ uid: parsed.data.storeCode, role: 'anonymous', action: 'prenotify.rejected', ip });
      throw new HttpsError('invalid-argument', '등록된 점포 정보로만 신청하실 수 있습니다.');
    }

    const hash = hashLast4(parsed.data.phone, parsed.data.storeCode, PHONE_HMAC_KEY.value());
    await db.collection('preNotify').doc(hash).set({
      storeCode: parsed.data.storeCode,
      phoneEnc: encryptPhone(parsed.data.phone, PHONE_ENC_KEY.value()),
      consentAt: FieldValue.serverTimestamp(),
      sentStages: [],
    });

    await audit({ uid: parsed.data.storeCode, role: 'anonymous', action: 'prenotify.registered', ip });
    return { ok: true };
  },
);

/**
 * T2-3 · D-7 / D-1 / D-day 오전 9시 자동 발송.
 * 매일 09:00 에 돌면서 config/app.openAt 기준으로 해당 단계 대상만 추린다.
 */
export const sendPreNotifyBatch = onSchedule(
  {
    ...SCHEDULE_OPTS,
    schedule: '0 9 * * *',
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    const cfg = await db.collection('config').doc('app').get();
    const openAt = cfg.data()?.openAt as number | undefined;
    if (!openAt) return;

    const daysLeft = Math.round((openAt - Date.now()) / 86_400_000);
    const stage = daysLeft === 7 ? 'D-7' : daysLeft === 1 ? 'D-1' : daysLeft === 0 ? 'D-DAY' : null;
    if (!stage) return;

    const text =
      stage === 'D-7'
        ? `[GS25 공유회] 2027 상품전략공유회가 일주일 뒤 온라인에서 열립니다. ${APP_URL}`
        : stage === 'D-1'
          ? `[GS25 공유회] 내일 온라인 전시가 열립니다. 점포코드와 휴대폰 뒷4자리로 입장하세요. ${APP_URL}`
          : `[GS25 공유회] 오늘 온라인 전시가 열렸습니다. 지금 입장해 보세요. ${APP_URL}`;

    const snap = await db.collection('preNotify').limit(2000).get();
    for (const doc of snap.docs) {
      const v = doc.data() as { phoneEnc: string; sentStages?: string[] };
      if (v.sentStages?.includes(stage)) continue;
      const r = await sendSms({
        code: 'PRE_NOTIFY',
        to: decryptPhone(v.phoneEnc, PHONE_ENC_KEY.value()),
        text,
        apiKey: SOLAPI_API_KEY.value(),
        apiSecret: SOLAPI_API_SECRET.value(),
        sender: SOLAPI_SENDER.value(),
      });
      if (r.ok) await doc.ref.update({ sentStages: FieldValue.arrayUnion(stage) });
    }
  },
);

/** 각 도시 행사 D-3 방문 예약 독려 */
export const sendCityReminder = onSchedule(
  {
    ...SCHEDULE_OPTS,
    schedule: '0 10 * * *',
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    const target = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
      new Date(Date.now() + 3 * 86_400_000),
    );
    const events = await db.collection('events').where('startDate', '==', target).get();

    for (const ev of events.docs) {
      const e = ev.data() as { region: string; city: string; venueName: string };
      const stores = await db
        .collection('stores')
        .where('region', '==', e.region)
        .where('active', '==', true)
        .limit(3000)
        .get();

      for (const s of stores.docs) {
        const phoneEnc = s.data().phoneEnc as string | undefined;
        if (!phoneEnc) continue;
        await sendSms({
          code: 'PRE_NOTIFY',
          to: decryptPhone(phoneEnc, PHONE_ENC_KEY.value()),
          text: `[GS25 공유회] ${e.city} 행사가 3일 뒤 시작됩니다. 타임 예약은 ${APP_URL}/offline/reserve`,
          apiKey: SOLAPI_API_KEY.value(),
          apiSecret: SOLAPI_API_SECRET.value(),
          sender: SOLAPI_SENDER.value(),
        });
      }
    }
  },
);

/** T7-4 · 라이브 시작 10분 전 알림 */
export const sendLiveAlerts = onSchedule(
  {
    ...SCHEDULE_OPTS,
    schedule: 'every 5 minutes',
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
  },
  async () => {
    const from = Date.now() + 9 * 60_000;
    const to = Date.now() + 14 * 60_000;
    const snap = await db
      .collection('liveStreams')
      .where('startAt', '>=', from)
      .where('startAt', '<=', to)
      .get();

    for (const doc of snap.docs) {
      const s = doc.data() as { city: string; topic: string; alertSent?: boolean };
      if (s.alertSent) continue;
      const subs = await db.collection('liveAlerts').doc(doc.id).collection('subs').get();

      for (const sub of subs.docs) {
        const user = await db.collection('users').doc(sub.id).get();
        const storeCode = user.data()?.storeCode as string | undefined;
        if (!storeCode) continue;
        const store = await db.collection('stores').doc(storeCode).get();
        const phoneEnc = store.data()?.phoneEnc as string | undefined;
        if (!phoneEnc) continue;
        await sendSms({
          code: 'LIVE_ALERT',
          to: decryptPhone(phoneEnc, PHONE_ENC_KEY.value()),
          text: `[GS25 공유회] 10분 뒤 ${s.city} 라이브 투어가 시작됩니다. ${APP_URL}/live`,
          apiKey: SOLAPI_API_KEY.value(),
          apiSecret: SOLAPI_API_SECRET.value(),
          sender: SOLAPI_SENDER.value(),
        });
      }
      await doc.ref.update({ alertSent: true });
    }
  },
);
