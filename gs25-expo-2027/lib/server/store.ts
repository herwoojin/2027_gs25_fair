/**
 * 로컬 개발용 저장소.
 *
 * ⚠️ 이것은 **Cloud Functions + Firestore 의 개발 모드 대역**이다.
 * 운영 코드는 functions/src/** 에 있고, 규칙(firestore.rules)으로 보호된다.
 * 여기서는 Firebase 프로젝트 없이도 dev 서버에서 전체 플로우(OTP → 스탬프 → 완주)를
 * 서버 판정 그대로 확인할 수 있도록 동일한 로직을 JSON 파일에 담아 재현한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AppUser,
  Cheer,
  Coupon,
  Progress,
  Question,
  RegionCode,
  Reservation,
  Slot,
  Survey,
} from '@/types';
import { SLOTS } from '@/lib/seed/events';
import { CHEERS, DEMO_STORES, QUESTIONS } from '@/lib/seed/misc';
import { DEFAULT_CONFIG } from '@/lib/config';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/store.ts is server-only');
}

const DATA_DIR = path.join(process.cwd(), '.devdata');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface StoreRecord {
  storeCode: string;
  storeName: string;
  ownerName: string;
  /** AES-256-GCM 암호문 — 평문 저장 금지 (PRD S-11) */
  phoneEnc: string;
  /** HMAC-SHA256(last4 + storeCode) */
  phoneLast4Hash: string;
  region: RegionCode;
  fcTeam: string;
  active: boolean;
  syncedAt: number;
}

export interface OtpSession {
  id: string;
  storeCode: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
  /** 본부 로그인일 때만 채워진다(이메일 인증). */
  staff?: {
    uid: string;
    email: string;
    name: string;
    team: string;
    role: 'admin' | 'operator' | 'md';
    sectionIds: string[];
    backupFor: string[];
  };
}

export interface SessionRecord {
  token: string;
  uid: string;
  sessionKey: string;
  role: AppUser['role'];
  storeCode?: string;
  region?: RegionCode;
  issuedAt: number;
  expiresAt: number;
}

export interface AuditRecord {
  id: string;
  uid: string;
  role: string;
  action: string;
  target?: string;
  ip?: string;
  ua?: string;
  at: number;
  detail?: string;
}

export interface SyncRow {
  id: string;
  sheet: string;
  row: (string | number)[];
  createdAt: number;
  tries: number;
}

interface DB {
  stores: Record<string, StoreRecord>;
  users: Record<string, AppUser>;
  /** ERD 의 staff/{uid} 대응 — 로그인 시 Staff 시트에서 가져와 채운다. */
  staffDirectory: Record<
    string,
    {
      uid: string;
      email: string;
      name: string;
      team: string;
      role: 'admin' | 'operator' | 'md';
      sectionIds: string[];
      backupFor: string[];
    }
  >;
  progress: Record<string, Progress>;
  surveys: Record<string, Survey>;
  questions: Question[];
  questionLikes: Record<string, string[]>;
  cheers: Cheer[];
  reservations: Reservation[];
  slotOverrides: Record<string, { reservedCount: number; checkedInCount: number }>;
  souvenirStock: Record<string, { total: number; given: number }>;
  coupons: Record<string, Coupon>;
  otpSessions: Record<string, OtpSession>;
  sessions: Record<string, SessionRecord>;
  rateLimits: Record<string, { count: number; windowStart: number; lockedUntil?: number }>;
  auditLogs: AuditRecord[];
  smsLogs: { id: string; code: string; toMasked: string; body: string; status: string; at: number }[];
  chatLogs: Record<string, { role: 'user' | 'bot'; text: string; sectionId: string; createdAt: number }[]>;
  aiUsage: Record<string, number>;
  liveSubs: Record<string, string[]>;
  preNotify: Record<string, { storeCode: string; phoneEnc: string; consentAt: number; sentStages: string[] }>;
  syncQueue: SyncRow[];
  completionCounter: number;
  config: typeof DEFAULT_CONFIG;
}

// ── 암호화 유틸 (T1-1) ───────────────────────────────────────────────
// 아래 기본값은 **로컬 개발 전용**이다. 저장소에 공개되어 있으므로 운영에서 쓰이면 안 된다.
if (process.env.NODE_ENV === 'production' && (!process.env.PHONE_ENC_KEY || !process.env.PHONE_HMAC_KEY)) {
  throw new Error(
    'PHONE_ENC_KEY / PHONE_HMAC_KEY 가 설정되지 않았습니다. ' +
      '운영에서는 Secret Manager 값을 반드시 주입해야 합니다(기본값은 공개되어 있어 사용 불가).',
  );
}

