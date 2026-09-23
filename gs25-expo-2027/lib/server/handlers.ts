/**
 * 개발 모드 백엔드 — Cloud Functions callable 과 1:1 로 대응하는 핸들러.
 * 이름은 functions/src/** 의 export 이름과 같다(requestOtp, submitQuiz, reserveSlot …).
 *
 * 규칙:
 *  - 스탬프·완주·퀴즈 채점·SMS·AI 호출은 전부 여기(서버)에서만 한다.
 *  - 클라이언트가 보낸 시각은 절대 신뢰하지 않고 서버 시각만 쓴다.
 */
import { z } from 'zod';
import {
  sendSms,
  sendSmsBatch,
  isNightBlocked as nightBlocked,
  smsMode,
  smsBalance,
  smsStatus,
  normalizePhone,
} from './sms';
import type {
  Cheer,
  Coupon,
  Question,
  RegionCode,
  Reservation,
  Souvenir,
} from '@/types';
import { REGION_LABEL } from '@/types';
import { SECTIONS, SECTION_BY_ID } from '@/lib/seed/sections';
import { PRODUCTS, PRODUCT_BY_ID, QUIZZES, QUIZ_BY_ID, productsBySection } from '@/lib/seed/products';
import { EVENTS, EVENT_BY_ID, eventDates } from '@/lib/seed/events';
import {
  CHEERS,
  LIVE_STREAMS,
  MESSAGES,
  POPUP_NEWS,
  SOUVENIRS,
  STAFF,
} from '@/lib/seed/misc';
import { QUIZ_ANSWERS } from './quizAnswers';
import {
  allSlots,
  audit,
  bumpSlot,
  checkRate,
  db,
  decryptPhone,
  ensureProgress,
  getSlot,
  hashLast4,
  hashOtp,
  lockKey,
  logSms,
  newId,
  nextCompletionNo,
  persist,
  queueSheetRow,
} from './store';
import { HttpError, issueSession, logout, readSession, requireOwner, requireStaff } from './session';
import { enqueueMail, mailerMode, OTP_TTL_SEC, queueStats } from './mailQueue';
import { lookupStaff, staffDirectoryStatus, staffUidOf } from './staffDirectory';
import {
  ALLOWED_STAFF_DOMAIN,
  isAllowedStaffEmail,
  listStaffFromSheet,
  mailerConfigured,
  maskEmail,
  pingMailer,
  sendStaffOtpEmail,
} from './appsScript';
import { buildAskTop, buildRanking, buildStats, buildWordcloud } from './aggregate';
import { containsBanned, tokenize } from './tokenize';

export interface Ctx {
  token: string | null;
  ip: string;
  ua: string;
}

const IS_DEV = process.env.NODE_ENV !== 'production';
const IS_PROD = process.env.NODE_ENV === 'production';
/** 개발 모드에서만 화면에 OTP 를 보여준다. 운영에서는 절대 반환하지 않는다. */
const SHOW_DEV_OTP = IS_DEV && process.env.DEV_SHOW_OTP !== 'false';

// ── SMS ──────────────────────────────────────────────────────────────
// 실제 발송은 lib/server/sms.ts (SOLAPI REST) 가 담당한다.
// 키·발신번호가 없으면 자동으로 log 모드가 되어 smsLogs 에만 기록된다.

/** 본부 담당자 알림 수신 번호. 미설정이면 해당 알림은 건너뛴다. */
function opsNumber(): string {
  return (process.env.SMS_OPS_NUMBER ?? '').replace(/[^0-9]/g, '');
}


// ── 인증 ─────────────────────────────────────────────────────────────
const SAME_ERROR = '입력하신 정보를 확인해 주세요.';

const requestOtpSchema = z.object({
  storeCode: z.string().trim().min(3).max(12),
  last4: z.string().trim().regex(/^\d{4}$/),
});

export async function requestOtp(payload: unknown, ctx: Ctx) {
  const { storeCode, last4 } = requestOtpSchema.parse(payload);

  // TRD 3.4 · 점포코드 10분 3회 / IP 10분 20회
  const byStore = checkRate(`store:${storeCode}`, 3, 10 * 60000);
  if (!byStore.ok) {
    audit({ uid: storeCode, role: 'anonymous', action: 'otp.rate_limited', ip: ctx.ip, ua: ctx.ua });
    throw new HttpError(429, `요청이 많습니다. ${byStore.retryAfterSec}초 후 다시 시도해 주세요.`, 'rate-limited');
  }
  const byIp = checkRate(`ip:${ctx.ip}`, 20, 10 * 60000);
  if (!byIp.ok) {
    throw new HttpError(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 'rate-limited');
  }

  const store = db.stores[storeCode];
  const valid = !!store && store.active && store.phoneLast4Hash === hashLast4(last4, storeCode);

  audit({
    uid: storeCode,
    role: 'anonymous',
    action: valid ? 'otp.requested' : 'otp.failed',
    ip: ctx.ip,
    ua: ctx.ua,
  });

  // S-03 · 점포 존재 여부를 드러내지 않도록 실패는 항상 같은 문구.
  if (!valid) throw new HttpError(400, SAME_ERROR, 'invalid-credentials');

  const sessionId = newId('otp_');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.otpSessions[sessionId] = {
    id: sessionId,
    storeCode,
    codeHash: hashOtp(code, sessionId),
    expiresAt: Date.now() + 3 * 60000, // 유효 3분
    attempts: 0,
    createdAt: Date.now(),
  };
  persist();

  const phone = decryptPhone(store.phoneEnc);
  // 사용자가 방금 요청한 인증번호이므로 야간 차단 대상이 아니다.
  const sms = await sendSms('OTP', phone, `[GS25 공유회] 인증번호 ${code} (3분 내 입력)`, {
    urgent: true,
  });
  // 실제 발송 모드인데 실패했다면, 오지 않을 문자를 기다리게 두면 안 된다.
  if (smsMode() === 'live' && !sms.ok) {
    delete db.otpSessions[sessionId];
    persist();
    throw new HttpError(503, '인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.', 'sms-failed');
  }

  return {
    sessionId,
    maskedPhone: phone.replace(/^(\d{3})\d{3,4}(\d{2})(\d{2})$/, '$1-****-**$3'),
    expiresInSec: 180,
    ...(SHOW_DEV_OTP ? { devCode: code } : {}),
  };
}

