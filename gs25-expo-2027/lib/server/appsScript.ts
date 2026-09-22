/**
 * Google Apps Script 메일 릴레이 클라이언트 (개발 모드 백엔드용).
 * 운영 대응 모듈은 functions/src/shared/appsScript.ts 에 있다.
 *
 * 인증번호의 생성·해시·만료·시도횟수는 **전부 우리 서버가 관리**한다.
 * Apps Script 는 "@gsretail.com 주소로 메일을 보내는 일"만 한다.
 */
if (typeof window !== 'undefined') {
  throw new Error('lib/server/appsScript.ts is server-only');
}

import crypto from 'node:crypto';

export const ALLOWED_STAFF_DOMAIN = 'gsretail.com';

/** 도메인 화이트리스트 — Apps Script 에서도 같은 검사를 한 번 더 한다. */
export function isAllowedStaffEmail(email: string): boolean {
  const re = new RegExp(`^[a-z0-9._%+-]+@${ALLOWED_STAFF_DOMAIN.replace(/\./g, '\\.')}$`);
  return re.test(email.trim().toLowerCase());
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

export function mailerConfigured(): boolean {
  return Boolean(process.env.APPS_SCRIPT_URL && process.env.APPS_SCRIPT_KEY);
}

export interface UrlDiagnosis {
  ok: boolean;
  code: 'ok' | 'empty' | 'dev-url' | 'needs-anonymous-access' | 'not-exec' | 'not-apps-script';
  message: string;
  hint?: string;
}

/**
 * Workspace 계정은 "모든 사용자" 배포도 /a/macros/<도메인>/ 형태로 URL 을 보여 준다.
 * 접근 가능 여부는 URL 형태가 아니라 실제 응답이 결정하므로, 도메인 경로만 떼어내고 통과시킨다.
 */
export function normalizeMailerUrl(url: string): string {
  return url.trim().replace(/^https:\/\/script\.google\.com\/a\/macros\/[^/]+\//, 'https://script.google.com/');
}

/**
 * Apps Script 웹앱 URL 형태를 미리 점검한다.
 * 확실히 못 쓰는 형태(빈 값 · /dev · 비-AppsScript)만 걸러내고, 나머지는 실제 호출로 판정한다.
 */
export function diagnoseMailerUrl(url = process.env.APPS_SCRIPT_URL ?? ''): UrlDiagnosis {
  const raw = url.trim();
  if (!raw) {
    return { ok: false, code: 'empty', message: 'APPS_SCRIPT_URL 이 비어 있습니다.' };
  }
  if (!raw.startsWith('https://script.google.com/')) {
    return {
      ok: false,
      code: 'not-apps-script',
      message: 'Apps Script 웹앱 URL 이 아닙니다.',
      hint: 'https://script.google.com/macros/s/AKfyc.../exec 형태여야 합니다.',
    };
  }
  if (raw.endsWith('/dev')) {
    return {
      ok: false,
      code: 'dev-url',
      message: '/dev 는 테스트 전용 URL 이라 서버 호출에 쓸 수 없습니다(항상 로그인 요구).',
      hint: '배포 → 새 배포 → 웹 앱 으로 만든 /exec URL 을 사용하세요.',
    };
  }
  if (!normalizeMailerUrl(raw).endsWith('/exec')) {
    return {
      ok: false,
      code: 'not-exec',
      message: 'URL 이 /exec 로 끝나지 않습니다.',
      hint: '배포 관리 화면의 "웹 앱" URL 을 그대로 복사하세요.',
    };
  }
  return { ok: true, code: 'ok', message: '형식이 올바릅니다.' };
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

export class MailerAccessError extends Error {
  code = 'needs-anonymous-access' as const;
}

/**
 * 시도할 URL 후보.
 * Workspace 계정은 배포 URL 을 /a/macros/<도메인>/ 형태로 보여 주는데,
 * 실제 접근 경로는 배포 설정에 따라 다르다. 둘 다 시도해 되는 쪽을 쓴다.
 *  - "모든 사용자" 배포 → 익명 경로(/macros/s/.../exec)가 동작
 *  - 도메인 제한 배포   → 익명 경로는 404, 도메인 경로는 로그인 요구(401)
 */
function urlCandidates(raw: string): string[] {
  const asGiven = raw.trim();
  const normalized = normalizeMailerUrl(asGiven);
  return asGiven === normalized ? [asGiven] : [normalized, asGiven];
}

async function post<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const key = process.env.APPS_SCRIPT_KEY!;
  const email = String((payload as { email?: string }).email ?? '');
  const body = JSON.stringify({ ...payload, action, ...signRequest(action, email, key) });
  const candidates = urlCandidates(process.env.APPS_SCRIPT_URL!);

  let sawLoginPage = false;
  let sawNotFound = false;
  let lastError = '';

  for (const url of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        // Apps Script 웹앱은 302 로 googleusercontent 로 넘긴다. fetch 가 기본으로 따라간다.
        redirect: 'follow',
        signal: controller.signal,
      });
      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        if (res.status === 404) sawNotFound = true;
        else if (
          res.status === 401 ||
          res.status === 403 ||
          /accounts\.google\.com|ServiceLogin|Sign in - Google/i.test(text)
        ) {
          sawLoginPage = true;
        }
        lastError = `HTTP ${res.status}`;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'request-failed';
    } finally {
      clearTimeout(timer);
    }
  }

  // 익명 경로 404 + 도메인 경로 로그인요구 = 도메인 제한 배포로 확정
  if (sawLoginPage || sawNotFound) {
    throw new MailerAccessError(
      '이 배포는 도메인 제한 상태라 서버에서 호출할 수 없습니다. ' +
        '배포 설정에서 ① 실행 사용자 = "나" ② 액세스 권한이 있는 사용자 = "모든 사용자" 로 바꾼 뒤 ' +
        '"새 버전"으로 재배포해 주세요.',
    );
  }
  throw new Error(`Apps Script 호출에 실패했습니다(${lastError}).`);
}