const ENC_KEY = crypto
  .createHash('sha256')
  .update(process.env.PHONE_ENC_KEY ?? 'dev-only-phone-enc-key-change-me')
  .digest();
const HMAC_KEY = process.env.PHONE_HMAC_KEY ?? 'dev-only-hmac-key-change-me';

export function encryptPhone(phone: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(
    ':',
  );
}

export function decryptPhone(payload: string): string {
  const [iv, tag, data] = payload.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

export function hashLast4(last4: string, storeCode: string): string {
  return crypto.createHmac('sha256', HMAC_KEY).update(`${last4}:${storeCode}`).digest('hex');
}

export function hashOtp(code: string, sessionId: string): string {
  return crypto.createHmac('sha256', HMAC_KEY).update(`${code}:${sessionId}`).digest('hex');
}

export function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{3,4}(\d{4})$/, '$1-****-$2');
}

// ── DB 로드/저장 ─────────────────────────────────────────────────────
function seedDb(): DB {
  const stores: Record<string, StoreRecord> = {};
  for (const s of DEMO_STORES) {
    stores[s.storeCode] = {
      storeCode: s.storeCode,
      storeName: s.storeName,
      ownerName: s.ownerName,
      phoneEnc: encryptPhone(s.phone),
      phoneLast4Hash: hashLast4(s.phone.slice(-4), s.storeCode),
      region: s.region,
      fcTeam: s.fcTeam,
      active: true,
      syncedAt: Date.now(),
    };
  }
  return {
    stores,
    users: {},
    staffDirectory: {},
    progress: {},
    surveys: {},
    questions: [...QUESTIONS],
    questionLikes: {},
    cheers: [...CHEERS],
    reservations: [],
    slotOverrides: {},
    souvenirStock: {},
    coupons: {},
    otpSessions: {},
    sessions: {},
    rateLimits: {},
    auditLogs: [],
    smsLogs: [],
    chatLogs: {},
    aiUsage: {},
    liveSubs: {},
    preNotify: {},
    syncQueue: [],
    completionCounter: 0,
    config: { ...DEFAULT_CONFIG },
  };
}

// dev 서버의 HMR 재시작에도 같은 인스턴스를 쓰도록 global 에 보관한다.
const g = globalThis as unknown as { __gsExpoDb?: DB };

/**
 * 컬렉션 키의 기본값.
 * 스키마에 키가 추가돼도 ① 예전 db.json ② dev 서버 HMR 로 살아남은 메모리 인스턴스가
 * 그대로 쓰이면서 `undefined[...] = x` 로 터지는 것을 막는다.
 */
const SHAPE: Record<string, () => unknown> = {
  stores: () => ({}),
  users: () => ({}),
  staffDirectory: () => ({}),
  progress: () => ({}),
  surveys: () => ({}),
  questions: () => [],
  questionLikes: () => ({}),
  cheers: () => [],
  reservations: () => [],
  slotOverrides: () => ({}),
  souvenirStock: () => ({}),
  coupons: () => ({}),
  otpSessions: () => ({}),
  sessions: () => ({}),
  rateLimits: () => ({}),
  auditLogs: () => [],
  smsLogs: () => [],
  chatLogs: () => ({}),
  aiUsage: () => ({}),
  liveSubs: () => ({}),
  preNotify: () => ({}),
  syncQueue: () => [],
};

function ensureShape(cur: DB): DB {
  const rec = cur as unknown as Record<string, unknown>;
  for (const [key, make] of Object.entries(SHAPE)) {
    if (rec[key] == null) rec[key] = make();
  }
  if (typeof rec.completionCounter !== 'number') rec.completionCounter = 0;
  if (rec.config == null) rec.config = { ...DEFAULT_CONFIG };
  return cur;
}

function load(): DB {
  if (g.__gsExpoDb) return ensureShape(g.__gsExpoDb);
  let db: DB;
  try {
    if (fs.existsSync(DB_FILE)) {
      db = { ...seedDb(), ...(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DB) };
    } else {
      db = seedDb();
    }
  } catch {
    db = seedDb();
  }
  g.__gsExpoDb = ensureShape(db);
  return g.__gsExpoDb;
}

