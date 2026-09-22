/**
 * T10-3 ⚡ · k6 부하 테스트 (스테이징 전용)
 *
 *   k6 run -e BASE_URL=https://stg.example -e OTP_TEST_CODE=000000 scripts/loadtest/k6.js
 *
 * 시나리오: 로그인 → 로비 진입 → 섹션 2개 → 상품 5개 progress/퀴즈 → 랭킹 조회 → 응원 1건
 * OTP 는 스테이징 한정 플래그(STAGING_FIXED_OTP)로 고정 코드를 사용한다.
 * ⚠️ prod 에는 절대 실행하지 않는다.
 */
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const OTP_TEST_CODE = __ENV.OTP_TEST_CODE || '000000';

if (BASE_URL.includes('prod')) fail('prod 환경에는 부하 테스트를 실행할 수 없습니다.');

const loginTrend = new Trend('login_duration');
const progressTrend = new Trend('progress_duration');
const feedTrend = new Trend('feed_duration');
const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 500 },   // 워밍업
        { duration: '3m', target: 1500 },  // 평시 피크
        { duration: '3m', target: 3000 },  // 오픈 순간 스파이크
        { duration: '5m', target: 3000 },  // 유지
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // PRD 7장 · 동시접속 1,000(피크 3,000)에서 끊김 없음
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    errors: ['rate<0.01'],
    login_duration: ['p(95)<2000'],
    progress_duration: ['p(95)<1000'],
  },
};

function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-session-token'] = token;
  return http.post(`${BASE_URL}/api/fn/${path}`, JSON.stringify(body), { headers });
}

const SECTIONS = ['standard-store', 'counter-ff', 'fresh', 'new-format', 'ax-auto-order'];
const PRODUCTS = {
  'standard-store': ['ps-layout', 'ps-gondola', 'ps-walkin', 'ps-endcap', 'ps-pb'],
  'counter-ff': ['pc-hotbar', 'pc-coffee', 'pc-bunsik', 'pc-package', 'pc-app-order'],
  fresh: ['pf-veg', 'pf-meal', 'pf-fruit', 'pf-cold', 'pf-local'],
  'new-format': ['pn-office', 'pn-resi', 'pn-tour'],
  'ax-auto-order': ['pa-auto', 'pa-forecast', 'pa-app'],
};

export default function () {
  const storeCode = String(20000 + (__VU % 5000));
  const last4 = storeCode.slice(-4);

  // 1) 로그인
  const t0 = Date.now();
  const otpRes = post('requestOtp', { storeCode, last4 });
  if (otpRes.status !== 200) {
    errorRate.add(1);
    sleep(2);
    return;
  }
  const sessionId = otpRes.json('result.sessionId');
  const verifyRes = post('verifyOtp', { sessionId, code: OTP_TEST_CODE });
  loginTrend.add(Date.now() - t0);

  if (verifyRes.status !== 200) {
    errorRate.add(1);
    sleep(2);
    return;
  }
  const token = verifyRes.json('result.token');
  check(verifyRes, { '로그인 성공': (r) => r.status === 200 });

  // 2) 로비 진입
  const lobby = post('getExhibitIndex', {}, token);
  check(lobby, { '로비 로드': (r) => r.status === 200 });
  errorRate.add(lobby.status !== 200);
  sleep(1);

  // 3) 섹션 2개 + 상품 5개
  const picked = [SECTIONS[__VU % SECTIONS.length], SECTIONS[(__VU + 1) % SECTIONS.length]];
  let count = 0;

  for (const sectionId of picked) {
    const sec = post('getSectionContent', { sectionId }, token);
    errorRate.add(sec.status !== 200);
    sleep(0.5);

    for (const productId of PRODUCTS[sectionId] || []) {
      if (count >= 5) break;
      count += 1;

      const p0 = Date.now();
      post('markProductProgress', { productId, event: 'enter' }, token);
      sleep(0.3);
      const consumed = post('markProductProgress', { productId, event: 'consumed' }, token);
      progressTrend.add(Date.now() - p0);
      errorRate.add(consumed.status !== 200);

      const quiz = post('submitQuiz', { productId, choice: __VU % 4 }, token);
      check(quiz, { '퀴즈 채점 응답': (r) => r.status === 200 || r.status === 400 });
      sleep(0.4);
    }
  }

  // 4) 랭킹 조회 (집계 문서 1건)
  const f0 = Date.now();
  const ranking = post('getAggregates', { kind: 'ranking' }, token);
  feedTrend.add(Date.now() - f0);
  check(ranking, { '랭킹 로드': (r) => r.status === 200 });
  errorRate.add(ranking.status !== 200);

  // 5) 응원 1건
  const cheer = post('createCheer', { text: `부하테스트 응원 ${__VU}` }, token);
  errorRate.add(cheer.status >= 500);

  sleep(2);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] ?? 0;
  const errRate = data.metrics.errors?.values?.rate ?? 0;

  // 결과를 보고 minInstances · 동시성 권장값을 계산한다.
  let recommendation;
  if (p95 > 3000 || errRate > 0.02) {
    recommendation =
      'minInstances 를 5 이상으로 올리고 concurrency 를 40으로 낮추세요(인스턴스당 부하 분산). Firestore 읽기를 aggregates 문서로 더 모으는 것도 검토하세요.';
  } else if (p95 > 1500) {
    recommendation = 'minInstances 2~3, concurrency 60 권장. 콜드스타트가 p95 를 끌어올리고 있습니다.';
  } else {
    recommendation = '현재 설정(minInstances 1, concurrency 80)으로 충분합니다.';
  }

  const summary = [
    '',
    '════════ 부하 테스트 요약 ════════',
    `p95 응답시간 : ${p95.toFixed(0)}ms`,
    `p99 응답시간 : ${(data.metrics.http_req_duration?.values?.['p(99)'] ?? 0).toFixed(0)}ms`,
    `오류율       : ${(errRate * 100).toFixed(2)}%`,
    `로그인 p95   : ${(data.metrics.login_duration?.values?.['p(95)'] ?? 0).toFixed(0)}ms`,
    `스탬프 p95   : ${(data.metrics.progress_duration?.values?.['p(95)'] ?? 0).toFixed(0)}ms`,
    '',
    `권장 설정: ${recommendation}`,
    '═════════════════════════════════',
    '',
  ].join('\n');

  return {
    stdout: summary,
    'loadtest-summary.json': JSON.stringify(data, null, 2),
  };
}
