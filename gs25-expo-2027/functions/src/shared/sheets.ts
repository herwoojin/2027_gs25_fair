import { google } from 'googleapis';
import { db, FieldValue } from './admin';

/**
 * T9-1 · 구글시트 백업.
 * 이벤트 발생 Function 이 syncQueue 에 행을 넣고, 1분 스케줄 함수가 시트별로 묶어 append 한다.
 * 실패한 행은 큐에 남아 재시도되므로 데이터가 유실되지 않는다.
 */
export type SheetName =
  | 'Logins'
  | 'Stamps'
  | 'Completions'
  | 'Questions'
  | 'Reservations'
  | 'CheckIns'
  | 'Coupons'
  | 'Cheers';

export async function queueRow(sheet: SheetName, row: (string | number)[]): Promise<void> {
  try {
    await db.collection('syncQueue').add({
      sheet,
      row,
      createdAt: FieldValue.serverTimestamp(),
      tries: 0,
    });
  } catch {
    /* 백업 큐 실패가 본 기능을 막으면 안 된다 */
  }
}

export function sheetsClient(saJson: string) {
  const credentials = JSON.parse(saJson) as { client_email: string; private_key: string };
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

export async function appendRows(
  saJson: string,
  spreadsheetId: string,
  sheet: SheetName,
  rows: (string | number)[][],
): Promise<void> {
  const sheets = sheetsClient(saJson);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheet}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

export async function readSheet(
  saJson: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const sheets = sheetsClient(saJson);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values ?? []) as string[][];
}