const verifyOtpSchema = z.object({
  sessionId: z.string().min(4),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function verifyOtp(payload: unknown, ctx: Ctx) {
  const { sessionId, code } = verifyOtpSchema.parse(payload);
  const s = db.otpSessions[sessionId];
  if (!s) throw new HttpError(400, SAME_ERROR, 'invalid-session');
  if (s.expiresAt < Date.now()) {
    delete db.otpSessions[sessionId];
    persist();
    throw new HttpError(400, '인증번호가 만료되었습니다. 다시 받아 주세요.', 'otp-expired');
  }

  if (s.codeHash !== hashOtp(code, sessionId)) {
    s.attempts += 1;
    persist();
    audit({ uid: s.storeCode, role: 'anonymous', action: 'otp.wrong', ip: ctx.ip, ua: ctx.ua });
    if (s.attempts >= 5) {
      // 5회 실패 → 30분 잠금
      lockKey(`store:${s.storeCode}`, 30 * 60000);
      delete db.otpSessions[sessionId];
      persist();
      throw new HttpError(429, '인증 시도 횟수를 초과했습니다. 30분 후 다시 시도해 주세요.', 'otp-locked');
    }
    throw new HttpError(400, `인증번호가 일치하지 않습니다. (${5 - s.attempts}회 남음)`, 'otp-mismatch');
  }

  const store = db.stores[s.storeCode];
  delete db.otpSessions[sessionId];
  persist();
  if (!store || !store.active) throw new HttpError(400, SAME_ERROR, 'invalid-credentials');

  const uid = `store_${store.storeCode}`;
  const prev = db.users[uid];
  const session = issueSession({
    uid,
    role: 'owner',
    storeCode: store.storeCode,
    region: store.region,
    displayName: store.storeName,
  });
  ensureProgress(uid, store.storeCode, store.region);

  audit({ uid, role: 'owner', action: 'login.success', ip: ctx.ip, ua: ctx.ua });
  queueSheetRow('Logins', [
    new Date().toISOString(),
    store.storeCode,
    store.region,
    ctx.ua.slice(0, 40),
    ctx.ip.replace(/\.\d+$/, '.***'),
  ]);

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    needsConsent: !prev?.consentAt,
    user: db.users[uid],
  };
}

// ── 본부 로그인 (이메일 인증번호) ────────────────────────────────
// 요구사항: Google Apps Script 가 @gsretail.com 주소로만 6자리 난수를 메일 발송한다.
// 인증번호의 해시·만료·시도횟수는 우리 서버가 관리하고, Apps Script 는 메일 릴레이만 맡는다.

// 패스워드리스: 회사 이메일만 받고, 그 주소로 보낸 인증번호가 유일한 인증 수단이다.
const staffLoginSchema = z.object({
  email: z.string().trim().max(120),
});

interface StaffLike {
  uid: string;
  name: string;
  team?: string;
  email?: string;
  sectionIds: string[];
  backupFor: string[];
  smsEnabled?: boolean;
}

/** 로그인한 본부 계정 정보 — Staff 시트에서 온 값이 시드보다 우선한다. */
function staffOf(uid: string): StaffLike | undefined {
  return db.staffDirectory[uid] ?? STAFF.find((s) => s.uid === uid);
}

/** 시트에서 로그인한 계정 + 시드 계정을 합친 목록 (uid 기준 중복 제거) */
function allStaff(): StaffLike[] {
  const map = new Map<string, StaffLike>();
  for (const s of STAFF) map.set(s.uid, s);
  for (const s of Object.values(db.staffDirectory)) map.set(s.uid, s);
  return [...map.values()];
}

/** 시드 STAFF + 이메일 접두사로 역할을 추론한다(로컬 개발 전용 폴백). */
function resolveSeededStaff(email: string) {
  const seeded = STAFF.find((s) => s.email.toLowerCase() === email);
  const role: 'admin' | 'operator' | 'md' | null = email.startsWith('admin@')
    ? 'admin'
    : email.startsWith('op')
      ? 'operator'
      : seeded
        ? 'md'
        : null;
  if (!role) return null;
  return {
    uid: staffUidOf(email),
    email,
    name: seeded?.name ?? email.split('@')[0],
    team: seeded?.team ?? '',
    role,
    sectionIds: seeded?.sectionIds ?? [],
    backupFor: seeded?.backupFor ?? [],
  };
}

async function resolveStaff(email: string) {
  // pull 모드: Apps Script 트리거가 1분마다 보내 준 원장 캐시가 유일한 진실이다.
  // (이 모드에서는 서버가 Apps Script 를 호출할 수 없어 시트를 직접 못 읽는다)
  if (mailerMode() === 'pull') {
    const hit = lookupStaff(email);
    if (hit) return hit;
    // 로컬 개발 편의: 원장에 없으면 시드 계정으로 대체한다.
    // 운영에서는 절대 폴백하지 않는다 — 시트에 없는 계정은 로그인되면 안 된다.
    if (!IS_PROD) return resolveSeededStaff(email);
    return null;
  }

  // push 모드 1순위: Google Sheets `Staff` 탭을 직접 조회
  const sheet = await listStaffFromSheet();
  if (sheet) {
    const hit = sheet.find((s) => s.email === email);
    if (!hit || !hit.active) return null;
    return {
      uid: staffUidOf(email),
      email,
      name: hit.name || email.split('@')[0],
      team: hit.team ?? '',
      role: hit.role,
      sectionIds: hit.sectionIds ?? [],
      backupFor: hit.backupFor ?? [],
    };
  }

  // 2순위(로컬 개발 — 메일러 미연결): 시드 STAFF
  return resolveSeededStaff(email);
}

export async function staffLogin(payload: unknown, ctx: Ctx) {
  const parsed = staffLoginSchema.parse(payload);
  const email = parsed.email.toLowerCase();

  // 도메인 규칙은 형식 문제이므로 명확히 안내한다(계정 존재 여부는 드러내지 않는다).
  if (!isAllowedStaffEmail(email)) {
    audit({ uid: email, role: 'anonymous', action: 'staff.login.domain_rejected', ip: ctx.ip });
    throw new HttpError(403, '@gsretail.com 이메일로만 로그인할 수 있습니다.', 'domain-not-allowed');
  }

  const byEmail = checkRate(`staffmail:${email}`, 5, 10 * 60000);
  if (!byEmail.ok) {
    throw new HttpError(
      429,
      `요청이 많습니다. ${byEmail.retryAfterSec}초 후 다시 시도해 주세요.`,
      'rate-limited',
    );
  }
  const byIp = checkRate(`staffip:${ctx.ip}`, 20, 10 * 60000);
  if (!byIp.ok) throw new HttpError(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 'rate-limited');

  const staff = await resolveStaff(email);
  if (!staff) {
    // 원장 자체를 아직 못 받았다면 "정보 확인" 이 아니라 준비 중임을 알려야 한다.
    // (Apps Script 트리거가 아직 돌지 않은 배포 직후 상황)
    // 운영 전용: 트리거가 아직 원장을 보내지 않아 판정 근거 자체가 없는 상태.
    // (개발에서는 시드 계정이 근거가 되므로 여기 걸리지 않는다)
    if (IS_PROD && mailerMode() === 'pull' && staffDirectoryStatus().count === 0) {
      audit({ uid: email, role: 'anonymous', action: 'staff.login.directory_empty', ip: ctx.ip });
      throw new HttpError(
        503,
        '본부 계정 원장을 아직 불러오지 못했습니다. 1분 후 다시 시도해 주세요.',
        'directory-not-ready',
      );
    }
    audit({ uid: email, role: 'anonymous', action: 'staff.login.not_registered', ip: ctx.ip });
    throw new HttpError(400, SAME_ERROR, 'invalid-credentials');
  }

  const mode = mailerMode();
  const ttlSec = OTP_TTL_SEC[mode];

  const sessionId = newId('otp_');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.otpSessions[sessionId] = {
    id: sessionId,
    storeCode: `staff:${email}`,
    codeHash: hashOtp(code, sessionId),
    expiresAt: Date.now() + ttlSec * 1000,
    attempts: 0,
    createdAt: Date.now(),
    staff,
  };
  persist();

  // pull 모드: 큐에 넣으면 Apps Script 트리거(1분)가 가져가 발송한다.
  // push 모드: 우리가 Apps Script 웹앱을 직접 호출한다.
  const sent =
    mode === 'pull'
      ? (enqueueMail({ email, code, expiresInSec: ttlSec }),
        { ok: true, maskedEmail: maskEmail(email), queued: true } as const)
      : await sendStaffOtpEmail({ email, code, expiresInSec: ttlSec, ip: ctx.ip });

  // 메일러가 설정돼 있는데 발송이 실패한 경우.
  // 로컬 개발에서는 인증번호를 화면에 띄워 계속 작업할 수 있게 하고(운영은 그대로 실패),
  // 설정이 잘못됐다는 사실은 응답과 감사 로그에 남긴다.
  const mailBroken = !sent.ok && ('error' in sent ? sent.error !== 'not-configured' : true);
  if (mailBroken) {
    audit({
      uid: email,
      role: 'anonymous',
      action: 'staff.otp.send_failed',
      ip: ctx.ip,
      detail: sent.error,
    });
  }
  if (mailBroken && !(IS_DEV && SHOW_DEV_OTP)) {
    delete db.otpSessions[sessionId];
    persist();
    const message =
      sent.error === 'not-registered' || sent.error === 'inactive' || sent.error === 'domain-not-allowed'
        ? SAME_ERROR
        : sent.error === 'rate-limited'
          ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
          : '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.';
    throw new HttpError(sent.error === 'rate-limited' ? 429 : 502, message, 'mail-failed');
  }

  logSms(
    'STAFF_OTP_MAIL',
    '00000000000',
    `본부 인증메일 → ${maskEmail(email)}`,
    sent.ok ? 'sent' : mailBroken ? `failed(${sent.error})` : 'dev-stub(메일러 미연결)',
  );
  audit({ uid: email, role: 'anonymous', action: 'staff.otp.requested', ip: ctx.ip, ua: ctx.ua });

  const queued = 'queued' in sent && sent.queued === true;

  return {
    sessionId,
    expiresInSec: ttlSec,
    maskedEmail: sent.maskedEmail ?? maskEmail(email),
    // queued: Apps Script 트리거가 가져갈 때까지 최대 1분 대기
    delivery: queued ? ('queued' as const) : sent.ok ? ('email' as const) : ('dev' as const),
    ...(!sent.ok && SHOW_DEV_OTP ? { devCode: code } : {}),
    ...(mailBroken && 'error' in sent ? { mailError: sent.error } : {}),
    ...('remainingQuota' in sent && sent.remainingQuota !== undefined
      ? { remainingQuota: sent.remainingQuota }
      : {}),
  };
}

export async function staffVerify(payload: unknown, ctx: Ctx) {
  const { sessionId, code } = verifyOtpSchema.parse(payload);
  const s = db.otpSessions[sessionId];
  if (!s?.staff) throw new HttpError(400, SAME_ERROR, 'invalid-session');

  if (s.expiresAt < Date.now()) {
    delete db.otpSessions[sessionId];
    persist();
    throw new HttpError(400, '인증번호가 만료되었습니다. 다시 받아 주세요.', 'otp-expired');
  }

  if (s.codeHash !== hashOtp(code, sessionId)) {
    s.attempts += 1;
    persist();
    audit({ uid: s.staff.email, role: 'anonymous', action: 'staff.otp.wrong', ip: ctx.ip });
    if (s.attempts >= 5) {
      lockKey(`staffmail:${s.staff.email}`, 30 * 60000);
      delete db.otpSessions[sessionId];
      persist();
      throw new HttpError(429, '인증 시도 횟수를 초과했습니다. 30분 후 다시 시도해 주세요.', 'otp-locked');
    }
    throw new HttpError(400, `인증번호가 일치하지 않습니다. (${5 - s.attempts}회 남음)`, 'otp-mismatch');
  }

  const staff = s.staff;
  delete db.otpSessions[sessionId];

  // ERD staff/{uid} 대응 — 질의 인박스의 담당 섹션 필터가 참조한다.
  db.staffDirectory[staff.uid] = staff;
  persist();

  const session = issueSession({ uid: staff.uid, role: staff.role, displayName: staff.name });
  audit({ uid: staff.uid, role: staff.role, action: 'staff.login.success', ip: ctx.ip, ua: ctx.ua });

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: db.users[staff.uid],
    needsConsent: false,
  };
}

