/**
 * 본부 계정 원장 캐시.
 *
 * pull 모드에서는 서버가 Apps Script 를 호출할 수 없어 Staff 시트를 직접 읽지 못한다.
 * 대신 **Apps Script 트리거가 1분마다 찾아올 때 원장을 함께 실어 보내고**,
 * 여기에 저장해 두었다가 로그인 판정에 쓴다.
 */
import { STAFF } from '@/lib/seed/misc';
import { db, persist } from './store';
import { isAllowedStaffEmail } from './appsScript';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/staffDirectory.ts is server-only');
}

export type StaffRole = 'admin' | 'operator' | 'md';

export interface StaffEntry {
  uid: string;
  email: string;
  name: string;
  team: string;
  role: StaffRole;
  sectionIds: string[];
  backupFor: string[];
}

/** Staff 시트에 uid 컬럼이 없으므로 이메일에서 안정적으로 파생시킨다. */
export function staffUidOf(email: string): string {
  const seeded = STAFF.find((s) => s.email.toLowerCase() === email);
  if (seeded) return seeded.uid;
  return `staff_${email.split('@')[0].replace(/[^a-z0-9]+/g, '_')}`;
}

function normalizeRole(v: unknown): StaffRole {
  const r = String(v ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'operator' || r === 'md' ? r : 'md';
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return String(v ?? '')
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Apps Script 가 보내온 Staff 시트 내용을 캐시에 반영한다.
 * 비활성(active=false) 계정은 캐시에서 제거해 즉시 로그인이 막히게 한다.
 */
export function syncStaffDirectory(rows: unknown): { synced: number; removed: number } {
  if (!Array.isArray(rows)) return { synced: 0, removed: 0 };

  let synced = 0;
  let removed = 0;
  const seen = new Set<string>();

  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const email = String(r.email ?? '').trim().toLowerCase();
    if (!isAllowedStaffEmail(email)) continue;

    const uid = staffUidOf(email);
    seen.add(uid);

    // 비활성은 명시적으로 적었을 때만이다. 빈 칸·미지정은 활성으로 본다.
    // (빈 칸을 비활성으로 보면 시트에 행을 추가해도 계정이 조용히 사라진다)
    const flag = String(r.active ?? '').trim().toLowerCase();
    const inactive = r.active === false || ['false', 'n', '0', 'x', 'no', '비활성'].includes(flag);
    if (inactive) {
      if (db.staffDirectory[uid]) {
        delete db.staffDirectory[uid];
        removed += 1;
      }
      continue;
    }

    db.staffDirectory[uid] = {
      uid,
      email,
      name: String(r.name ?? '').trim() || email.split('@')[0],
      team: String(r.team ?? '').trim(),
      role: normalizeRole(r.role),
      sectionIds: asList(r.sectionIds),
      backupFor: asList(r.backupFor),
    };
    synced += 1;
  }

  // 시트에서 아예 삭제된 계정도 캐시에서 지운다.
  for (const uid of Object.keys(db.staffDirectory)) {
    if (!seen.has(uid)) {
      delete db.staffDirectory[uid];
      removed += 1;
    }
  }

  db.staffSyncedAt = Date.now();
  persist();
  return { synced, removed };
}

export function lookupStaff(email: string): StaffEntry | null {
  return db.staffDirectory[staffUidOf(email)] ?? null;
}

/** 이메일 앞 두 글자만 남긴다. 진단용이라 원문을 내보내지 않는다. */
function mask(email: string): string {
  const [local, domain] = email.split('@');
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

export function staffDirectoryStatus() {
  return {
    // 시트에서 무엇이 읽혔는지 바로 확인할 수 있어야 한다.
    // 행을 추가했는데 로그인이 안 되는 경우, 여기 없으면 시트가 원인이다.
    emails: Object.values(db.staffDirectory).map((e) => `${mask(e.email)}(${e.role})`),
    count: Object.keys(db.staffDirectory).length,
    syncedAt: db.staffSyncedAt ?? null,
    syncedAgoSec: db.staffSyncedAt ? Math.round((Date.now() - db.staffSyncedAt) / 1000) : null,
  };
}