let saveTimer: NodeJS.Timeout | null = null;
export function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(g.__gsExpoDb, null, 2));
    } catch {
      /* 개발 편의 기능이므로 실패해도 앱을 멈추지 않는다 */
    }
  }, 300);
}

export const db = new Proxy({} as DB, {
  get: (_t, prop: string) => load()[prop as keyof DB],
  set: (_t, prop: string, value) => {
    (load() as unknown as Record<string, unknown>)[prop] = value;
    persist();
    return true;
  },
});

export function resetDb() {
  g.__gsExpoDb = seedDb();
  persist();
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────────
export function newId(prefix = ''): string {
  return prefix + crypto.randomBytes(9).toString('base64url');
}

export function audit(entry: Omit<AuditRecord, 'id' | 'at'>) {
  const d = load();
  d.auditLogs.unshift({ ...entry, id: newId('a_'), at: Date.now() });
  if (d.auditLogs.length > 2000) d.auditLogs.length = 2000;
  persist();
}

/** T9-1 · 구글시트 백업 큐 */
export function queueSheetRow(sheet: string, row: (string | number)[]) {
  const d = load();
  d.syncQueue.push({ id: newId('s_'), sheet, row, createdAt: Date.now(), tries: 0 });
  if (d.syncQueue.length > 5000) d.syncQueue.splice(0, d.syncQueue.length - 5000);
  persist();
}

export function logSms(code: string, to: string, body: string, status = 'sent') {
  const d = load();
  d.smsLogs.unshift({
    id: newId('m_'),
    code,
    toMasked: maskPhone(to),
    body,
    status,
    at: Date.now(),
  });
  if (d.smsLogs.length > 500) d.smsLogs.length = 500;
  persist();
}

/** TRD 3.4 · 슬라이딩 윈도 rate limit */
export function checkRate(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const d = load();
  const now = Date.now();
  const rec = d.rateLimits[key];
  if (rec?.lockedUntil && rec.lockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (!rec || now - rec.windowStart > windowMs) {
    d.rateLimits[key] = { count: 1, windowStart: now };
    persist();
    return { ok: true, retryAfterSec: 0 };
  }
  if (rec.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((rec.windowStart + windowMs - now) / 1000) };
  }
  rec.count += 1;
  persist();
  return { ok: true, retryAfterSec: 0 };
}

export function lockKey(key: string, ms: number) {
  const d = load();
  d.rateLimits[key] = { count: 999, windowStart: Date.now(), lockedUntil: Date.now() + ms };
  persist();
}

export function getSlot(slotId: string): Slot | undefined {
  const base = SLOTS.find((s) => s.id === slotId);
  if (!base) return undefined;
  const ov = load().slotOverrides[slotId];
  return ov ? { ...base, ...ov } : base;
}

export function allSlots(): Slot[] {
  const ov = load().slotOverrides;
  return SLOTS.map((s) => (ov[s.id] ? { ...s, ...ov[s.id] } : s));
}

export function bumpSlot(slotId: string, deltaReserved: number, deltaCheckedIn = 0) {
  const d = load();
  const base = SLOTS.find((s) => s.id === slotId);
  if (!base) return;
  const cur = d.slotOverrides[slotId] ?? {
    reservedCount: base.reservedCount,
    checkedInCount: base.checkedInCount,
  };
  d.slotOverrides[slotId] = {
    reservedCount: Math.max(0, cur.reservedCount + deltaReserved),
    checkedInCount: Math.max(0, cur.checkedInCount + deltaCheckedIn),
  };
  persist();
}

export function emptyProgress(uid: string, storeCode: string, region: RegionCode): Progress {
  return {
    uid,
    storeCode,
    region,
    products: {},
    stamps: {},
    stampCount: 0,
    quizFirstTryCorrect: 0,
    quizTotal: 0,
  };
}

export function getProgress(uid: string): Progress | undefined {
  return load().progress[uid];
}

export function ensureProgress(uid: string, storeCode: string, region: RegionCode): Progress {
  const d = load();
  if (!d.progress[uid]) {
    d.progress[uid] = emptyProgress(uid, storeCode, region);
    persist();
  }
  return d.progress[uid];
}

export function nextCompletionNo(): number {
  const d = load();
  d.completionCounter += 1;
  persist();
  return d.completionCounter;
}