/** 관리자 화면에서 메일러 연결 상태를 점검한다. */
export async function checkMailer(_payload: unknown, ctx: Ctx) {
  requireStaff(readSession(ctx.token), ['admin']);
  const mode = mailerMode();

  // pull 모드는 우리가 Apps Script 를 호출하지 않으므로 ping/원장조회를 하지 않는다.
  // 대신 트리거가 최근에 다녀갔는지로 연결 상태를 판단한다.
  if (mode === 'pull') {
    const q = queueStats();
    const alive = q.lastPullAgoSec !== null && q.lastPullAgoSec < 180;
    return {
      mode,
      configured: true,
      ping: {
        ok: alive,
        error: alive
          ? undefined
          : q.lastPullAt
            ? `Apps Script 트리거가 ${q.lastPullAgoSec}초째 오지 않았습니다.`
            : 'Apps Script 트리거가 아직 한 번도 오지 않았습니다. installPullTrigger() 를 실행했는지 확인하세요.',
      },
      staffCount: staffDirectoryStatus().count,
      allowedDomain: ALLOWED_STAFF_DOMAIN,
      queue: q,
      directory: staffDirectoryStatus(),
    };
  }

  const ping = await pingMailer();
  const staff = await listStaffFromSheet(true);
  return {
    mode: mailerMode(),
    configured: mailerConfigured(),
    ping,
    staffCount: staff?.length ?? null,
    allowedDomain: ALLOWED_STAFF_DOMAIN,
    queue: queueStats(),
  };
}

export async function acceptConsent(_payload: unknown, ctx: Ctx) {
  const caller = readSession(ctx.token);
  db.users[caller.uid].consentAt = Date.now();
  persist();
  audit({ uid: caller.uid, role: caller.role, action: 'consent.accepted', ip: ctx.ip });
  return { ok: true };
}

export async function me(_payload: unknown, ctx: Ctx) {
  const caller = readSession(ctx.token);
  const user = db.users[caller.uid];
  const progress = caller.role === 'owner' ? ensureProgress(caller.uid, caller.storeCode!, caller.region!) : null;
  return { user, progress, sessionKey: caller.sessionKey, config: db.config };
}

export async function signOut(_payload: unknown, ctx: Ctx) {
  logout(ctx.token);
  return { ok: true };
}

export async function setFontScale(payload: unknown, ctx: Ctx) {
  const caller = readSession(ctx.token);
  const { scale } = z.object({ scale: z.number().min(0.9).max(1.4) }).parse(payload);
  db.users[caller.uid].fontScale = scale;
  persist();
  return { ok: true };
}

/** T1-8 · 워터마크 제거 감지 기록 */
export async function reportWatermarkTamper(payload: unknown, ctx: Ctx) {
  const caller = readSession(ctx.token);
  const { detail } = z.object({ detail: z.string().max(200) }).parse(payload);
  audit({
    uid: caller.uid,
    role: caller.role,
    action: 'watermark.tamper',
    ip: ctx.ip,
    ua: ctx.ua,
    detail,
  });
  return { ok: true };
}

// ── 콘텐츠 (로그인 후에만 내려감 — TRD 5장) ─────────────────────────
export async function getSectionContent(payload: unknown, ctx: Ctx) {
  readSession(ctx.token);
  const { sectionId } = z.object({ sectionId: z.string() }).parse(payload);
  const section = SECTION_BY_ID[sectionId];
  if (!section) throw new HttpError(404, '존재하지 않는 섹션입니다.', 'not-found');
  const products = productsBySection(sectionId);
  return {
    section,
    products,
    // quizzes 는 보기만 — answerIndex 는 절대 내려가지 않는다.
    quizzes: products.map((p) => QUIZ_BY_ID[p.id]).filter(Boolean),
    messages: MESSAGES.filter(
      (m) => !m.visibleUntil || m.visibleUntil > Date.now(),
    ),
  };
}

export async function getProductContent(payload: unknown, ctx: Ctx) {
  readSession(ctx.token);
  const { productId } = z.object({ productId: z.string() }).parse(payload);
  const product = PRODUCT_BY_ID[productId];
  if (!product) throw new HttpError(404, '존재하지 않는 상품입니다.', 'not-found');
  const siblings = productsBySection(product.sectionId);
  const idx = siblings.findIndex((p) => p.id === productId);
  return {
    product,
    quiz: QUIZ_BY_ID[productId] ?? null,
    section: SECTION_BY_ID[product.sectionId],
    prevId: idx > 0 ? siblings[idx - 1].id : null,
    nextId: idx < siblings.length - 1 ? siblings[idx + 1].id : null,
    message: MESSAGES.find((m) => m.id === productId) ?? null,
  };
}

export async function getExhibitIndex(_payload: unknown, ctx: Ctx) {
  readSession(ctx.token);
  return {
    sections: SECTIONS,
    productCounts: Object.fromEntries(
      SECTIONS.map((s) => [s.id, productsBySection(s.id).length]),
    ),
  };
}

// ── 스탬프 판정 (T4-2) ───────────────────────────────────────────────
function recomputeProduct(uid: string, productId: string) {
  const p = db.progress[uid];
  const rec = p.products[productId];
  if (!rec?.enterAt || !rec.consumedAt || rec.doneAt) return;

  const product = PRODUCT_BY_ID[productId];
  const section = SECTION_BY_ID[product.sectionId];
  const hasQuiz = !!QUIZ_BY_ID[productId];

  const dwellOk = Date.now() - rec.enterAt >= section.minDwellSec * 1000;
  const quizOk = !hasQuiz || rec.quizCorrect === true;
  if (dwellOk && quizOk) {
    rec.doneAt = Date.now();
    persist();
    grantStampIfComplete(uid, product.sectionId);
  }
}

function grantStampIfComplete(uid: string, sectionId: string) {
  const p = db.progress[uid];
  const section = SECTION_BY_ID[sectionId];
  if (!section || p.stamps[sectionId]) return;
  const all = section.requiredProductIds.every((pid) => p.products[pid]?.doneAt);
  if (!all || section.requiredProductIds.length === 0) return;

  p.stamps[sectionId] = Date.now();
  p.stampCount = Object.keys(p.stamps).length;
  persist();
  queueSheetRow('Stamps', [new Date().toISOString(), p.storeCode, sectionId, p.stampCount]);
  audit({ uid, role: 'owner', action: 'stamp.granted', target: sectionId });
}

const progressSchema = z.object({
  productId: z.string(),
  event: z.enum(['enter', 'consumed']),
});

export async function markProductProgress(payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const { productId, event } = progressSchema.parse(payload);
  const product = PRODUCT_BY_ID[productId];
  if (!product) throw new HttpError(404, '존재하지 않는 상품입니다.', 'not-found');

  const p = ensureProgress(caller.uid, caller.storeCode, caller.region);
  const rec = (p.products[productId] ??= {});

  if (event === 'enter') {
    // 서버 시각만 신뢰한다.
    if (!rec.enterAt) rec.enterAt = Date.now();
  } else {
    if (!rec.enterAt) {
      // enter 없이 consumed 를 호출하면 거부 (개발자도구 조작 방지)
      throw new HttpError(400, '상품 상세에 먼저 입장해야 합니다.', 'invalid-sequence');
    }
    rec.consumedAt ??= Date.now();
  }
  persist();
  recomputeProduct(caller.uid, productId);

  return {
    progress: db.progress[caller.uid],
    dwellRemainSec: Math.max(
      0,
      Math.ceil(
        (SECTION_BY_ID[product.sectionId].minDwellSec * 1000 - (Date.now() - (rec.enterAt ?? Date.now()))) /
          1000,
      ),
    ),
  };
}

const quizSchema = z.object({ productId: z.string(), choice: z.number().int().min(0).max(9) });

