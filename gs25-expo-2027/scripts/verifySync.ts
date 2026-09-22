/**
 * T9-3 DoD · 구글시트 행 수 = Firestore 이벤트 수 정합성 검증.
 *
 *   SHEET_ID=... SHEETS_SA_JSON="$(cat sa.json)" npm run verify-sync
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';

const projectId = process.env.GCLOUD_PROJECT ?? 'gs25-expo-dev';
if (getApps().length === 0) initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();

const SHEET_ID = process.env.SHEET_ID ?? '';
const SA_JSON = process.env.SHEETS_SA_JSON ?? '';

/** 시트명 → Firestore 카운트 산식 */
const CHECKS: { sheet: string; count: () => Promise<number> }[] = [
  {
    sheet: 'Completions',
    count: async () => (await db.collection('progress').where('completedAt', '>', 0).count().get()).data().count,
  },
  {
    sheet: 'Reservations',
    count: async () => (await db.collection('reservations').count().get()).data().count,
  },
  {
    sheet: 'CheckIns',
    count: async () =>
      (await db.collection('reservations').where('status', '==', 'checked_in').count().get()).data().count,
  },
  {
    sheet: 'Questions',
    count: async () => (await db.collection('questions').count().get()).data().count,
  },
  {
    sheet: 'Cheers',
    count: async () => (await db.collection('cheers').count().get()).data().count,
  },
];

async function sheetRowCount(sheet: string): Promise<number> {
  const creds = JSON.parse(SA_JSON) as { client_email: string; private_key: string };
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheet}!A2:A` });
  return (res.data.values ?? []).length;
}

async function main() {
  if (!SHEET_ID || !SA_JSON) {
    console.error('❌ SHEET_ID / SHEETS_SA_JSON 환경변수가 필요합니다.');
    process.exit(1);
  }

  const pending = (await db.collection('syncQueue').count().get()).data().count;
  console.log(`▶ 대기 중인 백업 큐: ${pending}행`);

  let failed = 0;
  for (const c of CHECKS) {
    const [fs, sheet] = await Promise.all([c.count(), sheetRowCount(c.sheet)]);
    const ok = sheet >= fs; // 시트는 이력이므로 같거나 많아야 한다
    console.log(`  ${ok ? '✅' : '❌'} ${c.sheet}: Firestore ${fs} / 시트 ${sheet}`);
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`❌ ${failed}개 시트가 불일치합니다. flushSyncQueue 로그를 확인하세요.`);
    process.exit(1);
  }
  console.log('✅ 정합성 확인 완료');
}

main().catch((e) => {
  console.error('❌ 실패', e);
  process.exit(1);
});
