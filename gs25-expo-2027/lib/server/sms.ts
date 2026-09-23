/**
 * SOLAPI 문자 발송 모듈.
 *
 * 공식 SDK(`solapi` npm) 대신 REST API 를 직접 호출한다.
 * 서버리스 번들에 의존성을 늘리지 않고, 인증이 HMAC-SHA256 한 줄로 끝나기 때문이다.
 *
 * 안전장치 (GUIDE 3.4 · TRD 7.1)
 *   1) 발신번호·키가 없으면 **절대 발송하지 않고** 로그만 남긴다(log 모드).
 *   2) 광고성 코드는 야간(21~08시 KST) 발송을 차단한다.
 *   3) SMS_ALLOWLIST 가 있으면 그 번호로만 발송한다(개발 중 실수 대량발송 방지).
 *   4) 모든 발송 시도는 수신번호를 마스킹해 smsLogs 에 남긴다.
 *   5) 실패 시 1회 재시도한다.
 */
import crypto from 'crypto';
import { logSms } from './store';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/sms.ts is server-only');
}

const API_BASE = process.env.SOLAPI_API_BASE ?? 'https://api.solapi.com';

export type SmsCode =
  | 'OTP'
  | 'PRE_NOTIFY'
  | 'Q_TO_MD'
  | 'Q_ESCALATE'
  | 'A_TO_OWNER'
  | 'RESERVE_OK'
  | 'RESERVE_REMIND'
  | 'LIVE_ALERT'
  | 'NUDGE'
  | 'COUPON';

/** 광고성 — 야간 발송 차단 대상 */
const AD_CODES: readonly SmsCode[] = ['PRE_NOTIFY', 'NUDGE', 'COUPON'];

export type SmsMode = 'live' | 'log';

export interface SmsResult {
  ok: boolean;
  status: string;
  groupId?: string;
  messageId?: string;
  error?: string;
}

// ── 설정 ─────────────────────────────────────────────────────────

function apiKey() {
  return process.env.SOLAPI_API_KEY?.trim() ?? '';
}
function apiSecret() {
  return process.env.SOLAPI_API_SECRET?.trim() ?? '';
}
/** 발신번호 — 솔라피 콘솔에 사전 등록된 번호여야 한다. 하이픈은 제거한다. */
export function sender() {
  return (process.env.SOLAPI_SENDER ?? '').replace(/[^0-9]/g, '');
}

export function smsConfigured(): boolean {
  return !!(apiKey() && apiSecret() && sender());
}

/**
 * live = 실제 발송 / log = 기록만.
 * SMS_MODE 로 강제할 수 있고, 지정이 없으면 키 유무로 판단한다.
 */
export function smsMode(): SmsMode {
  const forced = process.env.SMS_MODE?.trim().toLowerCase();
  if (forced === 'live') return smsConfigured() ? 'live' : 'log';
  if (forced === 'log' || forced === 'off') return 'log';
  return smsConfigured() ? 'live' : 'log';
}

/** 지정되면 이 번호로만 발송한다. 개발·스테이징 안전장치. */
function allowlist(): string[] {
  return (process.env.SMS_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.replace(/[^0-9]/g, ''))
    .filter(Boolean);
}

/** TRD 7.1 · 광고성 발송 야간(21~08시) 금지 — 서버 시간대와 무관하게 KST 로 판단한다. */
export function isNightBlocked(now = new Date()): boolean {
  const h = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(now),
  );
  return h >= 21 || h < 8;
}

// ── 인증 ─────────────────────────────────────────────────────────

/**
 * SOLAPI 인증 헤더.
 * Authorization: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=HMAC(date+salt, secret)
 */
function authHeader(): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret()).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey()}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function solapi(path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { errorMessage: text.slice(0, 200) };
  }
  if (!res.ok) {
    const code = String(json.errorCode ?? res.status);
    const msg = String(json.errorMessage ?? res.statusText);
    throw new Error(`${code} ${msg}`);
  }
  return json;
}

// ── 발송 ─────────────────────────────────────────────────────────

/** 국내 번호만 허용. 010-1234-5678 / +82 10 1234 5678 모두 01012345678 로 정규화한다. */
export function normalizePhone(raw: string): string | null {
  let d = String(raw ?? '').replace(/[^0-9]/g, '');
  if (d.startsWith('82')) d = `0${d.slice(2)}`;
  if (!/^0(1[016-9]|2|[3-6][1-5]|70)\d{6,8}$/.test(d)) return null;
  return d;
}

