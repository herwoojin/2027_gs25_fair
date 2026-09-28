'use client';

import { useEffect } from 'react';

/**
 * 서비스 워커 등록.
 *
 * 설치형 앱(홈 화면 추가 · Play 의 TWA)이 되려면 서비스 워커가 있어야 한다.
 * 이 앱의 워커는 캐시를 늘리는 쪽이 아니라 **오프라인 안내만 담당**한다.
 * 이유는 public/sw.js 주석 참고 — 대외비 화면을 기기에 남기지 않기 위해서다.
 *
 * 개발 중에는 등록하지 않는다. 옛 빌드 산출물이 캐시에 남아 "고쳤는데 안 바뀌는"
 * 현상을 만들기 때문이다.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* 등록에 실패해도 앱은 그대로 동작해야 한다 */
      });
    };

    // 첫 화면이 다 그려진 뒤에 등록한다. 초기 로딩과 대역폭을 다투지 않게.
    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
