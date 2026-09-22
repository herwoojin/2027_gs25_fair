import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { beforeUserCreated, beforeUserSignedIn } from 'firebase-functions/v2/identity';
import { z } from 'zod';
import {
  auth,
  db,
  FieldValue,
  CALLABLE_OPTS,
  HOT_CALLABLE_OPTS,
  REGION,
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SOLAPI_SENDER,
  PHONE_ENC_KEY,
  PHONE_HMAC_KEY,
  APPS_SCRIPT_URL,
  APPS_SCRIPT_KEY,
} from '../shared/admin';
import { isAllowedStaffEmail, maskEmail, sendStaffOtpEmail } from '../shared/appsScript';
import { decryptPhone, hashLast4, hashOtp, randomOtp, randomToken } from '../shared/crypto';
import { consume, lock } from '../shared/rateLimit';
import { audit } from '../shared/audit';
import { sendSms } from '../shared/solapi';
import { queueRow } from '../shared/sheets';
import { requireAuth } from '../shared/guards';

/** S-03 · 점포 존재 여부를 드러내지 않도록 모든 실패는 같은 문구를 쓴다. */
const SAME_ERROR = '입력하신 정보를 확인해 주세요.';

const requestOtpSchema = z.object({
  storeCode: z.string().trim().min(3).max(12),
  last4: z.string().trim().regex(/^\d{4}$/),
});

/**
 * T1-3 🔐 · requestOtp
 * rate limit(점포 10분 3회 / IP 10분 20회) → stores 조회 → HMAC 비교 → OTP 발송
 */
export const requestOtp = onCall(
  {
    ...HOT_CALLABLE_OPTS,
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY, PHONE_HMAC_KEY],
  },
  async (req) => {
    const parsed = requestOtpSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', SAME_ERROR);
    const { storeCode, last4 } = parsed.data;
    const ip = req.rawRequest?.ip ?? '0.0.0.0';
    const ua = req.rawRequest?.headers?.['user-agent']?.toString() ?? 'unknown';

    const byStore = await consume(`store:${storeCode}`, 3, 10 * 60_000);
    if (!byStore.ok) {
      await audit({ uid: storeCode, role: 'anonymous', action: 'otp.rate_limited', ip, ua });
      throw new HttpsError(
        'resource-exhausted',
        `요청이 많습니다. ${byStore.retryAfterSec}초 후 다시 시도해 주세요.`,
      );
    }
    const byIp = await consume(`ip:${ip}`, 20, 10 * 60_000);
    if (!byIp.ok) {
      await audit({ uid: 'anonymous', role: 'anonymous', action: 'otp.ip_rate_limited', ip, ua });
      throw new HttpsError('resource-exhausted', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    }

    const storeSnap = await db.collection('stores').doc(storeCode).get();
    const store = storeSnap.data() as
      | { active?: boolean; phoneLast4Hash?: string; phoneEnc?: string; region?: string; storeName?: string }
      | undefined;

    const valid =
      !!store &&
      store.active === true &&
      store.phoneLast4Hash === hashLast4(last4, storeCode, PHONE_HMAC_KEY.value());

    await audit({
      uid: storeCode,
      role: 'anonymous',
      action: valid ? 'otp.requested' : 'otp.failed',
      ip,
      ua,
    });

    if (!valid || !store?.phoneEnc) throw new HttpsError('invalid-argument', SAME_ERROR);

    const sessionId = randomToken(12);
    const code = randomOtp();
    await db
      .collection('otpSessions')
      .doc(sessionId)
      .set({
        uidTarget: `store_${storeCode}`,
        storeCode,
        codeHash: hashOtp(code, sessionId, PHONE_HMAC_KEY.value()),
        // TTL 정책: expiresAt 필드로 Firestore TTL 등록 (GUIDE 2.6)
        expiresAt: new Date(Date.now() + 3 * 60_000),
        attempts: 0,
        createdAt: FieldValue.serverTimestamp(),
      });

    const phone = decryptPhone(store.phoneEnc, PHONE_ENC_KEY.value());
    await sendSms({
      code: 'OTP',
      to: phone,
      text: `[GS25 공유회] 인증번호 ${code} (3분 내 입력)`,
      apiKey: SOLAPI_API_KEY.value(),
      apiSecret: SOLAPI_API_SECRET.value(),
      sender: SOLAPI_SENDER.value(),
    });

    return {
      sessionId,
      maskedPhone: phone.replace(/^(\d{3})\d{3,4}(\d{2})(\d{2})$/, '$1-****-**$3'),
      expiresInSec: 180,
    };
  },
);

