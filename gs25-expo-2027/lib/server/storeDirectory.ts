/**
 * 점포 화이트리스트 원장 — 구글시트 `Stores` 탭과 맞춘다.
 *
 * 본부 계정(Staff)과 같은 pull 채널을 타지만, 두 가지가 다르다.
 *
 * 1) **전량을 매분 실어 보내지 않는다.**
 *    점포는 만 단위라 1분마다 전체를 주고받으면 낭비가 크다.
 *    트리거는 매번 가벼운 해시만 보내고, 서버가 "달라졌다" 고 알려줄 때만 전량을 올린다.
 *
 * 2) **시트에서 행을 지워도 접속이 막히지 않는다.**
 *    Staff 는 시트에 없으면 지우지만, 점포는 그렇게 하면 위험하다.
 *    부분 시트를 잘못 올리는 순간 수천 명이 로그인 불가가 된다.
 *    그래서 업서트만 하고, 막으려면 `active` 칸에 FALSE 를 명시해야 한다.
 *
 * 전화번호는 평문으로 저장하지 않는다(PRD S-11). 받는 즉시 암호화하고
 * 뒷4자리는 해시로만 남긴다.
 */
import crypto from 'node:crypto';
import type { RegionCode } from '@/types';
import { REGIONS } from '@/types';
import { db, decryptPhone, encryptPhone, hashLast4, persist } from './store';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/storeDirectory.ts is server-only');
}

const VALID_REGIONS = new Set(REGIONS.map((r) => r.code));

function str(v: unknown, max = 60): string {
  return String(v ?? '').trim().slice(0, max);
}

/** 비활성은 명시했을 때만. 빈 칸은 활성으로 본다 (Staff 와 같은 규칙) */
function isInactive(v: unknown): boolean {
  if (v === false) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return ['false', 'n', '0', 'x', 'no', '비활성'].includes(s);
}

function normalizePhone(v: unknown): string | null {
  const d = String(v ?? '').replace(/[^0-9]/g, '');
  return /^01[016-9]\d{7,8}$/.test(d) ? d : null;
}

export interface StoreSyncResult {
  upserted: number;
  deactivated: number;
  skipped: number;
  reasons: string[];
}

/**
 * 시트 내용을 원장에 반영한다.
 * 잘못된 행은 통째로 실패시키지 않고 건너뛰되, 왜 건너뛰었는지 남긴다 —
 * 만 줄짜리 시트에서 한 줄 때문에 전체가 막히면 안 된다.
 */
export function syncStores(rows: unknown): StoreSyncResult {
  const out: StoreSyncResult = { upserted: 0, deactivated: 0, skipped: 0, reasons: [] };
  if (!Array.isArray(rows)) return out;

  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const storeCode = str(r.storeCode, 12);
    if (!storeCode) {
      out.skipped += 1;
      continue;
    }

    const existing = db.stores[storeCode];

    if (isInactive(r.active)) {
      if (existing) {
        existing.active = false;
        existing.syncedAt = Date.now();
        out.deactivated += 1;
      }
      continue;
    }

    const region = str(r.region, 20).toUpperCase() as RegionCode;
    if (!VALID_REGIONS.has(region)) {
      out.skipped += 1;
      if (out.reasons.length < 10) out.reasons.push(`${storeCode}: 지역코드 '${region}' 없음`);
      continue;
    }

    const phone = normalizePhone(r.phone);
    // 번호가 비어 있어도 기존 번호가 있으면 유지한다. 시트 빈 칸이 번호를 지우면 안 된다.
    if (!phone && !existing) {
      out.skipped += 1;
      if (out.reasons.length < 10) out.reasons.push(`${storeCode}: 휴대폰 번호 형식 오류`);
      continue;
    }

    db.stores[storeCode] = {
      storeCode,
      storeName: str(r.storeName, 40) || existing?.storeName || storeCode,
      ownerName: str(r.ownerName, 30) || existing?.ownerName || '',
      phoneEnc: phone ? encryptPhone(phone) : existing!.phoneEnc,
      phoneLast4Hash: phone ? hashLast4(phone.slice(-4), storeCode) : existing!.phoneLast4Hash,
      region,
      fcTeam: str(r.fcTeam, 30) || existing?.fcTeam || '',
      active: true,
      syncedAt: Date.now(),
    };
    out.upserted += 1;
  }

  db.storesSyncedAt = Date.now();
  persist();
  return out;
}

/**
 * 원장의 현재 상태를 나타내는 해시.
 * 트리거가 보내온 시트 해시와 다르면 "전량을 올려 달라" 고 요청한다.
 */
export function storesHash(): string {
  const parts = Object.values(db.stores)
    .filter((s) => s.active)
    .map((s) => `${s.storeCode}|${s.storeName}|${s.ownerName}|${s.region}|${s.fcTeam}|${s.phoneLast4Hash}`)
    .sort();
  return crypto.createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 16);
}

export function storeDirectoryStatus() {
  const all = Object.values(db.stores);
  return {
    total: all.length,
    active: all.filter((s) => s.active).length,
    syncedAt: db.storesSyncedAt ?? null,
    syncedAgoSec: db.storesSyncedAt ? Math.round((Date.now() - db.storesSyncedAt) / 1000) : null,
    hash: storesHash(),
  };
}

/** 진단용 — 점포코드로 등록 여부를 확인한다. 번호는 마스킹만 내보낸다. */
export function lookupStore(storeCode: string) {
  const s = db.stores[storeCode.trim()];
  if (!s) return null;
  const phone = decryptPhone(s.phoneEnc);
  return {
    storeCode: s.storeCode,
    storeName: s.storeName,
    ownerName: s.ownerName,
    region: s.region,
    active: s.active,
    phoneMasked: phone.replace(/^(\d{3})\d{3,4}(\d{4})$/, '$1-****-$2'),
    last4: phone.slice(-4),
    syncedAt: s.syncedAt,
  };
}
