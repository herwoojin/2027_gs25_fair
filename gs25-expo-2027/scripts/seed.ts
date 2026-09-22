/**
 * T0-5 · 시드 스크립트 — 에뮬레이터/개발 프로젝트에 초기 데이터를 적재한다.
 *
 *   firebase emulators:start   # 다른 터미널
 *   npm run seed
 *
 * ⚠️ prod 프로젝트에는 절대 실행하지 않는다(가드 포함).
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'node:crypto';

import { SECTIONS } from '../lib/seed/sections';
import { PRODUCTS, QUIZZES } from '../lib/seed/products';
import { EVENTS, SLOTS } from '../lib/seed/events';
import { CHEERS, LIVE_STREAMS, MESSAGES, POPUP_NEWS, SOUVENIRS, STAFF, DEMO_STORES } from '../lib/seed/misc';
import { QUIZ_ANSWERS } from '../lib/server/quizAnswers';
import { DEFAULT_CONFIG } from '../lib/config';

const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'gs25-expo-dev';

/** 실수로 운영 데이터를 덮어쓰지 않도록 차단한다. */
const PROTECTED_PROJECTS = ['gs25-fair', 'gs25-expo-prod', 'gs25-expo-stg'];
if (PROTECTED_PROJECTS.includes(projectId) || projectId.includes('prod')) {
  console.error(`❌ ${projectId} 는 보호된 프로젝트입니다. 시드를 실행할 수 없습니다.`);
  console.error('   에뮬레이터에 적재하려면 GCLOUD_PROJECT=gs25-expo-dev 로 실행하세요.');
  process.exit(1);
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}

if (getApps().length === 0) {
  initializeApp({ projectId, credential: applicationDefault() });
}
const db = getFirestore();
const auth = getAuth();

const ENC_KEY = crypto
  .createHash('sha256')
  .update(process.env.PHONE_ENC_KEY ?? 'dev-only-phone-enc-key-change-me')
  .digest();
const HMAC_KEY = process.env.PHONE_HMAC_KEY ?? 'dev-only-hmac-key-change-me';

