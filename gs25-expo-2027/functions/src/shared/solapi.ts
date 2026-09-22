import { SolapiMessageService } from 'solapi';
import { db, FieldValue, SMS_ALLOWLIST } from './admin';
import { maskPhone } from './crypto';

/**
 * T1-2 🔐 · SOLAPI 공용 모듈.
 *  - 모든 발송은 smsLogs 에 기록(수신번호 마스킹)
 *  - dev 에서는 SMS_ALLOWLIST 에 있는 번호로만 실제 발송(실수 대량발송 방지)
 *  - 광고성 문자는 야간(21~08시) 차단 + "(광고)" 표기 + 수신거부 안내
 */
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

/** 광고성 여부 — 야간 발송 차단 대상 */
const AD_CODES: SmsCode[] = ['PRE_NOTIFY', 'NUDGE', 'COUPON'];

let service: SolapiMessageService | null = null;

function client(apiKey: string, apiSecret: string): SolapiMessageService {
  if (!service) service = new SolapiMessageService(apiKey, apiSecret);
  return service;
}

export function isNightBlocked(now = new Date()): boolean {
  const h = Number(
    new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(now),
  );
  return h >= 21 || h < 8;
}

function allowlist(): string[] {
  return SMS_ALLOWLIST.value()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface SendArgs {
  code: SmsCode;
  to: string;
  text: string;
  subject?: string;
  /** MMS 등 이미지 첨부용 파일 id */
  imageId?: string;
  apiKey: string;
  apiSecret: string;
  sender: string;
}

export async function sendSms(args: SendArgs): Promise<{ ok: boolean; groupId?: string; error?: string }> {
  const { code, to, text, subject, imageId, apiKey, apiSecret, sender } = args;

  if (AD_CODES.includes(code) && isNightBlocked()) {
    await log(code, to, text, 'blocked-night');
    return { ok: false, error: 'night-blocked' };
  }

  const list = allowlist();
  if (list.length > 0 && !list.includes(to)) {
    // dev/stg 안전장치
    await log(code, to, text, 'skipped-allowlist');
    return { ok: false, error: 'not-in-allowlist' };
  }

  try {
    const res = await client(apiKey, apiSecret).send({
      to,
      from: sender,
      text,
      ...(subject ? { subject } : {}),
      ...(imageId ? { imageId } : {}),
    });
    const groupId = (res as { groupId?: string })?.groupId;
    await log(code, to, text, 'sent', groupId);
    return { ok: true, groupId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // 1회 재시도 (TRD 7.1)
    try {
      const res = await client(apiKey, apiSecret).send({ to, from: sender, text });
      const groupId = (res as { groupId?: string })?.groupId;
      await log(code, to, text, 'sent-retry', groupId);
      return { ok: true, groupId };
    } catch (e2) {
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      await log(code, to, text, 'failed', undefined, m2 || message);
      return { ok: false, error: m2 || message };
    }
  }
}

/** 100건씩 끊어 발송 (T8-4 쿠폰 일괄 발송) */
export async function sendBatch(
  targets: { to: string; text: string }[],
  base: Omit<SendArgs, 'to' | 'text'>,
): Promise<{ sent: number; failed: number; results: { to: string; ok: boolean }[] }> {
  const results: { to: string; ok: boolean }[] = [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    const out = await Promise.all(chunk.map((t) => sendSms({ ...base, to: t.to, text: t.text })));
    out.forEach((r, idx) => {
      results.push({ to: chunk[idx].to, ok: r.ok });
      if (r.ok) sent += 1;
      else failed += 1;
    });
  }
  return { sent, failed, results };
}

async function log(
  code: string,
  to: string,
  body: string,
  status: string,
  groupId?: string,
  error?: string,
) {
  try {
    await db.collection('smsLogs').add({
      code,
      toMasked: maskPhone(to),
      bodyPreview: body.slice(0, 80),
      status,
      groupId: groupId ?? null,
      error: error ?? null,
      at: FieldValue.serverTimestamp(),
    });
  } catch {
    /* 로깅 실패가 발송을 막으면 안 된다 */
  }
}

/** smsTemplates 컬렉션의 템플릿을 채운다. {{key}} 치환. */
export async function renderTemplate(code: SmsCode, vars: Record<string, string>): Promise<string | null> {
  const snap = await db.collection('smsTemplates').doc(code).get();
  if (!snap.exists) return null;
  const body = (snap.data()?.body as string) ?? '';
  return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
}
