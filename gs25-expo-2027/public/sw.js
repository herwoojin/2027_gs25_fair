/*
 * 서비스 워커 — 설치형 앱(PWA/TWA)의 최소 요건을 채우는 용도다.
 *
 * ⚠️ 이 플랫폼은 폐쇄형이고 상품 정보가 대외비다. 그래서 일반적인 PWA 와 달리
 *    **캐시하지 않는 것**이 설계의 핵심이다.
 *
 *    캐시함   : 자기 출처의 정적 자산(빌드 산출물·아이콘·매니페스트)과 오프라인 안내 페이지
 *    캐시안함 : 모든 /api/* 응답, HTML 문서, 로그인 뒤 화면, 이미지·영상 원본
 *
 *    문서(HTML)를 캐시하면 공용 단말에서 로그아웃 뒤에도 이전 화면이 남고,
 *    /api 를 캐시하면 남의 세션 응답이 디스크에 남을 수 있다. 둘 다 사고다.
 *    그래서 문서는 항상 네트워크로 가고, 끊겼을 때만 오프라인 안내를 보여 준다.
 */

const VERSION = 'v2'; // 로고 교체 — 캐시된 옛 아이콘을 버린다
const SHELL = `gs25-shell-${VERSION}`;
const OFFLINE_URL = '/offline.html';

/** 미리 받아 두는 것 — 오프라인 안내와 아이콘뿐이다 */
const PRECACHE = [OFFLINE_URL, '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** 빌드 산출물처럼 내용이 바뀌면 이름도 바뀌는 것만 캐시 대상으로 본다 */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 외부 요청은 건드리지 않는다
  if (url.pathname.startsWith('/api/')) return; // 세션·상품 응답은 절대 캐시하지 않는다

  // 문서는 항상 네트워크. 끊겼을 때만 오프라인 안내를 보여 준다.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            // 정상 응답만 담는다(opaque·오류 응답을 담으면 깨진 화면이 굳어 버린다)
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

/** 새 버전을 즉시 적용하고 싶을 때 앱에서 보내는 신호 */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