export interface SendOptions {
  /** LMS 제목. 지정하면 LMS 로 발송된다. */
  subject?: string;
  /** 야간 차단을 우회한다. 인증번호처럼 사용자가 방금 요청한 경우에만. */
  urgent?: boolean;
}

/**
 * 문자 1건 발송.
 * 절대 예외를 던지지 않는다 — 발송 실패가 로그인·예약 같은 본 기능을 막으면 안 된다.
 */
export async function sendSms(
  code: SmsCode,
  to: string,
  text: string,
  opts: SendOptions = {},
): Promise<SmsResult> {
  const phone = normalizePhone(to);
  if (!phone) {
    logSms(code, String(to), text, 'invalid-number');
    return { ok: false, status: 'invalid-number', error: '휴대폰 번호 형식이 아닙니다.' };
  }

  if (!opts.urgent && AD_CODES.includes(code) && isNightBlocked()) {
    logSms(code, phone, text, 'blocked-night');
    return { ok: false, status: 'blocked-night', error: '야간(21~08시) 광고성 발송은 차단됩니다.' };
  }

  const list = allowlist();
  if (list.length > 0 && !list.includes(phone)) {
    logSms(code, phone, text, 'skipped-allowlist');
    return { ok: false, status: 'skipped-allowlist', error: '허용 목록에 없는 번호입니다.' };
  }

  if (smsMode() === 'log') {
    logSms(code, phone, text, smsConfigured() ? 'skipped-logmode' : 'skipped-unconfigured');
    return { ok: false, status: 'log-mode' };
  }

  // 90바이트(EUC-KR 기준 한글 45자)를 넘으면 LMS 로 보내야 한다.
  const isLong = Buffer.byteLength(text, 'utf8') > 90 || !!opts.subject;
  const message = {
    to: phone,
    from: sender(),
    text,
    type: isLong ? 'LMS' : 'SMS',
    ...(isLong ? { subject: opts.subject ?? '[GS25 상품전략공유회]' } : {}),
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = (await solapi('/messages/v4/send', { method: 'POST', body: { message } })) as {
        groupId?: string;
        messageId?: string;
        statusCode?: string;
        statusMessage?: string;
      };
      const status = attempt === 1 ? 'sent' : 'sent-retry';
      logSms(code, phone, text, status);
      return { ok: true, status, groupId: res.groupId, messageId: res.messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 2) {
        logSms(code, phone, text, 'failed', msg);
        return { ok: false, status: 'failed', error: msg };
      }
    }
  }

  return { ok: false, status: 'failed' };
}

/** 여러 건 발송 — 100건씩 끊어 보낸다(T8-4 쿠폰 일괄 발송). */
export async function sendSmsBatch(
  code: SmsCode,
  targets: { to: string; text: string }[],
  opts: SendOptions = {},
): Promise<{ sent: number; failed: number; results: { to: string; ok: boolean; error?: string }[] }> {
  const results: { to: string; ok: boolean; error?: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    const out = await Promise.all(chunk.map((t) => sendSms(code, t.to, t.text, opts)));
    out.forEach((r, idx) => {
      results.push({ to: chunk[idx].to, ok: r.ok, ...(r.error ? { error: r.error } : {}) });
      if (r.ok) sent += 1;
      else failed += 1;
    });
  }
  return { sent, failed, results };
}

// ── 조회 ─────────────────────────────────────────────────────────

/** 잔액 조회. 실패해도 예외를 던지지 않는다. */
export async function smsBalance(): Promise<{ ok: boolean; balance?: number; point?: number; error?: string }> {
  if (!smsConfigured()) return { ok: false, error: 'SOLAPI 키 또는 발신번호가 설정되지 않았습니다.' };
  try {
    const r = (await solapi('/cash/v1/balance')) as { balance?: number; point?: number };
    return { ok: true, balance: r.balance, point: r.point };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 헬스 엔드포인트·관리자 화면용 — 비밀값은 절대 포함하지 않는다. */
export function smsStatus() {
  return {
    mode: smsMode(),
    configured: smsConfigured(),
    hasApiKey: !!apiKey(),
    hasApiSecret: !!apiSecret(),
    senderMasked: sender() ? sender().replace(/^(\d{2,3})\d+(\d{4})$/, '$1-****-$2') : '',
    allowlistCount: allowlist().length,
    nightBlocked: isNightBlocked(),
  };
}
