'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Firebase 경로를 쓸지 여부.
 * 설정이 있어도 NEXT_PUBLIC_DEMO_MODE=true 면 로컬 백엔드(/api/fn/*)를 계속 사용한다.
 * → Cloud Functions 를 배포하기 전에 프로젝트 설정만 먼저 넣어 둘 수 있다.
 */
export const firebaseConfigured =
  Boolean(config.projectId && config.apiKey) && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true';

/** Firebase 프로젝트 설정 자체가 들어 있는지 (연결 상태 표시용) */
export const firebaseConfigPresent = Boolean(config.projectId && config.apiKey);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let fnInstance: Functions | null = null;
let storageInstance: FirebaseStorage | null = null;

/** Firebase 설정이 없으면 null 을 돌려주고, 호출부는 개발 모드 API 로 폴백한다. */
export function getFirebase() {
  if (!firebaseConfigured) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
    // Functions 는 서울 리전 (TRD 1장)
    fnInstance = getFunctions(app, 'asia-northeast3');
    storageInstance = getStorage(app);

    if (process.env.NEXT_PUBLIC_USE_EMULATOR === 'true') {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
      connectFunctionsEmulator(fnInstance, '127.0.0.1', 5001);
      connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
    }
  }
  return {
    app: app!,
    auth: authInstance!,
    db: dbInstance!,
    functions: fnInstance!,
    storage: storageInstance!,
  };
}