export async function submitQuiz(payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const { productId, choice } = quizSchema.parse(payload);

  const quiz = QUIZ_BY_ID[productId];
  const answer = QUIZ_ANSWERS[productId];
  if (!quiz || !answer) throw new HttpError(404, '퀴즈가 없습니다.', 'not-found');
  if (choice >= quiz.options.length) throw new HttpError(400, '잘못된 선택입니다.', 'invalid-choice');

  const p = ensureProgress(caller.uid, caller.storeCode, caller.region);
  const rec = p.products[productId];
  if (!rec?.enterAt) {
    throw new HttpError(400, '상품 상세에 먼저 입장해야 합니다.', 'invalid-sequence');
  }

  const correct = choice === answer.answerIndex;
  const isFirstTry = (rec.attempts ?? 0) === 0;
  rec.attempts = (rec.attempts ?? 0) + 1;

  if (isFirstTry) {
    rec.quizFirstTryCorrect = correct;
    p.quizTotal += 1;
    if (correct) p.quizFirstTryCorrect += 1;
  }
  if (correct) rec.quizCorrect = true;
  persist();

  const before = p.stampCount;
  recomputeProduct(caller.uid, productId);
  const after = db.progress[caller.uid].stampCount;

  return {
    correct,
    // 정답 인덱스는 제출 후에만, 그것도 정답일 때만 의미가 있으므로 해설만 돌려준다.
    explanation: answer.explanation,
    firstTry: isFirstTry,
    attempts: rec.attempts,
    progress: db.progress[caller.uid],
    stampGranted: after > before ? SECTION_BY_ID[PRODUCT_BY_ID[productId].sectionId] : null,
  };
}

const surveySchema = z.object({
  q1: z.number().int().min(1).max(5),
  q2: z.number().int().min(1).max(5),
  q3: z.number().int().min(1).max(5),
  q4: z.number().int().min(1).max(5),
  q5: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

/** T4-4 · 퇴점: 설문 제출 → 11번째 스탬프 → 완주 처리 */
export async function submitSurvey(payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const body = surveySchema.parse(payload);
  const p = ensureProgress(caller.uid, caller.storeCode, caller.region);

  const needed = SECTIONS.filter((s) => s.slug !== 'exit');
  const missing = needed.filter((s) => !p.stamps[s.id]);
  if (missing.length > 0) {
    throw new HttpError(
      400,
      `아직 완료하지 않은 섹션이 ${missing.length}곳 있습니다: ${missing.map((m) => m.title).join(', ')}`,
      'incomplete',
      { missing: missing.map((m) => m.id) },
    );
  }

  db.surveys[caller.uid] = { uid: caller.uid, ...body, createdAt: Date.now() };
  p.surveyDoneAt = Date.now();
  if (!p.stamps['exit']) {
    p.stamps['exit'] = Date.now();
    p.stampCount = Object.keys(p.stamps).length;
  }
  if (!p.completedAt) {
    p.completedAt = Date.now();
    p.completionNo = nextCompletionNo();
    queueSheetRow('Completions', [
      new Date().toISOString(),
      p.storeCode,
      p.region,
      p.completionNo,
      p.quizTotal ? Math.round((p.quizFirstTryCorrect / p.quizTotal) * 100) : 0,
    ]);
    audit({ uid: caller.uid, role: 'owner', action: 'completion', target: String(p.completionNo) });
  }
  persist();

  return {
    progress: p,
    completionNo: p.completionNo,
    certificate: {
      storeName: db.stores[p.storeCode]?.storeName ?? p.storeCode,
      storeCode: p.storeCode,
      completionNo: p.completionNo!,
      completedAt: p.completedAt!,
      understanding: p.quizTotal ? Math.round((p.quizFirstTryCorrect / p.quizTotal) * 100) : 0,
    },
  };
}

// ── 질의응답 (T5-1 ~ T5-4) ──────────────────────────────────────────
const askSchema = z.object({
  channel: z.enum(['section', 'hq']),
  sectionId: z.string().optional(),
  productId: z.string().optional(),
  text: z.string().trim().min(2).max(500),
});

export async function createQuestion(payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const body = askSchema.parse(payload);
  const rate = checkRate(`ask:${caller.uid}`, 10, 10 * 60000);
  if (!rate.ok) throw new HttpError(429, '질문이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 'rate-limited');

  const banned = containsBanned(body.text);
  if (banned) throw new HttpError(400, '사용할 수 없는 표현이 포함되어 있습니다.', 'banned-word');

  const section = body.sectionId ? SECTION_BY_ID[body.sectionId] : null;
  const q: Question = {
    id: newId('q_'),
    channel: body.channel,
    sectionId: body.sectionId,
    productId: body.productId,
    uid: caller.uid,
    storeCode: caller.storeCode,
    region: caller.region,
    authorLabel: `${REGION_LABEL[caller.region]}권 경영주`,
    text: body.text,
    status: 'open',
    // onQuestionCreate 트리거와 동일: sections.mdIds → assignedMdIds
    assignedMdIds: section ? section.mdIds : ['md-hq'],
    isPublic: body.channel === 'hq',
    likeCount: 0,
    createdAt: Date.now(),
  };
  db.questions.unshift(q);
  persist();

  // 담당 MD 문자 (Q_TO_MD)
  for (const mdId of q.assignedMdIds) {
    const staff = STAFF.find((s) => s.uid === mdId);
    if (!staff?.smsEnabled) continue;
    await sendSms(
      'Q_TO_MD',
      opsNumber(),
      `[공유회질의] ${section?.title ?? '본사'} ${REGION_LABEL[caller.region]} 경영주: ${body.text.slice(0, 40)}… 답변: /admin/questions?q=${q.id}`,
    );
  }
  queueSheetRow('Questions', [
    new Date().toISOString(),
    caller.storeCode,
    body.sectionId ?? 'hq',
    body.text,
    '',
    '',
    '',
  ]);

  return { question: q };
}

export async function listQuestions(payload: unknown, ctx: Ctx) {
  const caller = readSession(ctx.token);
  const { scope, sort, sectionId, limit } = z
    .object({
      scope: z.enum(['public', 'mine', 'inbox']).default('public'),
      sort: z.enum(['latest', 'likes']).default('latest'),
      sectionId: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    })
    .parse(payload ?? {});

  let rows = [...db.questions];
  if (scope === 'mine') {
    rows = rows.filter((q) => q.uid === caller.uid);
  } else if (scope === 'inbox') {
    requireStaff(caller);
    if (caller.role === 'md') {
      const staff = staffOf(caller.uid);
      const mine = new Set([...(staff?.sectionIds ?? []), ...(staff?.backupFor ?? [])]);
      rows = rows.filter((q) => (q.sectionId ? mine.has(q.sectionId) : mine.has('welcome')));
    }
  } else {
    rows = rows.filter((q) => q.isPublic && q.status !== 'hidden');
  }
  if (sectionId) rows = rows.filter((q) => q.sectionId === sectionId);

  if (scope === 'inbox') {
    rows.sort((a, b) =>
      a.status === b.status ? a.createdAt - b.createdAt : a.status === 'open' ? -1 : 1,
    );
  } else if (sort === 'likes') {
    rows.sort((a, b) => b.likeCount - a.likeCount || b.createdAt - a.createdAt);
  } else {
    rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  const likedByMe = new Set(
    Object.entries(db.questionLikes)
      .filter(([, uids]) => uids.includes(caller.uid))
      .map(([qid]) => qid),
  );

  return {
    questions: rows.slice(0, limit).map((q) => ({ ...q, likedByMe: likedByMe.has(q.id) })),
    total: rows.length,
  };
}

export async function likeQuestion(payload: unknown, ctx: Ctx) {
  const caller = readSession(ctx.token);
  const { questionId } = z.object({ questionId: z.string() }).parse(payload);
  const q = db.questions.find((x) => x.id === questionId);
  if (!q) throw new HttpError(404, '질문을 찾을 수 없습니다.', 'not-found');
  const likes = (db.questionLikes[questionId] ??= []);
  const i = likes.indexOf(caller.uid);
  if (i >= 0) {
    likes.splice(i, 1);
    q.likeCount = Math.max(0, q.likeCount - 1);
  } else {
    likes.push(caller.uid);
    q.likeCount += 1;
  }
  persist();
  return { likeCount: q.likeCount, liked: i < 0 };
}

export async function answerQuestion(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token));
  const { questionId, text, makePublic } = z
    .object({
      questionId: z.string(),
      text: z.string().trim().min(2).max(1000),
      makePublic: z.boolean().default(false),
    })
    .parse(payload);

  const q = db.questions.find((x) => x.id === questionId);
  if (!q) throw new HttpError(404, '질문을 찾을 수 없습니다.', 'not-found');

  const staff = staffOf(caller.uid);
  q.answer = {
    text,
    byUid: caller.uid,
    byName: staff ? `${staff.name} MD` : db.users[caller.uid]?.displayName ?? '본부',
    at: Date.now(),
  };
  q.status = 'answered';
  if (makePublic) q.isPublic = true;
  persist();

  // A_TO_OWNER 문자
  const store = db.stores[q.storeCode];
  if (store) {
    await sendSms(
      'A_TO_OWNER',
      decryptPhone(store.phoneEnc),
      `[공유회] 답변이 도착했습니다: ${text.slice(0, 60)}… 전체보기 /my`,
    );
  }
  audit({ uid: caller.uid, role: caller.role, action: 'question.answered', target: questionId });
  queueSheetRow('Questions', [
    new Date().toISOString(),
    q.storeCode,
    q.sectionId ?? 'hq',
    q.text,
    new Date().toISOString(),
    q.answer.byName,
    text,
  ]);
  return { question: q };
}

export async function moderateQuestion(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['operator', 'admin']);
  const { questionId, action } = z
    .object({ questionId: z.string(), action: z.enum(['hide', 'show', 'publish', 'unpublish']) })
    .parse(payload);
  const q = db.questions.find((x) => x.id === questionId);
  if (!q) throw new HttpError(404, '질문을 찾을 수 없습니다.', 'not-found');
  if (action === 'hide') q.status = 'hidden';
  if (action === 'show') q.status = q.answer ? 'answered' : 'open';
  if (action === 'publish') q.isPublic = true;
  if (action === 'unpublish') q.isPublic = false;
  persist();
  audit({ uid: caller.uid, role: caller.role, action: `question.${action}`, target: questionId });
  return { question: q };
}

/** T5-3 · 2시간 미응답 에스컬레이션 (운영에서는 스케줄 함수) */
export async function escalateQuestions(_payload: unknown, ctx: Ctx) {
  requireStaff(readSession(ctx.token), ['admin']);
  const cutoff = Date.now() - 2 * 3600 * 1000;
  let n = 0;
  for (const q of db.questions) {
    if (q.status !== 'open' || q.escalatedAt || q.createdAt > cutoff) continue;
    q.escalatedAt = Date.now();
    n += 1;
    const backups = allStaff().filter((s) => q.sectionId && s.backupFor.includes(q.sectionId));
    for (const b of backups) {
      await sendSms('Q_ESCALATE', opsNumber(), `[공유회 미응답] ${b.name}님, 2시간 경과 질문이 있습니다.`);
    }
  }
  persist();
  return { escalated: n };
}

// ── 응원 (T5-6 / T5-7) ───────────────────────────────────────────────
export async function createCheer(payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const { text } = z.object({ text: z.string().trim().min(2).max(50) }).parse(payload);
  const rate = checkRate(`cheer:${caller.uid}`, 5, 10 * 60000);
  if (!rate.ok) throw new HttpError(429, '잠시 후 다시 작성해 주세요.', 'rate-limited');

  const banned = containsBanned(text);
  const cheer: Cheer = {
    id: newId('ch_'),
    uid: caller.uid,
    region: caller.region,
    authorLabel: `${REGION_LABEL[caller.region]} 경영주`,
    text,
    // 금칙어가 걸리면 운영자 검수 대기로 보낸다.
    status: banned ? 'pending' : 'visible',
    tokens: tokenize(text),
    createdAt: Date.now(),
  };
  db.cheers.unshift(cheer);
  persist();
  queueSheetRow('Cheers', [new Date().toISOString(), caller.region, text, cheer.status]);
  return { cheer, held: !!banned };
}

export async function listCheers(payload: unknown, ctx: Ctx) {
  readSession(ctx.token);
  const { region, word, limit } = z
    .object({
      region: z.string().default('ALL'),
      word: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(40),
    })
    .parse(payload ?? {});

  let rows = db.cheers.filter((c) => c.status === 'visible');
  if (region !== 'ALL') rows = rows.filter((c) => c.region === region);
  if (word) rows = rows.filter((c) => c.text.includes(word) || c.tokens.includes(word));
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return { cheers: rows.slice(0, limit), total: rows.length };
}

export async function moderateCheer(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['operator', 'admin']);
  const { cheerId, action } = z
    .object({ cheerId: z.string(), action: z.enum(['approve', 'hide']) })
    .parse(payload);
  const c = db.cheers.find((x) => x.id === cheerId);
  if (!c) throw new HttpError(404, '응원을 찾을 수 없습니다.', 'not-found');
  c.status = action === 'approve' ? 'visible' : 'hidden';
  persist();
  audit({ uid: caller.uid, role: caller.role, action: `cheer.${action}`, target: cheerId });
  return { cheer: c };
}