function encryptPhone(phone: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([c.update(phone, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}
function hashLast4(last4: string, storeCode: string): string {
  return crypto.createHmac('sha256', HMAC_KEY).update(`${last4}:${storeCode}`).digest('hex');
}

async function commitAll(items: { ref: FirebaseFirestore.DocumentReference; data: unknown }[]) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    items.slice(i, i + 400).forEach(({ ref, data }) => batch.set(ref, data as object, { merge: true }));
    await batch.commit();
  }
}

async function main() {
  console.log(`▶ 시드 시작 (project=${projectId})`);

  // 설정
  await db.collection('config').doc('app').set(DEFAULT_CONFIG, { merge: true });

  // 섹션 · 상품 · 퀴즈
  await commitAll(SECTIONS.map((s) => ({ ref: db.collection('sections').doc(s.id), data: s })));
  await commitAll(PRODUCTS.map((p) => ({ ref: db.collection('products').doc(p.id), data: p })));
  await commitAll(QUIZZES.map((q) => ({ ref: db.collection('quizzes').doc(q.id), data: q })));

  // 🔒 정답은 별도 컬렉션 (클라이언트 read/write false)
  await commitAll(
    Object.entries(QUIZ_ANSWERS).map(([id, a]) => ({
      ref: db.collection('quizAnswers').doc(id),
      data: a,
    })),
  );
  console.log(`  섹션 ${SECTIONS.length} · 상품 ${PRODUCTS.length} · 퀴즈 ${QUIZZES.length}`);

  // 메시지 · 기념품 · 팝업 · 라이브
  await commitAll(MESSAGES.map((m) => ({ ref: db.collection('messages').doc(m.id), data: m })));
  await commitAll(SOUVENIRS.map((s) => ({ ref: db.collection('souvenirs').doc(s.id), data: s })));
  await commitAll(POPUP_NEWS.map((p) => ({ ref: db.collection('popupNews').doc(p.id), data: p })));
  await commitAll(LIVE_STREAMS.map((l) => ({ ref: db.collection('liveStreams').doc(l.id), data: l })));

  // 도시 · 슬롯
  await commitAll(EVENTS.map((e) => ({ ref: db.collection('events').doc(e.id), data: e })));
  await commitAll(
    SLOTS.map((s) => ({
      ref: db.collection('slots').doc(s.id),
      data: { ...s, reservedCount: 0, checkedInCount: 0 },
    })),
  );
  console.log(`  도시 ${EVENTS.length} · 슬롯 ${SLOTS.length}`);

  // 기념품 재고 (도시 × 품목)
  await commitAll(
    EVENTS.flatMap((e) =>
      SOUVENIRS.map((s) => ({
        ref: db.collection('souvenirStock').doc(`${e.id}_${s.id}`),
        data: { eventId: e.id, itemId: s.id, total: 300, given: 0 },
      })),
    ),
  );

  // 스태프
  await commitAll(
    STAFF.map((s) => ({
      ref: db.collection('staff').doc(s.uid),
      data: { ...s, phoneEnc: encryptPhone('01000000000') },
    })),
  );

  // 점포 화이트리스트 (운영에서는 구글시트 Stores 탭에서 동기화)
  await commitAll(
    DEMO_STORES.map((s) => ({
      ref: db.collection('stores').doc(s.storeCode),
      data: {
        storeCode: s.storeCode,
        storeName: s.storeName,
        ownerName: s.ownerName,
        phoneEnc: encryptPhone(s.phone),
        phoneLast4Hash: hashLast4(s.phone.slice(-4), s.storeCode),
        region: s.region,
        fcTeam: s.fcTeam,
        active: true,
        syncedAt: Date.now(),
      },
    })),
  );
  console.log(`  점포 ${DEMO_STORES.length}`);

  // 응원 샘플 (워드클라우드가 비어 보이지 않게)
  await commitAll(CHEERS.map((c) => ({ ref: db.collection('cheers').doc(c.id), data: c })));

  // SMS 템플릿
  const templates = [
    { code: 'OTP', body: '[GS25 공유회] 인증번호 {{code}} (3분 내 입력)', type: 'SMS', isAd: false },
    { code: 'PRE_NOTIFY', body: '[GS25 공유회] {{message}}', type: 'LMS', isAd: true },
    { code: 'Q_TO_MD', body: '[공유회질의] {{section}} {{region}} 경영주: {{preview}}… 답변: {{link}}', type: 'LMS', isAd: false },
    { code: 'A_TO_OWNER', body: '[공유회] 답변이 도착했습니다: {{preview}} 전체보기 {{link}}', type: 'LMS', isAd: false },
    { code: 'RESERVE_OK', body: '[GS25 공유회] {{city}} {{date}} {{time}} 예약이 확정되었습니다. 장소: {{venue}}', type: 'LMS', isAd: false },
    { code: 'RESERVE_REMIND', body: '[GS25 공유회] 내일 {{city}} {{time}} 방문 예정입니다.', type: 'SMS', isAd: false },
    { code: 'LIVE_ALERT', body: '[GS25 공유회] 10분 뒤 {{city}} 라이브 투어가 시작됩니다.', type: 'SMS', isAd: false },
    { code: 'NUDGE', body: '[GS25 공유회] {{message}}', type: 'LMS', isAd: true },
    { code: 'COUPON', body: '[GS25 공유회] 완주를 축하드립니다! 쿠폰번호: {{code}}', type: 'MMS', isAd: true },
  ];
  await commitAll(templates.map((t) => ({ ref: db.collection('smsTemplates').doc(t.code), data: t })));

  // 본부 계정 (에뮬레이터 전용)
  for (const s of STAFF) {
    try {
      await auth.createUser({ uid: s.uid, email: s.email, password: 'dev-password-1234', displayName: s.name });
    } catch {
      /* 이미 존재 */
    }
    await auth.setCustomUserClaims(s.uid, { role: s.uid === 'md-hq' ? 'admin' : 'md' });
    await db.collection('users').doc(s.uid).set(
      { role: s.uid === 'md-hq' ? 'admin' : 'md', displayName: s.name },
      { merge: true },
    );
  }

  console.log('✅ 시드 완료');
}

main().catch((e) => {
  console.error('❌ 시드 실패', e);
  process.exit(1);
});