const verifyOtpSchema = z.object({
  sessionId: z.string().min(4).max(64),
  code: z.string().trim().regex(/^\d{6}$/),
});

/**
 * T1-3 🔐 · verifyOtp
 * 5회 초과 시 30분 잠금 → 성공 시 customClaims 부여 + activeSessionKey 갱신 + customToken 발급
 */
export const verifyOtp = onCall(
  { ...HOT_CALLABLE_OPTS, secrets: [PHONE_HMAC_KEY] },
  async (req) => {
    const parsed = verifyOtpSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', SAME_ERROR);
    const { sessionId, code } = parsed.data;
    const ip = req.rawRequest?.ip ?? '0.0.0.0';
    const ua = req.rawRequest?.headers?.['user-agent']?.toString() ?? 'unknown';

    const ref = db.collection('otpSessions').doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('invalid-argument', SAME_ERROR);

    const s = snap.data() as {
      storeCode: string;
      codeHash: string;
      expiresAt: FirebaseFirestore.Timestamp;
      attempts: number;
    };

    if (s.expiresAt.toMillis() < Date.now()) {
      await ref.delete();
      throw new HttpsError('deadline-exceeded', '인증번호가 만료되었습니다. 다시 받아 주세요.');
    }

    if (s.codeHash !== hashOtp(code, sessionId, PHONE_HMAC_KEY.value())) {
      const attempts = s.attempts + 1;
      await audit({ uid: s.storeCode, role: 'anonymous', action: 'otp.wrong', ip, ua });
      if (attempts >= 5) {
        await lock(`store:${s.storeCode}`, 30 * 60_000);
        await ref.delete();
        await audit({ uid: s.storeCode, role: 'anonymous', action: 'otp.locked', ip, ua });
        throw new HttpsError(
          'resource-exhausted',
          '인증 시도 횟수를 초과했습니다. 30분 후 다시 시도해 주세요.',
        );
      }
      await ref.update({ attempts });
      throw new HttpsError('invalid-argument', `인증번호가 일치하지 않습니다. (${5 - attempts}회 남음)`);
    }

    await ref.delete();

    const storeSnap = await db.collection('stores').doc(s.storeCode).get();
    const store = storeSnap.data() as
      | { active?: boolean; storeName?: string; region?: string }
      | undefined;
    if (!store?.active) throw new HttpsError('invalid-argument', SAME_ERROR);

    const uid = `store_${s.storeCode}`;

    // Email/Password 프로바이더에 사전 생성된 계정을 확보 (TRD 3.1)
    try {
      await auth.getUser(uid);
    } catch {
      await auth.createUser({
        uid,
        email: `${s.storeCode}@expo.gs25.internal`,
        password: randomToken(24),
        displayName: store.storeName,
      });
    }

    await auth.setCustomUserClaims(uid, {
      role: 'owner',
      store: s.storeCode,
      region: store.region,
    });

    const sessionKey = randomToken(12);
    const userRef = db.collection('users').doc(uid);
    const existing = await userRef.get();

    await userRef.set(
      {
        role: 'owner',
        storeCode: s.storeCode,
        region: store.region,
        displayName: store.storeName,
        activeSessionKey: sessionKey, // 기존 세션 무효화
        firstLoginAt: existing.exists ? existing.data()?.firstLoginAt : FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // progress 문서 초기화 (Functions 만 쓰기 가능)
    await db
      .collection('progress')
      .doc(uid)
      .set(
        {
          storeCode: s.storeCode,
          region: store.region,
          products: {},
          stamps: {},
          stampCount: 0,
          quizFirstTryCorrect: 0,
          quizTotal: 0,
        },
        { merge: true },
      );

    await audit({ uid, role: 'owner', action: 'login.success', ip, ua });
    await queueRow('Logins', [
      new Date().toISOString(),
      s.storeCode,
      store.region ?? '',
      ua.slice(0, 40),
      ip.replace(/\.\d+$/, '.***'),
    ]);

    const customToken = await auth.createCustomToken(uid, { role: 'owner' });
    return {
      customToken,
      sessionKey,
      needsConsent: !existing.data()?.consentAt,
    };
  },
);

/**
 * T1-5 🔐 · 본부 로그인 1단계 — 회사 이메일로 6자리 인증번호를 메일 발송한다.
 *
 * 패스워드리스: 비밀번호 없이 **@gsretail.com 메일함 접근**이 유일한 인증 수단이다.
 * 보완 통제 — Staff 원장 화이트리스트 / 이메일·IP rate limit / 5회 실패 30분 잠금 /
 *            App Check / 감사 로그 / 세션 12시간 · 동시접속 1대.
 */
export const staffLogin = onCall(
  { ...CALLABLE_OPTS, secrets: [PHONE_HMAC_KEY, APPS_SCRIPT_URL, APPS_SCRIPT_KEY] },
  async (req) => {
    const parsed = z.object({ email: z.string().trim().max(120) }).safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', SAME_ERROR);
    const email = parsed.data.email.toLowerCase();
    const ip = req.rawRequest?.ip ?? '0.0.0.0';
    const ua = req.rawRequest?.headers?.['user-agent']?.toString() ?? 'unknown';

    // 도메인 규칙은 형식 문제이므로 명확히 안내한다(계정 존재 여부는 드러내지 않는다).
    if (!isAllowedStaffEmail(email)) {
      await audit({ uid: email, role: 'anonymous', action: 'staff.login.domain_rejected', ip, ua });
      throw new HttpsError('permission-denied', '@gsretail.com 이메일로만 로그인할 수 있습니다.');
    }

    const byEmail = await consume(`staffmail:${email}`, 5, 10 * 60_000);
    if (!byEmail.ok) {
      throw new HttpsError(
        'resource-exhausted',
        `요청이 많습니다. ${byEmail.retryAfterSec}초 후 다시 시도해 주세요.`,
      );
    }
    const byIp = await consume(`staffip:${ip}`, 20, 10 * 60_000);
    if (!byIp.ok) {
      throw new HttpsError('resource-exhausted', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    }

    // 본부 계정 원장 (Staff 시트 → staff 컬렉션 동기화 결과)
    const uid = `staff_${email.split('@')[0].replace(/[^a-z0-9]+/g, '_')}`;
    const staffSnap = await db.collection('staff').doc(uid).get();
    const staff = staffSnap.data() as
      | { name?: string; role?: 'admin' | 'operator' | 'md'; active?: boolean }
      | undefined;

    if (!staff || staff.active === false) {
      await audit({ uid: email, role: 'anonymous', action: 'staff.login.not_registered', ip, ua });
      throw new HttpsError('invalid-argument', SAME_ERROR);
    }

    const sessionId = randomToken(12);
    const code = randomOtp();
    await db
      .collection('otpSessions')
      .doc(sessionId)
      .set({
        uidTarget: uid,
        storeCode: null,
        email,
        role: staff.role ?? 'md',
        name: staff.name ?? email.split('@')[0],
        codeHash: hashOtp(code, sessionId, PHONE_HMAC_KEY.value()),
        expiresAt: new Date(Date.now() + 3 * 60_000),
        attempts: 0,
        createdAt: FieldValue.serverTimestamp(),
      });

    const sent = await sendStaffOtpEmail({
      url: APPS_SCRIPT_URL.value(),
      key: APPS_SCRIPT_KEY.value(),
      email,
      code,
      expiresInSec: 180,
      ip,
    });

    if (!sent.ok) {
      await db.collection('otpSessions').doc(sessionId).delete();
      await audit({ uid: email, role: 'anonymous', action: 'staff.otp.send_failed', ip, detail: sent.error });
      throw new HttpsError(
        sent.error === 'rate-limited' ? 'resource-exhausted' : 'unavailable',
        sent.error === 'rate-limited'
          ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
          : '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }

    await audit({ uid: email, role: 'anonymous', action: 'staff.otp.requested', ip, ua });
    return {
      sessionId,
      expiresInSec: 180,
      maskedEmail: sent.maskedEmail ?? maskEmail(email),
      delivery: 'email' as const,
    };
  },
);

/**
 * T1-5 🔐 · 본부 로그인 2단계 — 인증번호 확인 후 Custom Token 발급.
 * 경영주 verifyOtp 와 동일 규칙: 5회 실패 30분 잠금, 세션키 교체로 동시접속 1대 제한.
 */
export const staffVerify = onCall({ ...CALLABLE_OPTS, secrets: [PHONE_HMAC_KEY] }, async (req) => {
  const parsed = verifyOtpSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', SAME_ERROR);
  const { sessionId, code } = parsed.data;
  const ip = req.rawRequest?.ip ?? '0.0.0.0';
  const ua = req.rawRequest?.headers?.['user-agent']?.toString() ?? 'unknown';

  const ref = db.collection('otpSessions').doc(sessionId);
  const snap = await ref.get();
  const s = snap.data() as
    | {
        uidTarget: string;
        email?: string;
        role?: 'admin' | 'operator' | 'md';
        name?: string;
        codeHash: string;
        expiresAt: FirebaseFirestore.Timestamp;
        attempts: number;
      }
    | undefined;

  if (!s?.email) throw new HttpsError('invalid-argument', SAME_ERROR);

  if (s.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new HttpsError('deadline-exceeded', '인증번호가 만료되었습니다. 다시 받아 주세요.');
  }

  if (s.codeHash !== hashOtp(code, sessionId, PHONE_HMAC_KEY.value())) {
    const attempts = s.attempts + 1;
    await audit({ uid: s.email, role: 'anonymous', action: 'staff.otp.wrong', ip, ua });
    if (attempts >= 5) {
      await lock(`staffmail:${s.email}`, 30 * 60_000);
      await ref.delete();
      throw new HttpsError(
        'resource-exhausted',
        '인증 시도 횟수를 초과했습니다. 30분 후 다시 시도해 주세요.',
      );
    }
    await ref.update({ attempts });
    throw new HttpsError('invalid-argument', `인증번호가 일치하지 않습니다. (${5 - attempts}회 남음)`);
  }

  await ref.delete();

  const uid = s.uidTarget;
  const role = s.role ?? 'md';

  // Auth 계정 확보 — 비밀번호는 서버 난수로 두고 사용자에게 노출하지 않는다.
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, email: s.email, password: randomToken(24), displayName: s.name });
  }
  await auth.setCustomUserClaims(uid, { role, email: s.email, mfaVerifiedAt: Date.now() });

  const sessionKey = randomToken(12);
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        role,
        displayName: s.name ?? s.email.split('@')[0],
        email: s.email,
        activeSessionKey: sessionKey,
        lastLoginAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  await audit({ uid, role, action: 'staff.login.success', ip, ua });

  const customToken = await auth.createCustomToken(uid, { role });
  return { customToken, sessionKey, role, needsConsent: false };
});

/** 첫 로그인 동의 (개인정보 · 보안서약) */
export const acceptConsent = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireAuth(req);
  await db
    .collection('users')
    .doc(caller.uid)
    .set({ consentAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit({ uid: caller.uid, role: caller.role, action: 'consent.accepted', ip: caller.ip });
  return { ok: true };
});

/** T1-8 · 워터마크 제거·숨김 감지 기록 */
export const reportWatermarkTamper = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireAuth(req);
  const detail = z.object({ detail: z.string().max(200) }).safeParse(req.data);
  await audit({
    uid: caller.uid,
    role: caller.role,
    action: 'watermark.tamper',
    ip: caller.ip,
    ua: caller.ua,
    detail: detail.success ? detail.data.detail : 'unknown',
  });
  return { ok: true };
});

/**
 * S-01 · 공개 회원가입 차단.
 * 서버(Admin SDK)가 만든 계정 외에는 생성되지 않도록 막는다.
 */
export const blockPublicSignup = beforeUserCreated({ region: REGION }, (event) => {
  const email = event.data?.email ?? '';
  const isStoreAccount = /^\d+@expo\.gs25\.internal$/.test(email);
  const isStaff = email.toLowerCase().endsWith('@gsretail.com');
  if (!isStoreAccount && !isStaff) {
    throw new HttpsError('permission-denied', '이 서비스는 사전 등록된 계정만 이용할 수 있습니다.');
  }
  return {};
});

/** T1-5 🔐 · 본부 계정은 @gsretail.com 도메인만 로그인 허용 */
export const enforceStaffDomain = beforeUserSignedIn({ region: REGION }, (event) => {
  const email = event.data?.email ?? '';
  if (!email) return {};
  const isStoreAccount = /^\d+@expo\.gs25\.internal$/.test(email);
  if (!isStoreAccount && !email.toLowerCase().endsWith('@gsretail.com')) {
    throw new HttpsError('permission-denied', '@gsretail.com 계정만 로그인할 수 있습니다.');
  }
  return {};
});
