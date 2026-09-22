/**
 * Apps Script 메일 릴레이 연결 점검.
 *
 *   npm run check:mailer
 *   npm run check:mailer -- name@gsretail.com   # 실제 테스트 메일 발송
 *
 * .env.local 의 APPS_SCRIPT_URL / APPS_SCRIPT_KEY 를 사용한다.
 */
import fs from 'node:fs';
import path from 'node:path';

// tsx 는 .env.local 을 자동으로 읽지 않으므로 직접 로드한다.
for (const file of ['.env.local', '.env']) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const {
    mailerConfigured,
    pingMailer,
    listStaffFromSheet,
    sendStaffOtpEmail,
    isAllowedStaffEmail,
    diagnoseMailerUrl,
  } = await import('../lib/server/appsScript');

  console.log('▶ Apps Script 메일러 점검\n');

  const hasKey = Boolean(process.env.APPS_SCRIPT_KEY);
  const url = process.env.APPS_SCRIPT_URL ?? '';
  console.log(`  APPS_SCRIPT_KEY: ${hasKey ? '설정됨' : '❌ 비어 있음'}`);
  console.log(`  APPS_SCRIPT_URL: ${url || '❌ 비어 있음'}\n`);

  const d = diagnoseMailerUrl(url);
  if (!d.ok) {
    console.error(`❌ URL 문제: ${d.message}`);
    if (d.hint) console.error(`   → ${d.hint}`);
    console.error('');
    console.error('  올바른 배포 방법:');
    console.error('   1. Apps Script 편집기 → 우측 상단 [배포] → [새 배포]');
    console.error('   2. 유형 선택 ⚙️ → "웹 앱"');
    console.error('   3. 실행 사용자: 나 / 액세스 권한이 있는 사용자: 모든 사용자');
    console.error('   4. [배포] → 표시된 "웹 앱 URL" 복사');
    console.error('      → https://script.google.com/macros/s/AKfyc.../exec');
    console.error('');
    process.exit(1);
  }
  if (!mailerConfigured()) {
    console.error('❌ APPS_SCRIPT_URL / APPS_SCRIPT_KEY 가 설정되지 않았습니다.');
    console.error('   apps-script/README.md 의 1~4단계를 먼저 진행하세요.');
    process.exit(1);
  }

  const ping = await pingMailer();
  if (!ping.ok) {
    console.error(`❌ ping 실패: ${ping.error ?? '알 수 없음'}`);
    console.error('');
    if (/로그인|도메인 제한|액세스/.test(ping.error ?? '')) {
      console.error('  배포 화면에서 아래 두 가지를 확인하세요 (둘 중 하나만 틀려도 로그인을 요구합니다):');
      console.error('');
      console.error('   ① 다음 사용자 인증 정보로 실행  →  "나 (본인 계정)"');
      console.error('      · "웹 앱에 액세스하는 사용자" 로 되어 있으면 반드시 로그인이 필요합니다.');
      console.error('   ② 액세스 권한이 있는 사용자      →  "모든 사용자"');
      console.error('      · "gsretail.com 내 모든 사용자" / "나만" 이면 서버 호출이 막힙니다.');
      console.error('');
      console.error('  수정 경로: 배포 → 배포 관리 → ✏️(편집) → 위 두 항목 변경 → 버전 "새 버전" → 배포');
      console.error('');
      console.error('  ⚠️ 액세스 권한에 "모든 사용자" 항목이 아예 보이지 않으면');
      console.error('     Workspace 관리자가 외부 공유를 차단한 것입니다. 이 경우 알려 주세요.');
    } else {
      console.error('  · 코드 수정 후 "새 버전"으로 재배포했는지');
      console.error('  · APPS_SCRIPT_KEY 가 setup() 출력값과 같은지 확인하세요.');
    }
    process.exit(1);
  }
  console.log(`  ✅ ping OK · 허용 도메인 @${ping.allowedDomain}`);

  const staff = await listStaffFromSheet(true);
  if (!staff) {
    console.error('❌ Staff 시트를 읽지 못했습니다. setup() 을 실행했는지 확인하세요.');
    process.exit(1);
  }
  console.log(`  ✅ Staff 원장 ${staff.length}명`);
  for (const s of staff.slice(0, 10)) {
    console.log(`     · ${s.email} (${s.role}${s.active ? '' : ', 비활성'})`);
  }

  const target = process.argv[2];
  if (target) {
    if (!isAllowedStaffEmail(target)) {
      console.error(`\n❌ ${target} 은 @gsretail.com 이 아니라 발송할 수 없습니다.`);
      process.exit(1);
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n▶ ${target} 로 테스트 메일 발송 (인증번호 ${code})`);
    const res = await sendStaffOtpEmail({ email: target, code, expiresInSec: 180 });
    if (res.ok) {
      console.log(`  ✅ 발송 완료 → ${res.maskedEmail} · 남은 일일 한도 ${res.remainingQuota}`);
    } else {
      console.error(`  ❌ 발송 실패: ${res.error}`);
      process.exit(1);
    }
  } else {
    console.log('\n  테스트 메일을 보내려면: npm run check:mailer -- name@gsretail.com');
  }
}

main().catch((e) => {
  console.error('❌ 점검 실패', e);
  process.exit(1);
});
