/**
 * 메일 발송 대기열 (pull 모드).
 *
 * GS리테일 Workspace 정책상 Apps Script 웹앱을 "모든 사용자"로 배포할 수 없어
 * 우리 서버가 Apps Script 를 호출할 수 없다. 그래서 방향을 뒤집는다.
 *
 *   [push 모드]  우리 서버 ──HTTP──▶ Apps Script        (익명 웹앱 필요)
 *   [pull 모드]  우리 서버 ◀──HTTP── Apps Script 트리거  (인바운드 불필요)  ← 현재
 *
 * Apps Script 의 1분 시간 기반 트리거가 /api/mail-queue 로 와서
 * 대기 중인 인증번호를 가져가 발송하고 결과를 알려 준다.
 */
import crypto from 'node:crypto';
import { db, newId, persist } from './store';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/mailQueue.ts is server-only');
}

export type MailerMode = 'push' | 'pull' | 'off';

export function mailerMode(): MailerMode {
  const mode = (process.env.MAILER_MODE ?? '').toLowerCase();
  if (mode === 'pull') return process.env.APPS_SCRIPT_KEY ? 'pull' : 'off';
  if (mode === 'push') return process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_KEY ? 'push' : 'off';
  // 미지정: URL 이 있으면 push, 키만 있으면 pull
  if (process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_KEY) return 'push';
  if (process.env.APPS_SCRIPT_KEY) return 'pull';
  return 'off';
}

/** pull 모드는 트리거 주기(최대 1분)만큼 지연되므로 유효시간을 넉넉히 준다. */
export const OTP_TTL_SEC = { push: 180, pull: 600, off: 180 } as const;

export type MailJobStatus = 'pending' | 'claimed' | 'sent' | 'failed';

export interface MailJob {
  id: string;
  email: string;
  /** 인증번호 평문 — 발송 후 즉시 지운다. 로그에는 절대 남기지 않는다. */
  code: string;
  purpose: string;
  expiresInSec: number;
  createdAt: number;
  expiresAt: number;
  status: MailJobStatus;
  claimedAt?: number;
  sentAt?: number;
  attempts: number;
  error?: string;
}

export function enqueueMail(args: {
  email: string;
  code: string;
  purpose?: string;
  expiresInSec: number;
}): MailJob {
  const now = Date.now();
  const job: MailJob = {
    id: newId('mq_'),
    email: args.email.toLowerCase(),
    code: args.code,
    purpose: args.purpose ?? 'STAFF_LOGIN',
    expiresInSec: args.expiresInSec,
    createdAt: now,
    expiresAt: now + args.expiresInSec * 1000,
    status: 'pending',
    attempts: 0,
  };
  db.mailQueue.push(job);
  gc();
  persist();
  return job;
}

/** 만료·완료된 항목 정리. 인증번호가 오래 남지 않도록 한다. */
function gc() {
  const now = Date.now();
  const keep = db.mailQueue.filter((j) => {
    if (j.status === 'sent' || j.status === 'failed') return now - (j.sentAt ?? j.createdAt) < 10 * 60_000;
    return j.expiresAt > now;
  });
  // 완료된 건의 인증번호는 즉시 비운다.
  for (const j of keep) if (j.status === 'sent' || j.status === 'failed') j.code = '';
  if (keep.length !== db.mailQueue.length) db.mailQueue = keep;
}

/** Apps Script 트리거가 가져갈 대기 건을 반환하고 claimed 로 표시한다. */
export function claimPending(limit = 20): MailJob[] {
  gc();
  const now = Date.now();
  const out: MailJob[] = [];
  for (const j of db.mailQueue) {
    if (out.length >= limit) break;
    if (j.status === 'sent' || j.status === 'failed') continue;
    if (j.expiresAt <= now) continue;
    // 30초 안에 ack 가 없으면 다시 가져갈 수 있게 한다(트리거 중단 대비).
    if (j.status === 'claimed' && now - (j.claimedAt ?? 0) < 30_000) continue;
    j.status = 'claimed';
    j.claimedAt = now;
    j.attempts += 1;
    out.push(j);
  }
  persist();
  return out;
}

export function completeMail(id: string, ok: boolean, error?: string) {
  const j = db.mailQueue.find((x) => x.id === id);
  if (!j) return;
  j.status = ok ? 'sent' : 'failed';
  j.sentAt = Date.now();
  j.code = ''; // 평문 인증번호 즉시 삭제
  if (error) j.error = String(error).slice(0, 200);
  persist();
}

export function queueStats() {
  gc();
  const now = Date.now();
  return {
    pending: db.mailQueue.filter((j) => j.status === 'pending').length,
    claimed: db.mailQueue.filter((j) => j.status === 'claimed').length,
    sentRecently: db.mailQueue.filter((j) => j.status === 'sent').length,
    failedRecently: db.mailQueue.filter((j) => j.status === 'failed').length,
    /** 마지막으로 Apps Script 트리거가 다녀간 시각 */
    lastPullAt: db.mailerLastPullAt ?? null,
    lastPullAgoSec: db.mailerLastPullAt ? Math.round((now - db.mailerLastPullAt) / 1000) : null,
  };
}

export function markPulled() {
  db.mailerLastPullAt = Date.now();
  persist();
}

// ── 인바운드 요청 검증 (Apps Script → 우리 서버) ─────────────────────

/** base = action|ts|nonce  ·  sig = HMAC-SHA256(SHARED_KEY, base) */
export function verifyPullRequest(body: {
  action?: string;
  ts?: number;
  nonce?: string;
  sig?: string;
}): string {
  const key = process.env.APPS_SCRIPT_KEY;
  if (!key) return 'key-not-configured';

  const ts = Number(body.ts ?? 0);
  if (!ts || Math.abs(Date.now() - ts) > 120_000) return 'timestamp-skew';

  const nonce = String(body.nonce ?? '');
  if (nonce.length < 8) return 'bad-nonce';
  if (!consumeNonce(nonce)) return 'nonce-replay';

  const expected = crypto
    .createHmac('sha256', key)
    .update([body.action ?? '', ts, nonce].join('|'))
    .digest('hex');

  const given = String(body.sig ?? '');
  if (given.length !== expected.length) return 'bad-signature';
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return 'bad-signature';
  return '';
}

function consumeNonce(nonce: string): boolean {
  const now = Date.now();
  for (const [n, at] of Object.entries(db.pullNonces)) {
    if (now - at > 600_000) delete db.pullNonces[n];
  }
  if (db.pullNonces[nonce]) return false;
  db.pullNonces[nonce] = now;
  persist();
  return true;
}
