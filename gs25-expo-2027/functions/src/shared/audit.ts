import { db, FieldValue } from './admin';

/**
 * S-12 · 감사 로그.
 * 로그인 시도, 대량 조회, 엑셀 내보내기, 쿠폰 발송, 워터마크 제거 감지 등을 남긴다.
 * ⚠️ 전화번호·OTP 코드 같은 민감정보는 절대 기록하지 않는다.
 */
export interface AuditEntry {
  uid: string;
  role: string;
  action: string;
  target?: string;
  ip?: string;
  ua?: string;
  detail?: string;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.collection('auditLogs').add({
      ...entry,
      target: entry.target ?? null,
      ip: entry.ip ? maskIp(entry.ip) : null,
      ua: entry.ua?.slice(0, 120) ?? null,
      detail: entry.detail?.slice(0, 500) ?? null,
      at: FieldValue.serverTimestamp(),
    });
  } catch {
    /* 감사 로그 실패가 본 기능을 막으면 안 된다 */
  }
}

/** IPv4 마지막 옥텟 / IPv6 뒷부분 마스킹 */
export function maskIp(ip: string): string {
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + ':****';
  return ip.replace(/\.\d+$/, '.***');
}
