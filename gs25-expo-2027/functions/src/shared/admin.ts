import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret, defineString } from 'firebase-functions/params';

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export const auth = getAuth();
export const storage = getStorage();
export { FieldValue, Timestamp };

/** TRD 9장 · Secret Manager 로만 다루는 비밀정보 */
export const SOLAPI_API_KEY = defineSecret('SOLAPI_API_KEY');
export const SOLAPI_API_SECRET = defineSecret('SOLAPI_API_SECRET');
export const SOLAPI_SENDER = defineSecret('SOLAPI_SENDER');
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
export const SHEETS_SA_JSON = defineSecret('SHEETS_SA_JSON');
export const SHEET_ID = defineSecret('SHEET_ID');
export const INTEGRATION_KEY = defineSecret('INTEGRATION_KEY');
export const PHONE_ENC_KEY = defineSecret('PHONE_ENC_KEY');
export const PHONE_HMAC_KEY = defineSecret('PHONE_HMAC_KEY');
/** 본부 로그인 이메일 인증 — Google Apps Script 메일 릴레이 */
export const APPS_SCRIPT_URL = defineSecret('APPS_SCRIPT_URL');
export const APPS_SCRIPT_KEY = defineSecret('APPS_SCRIPT_KEY');

/** dev 에서 실수 대량 발송을 막는 수신 허용목록 (GUIDE 3.4) */
export const SMS_ALLOWLIST = defineString('SMS_ALLOWLIST', { default: '' });

/** 모든 Function 공통 옵션 — 서울 리전, App Check 강제 (T0-3 🔐) */
export const REGION = 'asia-northeast3';

export const CALLABLE_OPTS = {
  region: REGION,
  enforceAppCheck: true,
  cors: false,
  memory: '256MiB' as const,
  concurrency: 80,
};

/** 행사 기간에는 콜드스타트를 줄이기 위해 핵심 함수에 minInstances 를 준다. */
export const HOT_CALLABLE_OPTS = {
  ...CALLABLE_OPTS,
  minInstances: Number(process.env.HOT_MIN_INSTANCES ?? 0),
};

export const SCHEDULE_OPTS = {
  region: REGION,
  timeZone: 'Asia/Seoul',
  memory: '512MiB' as const,
};
