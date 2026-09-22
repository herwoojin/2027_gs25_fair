/**
 * T1-7 🔐 · Firestore Rules 테스트 (@firebase/rules-unit-testing)
 *
 *   firebase emulators:start --only firestore   # 다른 터미널
 *   npm run test:rules
 *
 * DoD
 *  - 비로그인 전면 거부
 *  - 경영주가 타인 progress 읽기 실패
 *  - quizAnswers · stores 읽기 실패
 *  - progress 직접 쓰기 실패
 *  - 질문 500자 초과 실패
 *  - 공개 질문은 다른 경영주도 읽기 성공
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';

let env: RulesTestEnvironment;
let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ❌ ${name}\n     ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  env = await initializeTestEnvironment({
    projectId: 'gs25-expo-rules-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  });

  // 서버 전용 데이터 준비 (규칙 우회)
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sections/standard-store'), { title: '표준매장', order: 3, requiredProductIds: [] });
    await setDoc(doc(db, 'products/ps-layout'), { name: '표준 레이아웃', sectionId: 'standard-store' });
    await setDoc(doc(db, 'quizzes/ps-layout'), { question: 'Q', options: ['1', '2', '3', '4'] });
    await setDoc(doc(db, 'quizAnswers/ps-layout'), { answerIndex: 1, explanation: 'x' });
    await setDoc(doc(db, 'stores/20001'), { storeCode: '20001', phoneEnc: 'enc', active: true });
    await setDoc(doc(db, 'progress/store_20001'), { storeCode: '20001', stampCount: 3 });
    await setDoc(doc(db, 'progress/store_20002'), { storeCode: '20002', stampCount: 1 });
    await setDoc(doc(db, 'questions/q-public'), {
      uid: 'store_20009',
      isPublic: true,
      status: 'answered',
      text: '공개 질문',
      channel: 'hq',
      likeCount: 3,
    });
    await setDoc(doc(db, 'questions/q-private'), {
      uid: 'store_20009',
      isPublic: false,
      status: 'open',
      text: '비공개 질문',
      channel: 'section',
      likeCount: 0,
    });
    await setDoc(doc(db, 'aggregates/ranking'), { firstFinishers: [] });
    await setDoc(doc(db, 'otpSessions/s1'), { codeHash: 'x' });
  });

  const anon = env.unauthenticatedContext().firestore();
  const owner1 = env
    .authenticatedContext('store_20001', { role: 'owner', store: '20001', region: 'SEOUL' })
    .firestore();
  const owner2 = env
    .authenticatedContext('store_20002', { role: 'owner', store: '20002', region: 'BUSAN' })
    .firestore();
  const md = env.authenticatedContext('md-store', { role: 'md' }).firestore();
  const admin = env.authenticatedContext('admin-1', { role: 'admin' }).firestore();

  console.log('\n🔐 Firestore Rules 테스트\n');

  console.log('· 비로그인');
  await it('비로그인은 sections 읽기 실패', () => assertFails(getDoc(doc(anon, 'sections/standard-store'))));
  await it('비로그인은 products 읽기 실패', () => assertFails(getDoc(doc(anon, 'products/ps-layout'))));
  await it('비로그인은 aggregates 읽기 실패', () => assertFails(getDoc(doc(anon, 'aggregates/ranking'))));
  await it('비로그인은 questions 읽기 실패', () => assertFails(getDoc(doc(anon, 'questions/q-public'))));

  console.log('· 민감 컬렉션');
  await it('경영주는 quizAnswers 읽기 실패', () => assertFails(getDoc(doc(owner1, 'quizAnswers/ps-layout'))));
  await it('관리자도 quizAnswers 읽기 실패', () => assertFails(getDoc(doc(admin, 'quizAnswers/ps-layout'))));
  await it('경영주는 stores 읽기 실패', () => assertFails(getDoc(doc(owner1, 'stores/20001'))));
  await it('관리자도 stores 읽기 실패(전화번호 보호)', () => assertFails(getDoc(doc(admin, 'stores/20001'))));
  await it('otpSessions 읽기 실패', () => assertFails(getDoc(doc(owner1, 'otpSessions/s1'))));

  console.log('· progress');
  await it('경영주는 본인 progress 읽기 성공', () => assertSucceeds(getDoc(doc(owner1, 'progress/store_20001'))));
  await it('경영주는 타인 progress 읽기 실패', () => assertFails(getDoc(doc(owner1, 'progress/store_20002'))));
  await it('MD 는 progress 읽기 성공', () => assertSucceeds(getDoc(doc(md, 'progress/store_20001'))));
  await it('경영주는 progress 직접 쓰기 실패', () =>
    assertFails(setDoc(doc(owner1, 'progress/store_20001'), { stampCount: 11 })));

  console.log('· 콘텐츠');
  await it('로그인 사용자는 sections 읽기 성공', () =>
    assertSucceeds(getDoc(doc(owner1, 'sections/standard-store'))));
  await it('로그인 사용자는 quizzes(보기) 읽기 성공', () =>
    assertSucceeds(getDoc(doc(owner1, 'quizzes/ps-layout'))));
  await it('경영주는 products 쓰기 실패', () =>
    assertFails(setDoc(doc(owner1, 'products/ps-layout'), { name: '조작' })));

  console.log('· 질문');
  await it('질문 500자 초과 생성 실패', () =>
    assertFails(
      addDoc(collection(owner1, 'questions'), {
        uid: 'store_20001',
        text: 'ㅁ'.repeat(501),
        status: 'open',
        likeCount: 0,
        isPublic: false,
        channel: 'hq',
      }),
    ));
  await it('정상 질문 생성 성공', () =>
    assertSucceeds(
      addDoc(collection(owner1, 'questions'), {
        uid: 'store_20001',
        text: '정상 질문입니다.',
        status: 'open',
        likeCount: 0,
        isPublic: false,
        channel: 'hq',
      }),
    ));
  await it('남의 uid 로 질문 생성 실패', () =>
    assertFails(
      addDoc(collection(owner1, 'questions'), {
        uid: 'store_20002',
        text: '사칭 질문',
        status: 'open',
        likeCount: 0,
        isPublic: false,
        channel: 'hq',
      }),
    ));
  await it('공개 질문은 다른 경영주도 읽기 성공', () =>
    assertSucceeds(getDoc(doc(owner2, 'questions/q-public'))));
  await it('비공개 질문은 다른 경영주가 읽기 실패', () =>
    assertFails(getDoc(doc(owner2, 'questions/q-private'))));
  await it('답변 직접 수정 실패', () =>
    assertFails(setDoc(doc(owner1, 'questions/q-public'), { answer: { text: '조작' } }, { merge: true })));

  console.log('· 응원');
  await it('응원 50자 초과 생성 실패', () =>
    assertFails(
      addDoc(collection(owner1, 'cheers'), {
        uid: 'store_20001',
        text: 'ㅁ'.repeat(51),
        status: 'visible',
      }),
    ));
  await it('정상 응원 생성 성공', () =>
    assertSucceeds(
      addDoc(collection(owner1, 'cheers'), {
        uid: 'store_20001',
        text: '화이팅입니다',
        status: 'visible',
      }),
    ));

  console.log('· 집계 · 감사로그');
  await it('로그인 사용자는 aggregates 읽기 성공', () =>
    assertSucceeds(getDoc(doc(owner1, 'aggregates/ranking'))));
  await it('aggregates 쓰기 실패', () =>
    assertFails(setDoc(doc(owner1, 'aggregates/ranking'), { firstFinishers: [] })));
  await it('경영주는 auditLogs 읽기 실패', () => assertFails(getDoc(doc(owner1, 'auditLogs/a1'))));

  await env.cleanup();

  console.log(`\n결과: ✅ ${passed} · ❌ ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('❌ 테스트 실행 실패 — 에뮬레이터(firestore:8080)가 켜져 있는지 확인하세요.');
  console.error(e);
  process.exit(1);
});