// ── 집계 ─────────────────────────────────────────────────────────────
export async function getAggregates(payload: unknown, ctx: Ctx) {
  readSession(ctx.token);
  const { kind, region } = z
    .object({
      kind: z.enum(['stats', 'ranking', 'wordcloud', 'askTop']),
      region: z.string().default('ALL'),
    })
    .parse(payload ?? { kind: 'stats' });

  if (kind === 'stats') return { stats: buildStats() };
  if (kind === 'ranking') return { ranking: buildRanking() };
  if (kind === 'askTop') return { askTop: buildAskTop() };
  return {
    wordcloud: buildWordcloud(region === 'ALL' ? 'ALL' : (region as RegionCode)),
    regionCounts: Object.fromEntries(
      db.cheers
        .filter((c) => c.status === 'visible')
        .reduce((m, c) => m.set(c.region, (m.get(c.region) ?? 0) + 1), new Map<string, number>()),
    ),
  };
}

// ── AI 챗봇 (T5-5) ───────────────────────────────────────────────────
const AI_DAILY_LIMIT = 50;

function retrievalAnswer(sectionId: string, message: string): { text: string; grounded: boolean } {
  const products = productsBySection(sectionId);
  const q = message.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ');
  // 같은 단어가 tokenize 결과와 원문 분할 양쪽에 들어가 점수가 두 번 더해지지 않도록 중복을 제거한다.
  const terms = [...new Set([...tokenize(q), ...q.split(/\s+/).filter((w) => w.length >= 2)])];

  let best: { p: (typeof products)[number]; score: number } | null = null;
  for (const p of products) {
    const hay = `${p.name} ${p.category} ${p.aiContext} ${p.summary3.join(' ')}`;
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += t.length;
    if (!best || score > best.score) best = { p, score };
  }
  if (!best || best.score < 4) {
    return {
      grounded: false,
      text: '등록된 자료 안에서는 확인이 어려운 내용입니다. 추측해서 답변드리지 않겠습니다. 아래 [MD에게 질문하기] 버튼으로 담당 MD에게 직접 여쭤보시면 문자로 답변을 받으실 수 있습니다.',
    };
  }
  const p = best.p;
  return {
    grounded: true,
    text: `${p.name} 기준으로 말씀드리면,\n\n${p.summary3.map((s) => `· ${s}`).join('\n')}\n\n${p.aiContext}\n\n더 자세한 내용은 상품 상세의 설명 원고에서 확인하실 수 있습니다.`,
  };
}

