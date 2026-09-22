/**
 * T1-1 🔐 · 점포 계정 일괄 생성.
 * Email/Password 프로바이더에 계정을 **사전 생성**해 두고(TRD 3.1),
 * 실제 로그인은 Custom Token 으로 수행한다. 비밀번호는 서버 난수로 사용자에게 노출되지 않는다.
 *
 *   npm run create-store-accounts
 *
 * DoD: 평문 전화번호가 DB 에 남지 않는다 (stores.phoneEnc / phoneLast4Hash 만 존재).
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'node:crypto';

const projectId = process.env.GCLOUD_PROJECT ?? 'gs25-expo-dev';
const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

// 실계정을 만드는 스크립트이므로, 에뮬레이터가 아니면 명시적 동의(--yes-live)를 요구한다.
if (!usingEmulator) {
  if (!process.argv.includes('--yes-live')) {
    console.error(`❌ ${projectId} 는 실제 Firebase 프로젝트입니다.`);
    console.error('   에뮬레이터에 만들려면: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run create-store-accounts');
    console.error('   정말 실제 프로젝트에 생성하려면 --yes-live 를 붙이세요.');
    process.exit(1);
  }
  console.warn(`⚠️  실제 프로젝트(${projectId})에 계정을 생성합니다.`);
}

if (getApps().length === 0) initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

async function main() {
  const stores = await db.collection('stores').where('active', '==', true).get();
  console.log(`▶ 대상 점포 ${stores.size}개`);

  let created = 0;
  let skipped = 0;

  for (const doc of stores.docs) {
    const s = doc.data() as { storeCode: string; storeName: string; region: string; phoneEnc?: string };
    const uid = `store_${s.storeCode}`;

    // 평문 전화번호가 남아 있으면 경고 (S-11)
    if ((doc.data() as Record<string, unknown>).phone) {
      console.warn(`  ⚠️ ${s.storeCode}: 평문 phone 필드가 남아 있습니다. 삭제하세요.`);
    }

    try {
      await auth.getUser(uid);
      skipped += 1;
    } catch {
      await auth.createUser({
        uid,
        email: `${s.storeCode}@expo.gs25.internal`,
        // 사용자에게 노출되지 않는 서버 난수
        password: crypto.randomBytes(24).toString('base64url'),
        displayName: s.storeName,
        disabled: false,
      });
      created += 1;
    }

    await auth.setCustomUserClaims(uid, { role: 'owner', store: s.storeCode, region: s.region });
  }

  console.log(`✅ 생성 ${created} · 기존 ${skipped}`);
}

main().catch((e) => {
  console.error('❌ 실패', e);
  process.exit(1);
});
