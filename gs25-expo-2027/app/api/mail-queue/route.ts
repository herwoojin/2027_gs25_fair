import { NextRequest, NextResponse } from 'next/server';
import { audit } from '@/lib/server/store';
import {
  claimPending,
  completeMail,
  markPulled,
  queueStats,
  verifyPullRequest,
} from '@/lib/server/mailQueue';
import { staffDirectoryStatus, syncStaffDirectory } from '@/lib/server/staffDirectory';
import { storeDirectoryStatus, storesHash, syncStores } from '@/lib/server/storeDirectory';
import {
  claimEventWrites,
  completeEventWrite,
  eventDirectoryStatus,
  syncEvents,
} from '@/lib/server/eventDirectory';
import { hydrateShared, flushShared } from '@/lib/server/sharedState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Apps Script 시간 기반 트리거가 **찾아오는** 엔드포인트 (pull 모드).
 *
 * GS리테일 Workspace 정책상 Apps Script 웹앱을 익명 공개할 수 없어
 * 우리 서버가 Apps Script 를 호출할 수 없다. 대신 Apps Script 가 1분마다
 * 여기로 와서 발송할 인증번호를 가져가고 결과를 알려 준다.
 *
 * 인증: HMAC-SHA256(APPS_SCRIPT_KEY, action|ts|nonce)
 *       타임스탬프 ±2분, nonce 1회용(10분) — 재전송 불가
 */
export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    ts?: number;
    nonce?: string;
    sig?: string;
    results?: unknown;
    staff?: unknown;
    events?: unknown;
    eventResults?: unknown;
    stores?: unknown;
    storesHash?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';

  // Apps Script 가 어느 인스턴스로 오든 같은 대기열을 보도록 먼저 읽는다.
  await hydrateShared();

  const err = verifyPullRequest(body);
  if (err) {
    audit({ uid: 'apps-script', role: 'system', action: 'mailqueue.unauthorized', ip, detail: err });
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  if (body.action === 'pull') {
    // 실제 트리거가 다녀간 것만 기록한다. ping 까지 세면
    // "트리거가 도는지" 를 이 값으로 판단할 수 없게 된다.
    markPulled();

    // pull 모드에서는 서버가 Staff 시트를 직접 읽을 수 없다.
    // Apps Script 가 매번 원장을 함께 보내 주므로 여기서 캐시에 반영한다.
    const staffSync = syncStaffDirectory(body.staff);
    // 시트가 보내 준 순회 일정을 반영한다.
    const eventSync = syncEvents(body.events);
    // 관리자가 화면에서 고친 내용은 트리거가 가져가 시트에 쓴다.
    const eventWrites = claimEventWrites(20);

    // 점포는 만 단위라 매분 전량을 주고받지 않는다.
    // 트리거가 보낸 시트 해시가 원장과 다를 때만 전량을 요청한다.
    const needStores = typeof body.storesHash === 'string' && body.storesHash !== storesHash();

    const jobs = claimPending(20);
    await flushShared();
    return NextResponse.json(
      {
        ok: true,
        staffSync,
        eventSync,
        needStores,
        eventWrites: eventWrites.map((w) => ({ id: w.id, eventId: w.eventId, patch: w.patch })),
        jobs: jobs.map((j) => ({
          id: j.id,
          email: j.email,
          code: j.code,
          purpose: j.purpose,
          expiresInSec: Math.max(60, Math.round((j.expiresAt - Date.now()) / 1000)),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (body.action === 'stores') {
    const result = syncStores(body.stores);
    await flushShared();
    audit({
      uid: 'apps-script',
      role: 'system',
      action: 'stores.synced',
      ip,
      detail: `반영 ${result.upserted} 비활성 ${result.deactivated} 건너뜀 ${result.skipped}`,
    });
    return NextResponse.json(
      { ok: true, ...result, status: storeDirectoryStatus() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (body.action === 'ack') {
    const eventResults = (body.eventResults ?? []) as { id: string; ok: boolean; error?: string }[];
    for (const r of eventResults) completeEventWrite(r.id, !!r.ok, r.error);

    const results = (body.results ?? []) as { id: string; ok: boolean; error?: string }[];
    let sent = 0;
    let failed = 0;
    for (const r of results) {
      completeMail(r.id, !!r.ok, r.error);
      if (r.ok) sent += 1;
      else failed += 1;
    }
    if (sent || failed) {
      audit({
        uid: 'apps-script',
        role: 'system',
        action: 'mailqueue.ack',
        ip,
        detail: `성공 ${sent} 실패 ${failed}`,
      });
    }
    await flushShared();
    return NextResponse.json({ ok: true, sent, failed }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.action === 'ping') {
    return NextResponse.json({
      ok: true,
      pong: true,
      queue: queueStats(),
      staff: staffDirectoryStatus(),
      events: eventDirectoryStatus(),
      stores: storeDirectoryStatus(),
    });
  }

  return NextResponse.json({ ok: false, error: 'unknown-action' }, { status: 400 });
}
