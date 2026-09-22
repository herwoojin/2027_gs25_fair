import { NextRequest, NextResponse } from 'next/server';
import { audit } from '@/lib/server/store';
import {
  claimPending,
  completeMail,
  markPulled,
  queueStats,
  verifyPullRequest,
} from '@/lib/server/mailQueue';

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
  let body: { action?: string; ts?: number; nonce?: string; sig?: string; results?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';

  const err = verifyPullRequest(body);
  if (err) {
    audit({ uid: 'apps-script', role: 'system', action: 'mailqueue.unauthorized', ip, detail: err });
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  markPulled();

  if (body.action === 'pull') {
    const jobs = claimPending(20);
    return NextResponse.json(
      {
        ok: true,
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

  if (body.action === 'ack') {
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
    return NextResponse.json({ ok: true, sent, failed }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.action === 'ping') {
    return NextResponse.json({ ok: true, pong: true, queue: queueStats() });
  }

  return NextResponse.json({ ok: false, error: 'unknown-action' }, { status: 400 });
}