export async function askSectionBot(payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const { sectionId, message } = z
    .object({
      sectionId: z.string(),
      productId: z.string().optional(),
      message: z.string().trim().min(1).max(300),
      history: z.array(z.object({ role: z.enum(['user', 'bot']), text: z.string() })).max(10).optional(),
    })
    .parse(payload);

  const dayKey = `${caller.uid}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const used = db.aiUsage[dayKey] ?? 0;
  if (used >= AI_DAILY_LIMIT) {
    throw new HttpError(429, `하루 질문 한도(${AI_DAILY_LIMIT}회)를 모두 사용하셨습니다.`, 'quota-exceeded');
  }

  // 금칙 처리 — 개인정보·타사 비교 요청
  const forbidden = ['개인정보', '전화번호', '주민번호', 'cu ', '세븐일레븐', '이마트24', '경쟁사 매출'];
  const low = message.toLowerCase();
  if (forbidden.some((f) => low.includes(f.trim()))) {
    return {
      text: '타사 비교나 개인정보에 대해서는 답변드릴 수 없습니다. 상품·운영 관련 질문을 해주시면 등록된 자료 범위 안에서 안내해 드리겠습니다.',
      grounded: false,
      remaining: AI_DAILY_LIMIT - used,
    };
  }

  const answer = retrievalAnswer(sectionId, message);
  db.aiUsage[dayKey] = used + 1;
  const log = (db.chatLogs[caller.uid] ??= []);
  log.push({ role: 'user', text: message, sectionId, createdAt: Date.now() });
  log.push({ role: 'bot', text: answer.text, sectionId, createdAt: Date.now() });
  if (log.length > 200) log.splice(0, log.length - 200);
  persist();

  return { ...answer, remaining: AI_DAILY_LIMIT - used - 1 };
}

export async function getSuggestedQuestions(payload: unknown, ctx: Ctx) {
  readSession(ctx.token);
  const { sectionId } = z.object({ sectionId: z.string() }).parse(payload);
  const products = productsBySection(sectionId).slice(0, 3);
  return {
    chips: products.map((p) => `${p.name}은(는) 무엇이 달라지나요?`),
  };
}

// ── 오프라인 예약 (T7-1 ~ T7-3) ─────────────────────────────────────
export async function getOfflineSchedule(_payload: unknown, _ctx: Ctx) {
  // 일정·장소는 공개 정보이므로 비로그인도 볼 수 있다(상품 정보 없음).
  return { events: EVENTS, slots: allSlots() };
}

const reserveSchema = z.object({
  eventId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotNo: z.number().int().min(1).max(3),
  partySize: z.number().int().min(1).max(2).default(1),
  engravingText: z.string().trim().max(12).default(''),
});

function reservationDeadlinePassed(date: string): boolean {
  // 전일 18시 마감 (PRD F-11)
  const deadline = new Date(`${date}T18:00:00+09:00`).getTime() - 86400000;
  return Date.now() > deadline;
}

export async function reserveSlot(payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const body = reserveSchema.parse(payload);
  const ev = EVENT_BY_ID[body.eventId];
  if (!ev) throw new HttpError(404, '존재하지 않는 행사입니다.', 'not-found');
  if (!eventDates(body.eventId).includes(body.date)) {
    throw new HttpError(400, '해당 도시의 개최일이 아닙니다.', 'invalid-date');
  }
  if (reservationDeadlinePassed(body.date)) {
    throw new HttpError(400, '예약은 전일 18시에 마감됩니다.', 'deadline-passed');
  }

  const slotId = `${body.eventId}_${body.date.replace(/-/g, '')}_${body.slotNo}`;
  const slot = getSlot(slotId);
  if (!slot) throw new HttpError(404, '존재하지 않는 타임입니다.', 'not-found');
  if (slot.reservedCount >= slot.capacity) {
    throw new HttpError(409, '해당 타임은 정원이 모두 찼습니다.', 'slot-full');
  }

  // 1점포 1예약 — 기존 예약이 있으면 변경 처리
  const prev = db.reservations.find((r) => r.uid === caller.uid && r.status === 'reserved');
  if (prev) {
    if (reservationDeadlinePassed(prev.date)) {
      throw new HttpError(400, '기존 예약은 전일 18시 이후 변경할 수 없습니다.', 'deadline-passed');
    }
    prev.status = 'cancelled';
    bumpSlot(prev.slotId, -1);
  }

  const reservation: Reservation = {
    id: newId('r_'),
    uid: caller.uid,
    storeCode: caller.storeCode,
    region: caller.region,
    eventId: body.eventId,
    slotId,
    date: body.date,
    slotNo: body.slotNo,
    partySize: body.partySize,
    engravingText: body.engravingText || (db.stores[caller.storeCode]?.storeName ?? '').slice(0, 12),
    status: 'reserved',
    qrToken: `${newId('qr_')}.${hashOtp(slotId + caller.uid, 'qr')}`.slice(0, 64),
    createdAt: Date.now(),
  };
  db.reservations.unshift(reservation);
  bumpSlot(slotId, 1);
  persist();

  const store = db.stores[caller.storeCode];
  if (store) {
    await sendSms(
      'RESERVE_OK',
      decryptPhone(store.phoneEnc),
      `[GS25 공유회] ${ev.city} ${body.date} ${['', '10:00', '13:00', '15:00'][body.slotNo]} 예약이 확정되었습니다. 장소: ${ev.venueName}`,
    );
  }
  queueSheetRow('Reservations', [
    new Date().toISOString(),
    caller.storeCode,
    ev.city,
    body.date,
    body.slotNo,
    'reserved',
    reservation.engravingText,
  ]);

  return { reservation, event: ev, changed: !!prev };
}

export async function cancelReservation(_payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const r = db.reservations.find((x) => x.uid === caller.uid && x.status === 'reserved');
  if (!r) throw new HttpError(404, '예약이 없습니다.', 'not-found');
  if (reservationDeadlinePassed(r.date)) {
    throw new HttpError(400, '전일 18시 이후에는 취소할 수 없습니다.', 'deadline-passed');
  }
  r.status = 'cancelled';
  bumpSlot(r.slotId, -1);
  persist();
  queueSheetRow('Reservations', [new Date().toISOString(), caller.storeCode, r.eventId, r.date, r.slotNo, 'cancelled', '']);
  return { ok: true };
}

export async function myReservation(_payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const r = db.reservations.find((x) => x.uid === caller.uid && x.status !== 'cancelled');
  return { reservation: r ?? null, event: r ? EVENT_BY_ID[r.eventId] : null };
}

/** T7-3 · 운영자 체크인 */
export async function checkIn(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['operator', 'admin']);
  const { qrToken, souvenirIds } = z
    .object({ qrToken: z.string().min(8), souvenirIds: z.array(z.string()).default([]) })
    .parse(payload);

  const r = db.reservations.find((x) => x.qrToken === qrToken);
  if (!r) throw new HttpError(404, '유효하지 않은 QR입니다.', 'invalid-qr');
  if (r.status === 'checked_in') throw new HttpError(409, '이미 체크인된 예약입니다.', 'already-checked-in');
  if (r.status === 'cancelled') throw new HttpError(400, '취소된 예약입니다.', 'cancelled');

  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  if (r.date !== today && process.env.CHECKIN_ALLOW_ANY_DAY !== 'true') {
    throw new HttpError(400, `예약일(${r.date})이 아닙니다.`, 'wrong-day');
  }

  r.status = 'checked_in';
  r.checkedInAt = Date.now();
  r.checkedInBy = caller.uid;
  r.souvenirGiven = Object.fromEntries(souvenirIds.map((id) => [id, true]));
  bumpSlot(r.slotId, 0, 1);

  for (const id of souvenirIds) {
    const key = `${r.eventId}_${id}`;
    const stock = (db.souvenirStock[key] ??= { total: 300, given: 0 });
    stock.given += 1;
  }
  const owner = db.users[r.uid];
  if (owner) owner.offlineVisited = true;
  persist();

  queueSheetRow('CheckIns', [
    new Date().toISOString(),
    r.storeCode,
    EVENT_BY_ID[r.eventId]?.city ?? r.eventId,
    r.slotNo,
    souvenirIds.join('|'),
  ]);
  audit({ uid: caller.uid, role: caller.role, action: 'checkin', target: r.id });

  return {
    reservation: r,
    storeName: db.stores[r.storeCode]?.storeName ?? r.storeCode,
    engravingText: r.engravingText,
  };
}

export async function getSouvenirs(_payload: unknown, ctx: Ctx) {
  let stampCount = 0;
  try {
    const caller = readSession(ctx.token);
    stampCount = db.progress[caller.uid]?.stampCount ?? 0;
  } catch {
    // 비로그인(/souvenir-promo 홍보 페이지)도 티저는 볼 수 있다.
  }
  const now = Date.now();
  const stockByItem: Record<string, { total: number; given: number }> = {};
  for (const [key, v] of Object.entries(db.souvenirStock)) {
    const itemId = key.split('_').slice(1).join('_');
    const cur = (stockByItem[itemId] ??= { total: 0, given: 0 });
    cur.total += v.total;
    cur.given += v.given;
  }
  return {
    souvenirs: SOUVENIRS.map((s: Souvenir) => {
      const revealed = now >= s.revealAt;
      const hintOpen = stampCount >= s.stampToHint;
      return {
        id: s.id,
        order: s.order,
        shape: s.shape,
        stampToHint: s.stampToHint,
        revealAt: s.revealAt,
        revealed,
        hintOpen,
        name: revealed ? s.name : hintOpen ? '???' : '???',
        hint: hintOpen || revealed ? s.hint : null,
        soldOut: (stockByItem[s.id]?.given ?? 0) >= (stockByItem[s.id]?.total ?? Infinity),
      };
    }),
    stampCount,
  };
}

// ── 라이브 (T7-4) ────────────────────────────────────────────────────
export async function getLive(_payload: unknown, ctx: Ctx) {
  let uid: string | null = null;
  try {
    uid = readSession(ctx.token).uid;
  } catch {
    uid = null;
  }
  const now = Date.now();
  const streams = LIVE_STREAMS.map((s) => ({
    ...s,
    status: (now > s.endAt ? 'ended' : now >= s.startAt ? 'live' : 'scheduled') as LiveStatusLite,
    subscribed: uid ? (db.liveSubs[s.id] ?? []).includes(uid) : false,
    // 로그인 사용자에게만 플레이어 id 를 내려준다 (F-12)
    youtubeId: uid ? s.youtubeId ?? null : null,
  })).sort((a, b) => a.startAt - b.startAt);
  return { streams, loggedIn: !!uid };
}

type LiveStatusLite = 'scheduled' | 'live' | 'ended';

export async function subscribeLive(payload: unknown, ctx: Ctx) {
  const caller = readSession(ctx.token);
  const { streamId } = z.object({ streamId: z.string() }).parse(payload);
  const subs = (db.liveSubs[streamId] ??= []);
  const i = subs.indexOf(caller.uid);
  if (i >= 0) subs.splice(i, 1);
  else subs.push(caller.uid);
  persist();
  return { subscribed: i < 0 };
}

export async function setLiveYoutubeId(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['md', 'admin']);
  const { streamId, youtubeId } = z
    .object({ streamId: z.string(), youtubeId: z.string().max(20) })
    .parse(payload);
  const s = LIVE_STREAMS.find((x) => x.id === streamId);
  if (!s) throw new HttpError(404, '편성을 찾을 수 없습니다.', 'not-found');
  s.youtubeId = youtubeId || undefined;
  audit({ uid: caller.uid, role: caller.role, action: 'live.set_youtube', target: streamId });
  return { stream: s };
}

// ── 프리오픈 (T2-2 / T2-3) ──────────────────────────────────────────
export async function getPublicHome(_payload: unknown, _ctx: Ctx) {
  const now = Date.now();
  return {
    config: db.config,
    popup:
      POPUP_NEWS.filter((p) => p.target === 'public' && p.startAt <= now && p.endAt >= now).sort(
        (a, b) => b.priority - a.priority,
      )[0] ?? null,
    // 일정·장소·좌표는 공개 정보(상품 정보 아님 — PRD F-01 준수)
    cities: EVENTS.map((e) => ({
      id: e.id,
      city: e.city,
      region: e.region,
      startDate: e.startDate,
      endDate: e.endDate,
      venueName: e.venueName,
      lat: e.lat,
      lng: e.lng,
      order: e.order,
    })),
    souvenirCount: SOUVENIRS.length,
  };
}

export async function getAppPopup(_payload: unknown, ctx: Ctx) {
  readSession(ctx.token);
  const now = Date.now();
  return {
    popup:
      POPUP_NEWS.filter((p) => p.target === 'app' && p.startAt <= now && p.endAt >= now).sort(
        (a, b) => b.priority - a.priority,
      )[0] ?? null,
  };
}

export async function requestPreNotify(payload: unknown, ctx: Ctx) {
  const { storeCode, phone, consent } = z
    .object({
      storeCode: z.string().trim().min(3).max(12),
      phone: z.string().trim().regex(/^01[016789]\d{7,8}$/),
      consent: z.literal(true),
    })
    .parse(payload);

  const rate = checkRate(`prenotify:${ctx.ip}`, 10, 60 * 60000);
  if (!rate.ok) throw new HttpError(429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 'rate-limited');

  const store = db.stores[storeCode];
  // 화이트리스트 점포만 신청 가능. 존재 여부는 노출하지 않는다 (F-01).
  if (!store || !store.active) {
    audit({ uid: storeCode, role: 'anonymous', action: 'prenotify.rejected', ip: ctx.ip });
    throw new HttpError(400, '등록된 점포 정보로만 신청하실 수 있습니다.', 'not-allowed');
  }

  const key = hashLast4(phone, storeCode);
  db.preNotify[key] = {
    storeCode,
    phoneEnc: (await import('./store')).encryptPhone(phone),
    consentAt: Date.now(),
    sentStages: [],
  };
  persist();
  audit({ uid: storeCode, role: 'anonymous', action: 'prenotify.registered', ip: ctx.ip });
  return { ok: true };
}

/** T2-3 · D-7 / D-1 / D-day 발송 대상 추출 (운영에서는 스케줄 함수) */
export async function runPreNotifyBatch(payload: unknown, ctx: Ctx) {
  requireStaff(readSession(ctx.token), ['admin']);
  const { stage } = z.object({ stage: z.enum(['D-7', 'D-1', 'D-DAY']) }).parse(payload);
  let sent = 0;
  for (const [key, rec] of Object.entries(db.preNotify)) {
    if (rec.sentStages.includes(stage)) continue;
    await sendSms('PRE_NOTIFY', decryptPhone(rec.phoneEnc), `[GS25 공유회] ${stage} 안내입니다.`);
    rec.sentStages.push(stage);
    sent += 1;
    void key;
  }
  persist();
  return { sent };
}

// ── 관리자 (T8-*) ───────────────────────────────────────────────────
export async function adminParticipants(payload: unknown, ctx: Ctx) {
  // 참여자 명단은 개인정보에 준하므로 관리자만 볼 수 있다(메뉴에서 숨기는 것으로는 부족).
  const caller = requireStaff(readSession(ctx.token), ['admin']);
  const { filter, region, search, page, pageSize } = z
    .object({
      filter: z.enum(['all', 'completed', 'incomplete', 'never']).default('all'),
      region: z.string().default('ALL'),
      search: z.string().default(''),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(10).max(200).default(25),
    })
    .parse(payload ?? {});

  let rows = Object.values(db.stores).map((s) => {
    const uid = `store_${s.storeCode}`;
    const user = db.users[uid];
    const p = db.progress[uid];
    const r = db.reservations.find((x) => x.uid === uid && x.status !== 'cancelled');
    return {
      storeCode: s.storeCode,
      storeName: s.storeName,
      region: s.region,
      loggedIn: !!user?.lastLoginAt,
      lastLoginAt: user?.lastLoginAt ?? null,
      stampCount: p?.stampCount ?? 0,
      completedAt: p?.completedAt ?? null,
      reserved: r ? `${EVENT_BY_ID[r.eventId]?.city ?? ''} ${r.date}` : null,
      visited: r?.status === 'checked_in',
      coupon: db.coupons[uid]?.status ?? null,
    };
  });

  if (region !== 'ALL') rows = rows.filter((r) => r.region === region);
  if (filter === 'completed') rows = rows.filter((r) => r.completedAt);
  if (filter === 'incomplete') rows = rows.filter((r) => r.loggedIn && !r.completedAt);
  if (filter === 'never') rows = rows.filter((r) => !r.loggedIn);
  if (search) {
    const s = search.trim();
    rows = rows.filter((r) => r.storeCode.includes(s) || r.storeName.includes(s));
  }

  audit({ uid: caller.uid, role: caller.role, action: 'participants.list', detail: `${rows.length}건` });
  const total = rows.length;
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

export async function exportParticipants(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['admin']);
  const res = await adminParticipants({ ...(payload as object), page: 1, pageSize: 200 }, ctx);
  audit({
    uid: caller.uid,
    role: caller.role,
    action: 'participants.export',
    detail: `${res.total}건 내보내기`,
  });
  const header = ['점포코드', '점포명', '지역', '로그인', '스탬프', '완주시각', '예약', '방문', '쿠폰'];
  const lines = [header.join(',')].concat(
    res.rows.map((r) =>
      [
        r.storeCode,
        r.storeName,
        r.region,
        r.loggedIn ? 'Y' : 'N',
        `${r.stampCount}/11`,
        r.completedAt ? new Date(r.completedAt).toISOString() : '',
        r.reserved ?? '',
        r.visited ? 'Y' : 'N',
        r.coupon ?? '',
      ].join(','),
    ),
  );
  return { csv: `﻿${lines.join('\n')}`, count: res.rows.length };
}

export async function sendNudge(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['admin']);
  const { target, preview } = z
    .object({ target: z.enum(['never', 'incomplete']), preview: z.boolean().default(true) })
    .parse(payload);
  if (!preview && nightBlocked()) {
    throw new HttpError(400, '21시~08시에는 발송할 수 없습니다.', 'night-blocked');
  }
  const res = await adminParticipants({ filter: target, pageSize: 200 }, ctx);
  const body =
    target === 'never'
      ? '[GS25 공유회] 아직 온라인 전시에 접속하지 않으셨습니다. 지금 참여해 보세요.'
      : '[GS25 공유회] 스탬프가 몇 개 남았습니다! 완주하시면 쿠폰을 보내 드립니다.';
  if (!preview) {
    const targets = res.rows
      .map((r) => db.stores[r.storeCode])
      .filter((st): st is NonNullable<typeof st> => !!st)
      .map((st) => ({ to: decryptPhone(st.phoneEnc), text: body }));
    const out = await sendSmsBatch('NUDGE', targets);
    audit({
      uid: caller.uid,
      role: caller.role,
      action: 'nudge.sent',
      detail: `대상 ${res.rows.length}건 · 성공 ${out.sent} 실패 ${out.failed}`,
    });
    return { count: res.rows.length, sent: out.sent, failed: out.failed, body, preview, sample: res.rows.slice(0, 5) };
  }
  return { count: res.rows.length, body, preview, sample: res.rows.slice(0, 5) };
}

export async function sendCoupons(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['admin']);
  const { codes, dryRun, retryFailedOnly } = z
    .object({
      codes: z.array(z.string().trim().min(4)).default([]),
      dryRun: z.boolean().default(true),
      retryFailedOnly: z.boolean().default(false),
    })
    .parse(payload);

  if (!dryRun && nightBlocked()) {
    throw new HttpError(400, '21시~08시에는 발송할 수 없습니다.', 'night-blocked');
  }

  const finishers = Object.values(db.progress).filter((p) => p.completedAt);
  const targets = retryFailedOnly
    ? finishers.filter((p) => db.coupons[p.uid]?.status === 'failed')
    : finishers;

  const matched = targets.map((p, i) => ({
    uid: p.uid,
    storeCode: p.storeCode,
    storeName: db.stores[p.storeCode]?.storeName ?? p.storeCode,
    code: db.coupons[p.uid]?.code ?? codes[i] ?? null,
  }));

  if (dryRun) {
    return {
      dryRun: true,
      matched,
      matchedCount: matched.filter((m) => m.code).length,
      unmatchedCount: matched.filter((m) => !m.code).length,
      spareCodes: Math.max(0, codes.length - matched.length),
    };
  }

  let sent = 0;
  let failed = 0;
  // 100건씩 배치 (T8-4)
  for (let i = 0; i < matched.length; i += 100) {
    for (const m of matched.slice(i, i + 100)) {
      if (!m.code) continue;
      const store = db.stores[m.storeCode];
      // 실제 발송 결과를 쿠폰 상태에 반영한다 — 실패한 건은 재발송 대상으로 남아야 한다.
      const res = store
        ? await sendSms(
            'COUPON',
            decryptPhone(store.phoneEnc),
            `[GS25 공유회] 완주 축하드립니다! 쿠폰번호: ${m.code}`,
          )
        : null;
      const delivered = smsMode() === 'live' ? !!res?.ok : !!store;
      const coupon: Coupon = {
        uid: m.uid,
        storeCode: m.storeCode,
        code: m.code,
        status: delivered ? 'sent' : 'failed',
        sentAt: Date.now(),
        retries: (db.coupons[m.uid]?.retries ?? 0) + (retryFailedOnly ? 1 : 0),
      };
      db.coupons[m.uid] = coupon;
      if (delivered) sent += 1;
      else failed += 1;
      queueSheetRow('Coupons', [new Date().toISOString(), m.storeCode, coupon.status, m.code]);
    }
  }
  persist();
  audit({ uid: caller.uid, role: caller.role, action: 'coupons.sent', detail: `성공 ${sent} 실패 ${failed}` });
  return { dryRun: false, sent, failed };
}

/** 관리자 · 문자 발송 설정과 솔라피 잔액을 확인한다. */
export async function adminSmsStatus(_payload: unknown, ctx: Ctx) {
  requireStaff(readSession(ctx.token), ['admin']);
  const balance = await smsBalance();
  return {
    ...smsStatus(),
    opsNumberSet: !!opsNumber(),
    balance: balance.ok ? { balance: balance.balance, point: balance.point } : null,
    balanceError: balance.ok ? null : balance.error,
    recent: db.smsLogs.slice(0, 20),
  };
}

/** 관리자 · 지정한 번호로 테스트 문자를 1건 보낸다. */
export async function adminSmsTest(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['admin']);
  const { to, text } = z
    .object({
      to: z.string().trim().min(9).max(20),
      text: z.string().trim().min(1).max(300).default('[GS25 상품전략공유회] 발송 테스트입니다.'),
    })
    .parse(payload ?? {});

  const phone = normalizePhone(to);
  if (!phone) throw new HttpError(400, '휴대폰 번호 형식이 아닙니다.', 'invalid-phone');

  // 테스트는 관리자가 방금 누른 것이므로 야간 차단 대상이 아니다.
  const res = await sendSms('PRE_NOTIFY', phone, text, { urgent: true });
  audit({
    uid: caller.uid,
    role: caller.role,
    action: 'sms.test',
    detail: `${res.status}${res.error ? ` · ${res.error}` : ''}`,
  });
  return { ...res, mode: smsMode() };
}

export async function adminAudit(payload: unknown, ctx: Ctx) {
  requireStaff(readSession(ctx.token), ['admin']);
  const { limit } = z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(payload ?? {});
  return { logs: db.auditLogs.slice(0, limit), smsLogs: db.smsLogs.slice(0, 50), syncQueue: db.syncQueue.slice(-50) };
}

export async function adminReservations(payload: unknown, ctx: Ctx) {
  // 예약·체크인은 현장 운영자와 관리자만
  requireStaff(readSession(ctx.token), ['operator', 'admin']);
  const { eventId } = z.object({ eventId: z.string().optional() }).parse(payload ?? {});
  const rows = db.reservations
    .filter((r) => (eventId ? r.eventId === eventId : true))
    .map((r) => ({
      ...r,
      storeName: db.stores[r.storeCode]?.storeName ?? r.storeCode,
      city: EVENT_BY_ID[r.eventId]?.city ?? r.eventId,
    }));
  return { reservations: rows, slots: allSlots(), events: EVENTS };
}

export async function adminSetConfig(payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['admin']);
  const patch = z
    .object({
      force2D: z.boolean().optional(),
      maintenanceNotice: z.string().max(200).optional(),
    })
    .parse(payload);
  db.config = { ...db.config, ...patch };
  persist();
  audit({ uid: caller.uid, role: caller.role, action: 'config.update', detail: JSON.stringify(patch) });
  return { config: db.config };
}

export async function getPublicConfig(_payload: unknown, _ctx: Ctx) {
  return { config: db.config };
}

export async function adminContent(_payload: unknown, ctx: Ctx) {
  requireStaff(readSession(ctx.token), ['admin']);
  return {
    sections: SECTIONS,
    products: PRODUCTS.map(({ aiContext, script, ...rest }) => ({
      ...rest,
      scriptLength: script.length,
      hasAiContext: aiContext.length > 0,
    })),
    quizzes: QUIZZES,
    popupNews: POPUP_NEWS,
    souvenirs: SOUVENIRS,
    messages: MESSAGES,
  };
}

export async function adminCheers(payload: unknown, ctx: Ctx) {
  requireStaff(readSession(ctx.token), ['operator', 'admin']);
  const { status } = z
    .object({ status: z.enum(['pending', 'visible', 'hidden', 'all']).default('all') })
    .parse(payload ?? {});
  const rows = db.cheers.filter((c) => (status === 'all' ? true : c.status === status));
  return { cheers: rows.slice(0, 100) };
}

export async function adminWhitelistSync(_payload: unknown, ctx: Ctx) {
  const caller = requireStaff(readSession(ctx.token), ['admin']);
  audit({ uid: caller.uid, role: caller.role, action: 'whitelist.sync' });
  // 운영: importStores Function 이 Google Sheets `Stores` 탭을 읽어 업서트한다.
  return {
    ok: true,
    stores: Object.values(db.stores).map((s) => ({
      storeCode: s.storeCode,
      storeName: s.storeName,
      ownerName: s.ownerName,
      region: s.region,
      fcTeam: s.fcTeam,
      active: s.active,
      syncedAt: s.syncedAt,
    })),
    note: '개발 모드에서는 시드 점포를 반환합니다. 운영에서는 Google Sheets Stores 탭과 동기화합니다.',
  };
}

export async function myPage(_payload: unknown, ctx: Ctx) {
  const caller = requireOwner(readSession(ctx.token));
  const p = ensureProgress(caller.uid, caller.storeCode, caller.region);
  const r = db.reservations.find((x) => x.uid === caller.uid && x.status !== 'cancelled');
  return {
    progress: p,
    sections: SECTIONS,
    storeName: db.stores[caller.storeCode]?.storeName ?? caller.storeCode,
    questions: db.questions.filter((q) => q.uid === caller.uid),
    reservation: r ?? null,
    event: r ? EVENT_BY_ID[r.eventId] : null,
    coupon: db.coupons[caller.uid] ?? null,
    survey: db.surveys[caller.uid] ?? null,
  };
}

// ── 라우팅 테이블 ────────────────────────────────────────────────────
export const HANDLERS = {
  // auth
  requestOtp,
  verifyOtp,
  staffLogin,
  staffVerify,
  checkMailer,
  acceptConsent,
  me,
  signOut,
  setFontScale,
  reportWatermarkTamper,
  // content
  getExhibitIndex,
  getSectionContent,
  getProductContent,
  getPublicHome,
  getAppPopup,
  getPublicConfig,
  // exhibit
  markProductProgress,
  submitQuiz,
  submitSurvey,
  myPage,
  // qa
  createQuestion,
  listQuestions,
  likeQuestion,
  answerQuestion,
  moderateQuestion,
  escalateQuestions,
  // cheer
  createCheer,
  listCheers,
  moderateCheer,
  // aggregates
  getAggregates,
  // ai
  askSectionBot,
  getSuggestedQuestions,
  // offline
  getOfflineSchedule,
  reserveSlot,
  cancelReservation,
  myReservation,
  checkIn,
  getSouvenirs,
  // live
  getLive,
  subscribeLive,
  setLiveYoutubeId,
  // notify
  requestPreNotify,
  runPreNotifyBatch,
  // admin
  adminParticipants,
  exportParticipants,
  sendNudge,
  sendCoupons,
  adminAudit,
  adminReservations,
  adminSetConfig,
  adminContent,
  adminCheers,
  adminWhitelistSync,
  adminSmsStatus,
  adminSmsTest,
} as const;

export type HandlerName = keyof typeof HANDLERS;
