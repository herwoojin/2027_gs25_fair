/**
 * 순회 일정 원장 — 구글시트 `Events` 탭과 양방향으로 맞춘다.
 *
 * 방향이 둘 다 pull 채널을 탄다. GS리테일 정책상 우리가 Apps Script 를 호출할 수 없어,
 * 1분마다 찾아오는 트리거에 실어 보내는 방식밖에 없기 때문이다.
 *
 *   시트 → 우리  트리거가 pull 할 때 `events` 를 함께 보내 준다 → syncEvents()
 *   우리 → 시트  관리자가 고친 내용을 큐에 쌓아 두면, 다음 pull 때 트리거가 가져가 시트에 쓴다
 *
 * 화면은 기다리지 않는다. 관리자가 저장하는 즉시 캐시에 반영해 히어로·순회 일정이 바로 바뀌고,
 * 시트는 1분 안에 따라온다.
 */
import { EVENTS } from '@/lib/seed/events';
import type { EventPatch, EventWriteJob, ExpoEvent } from '@/types';
import { db, newId, persist } from './store';

if (typeof window !== 'undefined') {
  throw new Error('lib/server/eventDirectory.ts is server-only');
}

export type { EventPatch, EventWriteJob };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown, max = 200): string {
  return String(v ?? '').trim().slice(0, max);
}

function slots(v: unknown): string[] | undefined {
  const list = Array.isArray(v)
    ? v.map((x) => str(x, 40))
    : str(v, 200)
        .split(/[|,]/)
        .map((x) => x.trim());
  const out = list.filter(Boolean).slice(0, 3);
  return out.length ? out : undefined;
}

/** 빈 값은 '변경 없음' 으로 본다. 시트의 빈 칸이 기존 값을 지우면 안 된다. */
export function normalizePatch(raw: unknown): EventPatch {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p: EventPatch = {};
  const venueName = str(r.venueName, 80);
  const address = str(r.address, 160);
  const startDate = str(r.startDate, 10);
  const endDate = str(r.endDate, 10);
  const note = str(r.note, 200);
  const st = slots(r.slotTimes);

  if (venueName) p.venueName = venueName;
  if (address) p.address = address;
  if (DATE.test(startDate)) p.startDate = startDate;
  if (DATE.test(endDate)) p.endDate = endDate;
  if (note) p.note = note;
  if (st) p.slotTimes = st;
  return p;
}

/** Apps Script 가 보내온 Events 시트를 캐시에 반영한다. */
export function syncEvents(rows: unknown): { synced: number } {
  if (!Array.isArray(rows)) return { synced: 0 };
  let synced = 0;
  for (const raw of rows) {
    const r = raw as Record<string, unknown>;
    const id = str(r.id, 40);
    if (!id || !EVENTS.some((e) => e.id === id)) continue; // 모르는 도시는 무시
    const patch = normalizePatch(r);
    if (Object.keys(patch).length === 0) continue;
    db.eventOverrides[id] = { ...db.eventOverrides[id], ...patch };
    synced += 1;
  }
  db.eventsSyncedAt = Date.now();
  persist();
  return { synced };
}

/** 시드 + 시트에서 온 수정분을 합친 최종 일정 */
export function mergedEvents(): ExpoEvent[] {
  return EVENTS.map((e) => {
    const o = db.eventOverrides[e.id];
    return o ? { ...e, ...o, syncedAt: db.eventsSyncedAt ?? undefined } : e;
  });
}

export function mergedEvent(id: string): ExpoEvent | null {
  return mergedEvents().find((e) => e.id === id) ?? null;
}

// ── 시트로 되돌려 쓰기 ────────────────────────────────────────────

/** 관리자 수정 — 캐시에 즉시 반영하고, 시트 반영은 큐에 쌓는다. */
export function queueEventWrite(eventId: string, patch: EventPatch): EventWriteJob {
  db.eventOverrides[eventId] = { ...db.eventOverrides[eventId], ...patch };

  const job: EventWriteJob = {
    id: newId('ew_'),
    eventId,
    patch,
    createdAt: Date.now(),
    status: 'pending',
  };
  db.eventWrites.push(job);
  if (db.eventWrites.length > 200) db.eventWrites.splice(0, db.eventWrites.length - 200);
  persist();
  return job;
}

/** 트리거가 가져갈 몫. 30초 안에 ack 가 없으면 다시 내준다. */
export function claimEventWrites(limit = 20): EventWriteJob[] {
  const now = Date.now();
  const out: EventWriteJob[] = [];
  for (const j of db.eventWrites) {
    if (out.length >= limit) break;
    const stale = j.status === 'claimed' && (j.claimedAt ?? 0) < now - 30_000;
    if (j.status === 'pending' || stale) {
      j.status = 'claimed';
      j.claimedAt = now;
      out.push(j);
    }
  }
  if (out.length) persist();
  return out;
}

export function completeEventWrite(id: string, ok: boolean, error?: string) {
  const j = db.eventWrites.find((x) => x.id === id);
  if (!j) return;
  j.status = ok ? 'done' : 'failed';
  if (error) j.error = error.slice(0, 200);
  persist();
}

export function eventDirectoryStatus() {
  const pending = db.eventWrites.filter((j) => j.status === 'pending').length;
  const claimed = db.eventWrites.filter((j) => j.status === 'claimed').length;
  const failed = db.eventWrites.filter((j) => j.status === 'failed').length;
  return {
    overrides: Object.keys(db.eventOverrides).length,
    syncedAt: db.eventsSyncedAt ?? null,
    syncedAgoSec: db.eventsSyncedAt ? Math.round((Date.now() - db.eventsSyncedAt) / 1000) : null,
    pendingWrites: pending,
    claimedWrites: claimed,
    failedWrites: failed,
  };
}