/** 6자리 인증번호를 해당 이메일로 발송한다. */
export async function sendStaffOtpEmail(args: {
  email: string;
  code: string;
  expiresInSec: number;
  ip?: string;
}): Promise<SendOtpResult> {
  if (!mailerConfigured()) return { ok: false, error: 'not-configured' };
  if (!isAllowedStaffEmail(args.email)) return { ok: false, error: 'domain-not-allowed' };

  try {
    return await post<SendOtpResult>('sendOtp', {
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

/** Staff 시트의 본부 계정 원장을 가져온다(60초 캐시). */
let staffCache: { at: number; rows: StaffRecord[] } | null = null;

export async function listStaffFromSheet(force = false): Promise<StaffRecord[] | null> {
  if (!mailerConfigured()) return null;
  if (!force && staffCache && Date.now() - staffCache.at < 60_000) return staffCache.rows;
  try {
    const res = await post<{ ok: boolean; staff?: StaffRecord[] }>('listStaff', {});
    if (!res.ok || !res.staff) return null;
    staffCache = { at: Date.now(), rows: res.staff };
    return res.staff;
  } catch {
    return staffCache?.rows ?? null;
  }
}

export async function pingMailer(): Promise<{
  ok: boolean;
  error?: string;
  allowedDomain?: string;
  diagnosis?: UrlDiagnosis;
}> {
  if (!mailerConfigured()) return { ok: false, error: 'not-configured' };

  // 네트워크를 쓰기 전에 URL 형식부터 점검한다(원인을 바로 알려 주기 위해).
  const d = diagnoseMailerUrl();
  if (!d.ok) return { ok: false, error: `${d.message} ${d.hint ?? ''}`.trim(), diagnosis: d };

  try {
    const res = await post<{ ok: boolean; allowedDomain?: string }>('ping', {});
    return { ...res, diagnosis: d };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'request-failed', diagnosis: d };
  }
}
