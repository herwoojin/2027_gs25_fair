import { NextRequest, NextResponse } from 'next/server';
import { HANDLERS, type HandlerName, type Ctx } from '@/lib/server/handlers';
import { HttpError } from '@/lib/server/session';
import { hydrateShared, flushShared } from '@/lib/server/sharedState';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 개발 모드 callable 디스패처.
 * 운영에서는 이 경로 대신 Firebase Cloud Functions(httpsCallable)를 직접 호출한다.
 * → lib/api.ts 가 환경에 따라 분기한다.
 */
export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  const name = params.name as HandlerName;
  const handler = HANDLERS[name];
  if (!handler) {
    return NextResponse.json({ error: { code: 'not-found', message: '알 수 없는 요청입니다.' } }, { status: 404 });
  }

  const ctx: Ctx = {
    token: req.headers.get('x-session-token'),
    ip:
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      '127.0.0.1',
    ua: req.headers.get('user-agent') ?? 'unknown',
  };

  let payload: unknown = {};
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  // 서버리스 인스턴스가 갈려도 세션·대기열이 이어지도록 공유 상태를 먼저 읽는다.
  await hydrateShared();

  try {
    const result = await (handler as (p: unknown, c: Ctx) => Promise<unknown>)(payload, ctx);
    await flushShared();
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    await flushShared();
    if (err instanceof HttpError) {
      return NextResponse.json(
        { error: { code: err.code ?? 'error', message: err.message, ...(err.extra ?? {}) } },
        { status: err.status },
      );
    }
    if (typeof err === 'object' && err && 'issues' in err) {
      return NextResponse.json(
        { error: { code: 'invalid-argument', message: '입력값을 확인해 주세요.' } },
        { status: 400 },
      );
    }
    // 환경변수 누락 같은 배포 설정 문제는 "일시적 오류"로 뭉개면 원인을 찾을 수 없다.
    // 메시지에 환경변수 *이름*만 들어 있고 값은 없으므로 그대로 내려준다.
    const message = err instanceof Error ? err.message : '';
    if (/PHONE_ENC_KEY|PHONE_HMAC_KEY|APPS_SCRIPT_KEY/.test(message)) {
      console.error(`[fn:${name}] 설정 오류`, message);
      return NextResponse.json(
        { error: { code: 'server-misconfigured', message } },
        { status: 503 },
      );
    }
    console.error(`[fn:${name}]`, err);
    return NextResponse.json(
      { error: { code: 'internal', message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' } },
      { status: 500 },
    );
  }
}
