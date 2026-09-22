import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { z } from 'zod';
import {
  db,
  FieldValue,
  CALLABLE_OPTS,
  REGION,
  SCHEDULE_OPTS,
  SHEETS_SA_JSON,
  SHEET_ID,
  INTEGRATION_KEY,
  PHONE_ENC_KEY,
  PHONE_HMAC_KEY,
  APPS_SCRIPT_URL,
  APPS_SCRIPT_KEY,
} from '../shared/admin';
import { isAllowedStaffEmail, listStaffFromSheet } from '../shared/appsScript';
import { appendRows, readSheet, type SheetName } from '../shared/sheets';
import { encryptPhone, hashLast4, timingSafeEqual } from '../shared/crypto';
import { audit } from '../shared/audit';
import { requireStaff } from '../shared/guards';

/**
 * T9-1 · 1분 배치로 syncQueue 를 시트별로 묶어 append 한다.
 * 성공한 문서만 삭제하고, 실패는 tries 를 올려 재시도한다(5회 초과 시 관리자 알림).
 */
export const flushSyncQueue = onSchedule(
  { ...SCHEDULE_OPTS, schedule: 'every 1 minutes', secrets: [SHEETS_SA_JSON, SHEET_ID] },
  async () => {
    const snap = await db.collection('syncQueue').orderBy('createdAt').limit(500).get();
    if (snap.empty) return;

    const bySheet = new Map<SheetName, { id: string; row: (string | number)[]; tries: number }[]>();
    snap.forEach((d) => {
      const v = d.data() as { sheet: SheetName; row: (string | number)[]; tries?: number };
      const list = bySheet.get(v.sheet) ?? [];
      list.push({ id: d.id, row: v.row, tries: v.tries ?? 0 });
      bySheet.set(v.sheet, list);
    });

    for (const [sheet, items] of bySheet) {
      try {
        await appendRows(SHEETS_SA_JSON.value(), SHEET_ID.value(), sheet, items.map((i) => i.row));
        const batch = db.batch();
        items.forEach((i) => batch.delete(db.collection('syncQueue').doc(i.id)));
        await batch.commit();
      } catch (e) {
        const batch = db.batch();
        for (const i of items) {
          const tries = i.tries + 1;
          batch.update(db.collection('syncQueue').doc(i.id), { tries });
          if (tries > 5) {
            await audit({
              uid: 'system',
              role: 'system',
              action: 'sheets.append.failed',
              target: sheet,
              detail: e instanceof Error ? e.message : String(e),
            });
          }
        }
        await batch.commit();
      }
    }
  },
);

const storeRowSchema = z.object({
  storeCode: z.string().trim().min(3).max(12),
  storeName: z.string().trim().min(1).max(60),
  ownerName: z.string().trim().min(1).max(30),
  phone: z.string().trim().regex(/^01[016789]\d{7,8}$/),
  region: z.enum([
    'SEOUL', 'GYEONGGI', 'GANGWON', 'CHUNGCHEONG', 'DAEGU', 'ULSAN', 'BUSAN', 'GWANGJU', 'JEJU',
  ]),
  fcTeam: z.string().trim().max(40).default(''),
  active: z.boolean().default(true),
});

type StoreRow = z.infer<typeof storeRowSchema>;

