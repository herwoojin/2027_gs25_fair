import crypto from 'node:crypto';

/**
 * T1-1 🔐 · 휴대폰 번호는 평문으로 저장하지 않는다.
 *  - 전체 번호: AES-256-GCM 암호문 (발송 시에만 복호화)
 *  - 뒷 4자리: HMAC-SHA256(last4 + storeCode) — 비교 전용
 */
function keyOf(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptPhone(phone: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decryptPhone(payload: string, secret: string): string {
  const [iv, tag, data] = payload.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

export function hmac(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function hashLast4(last4: string, storeCode: string, secret: string): string {
  return hmac(`${last4}:${storeCode}`, secret);
}

export function hashOtp(code: string, sessionId: string, secret: string): string {
  return hmac(`${code}:${sessionId}`, secret);
}

export function randomOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** 타이밍 공격에 안전한 비교 (T9-3 공유키 검증) */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{3,4}(\d{4})$/, '$1-****-$2');
}
