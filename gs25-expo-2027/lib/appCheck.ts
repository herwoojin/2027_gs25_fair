'use client';

import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFirebase } from './firebase';

/**
 * T0-3 🔐 · App Check (reCAPTCHA Enterprise).
 * 정식 웹앱이 아닌 클라이언트(curl 등)의 Functions/Firestore/Storage 호출을 차단한다.
 * 개발에서는 콘솔에서 발급한 디버그 토큰을 NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN 으로 주입한다.
 */
let started = false;

export function initAppCheck() {
  if (started || typeof window === 'undefined') return;
  const fb = getFirebase();
  const siteKey = process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY;
  if (!fb || !siteKey) return;

  const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
  if (debugToken) {
    (window as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  initializeAppCheck(fb.app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  started = true;
}