async function upsertStores(rows: StoreRow[], encKey: string, hmacKey: string) {
  let created = 0;
  let updated = 0;
  let deactivated = 0;

  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const batch = db.batch();
    for (const r of chunk) {
      const ref = db.collection('stores').doc(r.storeCode);
      const exists = (await ref.get()).exists;
      batch.set(
        ref,
        {
          storeCode: r.storeCode,
          storeName: r.storeName,
          ownerName: r.ownerName,
          // 🔐 평문 저장 금지
          phoneEnc: encryptPhone(r.phone, encKey),
          phoneLast4Hash: hashLast4(r.phone.slice(-4), r.storeCode, hmacKey),
          region: r.region,
          fcTeam: r.fcTeam,
          active: r.active,
          syncedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      if (exists) updated += 1;
      else created += 1;
      if (!r.active) deactivated += 1;
    }
    await batch.commit();
  }
  return { created, updated, deactivated, total: rows.length };
}

/**
 * T9-2 · 구글시트 `Stores` 탭 → Firestore stores 동기화.
 * 관리자 화면 버튼 + 매일 06시 스케줄.
 */
export const importStores = onCall(
  { ...CALLABLE_OPTS, secrets: [SHEETS_SA_JSON, SHEET_ID, PHONE_ENC_KEY, PHONE_HMAC_KEY], timeoutSeconds: 540 },
  async (req) => {
    const caller = requireStaff(req, ['admin']);
    const values = await readSheet(SHEETS_SA_JSON.value(), SHEET_ID.value(), 'Stores!A2:G');
    const rows: StoreRow[] = [];
    const errors: string[] = [];

    values.forEach((v, idx) => {
      const parsed = storeRowSchema.safeParse({
        storeCode: v[0],
        storeName: v[1],
        ownerName: v[2],
        phone: (v[3] ?? '').replace(/\D/g, ''),
        region: v[4],
        fcTeam: v[5] ?? '',
        active: (v[6] ?? 'Y').toUpperCase() !== 'N',
      });
      if (parsed.success) rows.push(parsed.data);
      else errors.push(`${idx + 2}행: ${parsed.error.issues[0]?.message ?? '형식 오류'}`);
    });

    const result = await upsertStores(rows, PHONE_ENC_KEY.value(), PHONE_HMAC_KEY.value());
    await audit({
      uid: caller.uid,
      role: caller.role,
      action: 'whitelist.sync',
      detail: `${result.total}행 (오류 ${errors.length})`,
    });
    return { ...result, errors: errors.slice(0, 20) };
  },
);

export const importStoresDaily = onSchedule(
  {
    ...SCHEDULE_OPTS,
    schedule: '0 6 * * *',
    secrets: [SHEETS_SA_JSON, SHEET_ID, PHONE_ENC_KEY, PHONE_HMAC_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    const values = await readSheet(SHEETS_SA_JSON.value(), SHEET_ID.value(), 'Stores!A2:G');
    const rows: StoreRow[] = [];
    values.forEach((v) => {
      const parsed = storeRowSchema.safeParse({
        storeCode: v[0],
        storeName: v[1],
        ownerName: v[2],
        phone: (v[3] ?? '').replace(/\D/g, ''),
        region: v[4],
        fcTeam: v[5] ?? '',
        active: (v[6] ?? 'Y').toUpperCase() !== 'N',
      });
      if (parsed.success) rows.push(parsed.data);
    });
    const result = await upsertStores(rows, PHONE_ENC_KEY.value(), PHONE_HMAC_KEY.value());
    await audit({ uid: 'system', role: 'system', action: 'whitelist.sync.daily', detail: JSON.stringify(result) });
  },
);

/**
 * T9-3 · Power Automate 연동 엔드포인트.
 * 헤더 X-Integration-Key 를 timing-safe 비교하고, IP 허용목록을 확인한 뒤 stores 를 업서트한다.
 */
export const storesSync = onRequest(
  {
    region: REGION,
    secrets: [INTEGRATION_KEY, PHONE_ENC_KEY, PHONE_HMAC_KEY],
    cors: false,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method-not-allowed' });
      return;
    }

    const key = req.get('X-Integration-Key') ?? '';
    if (!key || !timingSafeEqual(key, INTEGRATION_KEY.value())) {
      await audit({ uid: 'integration', role: 'system', action: 'storesSync.unauthorized', ip: req.ip });
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const allow = (process.env.INTEGRATION_ALLOW_IPS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (allow.length > 0 && !allow.includes(req.ip ?? '')) {
      await audit({ uid: 'integration', role: 'system', action: 'storesSync.ip_blocked', ip: req.ip });
      res.status(403).json({ error: 'ip-not-allowed' });
      return;
    }

    const parsed = z
      .object({ stores: z.array(storeRowSchema).max(5000) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid-body', issues: parsed.error.issues.slice(0, 10) });
      return;
    }

    const result = await upsertStores(
      parsed.data.stores,
      PHONE_ENC_KEY.value(),
      PHONE_HMAC_KEY.value(),
    );
    await audit({
      uid: 'integration',
      role: 'system',
      action: 'storesSync.ok',
      ip: req.ip,
      detail: JSON.stringify(result),
    });
    res.json({ ok: true, ...result });
  },
);

/**
 * 본부 계정 원장 동기화 — Apps Script `Staff` 시트 → Firestore `staff/{uid}`.
 * MD 질의 배정(sections.mdIds)과 에스컬레이션이 이 컬렉션을 참조한다.
 */
async function syncStaff(): Promise<{ total: number; upserted: number }> {
  const rows = await listStaffFromSheet(APPS_SCRIPT_URL.value(), APPS_SCRIPT_KEY.value());
  if (!rows) return { total: 0, upserted: 0 };

  let upserted = 0;
  const batch = db.batch();
  for (const r of rows) {
    if (!isAllowedStaffEmail(r.email)) continue;
    const uid = `staff_${r.email.split('@')[0].replace(/[^a-z0-9]+/g, '_')}`;
    batch.set(
      db.collection('staff').doc(uid),
      {
        uid,
        email: r.email,
        name: r.name,
        team: r.team,
        role: r.role,
        sectionIds: r.sectionIds,
        backupFor: r.backupFor,
        active: r.active,
        // 알림은 이메일로 전환되었으므로 SMS 는 기본 비활성
        smsEnabled: false,
        syncedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    upserted += 1;
  }
  await batch.commit();
  return { total: rows.length, upserted };
}

export const importStaff = onCall(
  { ...CALLABLE_OPTS, secrets: [APPS_SCRIPT_URL, APPS_SCRIPT_KEY], timeoutSeconds: 120 },
  async (req) => {
    const caller = requireStaff(req, ['admin']);
    const result = await syncStaff();
    await audit({
      uid: caller.uid,
      role: caller.role,
      action: 'staff.sync',
      detail: JSON.stringify(result),
    });
    return result;
  },
);

export const importStaffDaily = onSchedule(
  { ...SCHEDULE_OPTS, schedule: '30 6 * * *', secrets: [APPS_SCRIPT_URL, APPS_SCRIPT_KEY] },
  async () => {
    const result = await syncStaff();
    await audit({ uid: 'system', role: 'system', action: 'staff.sync.daily', detail: JSON.stringify(result) });
  },
);

/** 행사 종료 +90일 개인정보 파기 배치 (S-11) */
export const purgePersonalData = onSchedule({ ...SCHEDULE_OPTS, schedule: '0 4 * * *' }, async () => {
  const cfg = await db.collection('config').doc('app').get();
  const closeAt = (cfg.data()?.closeAt as number) ?? 0;
  if (!closeAt || Date.now() < closeAt + 90 * 86_400_000) return;

  // 전화번호 암호문·사전알림 신청 파기 + 경영주 계정 비활성
  const stores = await db.collection('stores').limit(500).get();
  const batch = db.batch();
  stores.forEach((d) =>
    batch.update(d.ref, {
      phoneEnc: FieldValue.delete(),
      phoneLast4Hash: FieldValue.delete(),
      active: false,
      purgedAt: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();

  const pre = await db.collection('preNotify').limit(500).get();
  const b2 = db.batch();
  pre.forEach((d) => b2.delete(d.ref));
  await b2.commit();

  await audit({ uid: 'system', role: 'system', action: 'privacy.purge', detail: `${stores.size}건` });
});
