/** @type {import('next').NextConfig} */

// TRD 6.3 / T0-3 — 보안 헤더.
// CSP 허용 도메인은 firebase · googleapis · gstatic · youtube-nocookie 만.
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  // Next.js 는 인라인 부트스트랩 스크립트를 사용하므로 'unsafe-inline' 이 필요하다.
  // 개발 모드는 react-refresh 때문에 'unsafe-eval' 도 필요.
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://www.gstatic.com https://www.google.com https://www.recaptcha.net https://apis.google.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://firebasestorage.googleapis.com https://*.firebasestorage.app https://i.ytimg.com",
  "media-src 'self' blob: https://*.googleapis.com https://firebasestorage.googleapis.com https://*.firebasestorage.app",
  "font-src 'self' data:",
  `connect-src 'self' ${isDev ? 'ws: http://127.0.0.1:* http://localhost:*' : ''} https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://firebaseinstallations.googleapis.com https://content-firebaseappcheck.googleapis.com https://*.firebasestorage.app`,
  "frame-src 'self' https://www.youtube-nocookie.com https://www.google.com https://*.firebaseapp.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()' },
  // S-08 검색엔진 차단
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  // S-10 보조: prod 소스맵 비공개
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  transpilePackages: ['three'],
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // 상품 콘텐츠 API 는 캐시 금지 (T10-1)
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

module.exports = nextConfig;
