/**
 * Google Apps Script 메일 릴레이 클라이언트 (운영).
 * 웹앱 대응 모듈은 lib/server/appsScript.ts 에 있고 동작은 동일하다.
 *
 * 인증번호의 생성·해시·만료·시도횟수는 **Functions 가 관리**한다.
 * Apps Script 는 "@gsretail.com 주소로 메일을 보내는 일"만 맡는다.
 */
import crypto from 'node:crypto';

export const ALLOWED_STAFF_DOMAIN = 'gsretail.com';

export function isAllowedStaffEmail(email: string): boolean {
  const re = new RegExp(`^[a-z0-9._%+-]+@${ALLOWED_STAFF_DOMAIN.replace(/\./g, '\\.')}$`);
  return re.test(email.trim().toLowerCase());
}

/**
 * Workspace 계정은 "모든 사용자" 배포도 /a/macros/<도메인>/ 형태로 URL 을 보여 준다.
 * 접근 가능 여부는 URL 형태가 아니라 실제 응답이 결정하므로 도메인 경로만 떼어낸다.
 */
export function normalizeMailerUrl(url: string): string {
  return url.trim().replace(/^https:\/\/script\.google\.com\/a\/macros\/[^/]+\//, 'https://script.google.com/');
}

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${'*'.repeat(Math.max(1, local.length - shown.length))}@${domain}`;
}

export interface StaffRecord {
  email: string;
  name: string;
  team: string;
  role: 'admin' | 'operator' | 'md';
  sectionIds: string[];
  backupFor: string[];
  active: boolean;
}

export interface SendOtpResult {
  ok: boolean;
  error?: string;
  maskedEmail?: string;
  name?: string;
  role?: StaffRecord['role'];
  team?: string;
  sectionIds?: string[];
  backupFor?: string[];
  remainingQuota?: number;
}


/**
 * 요청 서명 — 공유키를 그대로 보내지 않고 HMAC 서명만 보낸다.
 * base = action|ts|nonce|email  ·  ts 는 ±2분, nonce 는 1회용(10분)
 * 웹앱 URL 이 유출되거나 과거 요청이 캡처돼도 재사용할 수 없다.
 */
function signRequest(action: string, email: string, key: string) {
  const ts = Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');
  const sig = crypto
    .createHmac('sha256', key)
    .update([action, ts, nonce, email].join('|'))
    .digest('hex');
  return { ts, nonce, sig };
}

async function post<T>(
  url: string,
  key: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(normalizeMailerUrl(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        action,
        ...signRequest(action, String((payload as { email?: string }).email ?? ''), key),
      }),
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      const isLoginPage =
        res.status === 401 ||
        res.status === 403 ||
        /accounts\.google\.com|ServiceLogin|Sign in - Google/i.test(text);
      throw new Error(
        isLoginPage
          ? `Apps Script 가 구글 로그인을 요구했습니다(HTTP ${res.status}). 배포의 실행 사용자="나", 액세스 권한="모든 사용자" 인지 확인하세요.`
          : `Apps Script 응답이 JSON 이 아닙니다(HTTP ${res.status}).`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function sendStaffOtpEmail(args: {
  url: string;
  key: string;
  email: string;
  code: string;
  expiresInSec: number;
  ip?: string;
}): Promise<SendOtpResult> {
  if (!isAllowedStaffEmail(args.email)) return { ok: false, error: 'domain-not-allowed' };
  try {
    return await post<SendOtpResult>(args.url, args.key, 'sendOtp', {
      email: args.email.trim().toLowerCase(),
      code: args.code,
      expiresInSec: args.expiresInSec,
      purpose: 'STAFF_LOGIN',
      ip: args.ip ?? '',
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'request-failed' };
  }
}

export async function listStaffFromSheet(url: string, key: string): Promise<StaffRecord[] | null> {
  try {
    const res = await post<{ ok: boolean; staff?: StaffRecord[] }>(url, key, 'listStaff', {});
    return res.ok && res.staff ? res.staff : null;
  } catch {
    return null;
  }
}

export async function pingMailer(url: string, key: string) {
  try {
    return await post<{ ok: boolean; allowedDomain?: string }>(url, key, 'ping', {});
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'request-failed' };
  }
}
