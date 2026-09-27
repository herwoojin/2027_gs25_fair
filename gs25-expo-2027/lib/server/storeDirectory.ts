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

/**
 * 지역 칸을 코드로 맞춘다.
 *
 * 시트에 영문 코드를 정확히 적는 건 쉽게 틀린다. 한글 지역명도 받아 준다.
 * 다만 '일산' 같은 **도시명은 받지 않는다** — 어느 권역인지 추측하면 틀릴 수 있고,
 * 틀린 채로 넘어가면 그 점포는 엉뚱한 지역 랭킹에 잡힌다. 차라리 건너뛰고 알려 주는 편이 낫다.
 */
const REGION_ALIAS: Record<string, RegionCode> = {
  서울: 'SEOUL',
  경기: 'GYEONGGI',
  인천: 'GYEONGGI',
  '경기·인천': 'GYEONGGI',
  '경기인천': 'GYEONGGI',
  강원: 'GANGWON',
  대전: 'CHUNGCHEONG',
  충청: 'CHUNGCHEONG',
  충남: 'CHUNGCHEONG',
  충북: 'CHUNGCHEONG',
  세종: 'CHUNGCHEONG',
  '대전·충청': 'CHUNGCHEONG',
  대구: 'DAEGU',
  경북: 'DAEGU',
  '대구·경북': 'DAEGU',
  울산: 'ULSAN',
  부산: 'BUSAN',
  경남: 'BUSAN',
  '부산·경남': 'BUSAN',
  광주: 'GWANGJU',
  전라: 'GWANGJU',
  전남: 'GWANGJU',
  전북: 'GWANGJU',
  '광주·전라': 'GWANGJU',
  제주: 'JEJU',
};

function toRegion(raw: string): RegionCode | null {
  const v = raw.trim();
  const upper = v.toUpperCase() as RegionCode;
  if (VALID_REGIONS.has(upper)) return upper;
  return REGION_ALIAS[v.replace(/\s+/g, '')] ?? null;
}

/** 시트 안내에 쓸 유효값 목록 */
const REGION_HINT = REGIONS.map((r) => `${r.code}(${r.label})`).join(', ');

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
  let d = String(v ?? '').replace(/[^0-9]/g, '');
  // 시트 칸이 숫자 서식이면 앞의 0 이 날아간다 (01012341001 → 1012341001).
  // 앱스크립트에서도 되살리지만, 다른 경로로 들어올 수 있으니 여기서도 받아 준다.
  if (/^1[016-9]\d{7,8}$/.test(d)) d = `0${d}`;
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

    const region = toRegion(str(r.region, 20));
    if (!region) {
      out.skipped += 1;
      if (out.reasons.length < 10) {
        out.reasons.push(
          `${storeCode}: 지역 '${str(r.region, 20)}' 을(를) 알 수 없습니다. 가능한 값 — ${REGION_HINT}`,
        );
      }
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
  // 건너뛴 이유를 남겨 둔다. 관리자가 시트를 고칠 수 있어야 한다.
  db.storesLastSync = { at: Date.now(), ...out };
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
    lastSync: db.storesLastSync ?? null,
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
