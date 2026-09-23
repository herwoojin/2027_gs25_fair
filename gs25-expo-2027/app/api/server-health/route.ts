import os from 'node:os';
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { smsStatus } from '@/lib/server/sms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 백엔드 용량 신호등(배터리 인디케이터)용 헬스 엔드포인트.
 * 이 엔드포인트 때문에 서버가 죽으면 안 되므로 전 구간 try/catch 로 감싼다.
 */
type Level = 'ok' | 'warn' | 'danger' | 'critical';

function levelOf(pct: number): Level {
  if (pct >= 95) return 'critical';
  if (pct >= 85) return 'danger';
  if (pct >= 70) return 'warn';
  return 'ok';
}

export async function GET() {
  try {
    const mem = process.memoryUsage();
    // 컨테이너 한도가 있으면 그걸, 없으면 호스트 메모리를 쓴다.
    const limitMB = Number(process.env.MEMORY_LIMIT_MB ?? 0) || Math.round(os.totalmem() / 1048576);
    const usedMB = Math.round(mem.rss / 1048576);
    const memPercent = limitMB > 0 ? (usedMB / limitMB) * 100 : 0;

    let disk: { usedMB: number; totalMB: number; percent: number } | null = null;
    try {
      const st = fs.statfsSync(process.cwd());
      const totalMB = Math.round((st.blocks * st.bsize) / 1048576);
      const freeMB = Math.round((st.bavail * st.bsize) / 1048576);
      disk = { usedMB: totalMB - freeMB, totalMB, percent: ((totalMB - freeMB) / totalMB) * 100 };
    } catch {
      disk = null;
    }

    const cpuLoad1m = os.loadavg()[0];
    const cpuPercent = Math.min(100, (cpuLoad1m / Math.max(1, os.cpus().length)) * 100);

    // 서버리스(Netlify/Lambda)는 컨테이너 디스크가 수 MB 라 항상 100% 로 잡힌다.
    // 실제 용량 신호가 아니므로 신호등 계산에서 제외한다.
    const diskIsEphemeral = !disk || disk.totalMB < 512;

    const diskPercent = disk && !diskIsEphemeral ? disk.percent : 0;
    const metrics = [memPercent, diskPercent, cpuPercent];
    const worst = Math.max(...metrics);
    const level = levelOf(worst);
    const reason =
      level === 'ok'
        ? ''
        : worst === memPercent
          ? '메모리 사용량이 높습니다'
          : diskPercent > 0 && worst === diskPercent
            ? '디스크 여유 공간이 적습니다'
            : 'CPU 부하가 높습니다';

    return NextResponse.json(
      {
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        memory: { usedMB, totalMB: limitMB, percent: Number(memPercent.toFixed(1)) },
        cpuLoad1m: Number(cpuLoad1m.toFixed(2)),
        disk:
          disk && !diskIsEphemeral
            ? { usedMB: disk.usedMB, totalMB: disk.totalMB, percent: Number(disk.percent.toFixed(1)) }
            : null,
        level,
        reason,
        // 배포 설정 점검용 — **값은 절대 담지 않고 설정 여부만** 알린다.
        config: {
          demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
          mailerMode: process.env.MAILER_MODE ?? '(미설정)',
          smsMode: smsStatus().mode,
          smsConfigured: smsStatus().configured,
          hasAppsScriptKey: Boolean(process.env.APPS_SCRIPT_KEY),
          hasPhoneEncKey: Boolean(process.env.PHONE_ENC_KEY),
          hasPhoneHmacKey: Boolean(process.env.PHONE_HMAC_KEY),
          devShowOtp: process.env.DEV_SHOW_OTP === 'true',
          nodeEnv: process.env.NODE_ENV,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, uptimeSec: null, memory: null, cpuLoad1m: null, disk: null, level: 'critical', reason: '헬스 조회 실패' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
